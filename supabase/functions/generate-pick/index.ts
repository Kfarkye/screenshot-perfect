import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { OpenAI } from "https://esm.sh/openai@4";
// Import Zod for schema validation (using the Deno registry)
import { z } from "https://deno.land/x/zod@v3.21.4/mod.ts";

// ---------------------------------------------------------
// CONFIGURATION & INITIALIZATION
// ---------------------------------------------------------

// 1. Environment Variable Validation (Fail Fast)
// Validate environment variables strictly at startup using Zod.
const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  // Use the SERVICE_ROLE_KEY to bypass RLS for these backend operations
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const envParse = EnvSchema.safeParse(Deno.env.toObject());

if (!envParse.success) {
  // Log the specific errors and exit if the environment is misconfigured.
  console.error("[FATAL] Invalid or missing environment variables:", envParse.error.format());
  Deno.exit(1);
}

const env = envParse.data;

// Initialize Clients
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const supabase: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

// Constants
const LLM_MODEL = "gpt-4o"; // Optimized for JSON adherence, cost, and performance
const EMBEDDING_MODEL = "text-embedding-3-small";
const PG_UNIQUE_VIOLATION_CODE = "23505";

// ---------------------------------------------------------
// SCHEMAS & TYPES
// ---------------------------------------------------------

// Input validation schema
const RequestInputSchema = z.object({
  game_id: z.string().min(1, "game_id cannot be empty"),
  // Context is flexible but must be a non-empty object
  game_context: z.record(z.unknown()).refine(ctx => Object.keys(ctx).length > 0, {
    message: "game_context cannot be empty",
  }),
  market_type: z.enum(["moneyline", "puckline", "total", "prop"]).default("moneyline"),
});

// Expected LLM output schema (Crucial for hardening)
const LLMOutputSchema = z.object({
  pick_side: z.string().min(1),
  confidence: z.number().int().min(1).max(100),
  reasoning: z.string().min(50, "Reasoning must be sufficiently detailed"),
});

type LLMOutput = z.infer<typeof LLMOutputSchema>;

// Define the structure of the data we return to the client (excludes embedding vector)
const RESPONSE_SELECT = "id, game_id, market_type, pick_side, confidence_score, reasoning_text, created_at";

// ---------------------------------------------------------
// HEADERS & HELPERS
// ---------------------------------------------------------

const securityHeaders = {
  "Access-Control-Allow-Origin": "*", // SECURITY NOTE: Restrict this in production if possible
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Content-Type-Options": "nosniff",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
};

const jsonHeaders = {
  ...securityHeaders,
  "Content-Type": "application/json",
};

/**
 * Standardized error response handler.
 */
const handleError = (status: number, message: string, details?: unknown) => {
  if (status >= 500) {
    console.error(`[ERROR ${status}] ${message}`, details);
  } else {
    console.warn(`[CLIENT ERROR ${status}] ${message}`, details);
  }
  
  return new Response(JSON.stringify({ error: message, details }), {
    status,
    headers: jsonHeaders,
  });
};

// Custom Error class for centralized handling of HTTP status codes
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

// ---------------------------------------------------------
// CORE LOGIC FUNCTIONS (CHECK-GEN-COMMIT)
// ---------------------------------------------------------

/**
 * 1. THE CHECK (Fast Path)
 * Uses .maybeSingle() to gracefully handle cache misses (returns null).
 */
const checkCache = async (game_id: string, market_type: string) => {
  const { data, error } = await supabase
    .from("analysis_memory")
    .select(RESPONSE_SELECT)
    .eq("game_id", game_id)
    .eq("market_type", market_type)
    .maybeSingle();

  if (error) {
    console.error("[DB READ ERROR]", error);
    throw new HttpError(500, "Database read operation failed");
  }
  
  return data;
};

/**
 * 2. THE GENERATION (Slow Path)
 * Calls the LLM, validates the output structure, and generates embeddings.
 */
const generateAnalysis = async (game_context: object, market_type: string): Promise<{ analysis: LLMOutput, embedding: number[] }> => {
  const systemPrompt = `
    You are a highly analytical, data-driven sports betting expert.
    Analyze the provided matchup context specifically for the '${market_type}' market.
    Be decisive. Pick a side based on positive Expected Value (EV), key stats, and trends found in the context.
    Your response MUST be a JSON object adhering strictly to this schema:
    { "pick_side": string, "confidence": number (1-100), "reasoning": string (min 100 chars) }
    Do not hedge.
  `;

  // 2a. Generate Analysis
  const completion = await openai.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analyze this game context: ${JSON.stringify(game_context)}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2, // Low temperature for high consistency
  }).catch(err => {
    // Handle OpenAI API errors (e.g., rate limits, service outages)
    console.error("[OPENAI CHAT ERROR]", err);
    // 502 Bad Gateway indicates an issue with the upstream service
    throw new HttpError(502, "Upstream analysis service unavailable");
  });

  const rawResult = completion.choices[0]?.message?.content;
  if (!rawResult) {
    throw new HttpError(502, "LLM returned empty content.");
  }

  // 2b. Validate LLM Output (Parsing and Schema)
  let parsedJson;
  try {
      // Ensure the LLM returned valid JSON syntax
      parsedJson = JSON.parse(rawResult);
  } catch (e) {
      console.error("[LLM JSON PARSE ERROR]", rawResult);
      throw new HttpError(502, "LLM returned invalid JSON structure.");
  }

  // Ensure the JSON adheres to the required schema
  const validation = LLMOutputSchema.safeParse(parsedJson);
  if (!validation.success) {
      console.error("[LLM SCHEMA INVALID]", parsedJson, validation.error.format());
      throw new HttpError(502, "Failed to generate a valid analysis structure");
  }

  const analysis = validation.data;

  // 2c. Generate Embedding
  const embeddingResponse = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: analysis.reasoning,
  }).catch(err => {
    console.error("[OPENAI EMBEDDING ERROR]", err);
    throw new HttpError(502, "Upstream embedding service unavailable");
  });
  
  const embedding = embeddingResponse.data[0]?.embedding;

  if (!embedding) {
      throw new HttpError(502, "Embedding generation failed.");
  }

  return { analysis, embedding };
};

/**
 * 3. THE COMMIT (Atomic Lock)
 * Inserts the generated pick. Handles the race condition using the unique constraint.
 */
const commitPick = async (
  game_id: string,
  market_type: string,
  analysis: LLMOutput,
  embedding: number[]
) => {
  const { data: savedPick, error: insertError } = await supabase
    .from("analysis_memory")
    .insert({
      game_id,
      market_type,
      pick_side: analysis.pick_side,
      confidence_score: analysis.confidence,
      reasoning_text: analysis.reasoning,
      reasoning_embedding: embedding,
    })
    .select(RESPONSE_SELECT)
    .single();

  // Handle Race Condition
  if (insertError) {
    if (insertError.code === PG_UNIQUE_VIOLATION_CODE) {
      console.warn(`[RACE CONDITION] Insert blocked for ${game_id}. Fetching the winning record.`);
      // If we lost the race (unique violation), fetch the record that won.
      const winnerPick = await checkCache(game_id, market_type);

      if (!winnerPick) {
        // This state should be highly unlikely if 23505 occurred.
        throw new HttpError(500, "Race condition occurred, but failed to retrieve the winning pick.");
      }
      return { pick: winnerPick, created: false };
    }
    // If it's any other database error, throw it.
    console.error("[DB WRITE ERROR]", insertError);
    throw new HttpError(500, "Database write operation failed");
  }

  return { pick: savedPick, created: true };
};

// ---------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: securityHeaders, status: 204 });
  }

  // Enforce POST method
  if (req.method !== "POST") {
    return handleError(405, "Method Not Allowed");
  }

  try {
    // 0. Input Validation
    // Safely parse JSON body, catching potential syntax errors
    const body = await req.json().catch(() => {
        throw new HttpError(400, "Invalid JSON payload");
    });
    
    const validation = RequestInputSchema.safeParse(body);

    if (!validation.success) {
      return handleError(400, "Invalid request payload", validation.error.format());
    }

    const { game_id, market_type, game_context } = validation.data;
    const logContext = `${game_id} (${market_type})`;

    // 1. THE CHECK
    const existingPick = await checkCache(game_id, market_type);

    if (existingPick) {
      console.log(`[CACHE HIT] Returning locked pick for ${logContext}`);
      return new Response(JSON.stringify(existingPick), { headers: jsonHeaders, status: 200 });
    }

    // 2. THE GENERATION
    console.log(`[CACHE MISS] Generating new pick for ${logContext}`);
    const { analysis, embedding } = await generateAnalysis(game_context, market_type);

    // 3. THE COMMIT
    const { pick: finalPick, created } = await commitPick(game_id, market_type, analysis, embedding);

    console.log(`[COMMIT SUCCESS] Locked pick for ${logContext}. Created: ${created}`);
    
    // Return 201 Created if this request generated the pick, 200 OK otherwise (if it lost the race).
    const status = created ? 201 : 200;
    return new Response(JSON.stringify(finalPick), { headers: jsonHeaders, status });

  } catch (error) {
    // Catch-all for unexpected errors, utilizing the HttpError class
    if (error instanceof HttpError) {
      return handleError(error.status, error.message);
    }
    
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return handleError(500, "Internal Server Error", errorMessage);
  }
});

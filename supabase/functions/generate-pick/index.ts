import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// ---------------------------------------------------------
// CONFIGURATION & CONSTANTS
// ---------------------------------------------------------

// 1. Staleness Configuration
const MAX_AGE_HOURS = 4;
// The threshold for American odds movement (e.g., -110 to -131 is a drift of 21)
const ODDS_DRIFT_THRESHOLD = 20;

// 2. Environment Validation (Fail Fast)
const EnvSchema = z.object({
  GOOGLE_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const envParse = EnvSchema.safeParse(Deno.env.toObject());
if (!envParse.success) {
  console.error("[FATAL] Invalid environment variables:", envParse.error.format());
  Deno.exit(1);
}
const env = envParse.data;

// 3. Initialize Supabase Client
const supabase: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const LLM_MODEL = "gemini-3-pro-preview";
const EMBEDDING_MODEL = "text-embedding-004";
// The columns used to uniquely identify a record for UPSERT (must match the DB unique constraint)
const UNIQUE_CONSTRAINT = 'game_id, market_type';

// ---------------------------------------------------------
// SCHEMAS & TYPES
// ---------------------------------------------------------

// Input validation schema - Requires real-time odds and context
const RequestInputSchema = z.object({
  game_id: z.string().min(1),
  // Real-time odds MUST be provided by the client
  current_odds: z.number().int(),
  // Context is required for regeneration
  game_context: z.record(z.unknown()).refine(ctx => Object.keys(ctx).length > 0, {
    message: "game_context cannot be empty",
  }),
  market_type: z.enum(["moneyline", "puckline", "total", "prop"]).default("moneyline"),
});

type RequestInput = z.infer<typeof RequestInputSchema>;

// Expected LLM output schema
const LLMOutputSchema = z.object({
  pick_side: z.string().min(1),
  confidence: z.number().int().min(1).max(100),
  reasoning: z.string().min(50),
});

type LLMOutput = z.infer<typeof LLMOutputSchema>;

// Define the structure of the data we return to the client (excluding embedding vector)
const RESPONSE_SELECT = "id, game_id, market_type, pick_side, confidence_score, reasoning_text, created_at, odds_at_generation";

// Cache Status Enum for clear logging
enum CacheStatus {
  HIT = "HIT",
  MISS = "MISS",
  STALE_TIME = "STALE_TIME",
  STALE_ODDS = "STALE_ODDS",
  STALE_DATA_INCOMPLETE = "STALE_DATA_INCOMPLETE",
}

// ---------------------------------------------------------
// HEADERS & HELPERS
// ---------------------------------------------------------

const securityHeaders = {
  "Access-Control-Allow-Origin": "*", // Restrict this in production
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Content-Type-Options": "nosniff",
};

const jsonHeaders = { ...securityHeaders, "Content-Type": "application/json" };

// Custom Error class for centralized handling
class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = "HttpError";
  }
}

const handleError = (error: unknown) => {
  if (error instanceof HttpError) {
    if (error.status >= 500) {
        console.error(`[ERROR ${error.status}] ${error.message}`, error.details);
    }
    return new Response(JSON.stringify({ error: error.message, details: error.details }), {
      status: error.status,
      headers: jsonHeaders,
    });
  }
  console.error("[INTERNAL ERROR]", error);
  return new Response(JSON.stringify({ error: "Internal Server Error" }), {
    status: 500,
    headers: jsonHeaders,
  });
};

// ---------------------------------------------------------
// CORE LOGIC FUNCTIONS
// ---------------------------------------------------------

/**
 * 1. CHECK & VALIDATE CACHE
 * Fetches the existing record and immediately applies staleness logic.
 */
const checkCacheAndValidate = async (input: RequestInput) => {
  const { game_id, market_type, current_odds } = input;

  const { data: cachedPick, error } = await supabase
    .from("analysis_memory")
    .select(RESPONSE_SELECT)
    .eq("game_id", game_id)
    .eq("market_type", market_type)
    .maybeSingle();

  if (error) {
    // If the database read fails, we cannot serve the request.
    throw new HttpError(500, "Database read operation failed", error);
  }

  if (!cachedPick) {
    return { status: CacheStatus.MISS, pick: null };
  }

  // --- Staleness Logic ---

  // A. Data Integrity Check
  if (cachedPick.odds_at_generation === null || cachedPick.odds_at_generation === undefined || !cachedPick.created_at) {
      console.warn(`[CACHE WARNING] Record missing odds or timestamp for ${game_id}. Assuming stale.`);
      return { status: CacheStatus.STALE_DATA_INCOMPLETE, pick: cachedPick };
  }

  // B. Time-based Staleness
  const createdAtTime = new Date(cachedPick.created_at).getTime();
  if (isNaN(createdAtTime)) {
    console.warn(`[CACHE WARNING] Invalid timestamp format for ${game_id}. Assuming stale.`);
    return { status: CacheStatus.STALE_DATA_INCOMPLETE, pick: cachedPick };
  }

  const hoursSinceGen = (Date.now() - createdAtTime) / (1000 * 60 * 60);

  if (hoursSinceGen > MAX_AGE_HOURS) {
    return { status: CacheStatus.STALE_TIME, pick: cachedPick };
  }

  // C. Context-based Staleness (Odds Movement)
  const oddsDrift = Math.abs(cachedPick.odds_at_generation - current_odds);

  if (oddsDrift > ODDS_DRIFT_THRESHOLD) {
    console.log(`[ODDS DRIFT] Drift of ${oddsDrift} detected (Threshold: ${ODDS_DRIFT_THRESHOLD})`);
    return { status: CacheStatus.STALE_ODDS, pick: cachedPick };
  }

  // If no condition is met, it's a valid cache hit.
  return { status: CacheStatus.HIT, pick: cachedPick };
};

/**
 * 2. THE GENERATION (Slow Path)
 * Calls the LLM via direct fetch, validates the output structure, and generates embeddings.
 */
const generateAnalysis = async (input: RequestInput): Promise<{ analysis: LLMOutput, embedding: number[] }> => {
  const { game_context, market_type, current_odds } = input;

  const systemPrompt = `
    You are a data-driven sports betting analyst. Analyze the provided matchup context for the '${market_type}' market.
    CRITICAL CONTEXT: The current odds are ${current_odds}. Use this to determine Expected Value (EV).
    Be decisive. Pick a side.
    Response MUST be a JSON object: { "pick_side": string, "confidence": number (1-100), "reasoning": string }
  `;

  // 2a. Generate Analysis using Google Gemini API
  try {
    console.log('[Calling Gemini API]', { model: LLM_MODEL, game_id: input.game_id });
    
    const chatResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${LLM_MODEL}:generateContent?key=${env.GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\nAnalyze: ${JSON.stringify(game_context)}`
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        }
      }),
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      console.error('[Gemini Chat Error]', chatResponse.status, errorText);
      throw new HttpError(502, "Upstream analysis service unavailable", { status: chatResponse.status, error: errorText });
    }

    const chatData = await chatResponse.json();
    console.log('[Gemini Chat Response]', JSON.stringify(chatData).substring(0, 200));
    const rawResult = chatData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawResult) {
      console.error('[Gemini returned empty content]', chatData);
      throw new HttpError(502, "Gemini returned empty response");
    }

    // 2b. Validate LLM Output
    console.log('[Parsing Gemini response]', rawResult.substring(0, 100));
    const parsedJson = JSON.parse(rawResult || "{}");
    const validation = LLMOutputSchema.safeParse(parsedJson);
    if (!validation.success) {
        console.error('[Schema validation failed]', validation.error.format());
        throw new HttpError(502, "LLM returned invalid schema", validation.error.format());
    }
    const analysis = validation.data;
    console.log('[Analysis validated]', { pick_side: analysis.pick_side, confidence: analysis.confidence });

    // 2c. Generate Embedding using Google Gemini API
    console.log('[Calling Gemini Embeddings API]');
    const embeddingResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${env.GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: {
          parts: [{
            text: analysis.reasoning
          }]
        },
        outputDimensionality: 1536  // Match database vector dimensions
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error('[Gemini Embedding Error]', embeddingResponse.status, errorText);
      throw new HttpError(502, "Upstream embedding service unavailable", { status: embeddingResponse.status, error: errorText });
    }

    const embeddingData = await embeddingResponse.json();
    console.log('[Embedding response]', { hasEmbedding: !!embeddingData.embedding });
    const embedding = embeddingData.embedding?.values;

    if (!embedding) {
      console.error('[Embedding missing in response]', embeddingData);
      throw new HttpError(502, "Embedding generation failed.");
    }
    
    console.log('[Successfully generated analysis and embedding]');
    return { analysis, embedding };

  } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error("[LLM PROCESSING ERROR - Full details]", e);
      console.error("[Error stack]", e instanceof Error ? e.stack : 'No stack');
      console.error("[Error message]", e instanceof Error ? e.message : String(e));
      throw new HttpError(502, "Failed to process analysis results", { 
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined 
      });
  }
};

/**
 * 3. THE COMMIT (UPSERT)
 * Inserts the new pick or updates the existing (stale) one.
 */
const commitPick = async (
  input: RequestInput,
  analysis: LLMOutput,
  embedding: number[]
) => {
  const { game_id, market_type, current_odds } = input;

  const payload = {
    game_id,
    market_type,
    pick_side: analysis.pick_side,
    confidence_score: analysis.confidence,
    reasoning_text: analysis.reasoning,
    reasoning_embedding: embedding,
    // Crucial: Update the odds to the current value
    odds_at_generation: current_odds,
    // CRITICAL: Manually reset the timestamp for the new analysis. 
    // Upsert (which acts as an UPDATE on conflict) does not automatically refresh 'created_at'.
    created_at: new Date().toISOString(), 
  };

  // UPSERT: If a conflict occurs on the unique constraints, update the existing row.
  const { data: savedPick, error: upsertError } = await supabase
    .from("analysis_memory")
    .upsert(payload, { onConflict: UNIQUE_CONSTRAINT })
    .select(RESPONSE_SELECT)
    .single();

  if (upsertError) {
    // Unlike INSERT, UPSERT does not throw 23505 on conflict; it updates instead.
    // Errors here are typically systemic database issues.
    throw new HttpError(500, "Database upsert operation failed", upsertError);
  }

  return savedPick;
};

// ---------------------------------------------------------
// MAIN HANDLER
// ---------------------------------------------------------

serve(async (req) => {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") return new Response(null, { headers: securityHeaders, status: 204 });
  
  // Enforce POST
  if (req.method !== "POST") return handleError(new HttpError(405, "Method Not Allowed"));

  try {
    // 0. Input Validation
    const body = await req.json().catch(() => {
        throw new HttpError(400, "Invalid JSON payload");
    });
    
    const validation = RequestInputSchema.safeParse(body);
    if (!validation.success) {
      throw new HttpError(400, "Invalid request parameters", validation.error.format());
    }
    const input = validation.data;
    const logContext = `${input.game_id} (${input.market_type} @ ${input.current_odds})`;

    // 1. CHECK & VALIDATE
    const { status, pick } = await checkCacheAndValidate(input);

    if (status === CacheStatus.HIT) {
      console.log(`[CACHE HIT] Serving valid pick for ${logContext}.`);
      return new Response(JSON.stringify(pick), { headers: jsonHeaders, status: 200 });
    }

    // 2. GENERATION (Handles MISS, STALE_TIME, STALE_ODDS, STALE_DATA_INCOMPLETE)
    console.log(`[CACHE ${status}] Regenerating analysis for ${logContext}.`);
    const { analysis, embedding } = await generateAnalysis(input);

    // 3. COMMIT (UPSERT)
    // NOTE ON RACE CONDITIONS: If two requests simultaneously find the cache stale,
    // both will generate, and the last one to finish will overwrite the first (UPSERT behavior).
    const newPick = await commitPick(input, analysis, embedding);

    console.log(`[UPSERT SUCCESS] Updated analysis for ${logContext}.`);
    // Return 201 as we have created/updated the resource state.
    return new Response(JSON.stringify(newPick), { headers: jsonHeaders, status: 201 });

  } catch (error) {
    return handleError(error);
  }
});

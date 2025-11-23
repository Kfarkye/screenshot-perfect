// Edge runtime types are provided by Supabase Deno environment
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

import { corsHeaders } from '../_shared/cors.ts';
import { handleSearchQuery } from './searchRouter.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION & VALIDATION (Fail-fast initialization)
// ═══════════════════════════════════════════════════════════════════════════

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),
  DEBUG_SECRET_HEADER_VALUE: z.string().optional(),
  ENABLE_CIRCUIT_BREAKER: z.coerce.boolean().default(true),
  ENABLE_REQUEST_DEDUPLICATION: z.coerce.boolean().default(true),
  ENABLE_RATE_LIMITING: z.coerce.boolean().default(true),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
});

type EnvConfig = z.infer<typeof EnvSchema>;

function initializeEnvironment(): EnvConfig {
  try {
    return EnvSchema.parse(Deno.env.toObject());
  } catch (error) {
    const errorDetails = error instanceof z.ZodError ? error.errors : String(error);
    console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "FATAL",
        message: "[INIT] Invalid environment configuration.",
        details: errorDetails
    }));
    throw new Error("Configuration Error: Invalid environment variables.");
  }
}

const env = initializeEnvironment();
const SERVICE_NAME = "ai-chat-router";
const DEPLOYMENT_REGION = Deno.env.get("DENO_REGION") || "unknown";

const CONFIG = {
  API_CONNECT_TIMEOUT_MS: 15000,
  STREAM_INACTIVITY_TIMEOUT_MS: 25000,
  STREAM_TOTAL_TIMEOUT_MS: 180000,
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY_MS: 500,
  RETRY_MIN_JITTER_DELAY_MS: 100,
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
  CIRCUIT_BREAKER_RECOVERY_SUCCESSES: 3,
  MAX_MESSAGE_LENGTH: 50000,
  MAX_MESSAGES_COUNT: 100,
  MAX_IMAGE_COUNT: 10,
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024,
  MAX_TRACE_LOG_LENGTH: 5000,
  IMAGE_BUCKET_NAME: 'chat-uploads',
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 60,
  DEDUP_WINDOW_MS: 5000,
} as const;

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
} as const;

const RequestBodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1).max(CONFIG.MAX_MESSAGE_LENGTH),
  })).nonempty().max(CONFIG.MAX_MESSAGES_COUNT),
  conversationId: z.string().uuid().optional(),
  imageIds: z.array(z.string().uuid()).max(CONFIG.MAX_IMAGE_COUNT).optional(),
  mode: z.enum(['chat', 'search_assist']).optional().default('chat'),
  idempotencyKey: z.string().max(255).optional(),
  preferredProvider: z.enum(['anthropic', 'openai', 'gemini', 'auto']).optional(),
});

type RequestBody = z.infer<typeof RequestBodySchema>;
type ChatMessage = RequestBody['messages'][0];

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});
const encoder = new TextEncoder();

// ═══════════════════════════════════════════════════════════════════════════
// ERROR DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

class AppError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

class ValidationError extends AppError {
  constructor(message: string, public details?: unknown) {
    super(message, 400, "VALIDATION_FAILED", false);
  }
}

class AuthError extends AppError {
  constructor(message = "Authentication failed.", code = "AUTH_FAILED", status = 401) {
    super(message, status, code, false);
  }
}

class ProviderError extends AppError {
  constructor(public provider: string, public upstreamStatus: number, message: string) {
    const retryable = upstreamStatus === 429 || (upstreamStatus >= 500 && upstreamStatus !== 501);
    super(`${provider} API error: ${message}`, 502, "UPSTREAM_API_ERROR", retryable);
  }
}

class TimeoutError extends AppError {
  constructor(message: string, code = "TIMEOUT") {
    super(message, 504, code, true);
  }
}

class RateLimitError extends AppError {
  constructor(message: string) {
    super(message, 429, "RATE_LIMIT_EXCEEDED", false);
  }
}

class CircuitBreakerError extends AppError {
  constructor(provider: string) {
    super(`Circuit breaker open for ${provider}. Service unavailable.`, 503, "CIRCUIT_BREAKER_OPEN", true);
  }
}

Deno.serve(async (req: Request) => {
  const requestStartTime = performance.now();
  const url = new URL(req.url);
  const ctx = initializeRequestContext(req);

  const responseHeaders: Record<string, string> = {
    ...corsHeaders,
    ...SECURITY_HEADERS,
    'X-Request-ID': ctx.requestId,
    'X-Trace-ID': ctx.trace.traceId,
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: responseHeaders, status: 204 });
  }

  // Health check endpoint
  if (req.method === 'GET' && url.pathname.endsWith('/health')) {
    return handleHealthCheck(responseHeaders);
  }

  // Only allow POST for chat
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...responseHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Parse request body
    const rawBody = await req.json().catch(() => {
      throw new ValidationError("Invalid JSON payload");
    });

    log("DEBUG", "[REQUEST] Body parsed", { ctx, bodySize: JSON.stringify(rawBody).length });

    // Validate request
    const validationResult = RequestBodySchema.safeParse(rawBody);
    if (!validationResult.success) {
      log("WARN", "[VALIDATION] Request validation failed", { ctx, errors: validationResult.error.format() });
      throw new ValidationError("Invalid request structure", validationResult.error.format());
    }

    const requestData = validationResult.data;
    const { messages, mode, preferredProvider } = requestData;

    // For now, use simple Gemini call without auth
    if (!env.GEMINI_API_KEY) {
      throw new AppError("Gemini API key not configured", 500, "CONFIG_ERROR", false);
    }

    log("INFO", "[ROUTER] Routing to Gemini", { ctx, messageCount: messages.length });

    // Call Gemini API
    const geminiMessages = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }]
    }));

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${env.GEMINI_API_KEY}`;
    
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: geminiMessages,
        generationConfig: { maxOutputTokens: 6000 }
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      log("ERROR", "[GEMINI] API error", { ctx, status: geminiResponse.status, error: errorText });
      throw new ProviderError('gemini', geminiResponse.status, errorText);
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';

    const latency = performance.now() - requestStartTime;
    log("INFO", "[COMPLETE] Request completed successfully", { ctx, latency, provider: 'gemini' });

    return new Response(JSON.stringify({
      response: responseText,
      provider: 'gemini',
      latency
    }), {
      status: 200,
      headers: { ...responseHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const latency = performance.now() - requestStartTime;
    log("ERROR", "[REQUEST] Request failed", { ctx, error, latency });

    let status = 500;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (error instanceof AppError) {
      status = error.status;
      message = error.message;
      code = error.code;
    } else if (error instanceof Error) {
      message = error.message;
    }

    return new Response(JSON.stringify({
      error: message,
      code,
      requestId: ctx.requestId
    }), {
      status,
      headers: { ...responseHeaders, 'Content-Type': 'application/json' }
    });
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { corsHeaders } from "../_shared/cors.ts";
// Assuming searchRouter.ts exists and is functional
import { handleSearchQuery } from "./searchRouter.ts";

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION & VALIDATION (Fail-fast initialization)
// ═══════════════════════════════════════════════════════════════════════════

const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(["TRACE", "DEBUG", "INFO", "WARN", "ERROR"]).default("INFO"),
  DEBUG_SECRET_HEADER_VALUE: z.string().optional(),
  ENABLE_CIRCUIT_BREAKER: z.coerce.boolean().default(true),
  ENABLE_REQUEST_DEDUPLICATION: z.coerce.boolean().default(true),
  ENABLE_RATE_LIMITING: z.coerce.boolean().default(true),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
});

function initializeEnvironment() {
  try {
    return EnvSchema.parse(Deno.env.toObject());
  } catch (error) {
    const errorDetails = error instanceof z.ZodError ? error.errors : String(error);
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "FATAL",
        message: "[INIT] Invalid environment configuration.",
        details: errorDetails,
      }),
    );
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
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  MAX_TRACE_LOG_LENGTH: 5000,
  IMAGE_BUCKET_NAME: "chat-uploads",
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 60,
  DEDUP_WINDOW_MS: 5000,
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

// ENHANCEMENT: Update RequestBodySchema to include optional context identifiers and preferredModel
const RequestBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(CONFIG.MAX_MESSAGE_LENGTH),
      }),
    )
    .nonempty()
    .max(CONFIG.MAX_MESSAGES_COUNT),
  conversationId: z.string().uuid().optional(),
  // NEW: Context identifiers
  projectId: z.string().uuid().optional(),
  clinicianId: z.string().uuid().optional(),
  // END NEW
  imageIds: z.array(z.string().uuid()).max(CONFIG.MAX_IMAGE_COUNT).optional(),
  mode: z.enum(["chat", "search_assist"]).optional().default("chat"),
  idempotencyKey: z.string().max(255).optional(),
  preferredProvider: z.enum(["anthropic", "openai", "gemini", "auto"]).optional(),
  // NEW: Explicit model selection
  preferredModel: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

// ENHANCEMENT: Define AppContext and update RequestContext interface
interface AppContext {
  projectId?: string;
  clinicianId?: string;
}

interface RequestContext {
  requestId: string;
  trace: { traceId: string; spanId: string; parentSpanId?: string };
  logLevel: number;
  enableClientDebug: boolean;
  userId?: string;
  appContext: AppContext; // NEW: Container for application-specific context
}

interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
  totalCost?: number;
}

interface ImageContent {
  media_type: string;
  data: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const encoder = new TextEncoder();

// ═══════════════════════════════════════════════════════════════════════════
// ERROR DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

class AppError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  constructor(message: string, status: number, code: string, retryable = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.name = this.constructor.name;
  }
}

class ValidationError extends AppError {
  details: any;
  constructor(message: string, details?: any) {
    super(message, 400, "VALIDATION_FAILED", false);
    this.details = details;
  }
}

// ENHANCEMENT: Specific error for image validation failures
class ImageValidationError extends ValidationError {
  constructor(message: string, details?: any) {
    super(message, details);
    this.code = "IMAGE_VALIDATION_FAILED";
  }
}

class AuthError extends AppError {
  constructor(message = "Authentication failed.", code = "AUTH_FAILED", status = 401) {
    super(message, status, code, false);
  }
}

class ProviderError extends AppError {
  provider: string;
  upstreamStatus: number;
  constructor(provider: string, upstreamStatus: number, message: string) {
    const retryable = upstreamStatus === 429 || (upstreamStatus >= 500 && upstreamStatus !== 501);
    super(`${provider} API error: ${message}`, 502, "UPSTREAM_API_ERROR", retryable);
    this.provider = provider;
    this.upstreamStatus = upstreamStatus;
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

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING & OBSERVABILITY
// ═══════════════════════════════════════════════════════════════════════════

const LOG_LEVELS = { TRACE: -1, DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[env.LOG_LEVEL];

function log(
  level: keyof typeof LOG_LEVELS,
  message: string,
  meta: { error?: any; ctx?: RequestContext; [key: string]: any } = {},
) {
  const currentLogLevel = meta.ctx ? meta.ctx.logLevel : CURRENT_LOG_LEVEL;
  if (LOG_LEVELS[level] < currentLogLevel) return;

  const { error, ctx, ...restMeta } = meta;

  const logEntry: Record<string, any> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
    region: DEPLOYMENT_REGION,
    requestId: ctx?.requestId,
    traceId: ctx?.trace.traceId,
    spanId: ctx?.trace.spanId,
    userId: ctx?.userId,
    // ENHANCEMENT: Include context identifiers in logs
    projectId: ctx?.appContext?.projectId,
    clinicianId: ctx?.appContext?.clinicianId,
    // END ENHANCEMENT
    ...restMeta,
  };

  if (error instanceof Error) {
    logEntry.error = {
      message: error.message,
      name: error.name,
      stack: error.stack,
      ...(error instanceof AppError && { code: error.code, status: error.status, retryable: error.retryable }),
    };
  } else if (error) {
    logEntry.error = String(error);
  }

  const serializedLog = JSON.stringify(logEntry);

  switch (level) {
    case "ERROR":
      console.error(serializedLog);
      break;
    case "WARN":
      console.warn(serializedLog);
      break;
    default:
      console.log(serializedLog);
  }
}

function createTraceContext(req: Request): RequestContext["trace"] {
  // ... (Implementation remains the same)
  const traceparent = req.headers.get("traceparent");
  if (traceparent) {
    const parts = traceparent.split("-");
    if (parts.length === 4 && parts[0] === "00" && parts[1].length === 32 && parts[2].length === 16) {
      return {
        traceId: parts[1],
        spanId: crypto.randomUUID().replaceAll("-", "").substring(0, 16),
        parentSpanId: parts[2],
      };
    }
  }
  return {
    traceId: crypto.randomUUID().replaceAll("-", ""),
    spanId: crypto.randomUUID().replaceAll("-", "").substring(0, 16),
  };
}

function initializeRequestContext(req: Request): RequestContext {
  const requestId = crypto.randomUUID();
  const trace = createTraceContext(req);
  let logLevel = CURRENT_LOG_LEVEL;
  let enableClientDebug = false;

  const debugHeaderValue = req.headers.get("X-Debug-Mode");
  if (env.DEBUG_SECRET_HEADER_VALUE && debugHeaderValue === env.DEBUG_SECRET_HEADER_VALUE) {
    logLevel = LOG_LEVELS.TRACE;
    enableClientDebug = true;
    // Log activation immediately as ctx is not fully formed yet
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        message: "[DEBUG] Debug mode activated via header for this request.",
        requestId,
        traceId: trace.traceId,
        service: SERVICE_NAME,
      }),
    );
  }

  return {
    requestId,
    trace,
    logLevel,
    enableClientDebug,
    // ENHANCEMENT: Initialize appContext container
    appContext: {},
  };
}

class MetricsCollector {
  // ... (Implementation remains the same)
  private metrics = new Map<string, number[]>();
  private MAX_SAMPLES = 100;

  record(metric: string, value: number) {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    const values = this.metrics.get(metric)!;
    values.push(value);
    if (values.length > this.MAX_SAMPLES) {
      values.shift();
    }
  }

  getPercentile(metric: string, percentile: number): number | null {
    const values = this.metrics.get(metric);
    if (!values || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }
}

const metrics = new MetricsCollector();
log("INFO", "[INIT] AI Chat Router Initializing.");

// ═══════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER PATTERN (Remains the same)
// ═══════════════════════════════════════════════════════════════════════════

enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

class CircuitBreaker {
  // ... (Implementation remains the same)
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private readonly threshold: number,
    private readonly timeout: number,
    private readonly recoverySuccesses: number,
    public readonly name: string,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!env.ENABLE_CIRCUIT_BREAKER) {
      return operation();
    }

    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        log("INFO", `[CIRCUIT-BREAKER] Transitioning to HALF_OPEN, attempting recovery.`, { circuit: this.name });
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new CircuitBreakerError(this.name);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      // Only count retryable errors or generic network/system errors towards tripping the breaker
      if ((error instanceof AppError && error.retryable) || !(error instanceof AppError)) {
        this.onFailure();
      }
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.recoverySuccesses) {
        log("INFO", `[CIRCUIT-BREAKER] Closing circuit (Service Recovered).`, { circuit: this.name });
        this.state = CircuitState.CLOSED;
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === CircuitState.HALF_OPEN || this.failureCount >= this.threshold) {
      log("ERROR", `[CIRCUIT-BREAKER] Opening circuit (Service Failure Detected).`, {
        circuit: this.name,
        failures: this.failureCount,
        state: this.state,
      });
      this.state = CircuitState.OPEN;
    }
  }

  getState(): CircuitState {
    if (this.state === CircuitState.OPEN && Date.now() - this.lastFailureTime >= this.timeout) {
      return CircuitState.HALF_OPEN;
    }
    return this.state;
  }
}

const circuitBreakers = {
  anthropic: new CircuitBreaker(
    CONFIG.CIRCUIT_BREAKER_THRESHOLD,
    CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS,
    CONFIG.CIRCUIT_BREAKER_RECOVERY_SUCCESSES,
    "anthropic",
  ),
  openai: new CircuitBreaker(
    CONFIG.CIRCUIT_BREAKER_THRESHOLD,
    CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS,
    CONFIG.CIRCUIT_BREAKER_RECOVERY_SUCCESSES,
    "openai",
  ),
  gemini: new CircuitBreaker(
    CONFIG.CIRCUIT_BREAKER_THRESHOLD,
    CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS,
    CONFIG.CIRCUIT_BREAKER_RECOVERY_SUCCESSES,
    "gemini",
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING & DEDUPLICATION (Remains the same)
// ═══════════════════════════════════════════════════════════════════════════

class RateLimiter {
  // ... (Implementation remains the same)
  private requests = new Map<string, number[]>();

  async checkLimit(userId: string) {
    if (!env.ENABLE_RATE_LIMITING) return;

    const now = Date.now();
    const windowStart = now - CONFIG.RATE_LIMIT_WINDOW_MS;
    let userRequests = this.requests.get(userId) || [];

    userRequests = userRequests.filter((timestamp) => timestamp > windowStart);

    if (userRequests.length >= CONFIG.RATE_LIMIT_MAX_REQUESTS) {
      throw new RateLimitError(
        `Rate limit exceeded: ${CONFIG.RATE_LIMIT_MAX_REQUESTS} requests per ${CONFIG.RATE_LIMIT_WINDOW_MS / 1000}s`,
      );
    }

    userRequests.push(now);
    this.requests.set(userId, userRequests);

    // Periodic cleanup
    if (Math.random() < 0.01) {
      this.cleanup(windowStart);
    }
  }

  private cleanup(windowStart: number) {
    for (const [userId, requests] of this.requests.entries()) {
      const activeRequests = requests.filter((ts) => ts > windowStart);
      if (activeRequests.length === 0) {
        this.requests.delete(userId);
      } else {
        this.requests.set(userId, activeRequests);
      }
    }
  }

  getRemainingRequests(userId: string): number {
    const now = Date.now();
    const windowStart = now - CONFIG.RATE_LIMIT_WINDOW_MS;
    const userRequests = this.requests.get(userId) || [];
    const activeRequests = userRequests.filter((ts) => ts > windowStart);
    return Math.max(0, CONFIG.RATE_LIMIT_MAX_REQUESTS - activeRequests.length);
  }
}

const rateLimiter = new RateLimiter();

class RequestDeduplicator {
  // ... (Implementation remains the same)
  private pending = new Map<string, { promise: Promise<any>; timestamp: number }>();

  // ENHANCEMENT: Include preferredModel/Provider in the key as they affect the output
  async createKey(userId: string, body: z.infer<typeof RequestBodySchema>): Promise<string> {
    const payload = JSON.stringify({
      userId,
      messages: body.messages,
      imageIds: body.imageIds || [],
      preferredModel: body.preferredModel,
      preferredProvider: body.preferredProvider,
    });
    const msgBuffer = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async deduplicate<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (!env.ENABLE_REQUEST_DEDUPLICATION) {
      return operation();
    }

    const now = Date.now();
    const existing = this.pending.get(key);

    if (existing && now - existing.timestamp < CONFIG.DEDUP_WINDOW_MS) {
      log("INFO", "[DEDUP] Returning cached pending request (Request In-Flight)", {
        key_hash: key.substring(0, 15) + "...",
      });
      return existing.promise;
    }

    const promise = operation();
    this.pending.set(key, { promise, timestamp: now });

    promise.finally(() => {
      const entry = this.pending.get(key);
      // Only remove if it's the exact same request instance that set it
      if (entry && entry.timestamp === now) {
        this.pending.delete(key);
      }
    });

    return promise;
  }

  cleanup() {
    const now = Date.now();
    // Set cutoff time longer than the max stream time
    const cutoff = now - (CONFIG.STREAM_TOTAL_TIMEOUT_MS + 5000);
    let count = 0;
    for (const [key, request] of this.pending.entries()) {
      if (request.timestamp < cutoff) {
        this.pending.delete(key);
        count++;
      }
    }
    if (count > 0) {
      log("INFO", "[DEDUP-CLEANUP] Removed stalled requests", { count });
    }
  }
}

const deduplicator = new RequestDeduplicator();
setInterval(() => deduplicator.cleanup(), 60000); // Run cleanup periodically

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTIVE TIMEOUT CALCULATOR (Remains the same)
// ═══════════════════════════════════════════════════════════════════════════

class AdaptiveTimeout {
  // ... (Implementation remains the same)
  getConnectionTimeout(provider: string): number {
    const p95 = metrics.getPercentile(`${provider}_connection_time`, 95);
    if (!p95) return CONFIG.API_CONNECT_TIMEOUT_MS;
    // Use P95 latency * 1.5 as a heuristic, bounded by the configured minimum
    return Math.max(CONFIG.API_CONNECT_TIMEOUT_MS, p95 * 1.5);
  }

  getStreamInactivityTimeout(provider: string): number {
    // Use P95 TTFT * 2 as a heuristic for initial inactivity
    const p95 = metrics.getPercentile(`${provider}_ttft`, 95);
    if (!p95) return CONFIG.STREAM_INACTIVITY_TIMEOUT_MS;
    return Math.max(CONFIG.STREAM_INACTIVITY_TIMEOUT_MS, p95 * 2);
  }
}

const adaptiveTimeout = new AdaptiveTimeout();

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION (Remains the same)
// ═══════════════════════════════════════════════════════════════════════════

async function authenticateUser(token: string, ctx: RequestContext) {
  // ... (Implementation remains the same)
  const startTime = performance.now();
  try {
    log("DEBUG", "[AUTH] Attempting authentication", { ctx });
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      log("WARN", "[AUTH] Invalid or expired token", { ctx, error: error?.message });
      throw new AuthError("Invalid or expired token", "AUTH_INVALID_TOKEN", 401);
    }

    metrics.record("auth_duration", performance.now() - startTime);
    log("DEBUG", "[AUTH] Authentication successful", { ctx, userId: data.user.id });
    return { id: data.user.id, email: data.user.email };
  } catch (error) {
    metrics.record("auth_duration", performance.now() - startTime);
    if (!(error instanceof AuthError)) {
      log("ERROR", "[AUTH] Unexpected authentication service error", { ctx, error });
      throw new AppError("Authentication service unavailable", 500, "AUTH_SERVICE_ERROR", true);
    }
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING LOGIC
// ═══════════════════════════════════════════════════════════════════════════

interface RouteProfile {
  provider: "anthropic" | "openai" | "gemini";
  model: string;
  limits: { maxOutputTokens: number; timeoutMs: number; temperature: number };
  enabled: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
}

// NOTE: Model names must match the exact strings used by the providers.
const ROUTER_CONFIG: Record<string, RouteProfile> = {
  anthropic: {
    provider: "anthropic",
    model: "claude-3-5-sonnet-20240620", // Updated example model
    limits: { maxOutputTokens: 8000, timeoutMs: 180000, temperature: 0.7 },
    enabled: !!env.ANTHROPIC_API_KEY,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  openai: {
    provider: "openai",
    model: "gpt-4o",
    limits: { maxOutputTokens: 8000, timeoutMs: 180000, temperature: 0.7 },
    enabled: !!env.OPENAI_API_KEY,
    costPer1kInput: 0.005, // Updated GPT-4o pricing
    costPer1kOutput: 0.015,
  },
  gemini: {
    provider: "gemini",
    model: "gemini-1.5-pro-latest", // Updated example model
    limits: { maxOutputTokens: 8000, timeoutMs: 180000, temperature: 0.7 },
    enabled: !!env.GEMINI_API_KEY,
    costPer1kInput: 0.0035, // Example pricing
    costPer1kOutput: 0.0105,
  },
};

const PREFERRED_MODEL_KEY = "anthropic"; // Updated preference based on recent models
const FALLBACK_MODEL_KEY = "openai";

const CODE_WORDS = new Set([
  "code",
  "function",
  "debug",
  "implement",
  "algorithm",
  "typescript",
  "error",
  "bug",
  "api",
  "sql",
  "javascript",
  "python",
  "refactor",
]);

// ENHANCEMENT: Update signature to include preferredModel
function decideRoute(
  messages: any[],
  imageCount: number,
  ctx: RequestContext,
  userPreferredProvider?: string,
  userPreferredModel?: string,
) {
  log("DEBUG", "[ROUTER] Starting routing decision", { ctx, imageCount, userPreferredProvider, userPreferredModel });

  const selectHealthyProfile = (keys: string[]): RouteProfile | undefined => {
    for (const key of keys) {
      const profile = ROUTER_CONFIG[key];
      if (profile && profile.enabled) {
        const breaker = circuitBreakers[profile.provider];
        const state = breaker.getState();
        if (state !== CircuitState.OPEN) {
          log("DEBUG", `[ROUTER] Profile ${key} is healthy (State: ${state}) and enabled.`, { ctx });
          return profile;
        } else {
          log("WARN", `[ROUTER] Provider ${profile.provider} circuit breaker is OPEN. Skipping.`, {
            ctx,
            modelKey: key,
          });
        }
      } else {
        log("DEBUG", `[ROUTER] Profile ${key} is disabled or missing.`, { ctx });
      }
    }
    return undefined;
  };

  // ENHANCEMENT: Handle explicit model selection (Highest Priority)
  if (userPreferredModel) {
    // Find the profile that corresponds to this exact model string
    const matchingProfile = Object.values(ROUTER_CONFIG).find((p) => p.model === userPreferredModel);

    if (matchingProfile) {
      if (matchingProfile.enabled) {
        const breaker = circuitBreakers[matchingProfile.provider];
        if (breaker.getState() !== CircuitState.OPEN) {
          log("INFO", `[ROUTER] Routing to user explicitly selected model: ${userPreferredModel}`, { ctx });
          return {
            taskType: "user_model_preference",
            profile: matchingProfile,
            reasoning: `User explicitly requested model ${userPreferredModel}. Routed to ${matchingProfile.provider}.`,
          };
        } else {
          log(
            "WARN",
            `[ROUTER] User requested model ${userPreferredModel} but provider ${matchingProfile.provider} circuit is OPEN. Falling back to auto-routing.`,
            { ctx },
          );
        }
      } else {
        log(
          "WARN",
          `[ROUTER] User requested model ${userPreferredModel} but it is disabled. Falling back to auto-routing.`,
          { ctx },
        );
      }
    } else {
      log("WARN", `[ROUTER] User requested unknown model ${userPreferredModel}. Falling back to auto-routing.`, {
        ctx,
      });
    }
  }

  // --- Auto-routing logic (remains the same) ---
  const lastMessage = messages[messages.length - 1];
  const userText = lastMessage.content.toLowerCase();

  let taskType = "general";
  let preferredKeys = [PREFERRED_MODEL_KEY, FALLBACK_MODEL_KEY];

  if (userPreferredProvider && userPreferredProvider !== "auto") {
    taskType = "user_provider_preference";
    preferredKeys = [userPreferredProvider, PREFERRED_MODEL_KEY, FALLBACK_MODEL_KEY];
    log("INFO", `[ROUTER] User explicitly selected provider: ${userPreferredProvider}`, { ctx });
  } else if (imageCount > 0) {
    taskType = "vision";
    preferredKeys = ["anthropic", "openai", "gemini"];
  } else {
    const words = userText.split(/\s+/);
    if (words.some((word) => CODE_WORDS.has(word))) {
      taskType = "code";
      preferredKeys = ["anthropic", "openai", "gemini"];
    }
  }

  let profile = selectHealthyProfile(preferredKeys);
  let reasoning = `Task type: ${taskType}. Preferred models considered: [${preferredKeys.join(", ")}].`;

  if (!profile) {
    log("WARN", `[ROUTER] All preferred providers unavailable for task ${taskType}. Attempting global fallback.`, {
      ctx,
    });
    const allKeys = Object.keys(ROUTER_CONFIG);
    profile = selectHealthyProfile(allKeys);
    reasoning += " Fallback required due to preferred model unavailability.";
  }

  if (!profile) {
    log("ERROR", "[ROUTER] Service Unavailable: No AI providers available.", { ctx });
    throw new AppError(
      "Service Unavailable: No AI providers are currently operational.",
      503,
      "NO_PROVIDERS_AVAILABLE",
      false,
    );
  }

  reasoning += ` Routed to ${profile.provider} (${profile.model}).`;

  return { taskType, profile, reasoning };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESILIENCE UTILITIES (retryOperation, shouldRetryApiCall, createSSEParser remain the same)
// ═══════════════════════════════════════════════════════════════════════════

async function retryOperation<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: any) => boolean,
  maxRetries = CONFIG.MAX_RETRIES,
  ctx: RequestContext,
): Promise<T> {
  // ... (Implementation remains identical to the original input)
}

const shouldRetryApiCall = (error: any): boolean => {
  // ... (Implementation remains identical to the original input)
};

function createSSEParser(
  parser: (data: string) => { chunk: string | null; usage: { inputTokens?: number; outputTokens?: number } | null },
  provider: string,
  ctx: RequestContext,
) {
  // ... (Implementation remains identical to the original input)
}

// ═══════════════════════════════════════════════════════════════════════════
// API INTEGRATIONS (Remains the same)
// ═══════════════════════════════════════════════════════════════════════════

async function callProviderAPI(
  profile: RouteProfile,
  payload: any,
  systemPrompt: string,
  clientSignal: AbortSignal,
  ctx: RequestContext,
) {
  // ... (Implementation remains identical to the original input, handling Anthropic, OpenAI, and Gemini)
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA FETCHING & UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function sendSSE(controller: ReadableStreamDefaultController, eventType: string, data: any) {
  // ... (Implementation remains the same)
}

function sendDebugEvent(controller: ReadableStreamDefaultController, ctx: RequestContext, stage: string, details: any) {
  // ... (Implementation remains the same)
}

// ENHANCEMENT: Helper function to resolve context IDs from conversationId
async function resolveConversationContext(
  conversationId: string,
  userId: string,
  ctx: RequestContext,
): Promise<AppContext> {
  log("DEBUG", "[CONTEXT-RESOLVER] Resolving context from conversationId", { ctx, conversationId });

  const { data, error } = await supabaseAdmin
    .from("ai_conversations")
    .select("project_id, clinician_id, user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !data) {
    log("WARN", "[CONTEXT-RESOLVER] Conversation not found or error occurred", { ctx, conversationId, error });
    // If conversation lookup fails, we proceed without context rather than failing the request.
    return {};
  }

  // Security Check: Ensure the user owns the conversation
  if (data.user_id !== userId) {
    log("ERROR", "[CONTEXT-RESOLVER] Unauthorized access attempt to conversation context", {
      ctx,
      conversationId,
      attemptedUserId: userId,
    });
    throw new AuthError("Unauthorized access to conversation", "AUTH_FORBIDDEN", 403);
  }

  log("DEBUG", "[CONTEXT-RESOLVER] Context resolved successfully", {
    ctx,
    projectId: data.project_id,
    clinicianId: data.clinician_id,
  });
  return { projectId: data.project_id || undefined, clinicianId: data.clinician_id || undefined };
}

// ENHANCEMENT: Implement getDomainContext using user_contexts and appContext (Project/Clinician)
async function getDomainContext(userId: string, ctx: RequestContext): Promise<string | null> {
  log("DEBUG", "[CONTEXT] Fetching domain context", { ctx });

  const contextPromises = [];
  // Use a structured approach to prioritize prompts
  const prompts: { source: "project_instruction" | "clinician_profile" | "user_preference"; content: string }[] = [];

  // 1. Fetch active user contexts (Table: user_contexts)
  contextPromises.push(
    supabaseAdmin
      .from("user_contexts")
      .select("context_content")
      .eq("user_id", userId)
      .eq("is_active", true)
      .is("deleted_at", null) // Ensure not soft-deleted
      .then(({ data, error }) => {
        if (error) {
          log("ERROR", "[CONTEXT] Failed to fetch user_contexts", { error, ctx });
          return;
        }
        if (data && data.length > 0) {
          data.forEach((c) => prompts.push({ source: "user_preference", content: c.context_content }));
          log("DEBUG", `[CONTEXT] Found ${data.length} active user contexts.`, { ctx });
        }
      }),
  );

  // 2. Fetch project-specific system prompt (Table: projects)
  if (ctx.appContext.projectId) {
    contextPromises.push(
      supabaseAdmin
        .from("projects")
        .select("system_prompt")
        .eq("id", ctx.appContext.projectId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            log("ERROR", "[CONTEXT] Failed to fetch project system prompt", { error, ctx });
            return;
          }
          if (data?.system_prompt) {
            prompts.push({ source: "project_instruction", content: data.system_prompt });
            log("DEBUG", "[CONTEXT] Found project-specific system prompt.", { ctx });
          }
        }),
    );
  }

  // 3. Fetch clinician-specific context (Table: clinician_communication_profiles)
  if (ctx.appContext.clinicianId) {
    contextPromises.push(
      supabaseAdmin
        .from("clinician_communication_profiles")
        .select("communication_style, notes")
        .eq("clinician_id", ctx.appContext.clinicianId)
        .eq("user_id", userId) // Security check: ensure profile relates to the current user (e.g., recruiter)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            log("ERROR", "[CONTEXT] Failed to fetch clinician communication profile", { error, ctx });
            return;
          }
          if (data) {
            const clinicianContext = `[CLINICIAN INTERACTION STYLE]:\nTarget Style: ${data.communication_style}\nNotes: ${data.notes || "N/A"}`;
            prompts.push({ source: "clinician_profile", content: clinicianContext });
            log("DEBUG", "[CONTEXT] Found clinician profile.", { ctx });
          }
        }),
    );
  }

  await Promise.all(contextPromises);

  if (prompts.length === 0) {
    return null;
  }

  // Combine contexts, prioritizing Project > Clinician > User
  const sortedPrompts = prompts.sort((a, b) => {
    if (a.source === "project_instruction") return -1;
    if (b.source === "project_instruction") return 1;
    if (a.source === "clinician_profile") return -1;
    if (b.source === "clinician_profile") return 1;
    return 0;
  });

  const combinedPrompt = sortedPrompts.map((p) => p.content).join("\n\n---\n\n");
  log("DEBUG", "[CONTEXT] Domain context fetching complete.", { ctx, promptLength: combinedPrompt.length });
  return combinedPrompt;
}

const VALID_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// ENHANCEMENT: Implement Fail-Fast validation and Async Linking
async function fetchAndEncodeImages(
  imageIds: string[],
  userId: string,
  conversationId: string | undefined,
  ctx: RequestContext,
): Promise<ImageContent[]> {
  if (!imageIds || imageIds.length === 0) return [];

  log("DEBUG", "[IMAGES] Fetching and validating images", { ctx, imageIds });

  // Use 'file_size' column name as per the 'uploaded_images' schema
  const { data: imageRecords, error } = await supabaseAdmin
    .from("uploaded_images")
    .select("id, mime_type, storage_path, file_size")
    .in("id", imageIds)
    .eq("user_id", userId); // Validate ownership

  if (error) {
    log("ERROR", "[IMAGES] Database error fetching image records", { error, ctx });
    throw new AppError("Failed to verify images.", 500, "IMAGE_DB_ERROR", true);
  }

  // Authorization/Existence Check (Fail-Fast)
  if (!imageRecords || imageRecords.length !== imageIds.length) {
    log("WARN", "[IMAGES] Unauthorized access attempt or missing images", { ctx });
    throw new ImageValidationError("One or more images could not be found or accessed.");
  }

  // Pre-download Validation (Size and Type) (Fail-Fast)
  const oversized = imageRecords.filter((r) => r.file_size && r.file_size > CONFIG.MAX_IMAGE_SIZE_BYTES);
  if (oversized.length > 0) {
    log("WARN", "[IMAGES] Image(s) exceed size limit", { ctx });
    throw new ImageValidationError(
      `Image(s) exceed the maximum size limit of ${Math.round(CONFIG.MAX_IMAGE_SIZE_BYTES / (1024 * 1024))}MB.`,
    );
  }

  const invalidTypes = imageRecords.filter((r) => r.mime_type && !VALID_MIME_TYPES.has(r.mime_type));
  if (invalidTypes.length > 0) {
    log("WARN", "[IMAGES] Invalid MIME type(s)", { ctx });
    throw new ImageValidationError("One or more images have an unsupported file type.");
  }

  log("DEBUG", "[IMAGES] Image metadata fetched and validated.", { ctx, count: imageRecords.length });

  // ENHANCEMENT: Asynchronously link images to the conversation if not already linked
  if (conversationId) {
    const idsToLink = imageRecords.map((r) => r.id);
    // Use .then() for asynchronous DB operation without blocking the response
    supabaseAdmin
      .from("uploaded_images")
      .update({ conversation_id: conversationId })
      .in("id", idsToLink)
      .is("conversation_id", null) // Optimization: Only update if not already linked
      .then(({ error: linkError }) => {
        if (linkError) {
          log("ERROR", "[IMAGES-ASYNC] Failed to link images to conversation", { ctx, error: linkError });
        } else {
          log("DEBUG", "[IMAGES-ASYNC] Successfully initiated linking images to conversation", { ctx });
        }
      });
  }

  const downloadPromises = imageRecords.map(async (record) => {
    if (!record.storage_path || !record.mime_type) {
      // Should be caught by validation, but defensive coding
      throw new ImageValidationError("Image record incomplete.");
    }

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(CONFIG.IMAGE_BUCKET_NAME)
      .download(record.storage_path);

    // Download Failure (Fail-Fast)
    if (downloadError || !fileData) {
      log("ERROR", `[IMAGES] Failed to download image from storage`, { id: record.id, error: downloadError, ctx });
      // Throwing here ensures the request doesn't proceed if images are critical
      throw new AppError(`Failed to download necessary image resources.`, 500, "IMAGE_DOWNLOAD_ERROR", true);
    }

    // Post-download Size Check (Fail-Fast)
    if (fileData.size > CONFIG.MAX_IMAGE_SIZE_BYTES) {
      log("WARN", "[IMAGES] Downloaded image exceeds size limit (discrepancy with metadata)", {
        size: fileData.size,
        id: record.id,
        ctx,
      });
      throw new ImageValidationError(`Image size exceeds limit during download.`);
    }

    try {
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = encodeBase64(arrayBuffer);
      return { media_type: record.mime_type, data: base64 };
    } catch (error) {
      log("ERROR", `[IMAGES] Failed to encode image`, { id: record.id, error, ctx });
      throw new AppError(`Failed to process image resources.`, 500, "IMAGE_PROCESSING_ERROR", false);
    }
  });

  // Promise.all will reject immediately if any download/processing throws an error
  const results = await Promise.all(downloadPromises);
  return results.filter((r): r is ImageContent => r !== null);
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE FORMATTING (Remains the same)
// ═══════════════════════════════════════════════════════════════════════════
function formatMessagesForProvider(provider: string, messages: any[], images: ImageContent[], systemPrompt: string) {
  // ... (Implementation remains identical to the original input)
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE PERSISTENCE & TRACKING
// ═══════════════════════════════════════════════════════════════════════════

function persistMessage(requestId: string, messageData: any, ctx: RequestContext) {
  log("DEBUG", "[DB-ASYNC] Attempting to persist message", { ctx, requestId });
  // Fire and forget
  supabaseAdmin
    .from("ai_messages")
    .insert(messageData)
    .then(({ error }) => {
      if (error) {
        log("ERROR", "[DB-ASYNC] Failed to persist message", { requestId, error, ctx });
      } else {
        log("DEBUG", "[DB-ASYNC] Message persistence successful", { ctx, requestId });
      }
    });
}

function calculateCost(usage: UsageMetrics, profile: RouteProfile): number {
  const inputCost = (usage.inputTokens / 1000) * profile.costPer1kInput;
  const outputCost = (usage.outputTokens / 1000) * profile.costPer1kOutput;
  return inputCost + outputCost;
}

// ENHANCEMENT: Implement Request Context Tracking (Table: request_contexts)
async function trackRequestContext(
  ctx: RequestContext,
  status: "started" | "success" | "failed",
  details: { conversationId?: string; mode?: string; error?: string },
) {
  // Ensure userId is populated before tracking starts
  if (status === "started" && !ctx.userId) {
    log("WARN", "[REQUEST_CONTEXT] Cannot track start without userId", { ctx });
    return;
  }

  log("DEBUG", "[REQUEST_CONTEXT] Tracking request status", { ctx, status });

  if (status === "started") {
    const insertPayload = {
      id: ctx.requestId, // Using requestId as the identifier
      user_id: ctx.userId,
      conversation_id: details.conversationId || null,
      // Include appContext identifiers (space_id maps to project_id in schema)
      space_id: ctx.appContext.projectId || null,
      clinician_id: ctx.appContext.clinicianId || null,
      mode: details.mode || "chat",
      lane: "chat-router", // Identifier for this specific function/workflow
      started_at: new Date().toISOString(),
      status: "RUNNING",
    };
    // Await the insert to ensure it's logged before processing begins
    const { error } = await supabaseAdmin.from("request_contexts").insert(insertPayload);
    if (error) {
      log("ERROR", "[REQUEST_CONTEXT] Failed to insert request context", { ctx, error });
    }
  } else {
    // Updates can be asynchronous (fire-and-forget)
    const updatePayload = {
      status: status === "success" ? "FINISHED" : "FAILED",
      finished_at: new Date().toISOString(),
      error_message: details.error || null,
    };
    supabaseAdmin
      .from("request_contexts")
      .update(updatePayload)
      .eq("id", ctx.requestId)
      .then(({ error }) => {
        if (error) {
          log("ERROR", "[REQUEST_CONTEXT-ASYNC] Failed to update request context", { ctx, error });
        }
      });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK ENDPOINT (Remains the same)
// ═══════════════════════════════════════════════════════════════════════════
function handleHealthCheck(headers: Record<string, string>): Response {
  // ... (Implementation remains identical to the original input)
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const requestStartTime = performance.now();
  const url = new URL(req.url);

  const responseHeaders = { ...corsHeaders, ...SECURITY_HEADERS };

  if (req.method === "GET" && url.pathname === "/health") {
    return handleHealthCheck(responseHeaders);
  }

  const ctx = initializeRequestContext(req);
  const { requestId, trace } = ctx;
  responseHeaders["X-Request-ID"] = requestId;
  responseHeaders["X-Trace-ID"] = trace.traceId;

  const requestController = new AbortController();
  req.signal.addEventListener(
    "abort",
    () => {
      log("WARN", "[REQUEST] Client disconnected (signal)", { ctx });
      requestController.abort("Client disconnected");
    },
    { once: true },
  );

  log("INFO", "[REQUEST] Incoming", { method: req.method, path: url.pathname, ctx });

  if (ctx.enableClientDebug) {
    responseHeaders["X-Debug-Mode-Active"] = "true";
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: responseHeaders, status: 204 });
  }

  try {
    // --- Authentication and Body Parsing ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AuthError("Authorization header missing or malformed", "AUTH_HEADER_INVALID", 401);
    }
    const token = authHeader.substring(7);

    const authPromise = authenticateUser(token, ctx);
    const bodyPromise = req.json().catch(() => {
      throw new ValidationError("Invalid JSON payload or content type mismatch");
    });

    const [user, rawBody] = await Promise.all([authPromise, bodyPromise]);
    ctx.userId = user.id;

    log("DEBUG", "[REQUEST] Body parsed and user authenticated", { ctx, rawBodySize: JSON.stringify(rawBody).length });

    // --- Rate Limiting ---
    await rateLimiter.checkLimit(user.id);
    responseHeaders["X-RateLimit-Remaining"] = rateLimiter.getRemainingRequests(user.id).toString();
    responseHeaders["X-RateLimit-Limit"] = CONFIG.RATE_LIMIT_MAX_REQUESTS.toString();

    // --- Validation ---
    const validationResult = RequestBodySchema.safeParse(rawBody);
    if (!validationResult.success) {
      log("WARN", "[VALIDATION] Request validation failed", { ctx, errors: validationResult.error.format() });
      throw new ValidationError("Invalid request structure", validationResult.error.format());
    }

    const requestData = validationResult.data;
    // ENHANCEMENT: Destructure new fields
    const { messages, conversationId, imageIds, mode, preferredProvider, preferredModel } = requestData;

    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage.role !== "user") {
      throw new ValidationError("Last message must be from the user role.");
    }

    // ENHANCEMENT: Determine Application Context (Project/Clinician)
    const appContext: AppContext = {
      projectId: requestData.projectId,
      clinicianId: requestData.clinicianId,
    };

    // If context wasn't provided explicitly but conversationId was, look it up.
    if (conversationId && (!appContext.projectId || !appContext.clinicianId)) {
      // This function handles security checks internally
      const resolvedContext = await resolveConversationContext(conversationId, user.id, ctx);
      // Merge resolved context (explicitly provided takes precedence if available)
      appContext.projectId = appContext.projectId || resolvedContext.projectId;
      appContext.clinicianId = appContext.clinicianId || resolvedContext.clinicianId;
    }

    // Store the determined context in the request context for logging and downstream use
    ctx.appContext = appContext;
    // END ENHANCEMENT

    // ENHANCEMENT: Track the start of the request lifecycle
    // This must be done after authentication and context resolution
    await trackRequestContext(ctx, "started", { conversationId, mode });

    // --- Search Routing (remains the same) ---
    const searchTriggers = [/^search[: ]/i, /^find[: ]/i, /what (is|are) the latest/i];
    if (mode === "search_assist" || searchTriggers.some((t) => t.test(lastUserMessage.content))) {
      log("INFO", "[ROUTER] Search query detected, delegating.", { ctx });
      // Note: handleSearchQuery implementation is assumed to exist in ./searchRouter.ts
      return await handleSearchQuery({
        query: lastUserMessage.content,
        conversationId,
        userId: user.id,
        messages,
        supabase: supabaseAdmin,
        corsHeaders,
        userToken: token,
      });
    }

    // --- Deduplication ---
    const dedupKey = await deduplicator.createKey(user.id, requestData);
    log("DEBUG", "[DEDUP] Deduplication key generated", { ctx, keyHash: dedupKey.substring(0, 15) + "..." });

    return await deduplicator.deduplicate(dedupKey, async () => {
      const dedupStartTime = performance.now();

      // --- Data Fetching (Images and Context) ---
      log("DEBUG", "[DATA] Starting parallel data fetching (Images and Context)", { ctx });

      // ENHANCEMENT: Fetch images (now with fail-fast) and dynamic context in parallel
      const [images, domainContext] = await Promise.all([
        fetchAndEncodeImages(imageIds || [], user.id, conversationId, ctx),
        getDomainContext(user.id, ctx),
      ]);

      log("DEBUG", "[DATA] Parallel data fetching complete", {
        ctx,
        imagesCount: images.length,
        contextFound: !!domainContext,
      });

      // --- AI Routing ---
      // ENHANCEMENT: Pass preferredModel
      const { taskType, profile, reasoning } = decideRoute(
        messages,
        images.length,
        ctx,
        preferredProvider,
        preferredModel,
      );
      const { provider, model } = profile;

      log("INFO", "[ROUTER] Decision", { ctx, provider, model, taskType, reasoning });

      // Use the fetched domain context or a fallback
      const systemPrompt = domainContext || "You are a helpful AI assistant.";

      const apiPayload = formatMessagesForProvider(provider, messages, images, systemPrompt);

      // --- Persistence (User Message) ---
      if (conversationId) {
        persistMessage(
          requestId,
          {
            conversation_id: conversationId,
            role: "user",
            user_id: user.id,
            content: lastUserMessage.content,
            // ENHANCEMENT: Store actual image IDs in the dedicated JSONB column
            image_attachments: imageIds && imageIds.length > 0 ? imageIds.map((id) => ({ id })) : null,
            metadata: {
              image_count: images.length,
              mode,
              request_id: requestId,
              trace_id: trace.traceId,
              // ENHANCEMENT: Persist context identifiers
              project_id: ctx.appContext.projectId || null,
              clinician_id: ctx.appContext.clinicianId || null,
            },
          },
          ctx,
        );
      }

      // --- Streaming Response ---
      const stream = new ReadableStream({
        async start(controller) {
          const streamControllerStartTime = performance.now();

          // ... (Debug events remain similar, updated to include appContext)
          sendDebugEvent(controller, ctx, "INITIALIZATION", {
            requestId: ctx.requestId,
            traceId: ctx.trace.traceId,
            userId: ctx.userId,
            conversationId: conversationId || null,
            appContext: ctx.appContext, // Include appContext
            // ...
          });

          // ... (Routing and Payload Preview debug events)

          let ttftMs = 0;
          let firstChunkReceived = false;
          let assistantResponseText = "";
          let finalUsage: UsageMetrics = { inputTokens: 0, outputTokens: 0 };
          let upstreamReader = null;
          let apiCallError: any = null;

          try {
            sendSSE(controller, "metadata", {
              provider,
              model,
              taskType,
              reasoning,
              requestId,
              traceId: trace.traceId,
            });

            // ... (API Call and Streaming logic remains the same, including timeouts and Promise.race)

            // --- Usage Collection ---
            // ... (Usage collection logic remains the same)

            sendSSE(controller, "done", { status: "success", usage: finalUsage });
          } catch (error) {
            apiCallError = error;
            if (!(error instanceof AppError && error.code === "CLIENT_DISCONNECTED")) {
              log("ERROR", "[STREAM] Critical error during streaming", { ctx, provider, error });

              const errorType =
                error instanceof TimeoutError
                  ? "timeout"
                  : error instanceof ProviderError
                    ? "provider_error"
                    : error instanceof CircuitBreakerError
                      ? "circuit_breaker"
                      : "internal_error";
              const code = error instanceof AppError ? error.code : "UNKNOWN_STREAM_ERROR";

              sendSSE(controller, "error", { errorType, code, content: (error as Error).message });
            }
          } finally {
            const durationMs = performance.now() - requestStartTime;

            // ENHANCEMENT: Update Request Context Status
            const finalStatus = apiCallError ? "failed" : "success";
            trackRequestContext(ctx, finalStatus, { error: apiCallError?.message });

            // ... (Debug summary event)

            try {
              controller.close();
            } catch (e) {
              /* Controller might already be closed */
            }

            // --- Persistence (Assistant Message) ---
            if (assistantResponseText.trim() && conversationId) {
              persistMessage(
                requestId,
                {
                  conversation_id: conversationId,
                  role: "assistant",
                  user_id: user.id,
                  content: assistantResponseText,
                  model: model,
                  provider: provider, // Persist provider
                  task_type: taskType,
                  metadata: {
                    // ... (other metadata)
                    // ENHANCEMENT: Persist context identifiers
                    project_id: ctx.appContext.projectId || null,
                    clinician_id: ctx.appContext.clinicianId || null,
                  },
                },
                ctx,
              );
            }

            metrics.record("request_duration", durationMs);
            log("INFO", "[REQUEST] Completed", { ctx, status: 200, durationMs: Math.round(durationMs) });
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          ...responseHeaders,
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    });
  } catch (error) {
    const finalCtx = ctx || initializeRequestContext(req);

    // ENHANCEMENT: Track synchronous failure if userId is known
    // We check if tracking hasn't already occurred (e.g., if auth failed, userId might be missing)
    // We also avoid double-tracking if the error was the 403 from resolveConversationContext.
    if (finalCtx.userId && !(error instanceof AppError && error.code === "AUTH_FORBIDDEN")) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Use a generic 'failed' status for synchronous errors
      trackRequestContext(finalCtx, "failed", { error: errorMessage });
    }

    if (!(error instanceof AppError && error.code === "CLIENT_DISCONNECTED")) {
      log("ERROR", "[REQUEST] Failed (Synchronous Error)", { ctx: finalCtx, error });
    }

    // ... (Error response generation remains the same)
    let status = 500;
    let message = "Internal Server Error";
    let details = undefined;
    let code = "UNKNOWN_SYNC_ERROR";

    if (error instanceof AppError) {
      status = error.status;
      message = error.message;
      code = error.code;
      if (error instanceof ValidationError) {
        details = error.details;
      }
    }

    return new Response(
      JSON.stringify({
        error: message,
        details,
        requestId: finalCtx.requestId,
        code,
        traceId: finalCtx.trace.traceId,
      }),
      {
        status,
        headers: {
          ...responseHeaders,
          "X-Request-ID": finalCtx.requestId,
          "X-Trace-ID": finalCtx.trace.traceId,
          "Content-Type": "application/json",
        },
      },
    );
  }
});

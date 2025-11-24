import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

import { corsHeaders } from "../_shared/cors.ts";
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

type EnvConfig = z.infer<typeof EnvSchema>;

function initializeEnvironment(): EnvConfig {
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
  API_CONNECT_TIMEOUT_MS: 60000, // Increased to 60s for complex queries with googleSearch
  STREAM_INACTIVITY_TIMEOUT_MS: 45000, // Increased to 45s
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
  IMAGE_BUCKET_NAME: "chat-uploads",
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 60,
  DEDUP_WINDOW_MS: 5000,
} as const;

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
} as const;

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
  imageIds: z.array(z.string().uuid()).max(CONFIG.MAX_IMAGE_COUNT).optional(),
  mode: z.enum(["chat", "search_assist"]).optional().default("chat"),
  idempotencyKey: z.string().max(255).optional(),
  preferredProvider: z.enum(["anthropic", "openai", "gemini", "auto"]).optional(),
});

type RequestBody = z.infer<typeof RequestBodySchema>;
type ChatMessage = RequestBody["messages"][0];

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
  constructor(
    message: string,
    public status: number,
    public code: string,
    public retryable: boolean = false,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

class ValidationError extends AppError {
  constructor(
    message: string,
    public details?: unknown,
  ) {
    super(message, 400, "VALIDATION_FAILED", false);
  }
}

class AuthError extends AppError {
  constructor(message = "Authentication failed.", code = "AUTH_FAILED", status = 401) {
    super(message, status, code, false);
  }
}

class ProviderError extends AppError {
  constructor(
    public provider: string,
    public upstreamStatus: number,
    message: string,
  ) {
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

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING & OBSERVABILITY
// ═══════════════════════════════════════════════════════════════════════════

const LOG_LEVELS = { TRACE: -1, DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[env.LOG_LEVEL];

interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

interface RequestContext {
  requestId: string;
  trace: TraceContext;
  userId?: string;
  logLevel: number;
  enableClientDebug: boolean;
}

interface LogContext extends Record<string, unknown> {
  ctx?: RequestContext;
  error?: unknown;
  provider?: string;
}

function log(level: keyof typeof LOG_LEVELS, message: string, meta: LogContext = {}) {
  const currentLogLevel = meta.ctx ? meta.ctx.logLevel : CURRENT_LOG_LEVEL;

  if (LOG_LEVELS[level] < currentLogLevel) return;

  const { error, ctx, ...restMeta } = meta;

  const logEntry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
    region: DEPLOYMENT_REGION,
    requestId: ctx?.requestId,
    traceId: ctx?.trace.traceId,
    spanId: ctx?.trace.spanId,
    userId: ctx?.userId,
    ...restMeta,
  };

  if (error instanceof Error) {
    logEntry.error = {
      message: error.message,
      name: error.name,
      stack: error.stack,
      ...(error instanceof AppError && {
        code: error.code,
        status: error.status,
        retryable: error.retryable,
      }),
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

function createTraceContext(req: Request): TraceContext {
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
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        message: "[DEBUG] Debug mode (TRACE level and Client Events) activated via header for this request.",
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
  };
}

class MetricsCollector {
  private metrics: Map<string, number[]> = new Map();
  private readonly MAX_SAMPLES = 100;

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
// CIRCUIT BREAKER PATTERN
// ═══════════════════════════════════════════════════════════════════════════

enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private threshold: number,
    private timeout: number,
    private recoverySuccesses: number,
    private name: string,
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
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  async checkLimit(userId: string): Promise<void> {
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

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════════

interface PendingRequest {
  promise: Promise<Response>;
  timestamp: number;
}

class RequestDeduplicator {
  private pending: Map<string, PendingRequest> = new Map();

  async createKey(userId: string, body: RequestBody): Promise<string> {
    const payload = JSON.stringify({ userId, messages: body.messages, imageIds: body.imageIds || [] });
    const msgBuffer = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async deduplicate(key: string, operation: () => Promise<Response>): Promise<Response> {
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
      if (entry && entry.timestamp === now) {
        this.pending.delete(key);
      }
    });

    return promise;
  }

  cleanup() {
    const now = Date.now();
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

setInterval(() => deduplicator.cleanup(), 60000);

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTIVE TIMEOUT CALCULATOR
// ═══════════════════════════════════════════════════════════════════════════

class AdaptiveTimeout {
  getConnectionTimeout(provider: string): number {
    const p95 = metrics.getPercentile(`${provider}_connection_time`, 95);
    if (!p95) return CONFIG.API_CONNECT_TIMEOUT_MS;

    return Math.max(CONFIG.API_CONNECT_TIMEOUT_MS, p95 * 1.5);
  }

  getStreamInactivityTimeout(provider: string): number {
    const p95 = metrics.getPercentile(`${provider}_ttft`, 95);
    if (!p95) return CONFIG.STREAM_INACTIVITY_TIMEOUT_MS;

    return Math.max(CONFIG.STREAM_INACTIVITY_TIMEOUT_MS, p95 * 2);
  }
}

const adaptiveTimeout = new AdaptiveTimeout();

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════

async function authenticateUser(token: string, ctx: RequestContext): Promise<{ id: string; email?: string }> {
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
// ROUTING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

type Provider = "anthropic" | "openai" | "gemini";

interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
  totalCost?: number;
}

interface RouteProfile {
  provider: Provider;
  model: string;
  limits: {
    maxOutputTokens: number;
    timeoutMs: number;
    temperature: number;
  };
  enabled: boolean;
  costPer1kInput: number;
  costPer1kOutput: number;
}

const ROUTER_CONFIG: Record<string, RouteProfile> = {
  anthropic: {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    limits: {
      maxOutputTokens: 8000,
      timeoutMs: 180000,
      temperature: 0.7,
    },
    enabled: !!env.ANTHROPIC_API_KEY,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  openai: {
    provider: "openai",
    model: "gpt-4o",
    limits: {
      maxOutputTokens: 8000,
      timeoutMs: 180000,
      temperature: 0.7,
    },
    enabled: !!env.OPENAI_API_KEY,
    costPer1kInput: 0.0025,
    costPer1kOutput: 0.01,
  },
  gemini: {
    provider: "gemini",
    model: "gemini-3-pro-preview",
    limits: {
      maxOutputTokens: 6000,
      timeoutMs: 180000,
      temperature: 0.7,
    },
    enabled: !!env.GEMINI_API_KEY,
    costPer1kInput: 0.00125,
    costPer1kOutput: 0.005,
  },
};

const PREFERRED_MODEL_KEY = "gemini";
const FALLBACK_MODEL_KEY = "anthropic";

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

function decideRoute(
  messages: ChatMessage[],
  imageCount: number,
  ctx: RequestContext,
  userPreferredProvider?: string,
): { taskType: string; profile: RouteProfile; reasoning: string } {
  const lastMessage = messages[messages.length - 1];
  const userText = lastMessage.content.toLowerCase();

  log("DEBUG", "[ROUTER] Starting routing decision", {
    ctx,
    imageCount,
    messageLength: userText.length,
    userPreferredProvider,
  });

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

  let taskType = "general";
  let preferredKeys: string[] = [PREFERRED_MODEL_KEY, FALLBACK_MODEL_KEY];

  if (userPreferredProvider && userPreferredProvider !== "auto") {
    taskType = "user_preference";
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
// RESILIENCE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

async function retryOperation<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  maxRetries: number = CONFIG.MAX_RETRIES,
  ctx?: RequestContext,
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxRetries) {
    attempt++;
    log("DEBUG", "[RETRY] Attempt starting", { ctx, attempt, maxRetries });
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isRetryable = shouldRetry(error);

      if (!isRetryable) {
        log("INFO", "[RETRY] Operation failed permanently (non-retryable error).", {
          attempt,
          error,
          ctx,
        });
        throw error;
      }

      const baseDelay = Math.pow(2, attempt - 1) * CONFIG.RETRY_BASE_DELAY_MS;
      const delay = Math.max(CONFIG.RETRY_MIN_JITTER_DELAY_MS, Math.random() * baseDelay);

      log("WARN", "[RETRY] Operation failed (transient), retrying...", {
        attempt,
        maxRetries,
        delayMs: Math.round(delay),
        error,
        ctx,
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  log("ERROR", "[RETRY] Max retries exceeded.", {
    attempt,
    error: lastError,
    ctx,
  });
  throw lastError;
}

const shouldRetryApiCall = (error: unknown): boolean => {
  if (error instanceof AppError) {
    return error.retryable;
  }
  return error instanceof TypeError;
};

// ═══════════════════════════════════════════════════════════════════════════
// STREAM PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

type StreamParserResult = { chunk: string | null; usage: Partial<UsageMetrics> | null };
type StreamParser = (data: string) => StreamParserResult;

function createSSEParser(
  parser: StreamParser,
  provider: Provider,
  ctx: RequestContext,
): { transformer: TransformStream<Uint8Array, string>; usagePromise: Promise<UsageMetrics> } {
  const decoder = new TextDecoder();
  let buffer = "";
  const metrics: UsageMetrics = { inputTokens: 0, outputTokens: 0 };

  let resolveUsage: (value: UsageMetrics) => void;
  const usagePromise = new Promise<UsageMetrics>((resolve) => {
    resolveUsage = resolve;
  });

  const transformer = new TransformStream<Uint8Array, string>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) continue;

        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        log("TRACE", "[STREAM-IO] Raw SSE data received", {
          ctx,
          provider,
          rawData: data.substring(0, CONFIG.MAX_TRACE_LOG_LENGTH),
        });

        try {
          const result = parser(data);

          if (result.usage) {
            if (result.usage.inputTokens !== undefined) {
              metrics.inputTokens = result.usage.inputTokens;
            }
            if (result.usage.outputTokens !== undefined) {
              metrics.outputTokens += result.usage.outputTokens;
            }
          }

          if (result.chunk) {
            controller.enqueue(result.chunk);
          }
        } catch (e) {
          log("ERROR", `[STREAM] Fatal error processing chunk from ${provider}`, {
            error: e,
            ctx,
            rawDataSample: data.substring(0, 200),
          });
          controller.error(new ProviderError(provider, 500, `Failed to parse stream data: ${(e as Error).message}`));
          return;
        }
      }
    },
    flush() {
      log("DEBUG", "[STREAM] Flushing buffer and resolving usage metrics", { ctx, provider });
      resolveUsage(metrics);
    },
  });

  return { transformer, usagePromise };
}

// ═══════════════════════════════════════════════════════════════════════════
// API INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function callProviderAPI(
  profile: RouteProfile,
  payload: unknown,
  systemPrompt: string | undefined,
  clientSignal: AbortSignal,
  ctx: RequestContext,
): Promise<{ stream: ReadableStream<string>; usagePromise: Promise<UsageMetrics> }> {
  const { provider, model, limits } = profile;

  log("DEBUG", "[API] Preparing to call provider API", {
    ctx,
    provider,
    model,
  });

  return retryOperation(
    async () => {
      return circuitBreakers[provider].execute(async () => {
        let response: Response;
        let parser: StreamParser;

        const connectionStart = performance.now();

        const timeoutController = new AbortController();
        const connectionTimeout = adaptiveTimeout.getConnectionTimeout(provider);
        const timeoutError = new TimeoutError(
          `API connection timed out after ${connectionTimeout}ms`,
          "CONNECTION_TIMEOUT",
        );

        const timeoutId = setTimeout(() => {
          timeoutController.abort(timeoutError);
        }, connectionTimeout);

        const compositeSignal = AbortSignal.any([clientSignal, timeoutController.signal]);

        try {
          switch (provider) {
            case "anthropic": {
              if (!env.ANTHROPIC_API_KEY) throw new AppError("Anthropic API Key Missing", 500, "CONFIG_ERROR", false);

              const requestBody = JSON.stringify({
                model,
                max_tokens: limits.maxOutputTokens,
                messages: payload,
                stream: true,
                system: systemPrompt,
              });

              log("TRACE", "[API-IO] Sending Anthropic request payload", {
                ctx,
                requestBody:
                  requestBody.substring(0, CONFIG.MAX_TRACE_LOG_LENGTH) +
                  (requestBody.length > CONFIG.MAX_TRACE_LOG_LENGTH ? "... [TRUNCATED]" : ""),
              });

              response = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-api-key": env.ANTHROPIC_API_KEY,
                  "anthropic-version": "2023-06-01",
                  "anthropic-trace-id": ctx.trace.traceId,
                },
                body: requestBody,
                signal: compositeSignal,
              });

              parser = (data: string): StreamParserResult => {
                const parsed = JSON.parse(data);
                let chunk: string | null = null;
                let usage: Partial<UsageMetrics> | null = null;

                if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                  chunk = parsed.delta.text;
                } else if (parsed.type === "message_delta" && parsed.delta?.usage) {
                  usage = {
                    outputTokens: parsed.delta.usage.output_tokens || 0,
                  };
                } else if (parsed.type === "message_start" && parsed.message?.usage) {
                  usage = {
                    inputTokens: parsed.message.usage.input_tokens || 0,
                  };
                } else if (parsed.type === "error") {
                  throw new Error(`Anthropic Stream Error: ${parsed.error?.message}`);
                }

                return { chunk, usage };
              };
              break;
            }

            case "openai": {
              if (!env.OPENAI_API_KEY) throw new AppError("OpenAI API Key Missing", 500, "CONFIG_ERROR", false);

              const requestBody = JSON.stringify({
                model,
                messages: payload,
                stream: true,
                max_tokens: limits.maxOutputTokens,
                stream_options: { include_usage: true },
              });

              log("TRACE", "[API-IO] Sending OpenAI request payload", {
                ctx,
                requestBody:
                  requestBody.substring(0, CONFIG.MAX_TRACE_LOG_LENGTH) +
                  (requestBody.length > CONFIG.MAX_TRACE_LOG_LENGTH ? "... [TRUNCATED]" : ""),
              });

              response = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                  "X-Trace-Id": ctx.trace.traceId,
                },
                body: requestBody,
                signal: compositeSignal,
              });

              parser = (data: string): StreamParserResult => {
                const parsed = JSON.parse(data);
                let chunk: string | null = null;
                let usage: Partial<UsageMetrics> | null = null;

                if (parsed?.choices?.[0]?.delta?.content) {
                  chunk = parsed.choices[0].delta.content;
                }

                if (parsed.usage) {
                  usage = {
                    inputTokens: parsed.usage.prompt_tokens || 0,
                    outputTokens: parsed.usage.completion_tokens || 0,
                  };
                }

                return { chunk, usage };
              };
              break;
            }

            case "gemini": {
              if (!env.GEMINI_API_KEY) throw new AppError("Gemini API Key Missing", 500, "CONFIG_ERROR", false);

              const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${env.GEMINI_API_KEY}&alt=sse`;

              const geminiBody: Record<string, unknown> = {
                contents: payload,
                generationConfig: { maxOutputTokens: limits.maxOutputTokens },
              };

              if (systemPrompt) {
                geminiBody.systemInstruction = { parts: [{ text: systemPrompt }] };
              }

              const requestBody = JSON.stringify(geminiBody);

              log("TRACE", "[API-IO] Sending Gemini request payload", {
                ctx,
                requestBody:
                  requestBody.substring(0, CONFIG.MAX_TRACE_LOG_LENGTH) +
                  (requestBody.length > CONFIG.MAX_TRACE_LOG_LENGTH ? "... [TRUNCATED]" : ""),
              });

              response = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Cloud-Trace-Context": `${ctx.trace.traceId}/${ctx.trace.spanId};o=1`,
                },
                body: requestBody,
                signal: compositeSignal,
              });

              parser = (data: string): StreamParserResult => {
                const parsed = JSON.parse(data);
                let chunk: string | null = null;
                let usage: Partial<UsageMetrics> | null = null;

                const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) chunk = text;

                if (parsed.usageMetadata) {
                  usage = {
                    inputTokens: parsed.usageMetadata.promptTokenCount || 0,
                    outputTokens: parsed.usageMetadata.candidatesTokenCount || 0,
                  };
                }

                if (parsed?.promptFeedback?.blockReason) {
                  throw new Error(`Gemini blocked: ${parsed.promptFeedback.blockReason}`);
                }

                if (parsed?.candidates?.[0]?.finishReason === "SAFETY") {
                  throw new Error("Response stopped due to safety concerns.");
                }

                return { chunk, usage };
              };
              break;
            }

            default:
              throw new Error(`Unsupported provider: ${provider}`);
          }
        } catch (error) {
          if (compositeSignal.aborted) {
            if (error === timeoutError) {
              throw timeoutError;
            }
            if (clientSignal.aborted) {
              throw new AppError("Client disconnected during API connection.", 499, "CLIENT_DISCONNECTED", false);
            }
          }
          throw error;
        } finally {
          clearTimeout(timeoutId);
          metrics.record(`${provider}_connection_time`, performance.now() - connectionStart);
        }

        if (!response.ok) {
          const headers: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });

          const errorText = await response.text().catch(() => "Failed to read upstream error body");
          log("ERROR", "[API] Upstream API returned non-OK status", {
            ctx,
            provider,
            status: response.status,
            upstreamHeaders: headers,
            errorBodySample: errorText.substring(0, 500),
          });
          throw new ProviderError(provider, response.status, errorText);
        }

        if (!response.body) {
          throw new ProviderError(provider, 500, "No response body received from upstream.");
        }

        const { transformer, usagePromise } = createSSEParser(parser, provider, ctx);
        const stream = response.body.pipeThrough(transformer);

        return { stream, usagePromise };
      });
    },
    shouldRetryApiCall,
    CONFIG.MAX_RETRIES,
    ctx,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA FETCHING & UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function sendSSE(
  controller: ReadableStreamDefaultController,
  eventType: string,
  data: Record<string, unknown> | string,
) {
  try {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${payload}\n\n`));
  } catch (e) {
    log("DEBUG", "[SSE] Failed to send SSE event (controller likely closed).");
  }
}

function sendDebugEvent(
  controller: ReadableStreamDefaultController,
  ctx: RequestContext,
  stage: string,
  details: Record<string, unknown>,
) {
  if (!ctx.enableClientDebug) return;

  log("DEBUG", `[DEBUG-EVENT] Sending client debug event for stage: ${stage}`, { ctx });

  sendSSE(controller, "debug", {
    timestamp: new Date().toISOString(),
    stage,
    details,
  });
}

async function getDomainContext(userId: string, ctx: RequestContext): Promise<string | null> {
  // Domain context disabled - not needed for this app
  return null;
}

const VALID_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function fetchAndEncodeImages(
  imageIds: string[],
  userId: string,
  ctx: RequestContext,
): Promise<Array<{ media_type: string; data: string }>> {
  if (!imageIds || imageIds.length === 0) return [];

  log("DEBUG", "[IMAGES] Fetching and validating images", { ctx, imageIds });

  const { data: imageRecords, error } = await supabaseAdmin
    .from("uploaded_images")
    .select("id, mime_type, storage_path, size")
    .in("id", imageIds)
    .eq("user_id", userId);

  if (error || !imageRecords || imageRecords.length !== imageIds.length) {
    log("ERROR", "[IMAGES] Failed to fetch image records or unauthorized access attempt", {
      error,
      ctx,
      requestedIds: imageIds.length,
      foundCount: imageRecords?.length,
    });
    return [];
  }

  log("DEBUG", "[IMAGES] Image metadata fetched and ownership validated.", { ctx, count: imageRecords.length });

  const downloadPromises = imageRecords.map(async (record) => {
    if (!record.storage_path || !record.mime_type) return null;

    if (!VALID_MIME_TYPES.has(record.mime_type)) {
      log("WARN", "[IMAGES] Unsupported MIME type", { mime: record.mime_type, id: record.id, ctx });
      return null;
    }

    if (record.size && record.size > CONFIG.MAX_IMAGE_SIZE_BYTES) {
      log("WARN", "[IMAGES] Image exceeds size limit (metadata)", { size: record.size, id: record.id, ctx });
      return null;
    }

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(CONFIG.IMAGE_BUCKET_NAME)
      .download(record.storage_path);

    if (downloadError || !fileData) {
      log("ERROR", `[IMAGES] Failed to download image`, { id: record.id, error: downloadError, ctx });
      return null;
    }

    if (fileData.size > CONFIG.MAX_IMAGE_SIZE_BYTES) {
      log("WARN", "[IMAGES] Downloaded image exceeds size limit", { size: fileData.size, id: record.id, ctx });
      return null;
    }

    try {
      const arrayBuffer = await fileData.arrayBuffer();
      const base64 = encodeBase64(arrayBuffer);
      return { media_type: record.mime_type, data: base64 };
    } catch (error) {
      log("ERROR", `[IMAGES] Failed to encode image`, { id: record.id, error, ctx });
      return null;
    }
  });

  const results = await Promise.all(downloadPromises);
  return results.filter((r): r is { media_type: string; data: string } => r !== null);
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

function formatMessagesForProvider(
  provider: Provider,
  messages: ChatMessage[],
  images: Array<{ media_type: string; data: string }>,
  systemPrompt?: string,
): unknown {
  const filteredMessages = messages.filter((msg) => {
    if (provider === "anthropic" || provider === "gemini") {
      return msg.role !== "system";
    }
    return true;
  });

  if (provider === "openai" && systemPrompt && !messages.some((m) => m.role === "system")) {
    filteredMessages.unshift({ role: "system", content: systemPrompt });
  }

  return filteredMessages.map((msg: ChatMessage, idx: number) => {
    const isLastMessage = idx === filteredMessages.length - 1;
    const role = provider === "gemini" ? (msg.role === "assistant" ? "model" : msg.role) : msg.role;

    if (msg.role === "user" && isLastMessage && images.length > 0) {
      const contentArray: Array<Record<string, unknown>> = [];

      if (msg.content) {
        if (provider === "gemini") {
          contentArray.push({ text: msg.content });
        } else {
          contentArray.push({ type: "text", text: msg.content });
        }
      }

      images.forEach((img) => {
        if (provider === "anthropic") {
          contentArray.push({
            type: "image",
            source: { type: "base64", media_type: img.media_type, data: img.data },
          });
        } else if (provider === "openai") {
          contentArray.push({
            type: "image_url",
            image_url: { url: `data:${img.media_type};base64,${img.data}`, detail: "auto" },
          });
        } else if (provider === "gemini") {
          contentArray.push({
            inlineData: { mimeType: img.media_type, data: img.data },
          });
        }
      });

      return provider === "gemini" ? { role, parts: contentArray } : { role, content: contentArray };
    }

    if (provider === "gemini") {
      return { role, parts: [{ text: msg.content }] };
    }
    return { role, content: msg.content };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

function persistMessage(requestId: string, messageData: Record<string, unknown>, ctx?: RequestContext) {
  log("DEBUG", "[DB-ASYNC] Attempting to persist message", { ctx, requestId });
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

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

function handleHealthCheck(headers: Record<string, string>): Response {
  log("INFO", "[HEALTH] Health check initiated.");

  const providerStatus = Object.entries(circuitBreakers).map(([name, breaker]) => ({
    name,
    state: breaker.getState(),
    enabled: Object.values(ROUTER_CONFIG).some((p) => p.provider === (name as Provider) && p.enabled),
  }));

  const allHealthy = providerStatus.every((p) => p.state === CircuitState.CLOSED || !p.enabled);

  const status = allHealthy ? 200 : 503;

  const responseBody = {
    status: allHealthy ? "OK" : "DEGRADED",
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    region: DEPLOYMENT_REGION,
    log_level: env.LOG_LEVEL,
    dependencies: {
      providers: providerStatus,
    },
  };

  return new Response(JSON.stringify(responseBody, null, 2), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  const requestStartTime = performance.now();
  const url = new URL(req.url);

  const responseHeaders: Record<string, string> = {
    ...corsHeaders,
    ...SECURITY_HEADERS,
  };

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

  log("INFO", "[REQUEST] Incoming", {
    method: req.method,
    path: url.pathname,
    ctx,
  });

  if (ctx.enableClientDebug) {
    responseHeaders["X-Debug-Mode-Active"] = "true";
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: responseHeaders, status: 204 });
  }

  try {
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

    log("DEBUG", "[REQUEST] Body parsed and user authenticated", {
      ctx,
      rawBodySize: JSON.stringify(rawBody).length,
    });

    await rateLimiter.checkLimit(user.id);
    responseHeaders["X-RateLimit-Remaining"] = rateLimiter.getRemainingRequests(user.id).toString();
    responseHeaders["X-RateLimit-Limit"] = CONFIG.RATE_LIMIT_MAX_REQUESTS.toString();

    const validationResult = RequestBodySchema.safeParse(rawBody);
    if (!validationResult.success) {
      log("WARN", "[VALIDATION] Request validation failed", { ctx, errors: validationResult.error.format() });
      throw new ValidationError("Invalid request structure", validationResult.error.format());
    }
    const requestData = validationResult.data;
    const { messages, conversationId, imageIds, mode, preferredProvider } = requestData;

    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage.role !== "user") {
      throw new ValidationError("Last message must be from the user role.");
    }

    const searchTriggers = [/^search[: ]/i, /^find[: ]/i, /what (is|are) the latest/i];
    if (mode === "search_assist" || searchTriggers.some((t) => t.test(lastUserMessage.content))) {
      log("INFO", "[ROUTER] Search query detected, delegating.", { ctx });
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

    const dedupKey = await deduplicator.createKey(user.id, requestData);
    log("DEBUG", "[DEDUP] Deduplication key generated", { ctx, keyHash: dedupKey.substring(0, 15) + "..." });

    return await deduplicator.deduplicate(dedupKey, async () => {
      const dedupStartTime = performance.now();

      log("DEBUG", "[DATA] Starting parallel data fetching (Images and Context)", { ctx });
      const [images, domainContext] = await Promise.all([
        fetchAndEncodeImages(imageIds || [], user.id, ctx),
        getDomainContext(user.id, ctx),
      ]);
      log("DEBUG", "[DATA] Parallel data fetching complete", {
        ctx,
        imagesCount: images.length,
        contextFound: !!domainContext,
      });

      const { taskType, profile, reasoning } = decideRoute(messages, images.length, ctx, preferredProvider);
      const { provider, model } = profile;

      log("INFO", "[ROUTER] Decision", {
        ctx,
        provider,
        model,
        taskType,
        reasoning,
      });

      const systemPrompt = domainContext || "You are a helpful AI assistant.";
      const apiPayload = formatMessagesForProvider(provider, messages, images, systemPrompt);

      if (conversationId) {
        persistMessage(
          requestId,
          {
            conversation_id: conversationId,
            role: "user",
            user_id: user.id,
            content: lastUserMessage.content,
            metadata: {
              image_count: images.length,
              mode,
              request_id: requestId,
              trace_id: trace.traceId,
            },
          },
          ctx,
        );
      }

      const stream = new ReadableStream({
        async start(controller) {
          const streamControllerStartTime = performance.now();

          sendDebugEvent(controller, ctx, "INITIALIZATION", {
            requestId: ctx.requestId,
            traceId: ctx.trace.traceId,
            userId: ctx.userId,
            conversationId: conversationId || null,
            environment: env.LOG_LEVEL,
            region: DEPLOYMENT_REGION,
            timings: {
              requestStartToStreamStart: streamControllerStartTime - requestStartTime,
              deduplicationOverhead: streamControllerStartTime - dedupStartTime,
            },
          });

          sendDebugEvent(controller, ctx, "ROUTING", {
            taskType,
            provider,
            model,
            reasoning,
            circuitBreakerState: circuitBreakers[provider].getState(),
            imageCount: images.length,
            contextUsed: !!domainContext,
          });

          try {
            const sanitizedPayload = JSON.parse(JSON.stringify(apiPayload));
            if (Array.isArray(sanitizedPayload)) {
              sanitizedPayload.forEach((msg) => {
                if (typeof msg.content === "string") {
                  msg.content = msg.content.substring(0, 500) + (msg.content.length > 500 ? "..." : "");
                } else if (Array.isArray(msg.content)) {
                  msg.content = msg.content.map((part: any) => {
                    if (part.type === "text" && part.text) {
                      part.text = part.text.substring(0, 200) + (part.text.length > 200 ? "..." : "");
                    } else if (part.type === "image" || part.type === "image_url" || part.inlineData) {
                      return { type: "image_placeholder", sanitized: true };
                    }
                    return part;
                  });
                }
              });
            }

            sendDebugEvent(controller, ctx, "PAYLOAD_PREVIEW", {
              systemPrompt: systemPrompt.substring(0, 500) + (systemPrompt.length > 500 ? "..." : ""),
              messages: sanitizedPayload,
            });
          } catch (e) {
            log("WARN", "[DEBUG-EVENT] Failed to sanitize payload for preview", { ctx, error: e });
            sendDebugEvent(controller, ctx, "PAYLOAD_PREVIEW", { error: "Failed to sanitize payload for preview." });
          }

          let ttftMs = 0;
          let firstChunkReceived = false;
          let assistantResponseText = "";
          let finalUsage: UsageMetrics = { inputTokens: 0, outputTokens: 0 };
          let upstreamReader: ReadableStreamDefaultReader<string> | null = null;
          let apiCallError: unknown = null;

          try {
            sendSSE(controller, "metadata", {
              provider,
              model,
              taskType,
              reasoning,
              requestId,
              traceId: trace.traceId,
            });

            const apiCallStartTime = performance.now();
            const { stream: apiStream, usagePromise } = await callProviderAPI(
              profile,
              apiPayload,
              systemPrompt,
              requestController.signal,
              ctx,
            );
            const apiConnectionTime = performance.now() - apiCallStartTime;

            sendDebugEvent(controller, ctx, "API_CONNECTION", {
              status: "Connected",
              connectionTimeMs: apiConnectionTime,
              adaptiveTimeouts: {
                connection: adaptiveTimeout.getConnectionTimeout(provider),
                inactivity: adaptiveTimeout.getStreamInactivityTimeout(provider),
              },
            });

            upstreamReader = apiStream.getReader();

            const streamStartTime = performance.now();
            const streamInactivityTimeout = adaptiveTimeout.getStreamInactivityTimeout(provider);

            while (true) {
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new TimeoutError("Stream inactivity timeout", "STREAM_INACTIVITY")),
                  streamInactivityTimeout,
                ),
              );

              const abortPromise = new Promise<never>((_, reject) => {
                if (requestController.signal.aborted) {
                  reject(new AppError("Client disconnected", 499, "CLIENT_DISCONNECTED", false));
                  return;
                }
                requestController.signal.addEventListener(
                  "abort",
                  () => {
                    reject(new AppError("Client disconnected", 499, "CLIENT_DISCONNECTED", false));
                  },
                  { once: true },
                );
              });

              const readPromise = upstreamReader.read();
              let result: ReadableStreamReadResult<string>;

              try {
                result = (await Promise.race([
                  readPromise,
                  timeoutPromise,
                  abortPromise,
                ])) as ReadableStreamReadResult<string>;
              } catch (error) {
                if (error instanceof AppError && error.code === "CLIENT_DISCONNECTED") {
                  log("WARN", "[STREAM] Client disconnected", { ctx });
                } else {
                  log("ERROR", "[STREAM] Timeout", { ctx, provider });
                }
                upstreamReader.cancel().catch(() => {});
                throw error;
              }

              const { done, value: chunk } = result;
              if (done) break;

              assistantResponseText += chunk;

              if (!firstChunkReceived) {
                firstChunkReceived = true;
                ttftMs = performance.now() - requestStartTime;
                metrics.record(`${provider}_ttft`, ttftMs);
                log("INFO", "[PERFORMANCE] TTFT", {
                  ctx,
                  ttftMs: Math.round(ttftMs),
                  provider,
                });

                sendDebugEvent(controller, ctx, "TTFT", {
                  ttftMs: Math.round(ttftMs),
                  timeSinceConnection: performance.now() - streamStartTime,
                });
              }

              sendSSE(controller, "text", chunk);

              if (performance.now() - streamStartTime > CONFIG.STREAM_TOTAL_TIMEOUT_MS) {
                log("ERROR", "[STREAM] Total timeout exceeded", { ctx, provider });
                upstreamReader.cancel().catch(() => {});
                throw new TimeoutError("Stream exceeded maximum duration", "STREAM_TOTAL_TIMEOUT");
              }
            }

            try {
              const usage = await usagePromise;
              if (usage.inputTokens > 0 || usage.outputTokens > 0) {
                finalUsage = usage;
                finalUsage.totalCost = calculateCost(usage, profile);

                log("INFO", "[USAGE] Metrics", {
                  ctx,
                  provider,
                  ...finalUsage,
                });

                metrics.record(`${provider}_input_tokens`, usage.inputTokens);
                metrics.record(`${provider}_output_tokens`, usage.outputTokens);
                metrics.record(`${provider}_total_cost`, finalUsage.totalCost);
              }
            } catch (e) {
              log("WARN", "[USAGE] Failed to collect metrics", { ctx, provider, error: e });
            }

            sendSSE(controller, "done", {
              status: "success",
              usage: finalUsage,
            });
          } catch (error) {
            apiCallError = error;

            if (!(error instanceof AppError && error.code === "CLIENT_DISCONNECTED")) {
              log("ERROR", "[STREAM] Critical error during streaming", {
                ctx,
                provider,
                error,
              });

              const errorType =
                error instanceof TimeoutError
                  ? "timeout"
                  : error instanceof ProviderError
                    ? "provider_error"
                    : error instanceof CircuitBreakerError
                      ? "circuit_breaker"
                      : "internal_error";

              const code = error instanceof AppError ? error.code : "UNKNOWN_STREAM_ERROR";

              sendSSE(controller, "error", {
                errorType,
                code,
                content: (error as Error).message,
              });
            }
          } finally {
            const durationMs = performance.now() - requestStartTime;

            const errorDetails = apiCallError
              ? {
                  name: (apiCallError as Error).name || "N/A",
                  message: (apiCallError as Error).message || "N/A",
                  code: apiCallError instanceof AppError ? apiCallError.code : "N/A",
                  status: apiCallError instanceof AppError ? apiCallError.status : "N/A",
                }
              : null;

            sendDebugEvent(controller, ctx, "REQUEST_SUMMARY", {
              status: apiCallError ? "Failed" : "Success",
              totalDurationMs: Math.round(durationMs),
              ttftMs: Math.round(ttftMs),
              provider,
              model,
              usage: finalUsage,
              responseTextLength: assistantResponseText.length,
              errorDetails: errorDetails,
            });

            try {
              controller.close();
            } catch (e) {}

            if (assistantResponseText.trim() && conversationId) {
              persistMessage(
                requestId,
                {
                  conversation_id: conversationId,
                  role: "assistant",
                  user_id: user.id,
                  content: assistantResponseText,
                  model: model,
                  task_type: taskType,
                  metadata: {
                    duration_ms: Math.round(durationMs),
                    ttft_ms: Math.round(ttftMs),
                    provider,
                    router_reasoning: reasoning,
                    usage: finalUsage,
                    request_id: requestId,
                    trace_id: trace.traceId,
                    circuit_breaker_state: circuitBreakers[provider].getState(),
                  },
                },
                ctx,
              );
            }

            metrics.record("request_duration", durationMs);
            log("INFO", "[REQUEST] Completed", {
              ctx,
              status: 200,
              durationMs: Math.round(durationMs),
            });
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

    if (!(error instanceof AppError && error.code === "CLIENT_DISCONNECTED")) {
      log("ERROR", "[REQUEST] Failed (Synchronous Error)", {
        ctx: finalCtx,
        error,
      });
    }

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
      JSON.stringify({ error: message, details, requestId: finalCtx.requestId, code, traceId: finalCtx.trace.traceId }),
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

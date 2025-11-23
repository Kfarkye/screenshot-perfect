// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION-GRADE AI CHAT ROUTER
// Features: Circuit Breakers, Rate Limiting, Multi-Provider, Retries, Logging
// ═══════════════════════════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY_MS: 1000,
  TIMEOUT_MS: 30000,
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_MAX_REQUESTS: 100,
  DEDUP_WINDOW_MS: 5000,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface RequestContext {
  requestId: string;
  startTime: number;
  userId?: string;
  ipAddress?: string;
}

interface ProviderResponse {
  text: string;
  provider: string;
  tokenUsage?: {
    input: number;
    output: number;
  };
}

type Provider = 'gemini' | 'openai' | 'anthropic';

// ═══════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER
// ═══════════════════════════════════════════════════════════════════════════

class CircuitBreaker {
  private failures = new Map<Provider, number>();
  private lastFailureTime = new Map<Provider, number>();
  private state = new Map<Provider, 'closed' | 'open' | 'half-open'>();

  constructor() {
    ['gemini', 'openai', 'anthropic'].forEach(p => {
      this.state.set(p as Provider, 'closed');
      this.failures.set(p as Provider, 0);
    });
  }

  canAttempt(provider: Provider): boolean {
    const state = this.state.get(provider);
    
    if (state === 'closed') return true;
    if (state === 'half-open') return true;
    
    // Check if circuit should transition from open to half-open
    const lastFailure = this.lastFailureTime.get(provider) || 0;
    if (Date.now() - lastFailure > CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS) {
      this.state.set(provider, 'half-open');
      return true;
    }
    
    return false;
  }

  recordSuccess(provider: Provider): void {
    this.failures.set(provider, 0);
    this.state.set(provider, 'closed');
    log('INFO', `[CIRCUIT] ${provider} circuit closed`);
  }

  recordFailure(provider: Provider): void {
    const current = this.failures.get(provider) || 0;
    const newCount = current + 1;
    this.failures.set(provider, newCount);
    this.lastFailureTime.set(provider, Date.now());

    if (newCount >= CONFIG.CIRCUIT_BREAKER_THRESHOLD) {
      this.state.set(provider, 'open');
      log('WARN', `[CIRCUIT] ${provider} circuit opened after ${newCount} failures`);
    }
  }

  getStatus(): Record<Provider, string> {
    return {
      gemini: this.state.get('gemini') || 'closed',
      openai: this.state.get('openai') || 'closed',
      anthropic: this.state.get('anthropic') || 'closed',
    };
  }
}

const circuitBreaker = new CircuitBreaker();

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════════════════════

class RateLimiter {
  private requests = new Map<string, number[]>();

  checkLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const windowStart = now - CONFIG.RATE_LIMIT_WINDOW_MS;
    
    // Get recent requests
    const recentRequests = (this.requests.get(identifier) || [])
      .filter(time => time > windowStart);
    
    if (recentRequests.length >= CONFIG.RATE_LIMIT_MAX_REQUESTS) {
      const oldestRequest = Math.min(...recentRequests);
      const retryAfter = Math.ceil((oldestRequest + CONFIG.RATE_LIMIT_WINDOW_MS - now) / 1000);
      return { allowed: false, retryAfter };
    }
    
    // Record this request
    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);
    
    return { allowed: true };
  }

  cleanup(): void {
    const cutoff = Date.now() - CONFIG.RATE_LIMIT_WINDOW_MS;
    for (const [key, times] of this.requests.entries()) {
      const filtered = times.filter(t => t > cutoff);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }
}

const rateLimiter = new RateLimiter();

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════════

class RequestDeduplicator {
  private pending = new Map<string, Promise<ProviderResponse>>();
  private results = new Map<string, { response: ProviderResponse; timestamp: number }>();

  async deduplicate(
    key: string,
    fn: () => Promise<ProviderResponse>
  ): Promise<ProviderResponse> {
    // Check cached result
    const cached = this.results.get(key);
    if (cached && Date.now() - cached.timestamp < CONFIG.DEDUP_WINDOW_MS) {
      log('INFO', `[DEDUP] Cache hit for key: ${key.substring(0, 20)}...`);
      return cached.response;
    }

    // Check if request is already pending
    const pending = this.pending.get(key);
    if (pending) {
      log('INFO', `[DEDUP] Waiting for pending request: ${key.substring(0, 20)}...`);
      return pending;
    }

    // Execute new request
    const promise = fn().then(result => {
      this.results.set(key, { response: result, timestamp: Date.now() });
      this.pending.delete(key);
      return result;
    }).catch(error => {
      this.pending.delete(key);
      throw error;
    });

    this.pending.set(key, promise);
    return promise;
  }

  cleanup(): void {
    const cutoff = Date.now() - CONFIG.DEDUP_WINDOW_MS;
    for (const [key, value] of this.results.entries()) {
      if (value.timestamp < cutoff) {
        this.results.delete(key);
      }
    }
  }
}

const deduplicator = new RequestDeduplicator();

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function log(level: LogLevel, message: string, data?: any): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data && { data }),
  };
  console.log(JSON.stringify(entry));
}

// ═══════════════════════════════════════════════════════════════════════════
// RETRY LOGIC
// ═══════════════════════════════════════════════════════════════════════════

async function withRetry<T>(
  fn: () => Promise<T>,
  provider: Provider,
  ctx: RequestContext
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = CONFIG.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        log('INFO', `[RETRY] Attempt ${attempt}/${CONFIG.MAX_RETRIES} after ${delay}ms`, {
          requestId: ctx.requestId,
          provider
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on non-retryable errors
      if (error instanceof Error && error.message.includes('401')) {
        throw error;
      }
      
      log('WARN', `[RETRY] Attempt ${attempt + 1} failed`, {
        requestId: ctx.requestId,
        provider,
        error: lastError.message
      });
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════════════════

async function callGemini(messages: ChatMessage[], ctx: RequestContext): Promise<ProviderResponse> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const geminiMessages = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : msg.role,
    parts: [{ text: msg.content }]
  }));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: { 
            maxOutputTokens: 8000,
            temperature: 0.7
          }
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) throw new Error('No response text from Gemini');

    return {
      text,
      provider: 'gemini',
      tokenUsage: {
        input: data.usageMetadata?.promptTokenCount || 0,
        output: data.usageMetadata?.candidatesTokenCount || 0
      }
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callOpenAI(messages: ChatMessage[], ctx: RequestContext): Promise<ProviderResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 4000
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) throw new Error('No response text from OpenAI');

    return {
      text,
      provider: 'openai',
      tokenUsage: {
        input: data.usage?.prompt_tokens || 0,
        output: data.usage?.completion_tokens || 0
      }
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callAnthropic(messages: ChatMessage[], ctx: RequestContext): Promise<ProviderResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  // Separate system message from conversation
  const systemMessage = messages.find(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role !== 'system');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: systemMessage?.content || '',
        messages: conversationMessages
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    
    if (!text) throw new Error('No response text from Anthropic');

    return {
      text,
      provider: 'anthropic',
      tokenUsage: {
        input: data.usage?.input_tokens || 0,
        output: data.usage?.output_tokens || 0
      }
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVIDER ROUTING WITH FALLBACK
// ═══════════════════════════════════════════════════════════════════════════

async function routeToProvider(
  messages: ChatMessage[],
  preferredProvider: Provider | 'auto',
  ctx: RequestContext
): Promise<ProviderResponse> {
  const providers: Provider[] = 
    preferredProvider === 'auto' 
      ? ['gemini', 'openai', 'anthropic']
      : [preferredProvider, 'gemini', 'openai', 'anthropic'].filter((v, i, a) => a.indexOf(v) === i) as Provider[];

  let lastError: Error | undefined;

  for (const provider of providers) {
    // Check circuit breaker
    if (!circuitBreaker.canAttempt(provider)) {
      log('WARN', `[ROUTER] Skipping ${provider} - circuit open`, { requestId: ctx.requestId });
      continue;
    }

    try {
      log('INFO', `[ROUTER] Attempting ${provider}`, { requestId: ctx.requestId });

      let result: ProviderResponse;
      
      switch (provider) {
        case 'gemini':
          result = await withRetry(() => callGemini(messages, ctx), provider, ctx);
          break;
        case 'openai':
          result = await withRetry(() => callOpenAI(messages, ctx), provider, ctx);
          break;
        case 'anthropic':
          result = await withRetry(() => callAnthropic(messages, ctx), provider, ctx);
          break;
      }

      circuitBreaker.recordSuccess(provider);
      log('INFO', `[ROUTER] Success with ${provider}`, {
        requestId: ctx.requestId,
        tokens: result.tokenUsage
      });
      
      return result;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      circuitBreaker.recordFailure(provider);
      
      log('ERROR', `[ROUTER] ${provider} failed`, {
        requestId: ctx.requestId,
        error: lastError.message
      });
    }
  }

  throw lastError || new Error('All providers failed');
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

function handleHealthCheck(): Response {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    circuits: circuitBreaker.getStatus(),
    environment: {
      gemini: !!Deno.env.get('GEMINI_API_KEY'),
      openai: !!Deno.env.get('OPENAI_API_KEY'),
      anthropic: !!Deno.env.get('ANTHROPIC_API_KEY'),
    }
  };

  return new Response(JSON.stringify(health), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  const ctx: RequestContext = {
    requestId: crypto.randomUUID(),
    startTime: Date.now(),
    ipAddress: req.headers.get('x-forwarded-for') || 'unknown'
  };

  const responseHeaders = {
    ...corsHeaders,
    'X-Request-ID': ctx.requestId,
  };

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: responseHeaders, status: 204 });
  }

  // Health check
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return handleHealthCheck();
  }

  // Only allow POST for chat
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...responseHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const { messages, preferredProvider = 'auto', idempotencyKey } = body;

    log('INFO', '[REQUEST] Received', {
      requestId: ctx.requestId,
      messageCount: messages?.length,
      preferredProvider
    });

    // Validation
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid messages array');
    }

    // Rate limiting
    const rateLimitKey = ctx.ipAddress || 'anonymous';
    const rateLimit = rateLimiter.checkLimit(rateLimitKey);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: rateLimit.retryAfter
      }), {
        status: 429,
        headers: {
          ...responseHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(rateLimit.retryAfter)
        }
      });
    }

    // Deduplication key
    const dedupKey = idempotencyKey || 
      JSON.stringify({ messages: messages.slice(-2), provider: preferredProvider });

    // Execute with deduplication
    const result = await deduplicator.deduplicate(dedupKey, () =>
      routeToProvider(messages, preferredProvider, ctx)
    );

    const latency = Date.now() - ctx.startTime;
    
    log('INFO', '[SUCCESS] Request completed', {
      requestId: ctx.requestId,
      provider: result.provider,
      latency,
      tokens: result.tokenUsage
    });

    return new Response(JSON.stringify({
      response: result.text,
      provider: result.provider,
      tokenUsage: result.tokenUsage,
      latency,
      requestId: ctx.requestId
    }), {
      status: 200,
      headers: { ...responseHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const latency = Date.now() - ctx.startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    log('ERROR', '[FAILURE] Request failed', {
      requestId: ctx.requestId,
      error: errorMessage,
      latency
    });

    return new Response(JSON.stringify({
      error: errorMessage,
      requestId: ctx.requestId
    }), {
      status: 500,
      headers: { ...responseHeaders, 'Content-Type': 'application/json' }
    });
  } finally {
    // Periodic cleanup
    if (Math.random() < 0.01) {
      rateLimiter.cleanup();
      deduplicator.cleanup();
    }
  }
});

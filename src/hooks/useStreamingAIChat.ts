// ════════════════════════════════════════════════════════════════════════════
// STREAMING AI CHAT HOOK [V5 - PRODUCTION HARDENED]
// Optimized for reliability, performance, and observability in production.
// ════════════════════════════════════════════════════════════════════════════
//
// @metanotes
// {
//   "version": "5.0.0",
//   "architecture": "Router-first multi-model RAG",
//   "enhancements": [
//     "useReducer State Management",
//     "Throttled Stream Updates (Performance)",
//     "Exponential Backoff Retries (Reliability)",
//     "API & Context Timeouts (Reliability)",
//     "Spec-Compliant SSE Parsing (Reliability)",
//     "Telemetry & TTFT Tracking (Observability)"
//   ]
// }
// ════════════════════════════════════════════════════════════════════════════

import { useReducer, useCallback, useRef, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSportsKnowledge, formatKnowledgeForPrompt } from './useSportsKnowledge';

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURATION & CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  HISTORY_LENGTH: 10,
  API_TIMEOUT_MS: 20000,
  CONTEXT_TIMEOUT_MS: 2500,
  STREAM_UPDATE_THROTTLE_MS: 80,
  MAX_RETRIES: 2,
  INITIAL_RETRY_DELAY_MS: 1000,
};

// ════════════════════════════════════════════════════════════════════════════
// UTILITIES (Telemetry, Retries, Throttling, Timeouts)
// ════════════════════════════════════════════════════════════════════════════

const Telemetry = {
  trackError: (error: Error | unknown, context: Record<string, any>) => {
    console.error('[Chat Error]', error, context);
  },
  trackEvent: (event: string, properties: Record<string, any>) => {
    console.log('[Chat Event]', event, properties);
  }
};

async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  retries: number = CONFIG.MAX_RETRIES,
  delay: number = CONFIG.INITIAL_RETRY_DELAY_MS
): Promise<T> {
  let attempt = 1;
  try {
    return await fn(attempt);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError' || errorMessage.includes('timeout'))) {
      throw error;
    }

    if (retries > 0) {
      attempt++;
      Telemetry.trackEvent('API_RETRY', { delay, attemptsLeft: retries, error: errorMessage.substring(0, 100) });
      await new Promise(res => setTimeout(res, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    } else {
      Telemetry.trackError(error, { stage: 'retryWithBackoff', reason: 'max_retries_reached' });
      throw new Error('Service temporarily unavailable. Please try again shortly.');
    }
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  resourceName: string,
  defaultValue: T
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>(resolve => {
    timeoutId = setTimeout(() => {
      Telemetry.trackEvent('CONTEXT_TIMEOUT', { resource: resourceName, timeoutMs });
      resolve(defaultValue);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const controller = new AbortController();
  
  for (const signal of signals) {
    if (!signal) continue;

    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  
  return controller.signal;
}

function throttle<T extends (...args: any[]) => void>(func: T, limit: number): T & { flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[] | null = null;
  let lastThis: any = null;

  const throttled = function(this: any, ...args: any[]) {
    lastArgs = args;
    lastThis = this;

    if (!timeoutId) {
      timeoutId = setTimeout(() => {
        if (lastArgs) {
          func.apply(lastThis, lastArgs);
        }
        timeoutId = null;
        lastArgs = null;
      }, limit);
    }
  } as T & { flush: () => void };

  throttled.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      if (lastArgs) {
        func.apply(lastThis, lastArgs);
      }
      timeoutId = null;
      lastArgs = null;
    }
  };

  return throttled;
}

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export type Intent = 'casual' | 'analysis' | 'research';
export type ModelId = 'google/gemini-2.5-flash' | 'google/gemini-2.5-pro';

export interface RouteResult {
  intent: Intent;
  model: ModelId;
  injectKnowledge: boolean;
  useWebSearch: boolean;
}

export interface MessageMetadata {
  model?: ModelId;
  intent?: Intent;
  durationMs?: number;
  ttftMs?: number;
  knowledgeUsed?: boolean;
  searchUsed?: boolean;
  tokens?: number;
  retries?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
}

export type ChatMessage = Message;

// ════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT (useReducer)
// ════════════════════════════════════════════════════════════════════════════

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  currentModel: ModelId | null;
}

const initialState: ChatState = {
  messages: [],
  isLoading: false,
  isStreaming: false,
  error: null,
  currentModel: null,
};

type ChatAction =
  | { type: 'START_REQUEST'; userMessage: Message; assistantPlaceholder: Message }
  | { type: 'ROUTING_COMPLETE'; model: ModelId }
  | { type: 'STREAM_START'; messageId: string; ttftMs: number }
  | { type: 'STREAM_UPDATE'; messageId: string; content: string }
  | { type: 'REQUEST_SUCCESS'; messageId: string; finalContent: string; metadata: MessageMetadata }
  | { type: 'REQUEST_ERROR'; error: string; messageId: string }
  | { type: 'CANCEL_OR_TIMEOUT'; messageId: string; partialContent: string }
  | { type: 'PREPARE_RETRY'; messages: Message[] }
  | { type: 'CLEAR' };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'START_REQUEST':
      return {
        ...state,
        messages: [...state.messages, action.userMessage, action.assistantPlaceholder],
        isLoading: true,
        error: null,
      };
    case 'ROUTING_COMPLETE':
      return { ...state, currentModel: action.model };
    case 'STREAM_START':
      return {
        ...state,
        isStreaming: true,
        messages: state.messages.map(msg =>
          msg.id === action.messageId
            ? { ...msg, metadata: { ...msg.metadata, ttftMs: action.ttftMs } }
            : msg
        ),
      };
    case 'STREAM_UPDATE':
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.messageId
            ? { ...msg, content: action.content }
            : msg
        ),
      };
    case 'REQUEST_SUCCESS':
      return {
        ...state,
        isLoading: false,
        isStreaming: false,
        currentModel: null,
        messages: state.messages.map(msg =>
          msg.id === action.messageId
            ? { ...msg, content: action.finalContent, metadata: { ...msg.metadata, ...action.metadata } }
            : msg
        ),
      };
    case 'REQUEST_ERROR':
      return {
        ...state,
        isLoading: false,
        isStreaming: false,
        error: action.error,
        currentModel: null,
        messages: state.messages.map(msg =>
          msg.id === action.messageId
            ? { ...msg, content: `Error: ${action.error}` }
            : msg
        ),
      };
    case 'CANCEL_OR_TIMEOUT':
      const messagesAfterInterrupt = action.partialContent
        ? state.messages.map(msg =>
            msg.id === action.messageId ? { ...msg, content: action.partialContent } : msg
          )
        : state.messages.filter(m => m.id !== action.messageId);

      return {
        ...state,
        isLoading: false,
        isStreaming: false,
        currentModel: null,
        messages: messagesAfterInterrupt,
      };
    case 'PREPARE_RETRY':
      return {
        ...state,
        messages: action.messages,
        error: null,
        isLoading: false,
      };
    case 'CLEAR':
      return initialState;
    default:
      return state;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════════════════════════════════════════

export function routeMessage(message: string): RouteResult {
  const lower = message.toLowerCase().trim();
  
  const researchPatterns = [
    /\b(news|latest|recent|just happened|today|tonight|yesterday)\b/,
    /\b(breaking|announced|confirmed|reportedly|rumor|report)\b/,
    /\b(update on|status of|what happened to|what's going on with)\b/,
    /\b(why did|why is|why are|how come|what caused|explain why)\b/,
    /\b(injury report|who'?s out|who'?s playing|availability|game time decision)\b/,
    /\b(when is|when does|what time|where is|how much|how many)\b.*\?/,
    /\b(current|right now|at the moment|as of)\b/,
  ];
  
  const analysisPatterns = [
    /\b(pick|picks|bet|bets|betting|spread|spreads|over|under|o\/u)\b/,
    /\b(parlay|parlays|teaser|moneyline|ml|total|totals|line|lines)\b/,
    /\b(odds|juice|vig|value|edge|ev|expected value)\b/,
    /\b(prop|props|player prop|same game|sgp|anytime scorer)\b/,
    /\b(who wins|who covers|who'?s gonna|should i take|should i bet)\b/,
    /\b(lock|locks|fade|fading|hammer|smash|love|like|lean)\b/,
    /\b(take the|play on|riding|rolling with|going with)\b/,
    /\b(what'?s the play|what'?s the move|best bet|top pick)\b/,
    /\b(sharp|sharps|square|squares|public|contrarian|steam|reverse line)\b/,
    /\b(matchup|vs|versus|against|facing|playing)\b.*\b(tonight|today|tomorrow)\b/,
    /\b(preview|breakdown|analysis|analyze|look at)\b/,
  ];
  
  const knowledgePatterns = [
    /\b(what team is|what team does|who plays for|where does .* play)\b/,
    /\b(play for|plays for|signed with|joined|on the)\b/,
    /\b(roster|starting lineup|starting five|depth chart)\b/,
    /\b(traded|got traded|was traded|trade|trades)\b/,
    /\b(when did .* get traded|who did .* trade for)\b/,
    /\b(is .* injured|is .* hurt|is .* out)\b/,
    /\b(injury|injuries|injured|hurt|sidelined)\b/,
    /\b(how tall|how old|what position|jersey number|contract)\b/,
  ];
  
  if (researchPatterns.some(p => p.test(lower))) {
    return {
      intent: 'research',
      model: 'google/gemini-2.5-pro',
      injectKnowledge: true,
      useWebSearch: true,
    };
  }
  
  if (analysisPatterns.some(p => p.test(lower))) {
    return {
      intent: 'analysis',
      model: 'google/gemini-2.5-pro',
      injectKnowledge: true,
      useWebSearch: false,
    };
  }
  
  if (knowledgePatterns.some(p => p.test(lower))) {
    return {
      intent: 'analysis',
      model: 'google/gemini-2.5-pro',
      injectKnowledge: true,
      useWebSearch: false,
    };
  }
  
  return {
    intent: 'casual',
    model: 'google/gemini-2.5-flash',
    injectKnowledge: false,
    useWebSearch: false,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPTS
// ════════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPTS = {
  casual: `You are SharpEdge, a chill sports betting assistant.

PERSONALITY:
- Friendly, casual, conversational
- Use natural language
- Match the user's energy
- Keep responses concise unless they want more

RULES:
- Chat naturally
- If they pivot to betting, give quick takes but suggest they ask specifically for analysis
- Be helpful and fun`,

  analysis: (context: string) => `You are SharpEdge, an elite sports betting analyst.

${context}

RULES:
1. Use verified data above over your training knowledge
2. Give direct, confident picks with clear reasoning
3. Be conversational but sharp
4. Include specific numbers: spreads, lines, percentages
5. If asked about a player's team, use ONLY the verified data above

FORMAT FOR PICKS:
🎯 [PICK]: Team/Player and line
📊 [WHY]: 2-3 bullet reasons
⚠️ [RISK]: One sentence on what could go wrong
💰 [CONFIDENCE]: Low/Medium/High

Keep it tight.`,

  research: (context: string) => `You are SharpEdge research assistant.

${context}

RULES:
1. Search for current, accurate information
2. If verified data is provided above, use it as baseline
3. Supplement with web search for breaking news, updates, context
4. Be clear about what's confirmed vs rumored
5. Synthesize findings into clear, actionable insights

FORMAT:
- Lead with the key finding
- Provide context
- Note any conflicting information
- End with betting relevance if applicable`,
};

// ════════════════════════════════════════════════════════════════════════════
// CONTEXT BUILDERS
// ════════════════════════════════════════════════════════════════════════════

async function getKnowledgeInjection(query: string): Promise<string> {
  const startTime = performance.now();

  const fetchKnowledge = async (): Promise<string> => {
    try {
      const knowledgeEntries = await getSportsKnowledge(query);
      
      const durationMs = performance.now() - startTime;

      if (knowledgeEntries.length === 0) {
        Telemetry.trackEvent('RAG_KNOWLEDGE_MISS', { durationMs });
        return '';
      }

      console.log(`[Chat] Knowledge hit: ${knowledgeEntries.length} entries in ${durationMs}ms`);
      Telemetry.trackEvent('RAG_KNOWLEDGE_HIT', { durationMs, entries: knowledgeEntries.length });

      return formatKnowledgeForPrompt(knowledgeEntries);
    } catch (err) {
      const durationMs = performance.now() - startTime;
      Telemetry.trackError(err, { durationMs, stage: 'knowledge_injection_catch' });
      return '';
    }
  };

  return withTimeout(fetchKnowledge(), CONFIG.CONTEXT_TIMEOUT_MS, 'Knowledge', '');
}

// ════════════════════════════════════════════════════════════════════════════
// MODEL CALLERS
// ════════════════════════════════════════════════════════════════════════════

interface ModelCallOptions {
  model: ModelId;
  systemPrompt: string;
  userMessage: string;
  conversationHistory: Message[];
  useWebSearch: boolean;
  onToken: (token: string) => void;
  onStreamStart: (ttftMs: number) => void;
  signal: AbortSignal;
}

async function callModel(options: ModelCallOptions): Promise<{ content: string, tokens?: number, retries: number }> {
  const { model, systemPrompt, userMessage, conversationHistory, onToken, onStreamStart, signal } = options;

  const timeoutSignal = AbortSignal.timeout(CONFIG.API_TIMEOUT_MS);
  const combinedSignal = combineSignals(signal, timeoutSignal);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-CONFIG.HISTORY_LENGTH).map(m => ({
      role: m.role,
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  let attempts = 0;

  try {
    const response = await retryWithBackoff(async (attempt) => {
      attempts = attempt;

      if (combinedSignal.aborted) {
        throw combinedSignal.reason;
      }

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("User not authenticated");

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat-router`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          messages,
          model,
          preferredProvider: "gemini",
          stream: true
        }),
        signal: combinedSignal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`API Error: ${res.status} - ${errorText}`);
      }

      return res;
    });

    const retries = attempts - 1;

    if (!response.body) throw new Error('No response body received');

    const streamResult = await processStream(response.body, onToken, onStreamStart, combinedSignal);
    return { ...streamResult, retries };

  } catch (error) {
    if (timeoutSignal.aborted && !signal.aborted) {
      Telemetry.trackError(error, { stage: 'callModel', reason: 'timeout', model });
      throw new Error(`Request timed out after ${CONFIG.API_TIMEOUT_MS / 1000}s.`);
    }

    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error;
    }
    
    Telemetry.trackError(error, { stage: 'callModel', reason: 'api_error', model });
    throw error;
  }
}

async function processStream(
  stream: ReadableStream,
  onToken: (token: string) => void,
  onStreamStart: (ttftMs: number) => void,
  signal: AbortSignal
): Promise<{ content: string, tokens?: number }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';
  let finalTokens: number | undefined;
  let isFirstToken = true;
  const streamStartTime = performance.now();

  try {
    while (true) {
      if (signal.aborted) {
        reader.cancel();
        throw signal.reason;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        if (!event.trim()) continue;

        const lines = event.split('\n');
        let dataPayload = '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            dataPayload += line.slice(5).trimStart();
          }
        }

        if (dataPayload) {
          if (dataPayload.trim() === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataPayload);
            const token = extractTokenFromChunk(parsed);

            if (token) {
              if (isFirstToken) {
                const ttftMs = Math.round(performance.now() - streamStartTime);
                onStreamStart(ttftMs);
                isFirstToken = false;
              }
              fullContent += token;
              onToken(token);
            }
            
            if (parsed.usage) {
              finalTokens = parsed.usage.total_tokens || parsed.usage.output_tokens;
            }

          } catch (err) {
            Telemetry.trackError(err, { stage: 'processStream_parse', rawData: dataPayload.substring(0, 100) });
          }
        }
      }
    }
  } catch (error) {
    if (signal.aborted || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
      throw error;
    }
    Telemetry.trackError(error, { stage: 'processStream_read' });
    throw new Error("Network error during streaming.");
  } finally {
    reader.releaseLock();
  }

  return { content: fullContent, tokens: finalTokens };
}

function extractTokenFromChunk(chunk: any): string {
  if (chunk.choices?.[0]?.delta?.content) {
    return chunk.choices[0].delta.content;
  }
  if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
    return chunk.delta.text;
  }
  if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
    return chunk.candidates[0].content.parts[0].text;
  }
  return chunk.content || chunk.text || '';
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN HOOK
// ════════════════════════════════════════════════════════════════════════════

export interface UseStreamingAIChatOptions {
  onRouteDetected?: (route: RouteResult) => void;
  onStreamEnd?: (metadata: MessageMetadata) => void;
  onError?: (error: Error) => void;
}

export function useStreamingAIChat(game?: any, pick?: any, options: UseStreamingAIChatOptions = {}) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const streamingContentRef = useRef<string>('');
  const currentAssistantIdRef = useRef<string | null>(null);

  const memoizedOptions = useMemo(() => options, [options]);

  const updateStreamingState = useCallback(() => {
    const assistantId = currentAssistantIdRef.current;
    const content = streamingContentRef.current;

    if (!assistantId) return;

    dispatch({ type: 'STREAM_UPDATE', messageId: assistantId, content });
  }, []);

  const throttledUpdateStreamingState = useMemo(() => {
    return throttle(updateStreamingState, CONFIG.STREAM_UPDATE_THROTTLE_MS);
  }, [updateStreamingState]);

  useEffect(() => {
    return () => {
      throttledUpdateStreamingState.flush();
    };
  }, [throttledUpdateStreamingState]);

  const sendMessage = useCallback(async (userMessageContent: string) => {
    if (!userMessageContent.trim() || state.isLoading) return;

    const startTime = performance.now();
    const conversationHistory = state.messages;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessageContent.trim(),
      timestamp: new Date(),
    };

    const assistantMsgId = crypto.randomUUID();
    const assistantPlaceholder: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    streamingContentRef.current = '';
    currentAssistantIdRef.current = assistantMsgId;

    dispatch({ type: 'START_REQUEST', userMessage: userMsg, assistantPlaceholder });

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    let route: RouteResult | null = null;

    try {
      route = routeMessage(userMessageContent);
      Telemetry.trackEvent('CHAT_ROUTING', { intent: route.intent, model: route.model });
      memoizedOptions.onRouteDetected?.(route);
      dispatch({ type: 'ROUTING_COMPLETE', model: route.model });

      const contextPromises: Promise<string>[] = [];

      if (route.injectKnowledge) {
        contextPromises.push(getKnowledgeInjection(userMessageContent));
      }

      const contextResults = await Promise.all(contextPromises);
      const context = contextResults.filter(Boolean).join('\n\n');

      const knowledgeUsed = route.injectKnowledge && contextResults[0]?.length > 0;

      let systemPrompt: string;
      switch (route.intent) {
        case 'analysis':
          systemPrompt = SYSTEM_PROMPTS.analysis(context);
          break;
        case 'research':
          systemPrompt = SYSTEM_PROMPTS.research(context);
          break;
        case 'casual':
        default:
          systemPrompt = SYSTEM_PROMPTS.casual;
      }

      const onStreamStart = (ttftMs: number) => {
        dispatch({ type: 'STREAM_START', messageId: assistantMsgId, ttftMs });
        Telemetry.trackEvent('CHAT_TTFT', { model: route!.model, ttftMs });
      };

      const onToken = (token: string) => {
        streamingContentRef.current += token;
        throttledUpdateStreamingState();
      };

      const { content: fullContent, tokens, retries } = await callModel({
        model: route.model,
        systemPrompt,
        userMessage: userMessageContent,
        conversationHistory: conversationHistory,
        useWebSearch: route.useWebSearch,
        onToken,
        onStreamStart,
        signal,
      });

      throttledUpdateStreamingState.flush();

      const durationMs = Math.round(performance.now() - startTime);

      const metadata: MessageMetadata = {
        model: route.model,
        intent: route.intent,
        durationMs,
        knowledgeUsed,
        searchUsed: route.useWebSearch,
        tokens,
        retries,
      };

      dispatch({
        type: 'REQUEST_SUCCESS',
        messageId: assistantMsgId,
        finalContent: fullContent || streamingContentRef.current,
        metadata
      });

      memoizedOptions.onStreamEnd?.(metadata);
      Telemetry.trackEvent('CHAT_COMPLETE', metadata);

    } catch (error) {
      const err = error instanceof Error ? error : new Error('An unexpected error occurred');
      const errorMessage = err.message;

      if (signal.aborted || err.name === 'AbortError' || err.name === 'TimeoutError' || errorMessage.includes('timeout')) {
        const reason = errorMessage.includes('timeout') ? 'timeout' : 'user_cancel';
        Telemetry.trackEvent('CHAT_INTERRUPTED', { model: route?.model || 'unknown', reason });
        
        throttledUpdateStreamingState.flush();
        const partialContent = streamingContentRef.current;

        dispatch({ type: 'CANCEL_OR_TIMEOUT', messageId: assistantMsgId, partialContent });
        return;
      }

      Telemetry.trackError(error, { stage: 'sendMessage', model: route?.model });
      memoizedOptions.onError?.(err);

      dispatch({ type: 'REQUEST_ERROR', error: errorMessage, messageId: assistantMsgId });
    } finally {
      abortControllerRef.current = null;
      currentAssistantIdRef.current = null;
    }
  }, [state.isLoading, state.messages, memoizedOptions, throttledUpdateStreamingState]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const resetChat = useCallback(() => {
    cancel();
    dispatch({ type: 'CLEAR' });
  }, [cancel]);

  const retry = useCallback(() => {
    if (state.isLoading) return;

    const lastUserMsgIndex = state.messages.map(m => m.role).lastIndexOf('user');
    if (lastUserMsgIndex === -1) return;

    const lastUserMsg = state.messages[lastUserMsgIndex];
    const messagesToKeep = state.messages.slice(0, lastUserMsgIndex);
    dispatch({ type: 'PREPARE_RETRY', messages: messagesToKeep });
        
    setTimeout(() => sendMessage(lastUserMsg.content), 0);
  }, [state.messages, state.isLoading, sendMessage]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  return useMemo(() => ({
    messages: state.messages,
    isLoading: state.isLoading,
    isStreaming: state.isStreaming,
    currentStream: state.messages[state.messages.length - 1]?.content || '',
    error: state.error,
    currentModel: state.currentModel,
    sendMessage,
    cancel,
    resetChat,
    retry,
    chatEndRef,
    routeMessage,
  }), [state, sendMessage, cancel, resetChat, retry]);
}

export default useStreamingAIChat;

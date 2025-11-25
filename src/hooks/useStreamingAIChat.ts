// ════════════════════════════════════════════════════════════════════════════
// STREAMING AI CHAT HOOK [V6 - PRODUCTION]
// V5 architecture + Unified edge function + Complete patterns
// ════════════════════════════════════════════════════════════════════════════
//
// @metanotes
// {
//   "version": "6.0.0",
//   "architecture": "Router-first → Unified edge function (ai-chat)",
//   "models": {
//     "casual": "gpt-5 (openai)",
//     "analysis": "claude-opus-4-5-20251101 (anthropic)",
//     "research": "gemini-3-pro-preview (gemini)"
//   },
//   "features": [
//     "useReducer state management",
//     "Throttled stream updates (80ms)",
//     "Ref-based content accumulation",
//     "Timeout protection (API + Context)",
//     "Spec-compliant SSE parsing",
//     "Partial content preservation",
//     "Structured telemetry",
//     "TTFT tracking"
//   ],
//   "edge_function": "ai-chat (handles retries, circuit breakers)"
// }
// ════════════════════════════════════════════════════════════════════════════

import { useReducer, useCallback, useRef, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  HISTORY_LENGTH: 10,
  API_TIMEOUT_MS: 60000, // Edge function has 180s, we timeout client at 60s
  CONTEXT_TIMEOUT_MS: 2500, // RAG fetches timeout
  STREAM_UPDATE_THROTTLE_MS: 80, // Throttle UI updates during streaming
};

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

export type Intent = "casual" | "analysis" | "research";
export type Provider = "openai" | "anthropic" | "gemini";

export interface RouteResult {
  intent: Intent;
  provider: Provider;
  injectOdds: boolean;
  injectKnowledge: boolean;
  useSearchMode: boolean;
}

export interface MessageMetadata {
  provider?: Provider;
  model?: string;
  intent?: Intent;
  taskType?: string;
  durationMs?: number;
  ttftMs?: number;
  knowledgeUsed?: boolean;
  oddsInjected?: boolean;
  searchUsed?: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
  [key: string]: unknown;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
}

// SSE Event types from edge function
interface MetadataEvent {
  provider: string;
  model: string;
  taskType: string;
  reasoning: string;
  requestId: string;
  traceId: string;
}

interface DoneEvent {
  status: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
}

interface ErrorEvent {
  errorType: string;
  code: string;
  content: string;
}

// ════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════════════════

/**
 * Telemetry wrapper - integrate with Sentry/Datadog/PostHog
 */
const Telemetry = {
  trackError: (error: Error | unknown, context: Record<string, unknown>) => {
    console.error("[Chat Error]", error, context);
    // Sentry.captureException(error, { extra: context });
  },
  trackEvent: (event: string, properties: Record<string, unknown>) => {
    console.log("[Chat Event]", event, properties);
    // PostHog.capture(event, properties);
  },
};

/**
 * Timeout wrapper for promises - graceful degradation
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  resourceName: string,
  defaultValue: T,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      Telemetry.trackEvent("CONTEXT_TIMEOUT", { resource: resourceName, timeoutMs });
      resolve(defaultValue);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Throttle function with flush capability
 */
function throttle<T extends (...args: unknown[]) => void>(func: T, limit: number): T & { flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: unknown[] | null = null;
  let lastThis: unknown = null;

  const throttled = function (this: unknown, ...args: unknown[]) {
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
// STATE MANAGEMENT (useReducer)
// ════════════════════════════════════════════════════════════════════════════

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  currentProvider: Provider | null;
}

const initialState: ChatState = {
  messages: [],
  isLoading: false,
  isStreaming: false,
  error: null,
  currentProvider: null,
};

type ChatAction =
  | { type: "START_REQUEST"; userMessage: Message; assistantPlaceholder: Message }
  | { type: "ROUTING_COMPLETE"; provider: Provider }
  | { type: "STREAM_START"; messageId: string; ttftMs: number }
  | { type: "STREAM_UPDATE"; messageId: string; content: string }
  | { type: "STREAM_METADATA"; messageId: string; metadata: Partial<MessageMetadata> }
  | { type: "REQUEST_SUCCESS"; messageId: string; finalContent: string; metadata: MessageMetadata }
  | { type: "REQUEST_ERROR"; error: string; messageId: string }
  | { type: "CANCEL_OR_TIMEOUT"; messageId: string; partialContent: string }
  | { type: "PREPARE_RETRY"; messages: Message[] }
  | { type: "CLEAR" };

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "START_REQUEST":
      return {
        ...state,
        messages: [...state.messages, action.userMessage, action.assistantPlaceholder],
        isLoading: true,
        isStreaming: false,
        error: null,
      };

    case "ROUTING_COMPLETE":
      return { ...state, currentProvider: action.provider };

    case "STREAM_START":
      return {
        ...state,
        isStreaming: true,
        messages: state.messages.map((msg) =>
          msg.id === action.messageId ? { ...msg, metadata: { ...msg.metadata, ttftMs: action.ttftMs } } : msg,
        ),
      };

    case "STREAM_UPDATE":
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.messageId ? { ...msg, content: action.content } : msg,
        ),
      };

    case "STREAM_METADATA":
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.messageId ? { ...msg, metadata: { ...msg.metadata, ...action.metadata } } : msg,
        ),
      };

    case "REQUEST_SUCCESS":
      return {
        ...state,
        isLoading: false,
        isStreaming: false,
        currentProvider: null,
        messages: state.messages.map((msg) =>
          msg.id === action.messageId
            ? { ...msg, content: action.finalContent, metadata: { ...msg.metadata, ...action.metadata } }
            : msg,
        ),
      };

    case "REQUEST_ERROR":
      return {
        ...state,
        isLoading: false,
        isStreaming: false,
        error: action.error,
        currentProvider: null,
        messages: state.messages.map((msg) =>
          msg.id === action.messageId ? { ...msg, role: "error" as const, content: `Error: ${action.error}` } : msg,
        ),
      };

    case "CANCEL_OR_TIMEOUT":
      const messagesAfterInterrupt = action.partialContent
        ? state.messages.map((msg) => (msg.id === action.messageId ? { ...msg, content: action.partialContent } : msg))
        : state.messages.filter((m) => m.id !== action.messageId);

      return {
        ...state,
        isLoading: false,
        isStreaming: false,
        currentProvider: null,
        messages: messagesAfterInterrupt,
      };

    case "PREPARE_RETRY":
      return {
        ...state,
        messages: action.messages,
        error: null,
        isLoading: false,
      };

    case "CLEAR":
      return initialState;

    default:
      return state;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTER (Client-side Intent Detection)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Client-side intent detection and provider routing
 * Runs in <5ms - no LLM call needed
 */
export function routeMessage(message: string): RouteResult {
  const lower = message.toLowerCase().trim();

  // ─────────────────────────────────────────────────────────────────────────
  // RESEARCH - Needs fresh/unknown data → Gemini (handles web search)
  // ─────────────────────────────────────────────────────────────────────────
  const researchPatterns = [
    /\b(news|latest|recent|just happened|today|tonight|yesterday)\b/,
    /\b(breaking|announced|confirmed|reportedly|rumor|report)\b/,
    /\b(update on|status of|what happened to|what's going on with)\b/,
    /\b(why did|why is|why are|how come|what caused|explain why)\b/,
    /\b(injury report|who'?s out|who'?s playing|availability|game time decision)\b/,
    /\b(when is|when does|what time|where is|how much|how many)\b.*\?/,
    /\b(current|right now|at the moment|as of)\b/,
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYSIS - Betting/picks (we have odds + DB data) → Claude
  // ─────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // KNOWLEDGE - Roster/trade/injury DB lookup → Claude (fast, no search)
  // ─────────────────────────────────────────────────────────────────────────
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

  // ─────────────────────────────────────────────────────────────────────────
  // ROUTING LOGIC - Check in order of specificity
  // ─────────────────────────────────────────────────────────────────────────

  if (researchPatterns.some((p) => p.test(lower))) {
    return {
      intent: "research",
      provider: "gemini",
      injectOdds: false,
      injectKnowledge: true,
      useSearchMode: true,
    };
  }

  if (analysisPatterns.some((p) => p.test(lower))) {
    return {
      intent: "analysis",
      provider: "anthropic",
      injectOdds: true,
      injectKnowledge: true,
      useSearchMode: false,
    };
  }

  if (knowledgePatterns.some((p) => p.test(lower))) {
    return {
      intent: "analysis",
      provider: "anthropic",
      injectOdds: false,
      injectKnowledge: true,
      useSearchMode: false,
    };
  }

  // Default: casual chat → GPT-5 (fastest, no injection)
  return {
    intent: "casual",
    provider: "openai",
    injectOdds: false,
    injectKnowledge: false,
    useSearchMode: false,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// CONTEXT INJECTION (RAG Pipeline)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Get current odds injection with timeout protection
 */
async function getOddsContext(): Promise<string> {
  const startTime = performance.now();

  const fetchOdds = async (): Promise<string> => {
    try {
      const { data, error } = await supabase.functions.invoke("get-current-odds", {
        body: { leagues: ["NBA", "NFL"], includeProps: false },
      });

      const durationMs = performance.now() - startTime;

      if (error || !data) {
        Telemetry.trackError(error || new Error("Odds data missing"), { durationMs, stage: "odds" });
        return "";
      }

      Telemetry.trackEvent("RAG_ODDS_SUCCESS", { durationMs });

      return `
══════════════════════════════════════════════════════════════
📊 LIVE ODDS (${new Date().toLocaleTimeString()})
══════════════════════════════════════════════════════════════
${data.formatted || JSON.stringify(data.odds, null, 2)}
══════════════════════════════════════════════════════════════`;
    } catch (err) {
      Telemetry.trackError(err, { stage: "odds_fetch" });
      return "";
    }
  };

  return withTimeout(fetchOdds(), CONFIG.CONTEXT_TIMEOUT_MS, "Odds", "");
}

/**
 * Get knowledge base context (DISABLED - no knowledge service available)
 */
async function getKnowledgeContext(query: string): Promise<string> {
  // Knowledge base integration disabled - return empty context
  return "";
}

// ════════════════════════════════════════════════════════════════════════════
// SSE STREAM PARSER (Spec-compliant)
// ════════════════════════════════════════════════════════════════════════════

interface SSECallbacks {
  onMetadata?: (data: MetadataEvent) => void;
  onText?: (text: string) => void;
  onDone?: (data: DoneEvent) => void;
  onError?: (data: ErrorEvent) => void;
  onDebug?: (stage: string, details: unknown) => void;
}

/**
 * Spec-compliant SSE parser
 * Handles buffering, multi-line data, and edge cases
 */
async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on double newline (SSE event separator)
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        if (!event.trim()) continue;

        const lines = event.split("\n");
        let eventType = "";
        let dataPayload = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            // Accumulate data (SSE allows multi-line data)
            dataPayload += line.slice(6);
          }
        }

        if (!dataPayload) continue;
        if (dataPayload.trim() === "[DONE]") continue;

        try {
          switch (eventType) {
            case "metadata":
              callbacks.onMetadata?.(JSON.parse(dataPayload));
              break;
            case "text":
              // Text events are plain strings, not JSON
              callbacks.onText?.(dataPayload);
              break;
            case "done":
              callbacks.onDone?.(JSON.parse(dataPayload));
              break;
            case "error":
              callbacks.onError?.(JSON.parse(dataPayload));
              break;
            case "debug":
              const debugData = JSON.parse(dataPayload);
              callbacks.onDebug?.(debugData.stage, debugData.details);
              break;
            default:
              // Handle events without explicit type (fallback)
              if (dataPayload && !eventType) {
                callbacks.onText?.(dataPayload);
              }
          }
        } catch (e) {
          Telemetry.trackError(e, { stage: "sse_parse", data: dataPayload.substring(0, 100) });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN HOOK
// ════════════════════════════════════════════════════════════════════════════

export interface UseStreamingAIChatOptions {
  conversationId?: string;
  onRouteDetected?: (route: RouteResult) => void;
  onMetadata?: (metadata: MetadataEvent) => void;
  onStreamStart?: (provider: Provider) => void;
  onStreamEnd?: (metadata: MessageMetadata) => void;
  onDebug?: (stage: string, details: unknown) => void;
  onError?: (error: Error) => void;
}

export function useStreamingAIChat(options: UseStreamingAIChatOptions = {}) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Refs for optimized streaming (no re-render per token)
  const streamingContentRef = useRef<string>("");
  const currentAssistantIdRef = useRef<string | null>(null);

  // Memoize options
  const memoizedOptions = useMemo(() => options, [options]);

  /**
   * Throttled state update for streaming content
   */
  const updateStreamingState = useCallback(() => {
    const assistantId = currentAssistantIdRef.current;
    const content = streamingContentRef.current;
    if (assistantId) {
      dispatch({ type: "STREAM_UPDATE", messageId: assistantId, content });
    }
  }, []);

  const throttledUpdate = useMemo(
    () => throttle(updateStreamingState, CONFIG.STREAM_UPDATE_THROTTLE_MS),
    [updateStreamingState],
  );

  // Cleanup throttle on unmount
  useEffect(() => {
    return () => throttledUpdate.flush();
  }, [throttledUpdate]);

  /**
   * Send a message and handle the full lifecycle
   */
  const sendMessage = useCallback(
    async (userMessageContent: string) => {
      if (!userMessageContent.trim() || state.isLoading) return;

      const startTime = performance.now();
      const conversationHistory = state.messages;

      // 1. CREATE MESSAGES
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: userMessageContent.trim(),
        timestamp: new Date(),
      };

      const assistantMsgId = crypto.randomUUID();
      const assistantPlaceholder: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      // Setup streaming refs
      streamingContentRef.current = "";
      currentAssistantIdRef.current = assistantMsgId;

      dispatch({ type: "START_REQUEST", userMessage: userMsg, assistantPlaceholder });

      // Setup abort with timeout
      abortControllerRef.current = new AbortController();
      const userSignal = abortControllerRef.current.signal;
      const timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort(new Error("Request timeout"));
      }, CONFIG.API_TIMEOUT_MS);

      let route: RouteResult | null = null;
      let metadata: MetadataEvent | null = null;
      let usage: DoneEvent["usage"] | null = null;

      try {
        // 2. ROUTE MESSAGE
        route = routeMessage(userMessageContent);
        Telemetry.trackEvent("CHAT_ROUTING", { intent: route.intent, provider: route.provider });
        memoizedOptions.onRouteDetected?.(route);
        dispatch({ type: "ROUTING_COMPLETE", provider: route.provider });

        // 3. BUILD CONTEXT (parallel, time-boxed)
        const contextPromises: Promise<string>[] = [];

        if (route.injectKnowledge) {
          contextPromises.push(getKnowledgeContext(userMessageContent));
        }
        if (route.injectOdds) {
          contextPromises.push(getOddsContext());
        }

        const contextResults = await Promise.all(contextPromises);

        const knowledgeUsed = route.injectKnowledge && (contextResults[0]?.length ?? 0) > 0;
        const oddsIndex = route.injectKnowledge ? 1 : 0;
        const oddsInjected = route.injectOdds && (contextResults[oddsIndex]?.length ?? 0) > 0;

        // 4. BUILD MESSAGES WITH INJECTED CONTEXT
        const contextPrefix = contextResults.filter(Boolean).join("\n\n");
        const enhancedUserMessage = contextPrefix
          ? `${contextPrefix}\n\n---\n\nUser question: ${userMessageContent}`
          : userMessageContent;

        const apiMessages = [
          ...conversationHistory.slice(-CONFIG.HISTORY_LENGTH).map((m) => ({
            role: m.role === "error" ? "assistant" : m.role,
            content: m.content,
          })),
          { role: "user", content: enhancedUserMessage },
        ];

        // 5. GET AUTH TOKEN
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          throw new Error("Not authenticated");
        }

        // 6. CALL UNIFIED EDGE FUNCTION
        memoizedOptions.onStreamStart?.(route.provider);

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: apiMessages,
            conversationId: memoizedOptions.conversationId,
            preferredProvider: route.provider,
            mode: route.useSearchMode ? "search_assist" : "chat",
          }),
          signal: userSignal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        // 7. PARSE SSE STREAM
        const reader = response.body.getReader();
        let ttftMs = 0;
        let firstTokenTime = 0;

        await parseSSEStream(
          reader,
          {
            onMetadata: (data) => {
              metadata = data;
              memoizedOptions.onMetadata?.(data);
              dispatch({
                type: "STREAM_METADATA",
                messageId: assistantMsgId,
                metadata: { provider: data.provider as Provider, model: data.model, taskType: data.taskType },
              });
              Telemetry.trackEvent("CHAT_METADATA", { provider: data.provider, model: data.model });
            },

            onText: (text) => {
              if (!firstTokenTime) {
                firstTokenTime = performance.now();
                ttftMs = firstTokenTime - startTime;
                dispatch({ type: "STREAM_START", messageId: assistantMsgId, ttftMs });
                Telemetry.trackEvent("CHAT_TTFT", { provider: route!.provider, ttftMs });
              }
              streamingContentRef.current += text;
              throttledUpdate();
            },

            onDone: (data) => {
              usage = data.usage;
            },

            onError: (data) => {
              Telemetry.trackError(new Error(data.content), { code: data.code, type: data.errorType });
              throw new Error(data.content || data.code);
            },

            onDebug: (stage, details) => {
              memoizedOptions.onDebug?.(stage, details);
            },
          },
          userSignal,
        );

        // 8. FINALIZE
        clearTimeout(timeoutId);
        throttledUpdate.flush();

        const durationMs = Math.round(performance.now() - startTime);
        const finalMetadata: MessageMetadata = {
          provider: (metadata?.provider as Provider) || route.provider,
          model: metadata?.model,
          intent: route.intent,
          taskType: metadata?.taskType,
          durationMs,
          ttftMs: Math.round(ttftMs),
          knowledgeUsed,
          oddsInjected,
          searchUsed: route.useSearchMode,
          usage: usage || undefined,
        };

        dispatch({
          type: "REQUEST_SUCCESS",
          messageId: assistantMsgId,
          finalContent: streamingContentRef.current,
          metadata: finalMetadata,
        });

        memoizedOptions.onStreamEnd?.(finalMetadata);
        Telemetry.trackEvent("CHAT_COMPLETE", finalMetadata);
      } catch (error) {
        clearTimeout(timeoutId);
        const err = error instanceof Error ? error : new Error("Unknown error");

        // Handle cancellation/timeout
        if (userSignal.aborted || err.name === "AbortError" || err.message.includes("timeout")) {
          const reason = err.message.includes("timeout") ? "timeout" : "user_cancel";
          Telemetry.trackEvent("CHAT_INTERRUPTED", { provider: route?.provider, reason });

          throttledUpdate.flush();
          dispatch({
            type: "CANCEL_OR_TIMEOUT",
            messageId: assistantMsgId,
            partialContent: streamingContentRef.current,
          });
          return;
        }

        // Handle other errors
        Telemetry.trackError(err, { stage: "sendMessage", provider: route?.provider });
        memoizedOptions.onError?.(err);
        dispatch({ type: "REQUEST_ERROR", error: err.message, messageId: assistantMsgId });
      } finally {
        abortControllerRef.current = null;
        currentAssistantIdRef.current = null;
      }
    },
    [state.isLoading, state.messages, memoizedOptions, throttledUpdate],
  );

  /**
   * Cancel current request
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /**
   * Clear conversation
   */
  const clear = useCallback(() => {
    cancel();
    dispatch({ type: "CLEAR" });
  }, [cancel]);

  /**
   * Retry last message
   */
  const retry = useCallback(() => {
    if (state.isLoading) return;

    const lastUserMsgIndex = state.messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserMsgIndex === -1) return;

    const lastUserMsg = state.messages[lastUserMsgIndex];
    const messagesToKeep = state.messages.slice(0, lastUserMsgIndex);

    dispatch({ type: "PREPARE_RETRY", messages: messagesToKeep });
    setTimeout(() => sendMessage(lastUserMsg.content), 0);
  }, [state.messages, state.isLoading, sendMessage]);

  return useMemo(
    () => ({
      messages: state.messages,
      isLoading: state.isLoading,
      isStreaming: state.isStreaming,
      error: state.error,
      currentProvider: state.currentProvider,
      sendMessage,
      cancel,
      clear,
      retry,
      routeMessage,
    }),
    [state, sendMessage, cancel, clear, retry],
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════════

export default useStreamingAIChat;

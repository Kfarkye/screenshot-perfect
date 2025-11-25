// ════════════════════════════════════════════════════════════════════════════
// STREAMING AI CHAT HOOK [V4 - MULTI-MODEL ROUTING]
// Routes to optimal model based on intent. Fast models stay fast.
// ════════════════════════════════════════════════════════════════════════════
//
// @metanotes
// {
//   "version": "4.0.0",
//   "author": "SharpEdge",
//   "architecture": "Router-first multi-model",
//   "models": {
//     "casual": "google/gemini-2.5-flash (Lovable AI)",
//     "analysis": "google/gemini-2.5-pro (Lovable AI)", 
//     "research": "google/gemini-2.5-pro (Lovable AI)"
//   },
//   "routing": "Client-side pattern matching (<5ms)",
//   "latency_targets": {
//     "casual": "800ms",
//     "analysis": "1.2s", 
//     "research": "3-5s (web search)"
//   }
// }
// ════════════════════════════════════════════════════════════════════════════

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createParser } from 'eventsource-parser';

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

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    model?: ModelId;
    intent?: Intent;
    durationMs?: number;
    knowledgeUsed?: boolean;
    searchUsed?: boolean;
  };
}

// Legacy export for backwards compatibility
export type ChatMessage = Message;

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  currentModel: ModelId | null;
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════════════════════════════════════════

/**
 * Client-side intent detection and model routing
 * Runs in <5ms - no LLM call needed
 */
export function routeMessage(message: string): RouteResult {
  const lower = message.toLowerCase().trim();
  
  // ─────────────────────────────────────────────────────────────────────────
  // RESEARCH - Needs fresh/unknown data → Gemini Pro (takes the web search hit)
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
  // ANALYSIS - Betting/picks → Gemini Pro
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
  // KNOWLEDGE - Roster/trade/injury DB lookup → Gemini Pro (fast, no search)
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
  
  // Research patterns take priority (needs live data)
  if (researchPatterns.some(p => p.test(lower))) {
    return {
      intent: 'research',
      model: 'google/gemini-2.5-pro',
      injectKnowledge: true,
      useWebSearch: true,
    };
  }
  
  // Analysis patterns (betting-related)
  if (analysisPatterns.some(p => p.test(lower))) {
    return {
      intent: 'analysis',
      model: 'google/gemini-2.5-pro',
      injectKnowledge: true,
      useWebSearch: false,
    };
  }
  
  // Knowledge patterns (DB lookup)
  if (knowledgePatterns.some(p => p.test(lower))) {
    return {
      intent: 'analysis',
      model: 'google/gemini-2.5-pro',
      injectKnowledge: true,
      useWebSearch: false,
    };
  }
  
  // Default: casual chat → Flash (fastest)
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
3. Never say "the data shows" or "based on the injection" - just use it
4. Never explain that you received data - act like you know it
5. Be conversational but sharp
6. Include specific numbers: spreads, lines, percentages
7. If asked about a player's team, use ONLY the verified data above

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
  try {
    const { getSportsKnowledge, formatKnowledgeForPrompt } = await import('./useSportsKnowledge');
    const knowledgeEntries = await getSportsKnowledge(query);
    
    if (knowledgeEntries.length === 0) {
      return '';
    }
    
    console.log(`[Chat] Knowledge hit: ${knowledgeEntries.length} entries`);
    
    return formatKnowledgeForPrompt(knowledgeEntries);
    
  } catch (err) {
    console.error('[Chat] Knowledge injection error:', err);
    return '';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN HOOK
// ════════════════════════════════════════════════════════════════════════════

// Hook can accept optional game/pick context for backwards compatibility
export function useStreamingAIChat(game?: any, pick?: any) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isLoading: false,
    error: null,
    currentModel: null,
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const sendMessage = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || state.isLoading) return;
    
    const startTime = performance.now();
    
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage.trim(),
      timestamp: new Date(),
    };
    
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      isLoading: true,
      error: null,
    }));
    
    abortControllerRef.current = new AbortController();
    
    try {
      // Route the message
      const route = routeMessage(userMessage);
      console.log(`[Chat] Routed to ${route.model} (${route.intent})`);
      
      setState(prev => ({ ...prev, currentModel: route.model }));
      
      // Build context
      let context = '';
      let knowledgeUsed = false;
      
      if (route.injectKnowledge) {
        const knowledgeContext = await getKnowledgeInjection(userMessage);
        if (knowledgeContext) {
          context = knowledgeContext;
          knowledgeUsed = true;
        }
      }
      
      // Build system prompt
      let systemPrompt: string;
      switch (route.intent) {
        case 'casual':
          systemPrompt = SYSTEM_PROMPTS.casual;
          break;
        case 'analysis':
          systemPrompt = SYSTEM_PROMPTS.analysis(context);
          break;
        case 'research':
          systemPrompt = SYSTEM_PROMPTS.research(context);
          break;
      }
      
      // Prepare messages
      const previousMessages = state.messages;
      const messagesPayload = [
        { role: 'system', content: systemPrompt },
        ...previousMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg.content },
      ];
      
      // Call AI
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("User not authenticated");

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat-router`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ 
          messages: messagesPayload,
          model: route.model,
          preferredProvider: "gemini",
          stream: true
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      if (!response.body) throw new Error('No response body received');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedResponse = '';

      const parser = createParser({
        onEvent: (event) => {
          const chunk = event.data;
          if (chunk && chunk !== '[DONE]') {
            try {
              const parsed = JSON.parse(chunk);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                accumulatedResponse += content;
                setState(prev => ({
                  ...prev,
                  messages: [
                    ...prev.messages.slice(0, -1),
                    {
                      id: crypto.randomUUID(),
                      role: 'assistant',
                      content: accumulatedResponse,
                      timestamp: new Date(),
                      metadata: {
                        model: route.model,
                        intent: route.intent,
                        knowledgeUsed,
                        searchUsed: route.useWebSearch,
                      },
                    },
                  ],
                }));
              }
            } catch (e) {
              console.warn('Failed to parse SSE chunk:', e);
            }
          }
        }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }

      const durationMs = Math.round(performance.now() - startTime);
      console.log(`[Chat] Complete in ${durationMs}ms via ${route.model}`);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        currentModel: null,
      }));
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('abort')) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          currentModel: null,
        }));
        return;
      }
      
      console.error('[Chat] Error:', error);
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false,
        currentModel: null,
        messages: [
          ...prev.messages,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Error: ${errorMessage}`,
            timestamp: new Date(),
          },
        ],
      }));
    }
  }, [state.messages, state.isLoading]);
  
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setState(prev => ({
      ...prev,
      isLoading: false,
      currentModel: null,
    }));
  }, []);
  
  const resetChat = useCallback(() => {
    cancel();
    setState({
      messages: [],
      isLoading: false,
      error: null,
      currentModel: null,
    });
  }, [cancel]);
  
  return {
    messages: state.messages,
    isLoading: state.isLoading,
    currentStream: state.messages[state.messages.length - 1]?.content || '',
    error: state.error,
    currentModel: state.currentModel,
    sendMessage,
    cancel,
    resetChat,
    chatEndRef,
    routeMessage,
  };
}

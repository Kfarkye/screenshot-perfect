import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PickData, GameData } from '../types';
import { createParser } from 'eventsource-parser';
import { detectSearchIntent, formatResultsForAI } from './useWebSearch';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
}

export const useStreamingAIChat = (game: GameData, pick: PickData) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStream, setCurrentStream] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStream]);

  const systemPrompt = useMemo(() => `You are an elite sports betting analyst AI. Focus strictly on THIS specific game:
**Game**: ${game.awayTeam} @ ${game.homeTeam} (${game.league})
**AI Pick**: ${pick.pick_side} (${pick.odds_at_generation > 0 ? '+' : ''}${pick.odds_at_generation})
**Confidence**: ${pick.confidence_score}%
**Initial Analysis**: ${pick.reasoning_text}

Use external tools (e.g., 'google_search') to find real-time injury updates, advanced metrics, recent performance data, and betting market movements to provide deeper analysis.

Provide concise, insightful analysis. Do not ask the user which game they are referring to. Use markdown formatting where appropriate.`, [game, pick]);

  const sendMessage = useCallback(async (inputMessage: string) => {
    if (!inputMessage.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID?.() || Date.now().toString(),
      role: 'user',
      content: inputMessage
    };
    
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setCurrentStream('');

    // Step 1: Check local sports knowledge DB (instant, free)
    const { getSportsKnowledge, formatKnowledgeForPrompt } = await import('./useSportsKnowledge');
    const knowledgeEntries = await getSportsKnowledge(inputMessage);
    
    let augmentedSystemPrompt = systemPrompt;
    
    if (knowledgeEntries.length > 0) {
      console.log('[Sports Knowledge] Using local DB:', knowledgeEntries.length, 'entries');
      const knowledgeContext = formatKnowledgeForPrompt(knowledgeEntries);
      augmentedSystemPrompt = systemPrompt + knowledgeContext;
    }

    // Step 2: Detect if we need web search (only as fallback)
    const searchIntent = detectSearchIntent(inputMessage);
    const needsWebSearch = searchIntent.shouldSearch && knowledgeEntries.length === 0;
    
    console.log('[AI Chat] Knowledge DB:', knowledgeEntries.length, '| Web search needed:', needsWebSearch);

    // Step 3: If DB didn't have answer AND search is needed, call web-search
    if (needsWebSearch) {
      console.log('[Web Search] Calling edge function...');
      try {
        const { data: searchData, error: searchError } = await supabase.functions.invoke('web-search', {
          body: { query: inputMessage, maxResults: 5 }
        });

        console.log('[Web Search] Response:', { data: searchData, error: searchError });

        if (!searchError && searchData) {
          const formattedResults = formatResultsForAI(searchData);
          console.log('[Web Search] Formatted results length:', formattedResults.length);
          
          // Step 3: Prepend search results to system prompt
          augmentedSystemPrompt = `LIVE WEB SEARCH RESULTS:
${formattedResults}

Use these results to answer. They are more current than your training data.

${systemPrompt}`;
        } else if (searchError) {
          console.error('[Web Search] Error from edge function:', searchError);
        }
      } catch (searchErr) {
        console.error('[Web Search] Exception:', searchErr);
      }
    } else {
      console.log('[Web Search] Skipping search - intent not detected');
    }

    const previousMessages = messages.filter(m => m.role !== 'error');
    const messagesPayload = [
      { role: 'system', content: augmentedSystemPrompt },
      ...previousMessages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMsg.content },
    ];

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("User not authenticated. Cannot access AI features.");

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      if (!SUPABASE_URL) throw new Error("Supabase environment variables not configured.");

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat-router`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ 
          messages: messagesPayload,
          tools: ["google_search"],
          generationConfig: { temperature: 0.4 },
          preferredProvider: "gemini",
          stream: true
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      if (!response.body) throw new Error('No response body received.');

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
                setCurrentStream(accumulatedResponse);
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

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID?.() || Date.now().toString(),
        role: 'assistant',
        content: accumulatedResponse || "I apologize, I didn't receive any content.",
      };
      setMessages(prev => [...prev, assistantMsg]);

    } catch (error) {
      console.error('AI chat streaming error:', error);
      const errorMsg = error instanceof Error ? error.message : 'An unknown error occurred.';
      setMessages(prev => [...prev, {
        id: crypto.randomUUID?.() || Date.now().toString(),
        role: 'error',
        content: `Error communicating with AI Analyst: ${errorMsg}`,
      }]);
    } finally {
      setIsLoading(false);
      setCurrentStream('');
    }
  }, [isLoading, systemPrompt, messages]);

  const resetChat = useCallback(() => {
    setMessages([]);
    setCurrentStream('');
    setIsLoading(false);
  }, []);

  return { messages, isLoading, currentStream, sendMessage, chatEndRef, resetChat };
};

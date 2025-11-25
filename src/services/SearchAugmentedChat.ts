/**
 * @service SearchAugmentedChat
 * @description AI chat service with integrated web search for real-time accuracy
 *
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "features": [
 *     "Auto-detect when to search",
 *     "Inject search results into context",
 *     "Streaming response support",
 *     "Citation extraction",
 *     "Fallback handling"
 *   ]
 * }
 */

import { detectSearchIntent, buildSearchQuery, formatResultsForAI, type SearchResult, type SearchCategory } from '../hooks/useWebSearch';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    searchPerformed?: boolean;
    searchQuery?: string;
    citations?: Citation[];
    model?: string;
    tokensUsed?: number;
    searchResults?: SearchResult[];
  };
}

export interface Citation {
  index: number;
  source: string;
  url: string;
  title: string;
}

export interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onSearchStart?: (query: string) => void;
  onSearchComplete?: (results: SearchResult[]) => void;
  onComplete?: (message: ChatMessage) => void;
  onError?: (error: Error) => void;
}

interface ChatOptions {
  model?: 'claude' | 'gpt' | 'gemini';
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  searchProvider?: 'tavily' | 'serper' | 'brave';
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPTS
// ─────────────────────────────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are SharpEdge AI, an expert sports betting analyst with deep knowledge of all major sports leagues.

PERSONALITY:
- Sharp, confident, direct
- Uses betting terminology naturally
- Explains complex concepts simply
- Never hedges unnecessarily

KNOWLEDGE SOURCES:
1. LIVE SEARCH RESULTS (when provided)
   - ALWAYS prioritize this over training data
   - Cite sources: "According to ESPN..." or "Per NBA.com..."
   - This is the source of truth for current rosters, trades, injuries, stats

2. YOUR TRAINING DATA (use for):
   - Rules and regulations
   - Historical facts (before 2024)
   - Betting strategy and concepts
   - General sports knowledge

3. PROVIDED GAME/ODDS DATA (when available)
   - Current lines, spreads, totals
   - Sharp money indicators
   - Market analysis

CRITICAL RULES:
- For ANY question about current rosters, recent trades, or player status:
  → Use search results, NOT training data
  → Your training data is outdated (may be 6+ months old)
  
- For rules, strategy, or historical questions:
  → Use your training knowledge
  → No need to search

- When search results are provided:
  → Trust them over your memory
  → Cite the source naturally
  → If results conflict, use most recent

- When asked about bets:
  → Reference the live odds data
  → Provide sharp analysis
  → Include confidence level`;

const SEARCH_INJECTION_TEMPLATE = `
─────────────────────────────────────────
LIVE WEB SEARCH RESULTS
Query: "{query}"
─────────────────────────────────────────

{results}

─────────────────────────────────────────
Use these results to answer accurately. Cite sources naturally.
If results don't fully answer the question, say so.
─────────────────────────────────────────`;

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH EXECUTION
// ─────────────────────────────────────────────────────────────────────────────

async function executeWebSearch(
  query: string,
  provider: 'tavily' | 'serper' | 'brave' = 'tavily'
): Promise<SearchResult[]> {
  try {
    if (provider === 'tavily') {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: import.meta.env.VITE_TAVILY_API_KEY,
          query,
          search_depth: 'basic',
          max_results: 5,
          include_answer: false,
        }),
      });

      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      
      const data = await response.json();
      return data.results.map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        source: new URL(r.url).hostname.replace('www.', ''),
        publishedAt: r.published_date,
      }));
    }

    if (provider === 'serper') {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': import.meta.env.VITE_SERPER_API_KEY || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: 5 }),
      });

      if (!response.ok) throw new Error(`Search failed: ${response.status}`);

      const data = await response.json();
      return (data.organic || []).map((r: any) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet,
        source: new URL(r.link).hostname.replace('www.', ''),
        publishedAt: r.date,
      }));
    }

    if (provider === 'brave') {
      const params = new URLSearchParams({ q: query, count: '5' });
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: {
          'X-Subscription-Token': import.meta.env.VITE_BRAVE_API_KEY || '',
          Accept: 'application/json',
        },
      });

      if (!response.ok) throw new Error(`Search failed: ${response.status}`);

      const data = await response.json();
      return (data.web?.results || []).map((r: any) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
        source: new URL(r.url).hostname.replace('www.', ''),
        publishedAt: r.age,
      }));
    }

    return [];
  } catch (error) {
    console.error('[SEARCH_ERROR]', error);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AI PROVIDER CALLS
// ─────────────────────────────────────────────────────────────────────────────

interface AICallParams {
  messages: Array<{ role: string; content: string }>;
  model: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
}

async function callClaude(params: AICallParams, callbacks?: StreamCallbacks): Promise<string> {
  const { messages, temperature, maxTokens, stream } = params;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature,
      stream,
      system: messages.find((m) => m.role === 'system')?.content || BASE_SYSTEM_PROMPT,
      messages: messages.filter((m) => m.role !== 'system'),
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  if (stream && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'content_block_delta' && data.delta?.text) {
              fullContent += data.delta.text;
              callbacks?.onToken?.(data.delta.text);
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      }
    }

    return fullContent;
  }

  const data = await response.json();
  return data.content[0]?.text || '';
}

async function callGPT(params: AICallParams, callbacks?: StreamCallbacks): Promise<string> {
  const { messages, temperature, maxTokens, stream } = params;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY || ''}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      temperature,
      max_tokens: maxTokens,
      stream,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  if (stream && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            const token = data.choices[0]?.delta?.content;
            if (token) {
              fullContent += token;
              callbacks?.onToken?.(token);
            }
          } catch {
            // Skip
          }
        }
      }
    }

    return fullContent;
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function callGemini(params: AICallParams, callbacks?: StreamCallbacks): Promise<string> {
  const { messages, temperature, maxTokens, stream } = params;

  // Convert messages to Gemini format
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages.find((m) => m.role === 'system')?.content;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:${stream ? 'streamGenerateContent' : 'generateContent'}?key=${import.meta.env.VITE_GEMINI_API_KEY || ''}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  if (stream && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      // Gemini returns newline-delimited JSON
      const lines = chunk.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullContent += text;
            callbacks?.onToken?.(text);
          }
        } catch {
          // Skip
        }
      }
    }

    return fullContent;
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CHAT FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  userMessage: string,
  conversationHistory: ChatMessage[],
  options: ChatOptions = {},
  callbacks?: StreamCallbacks
): Promise<ChatMessage> {
  const {
    model = 'claude',
    stream = true,
    temperature = 0.7,
    maxTokens = 2048,
    searchProvider = 'tavily',
  } = options;

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  try {
    callbacks?.onStart?.();

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Detect if we need to search
    // ─────────────────────────────────────────────────────────────────────────
    const intent = detectSearchIntent(userMessage);
    let searchResults: SearchResult[] = [];
    let searchQuery = '';

    if (intent.shouldSearch) {
      searchQuery = buildSearchQuery(userMessage, intent.category);
      callbacks?.onSearchStart?.(searchQuery);

      searchResults = await executeWebSearch(searchQuery, searchProvider);
      callbacks?.onSearchComplete?.(searchResults);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Build messages with search context
    // ─────────────────────────────────────────────────────────────────────────
    let systemPrompt = BASE_SYSTEM_PROMPT;

    if (searchResults.length > 0) {
      const formattedResults = formatResultsForAI(searchResults);
      systemPrompt += SEARCH_INJECTION_TEMPLATE
        .replace('{query}', searchQuery)
        .replace('{results}', formattedResults);
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Call appropriate AI model
    // ─────────────────────────────────────────────────────────────────────────
    const aiParams: AICallParams = {
      messages,
      model,
      temperature,
      maxTokens,
      stream,
    };

    let responseContent: string;

    switch (model) {
      case 'gpt':
        responseContent = await callGPT(aiParams, callbacks);
        break;
      case 'gemini':
        responseContent = await callGemini(aiParams, callbacks);
        break;
      case 'claude':
      default:
        responseContent = await callClaude(aiParams, callbacks);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Build response message with metadata
    // ─────────────────────────────────────────────────────────────────────────
    const assistantMessage: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: responseContent,
      timestamp: Date.now(),
      metadata: {
        searchPerformed: searchResults.length > 0,
        searchQuery: searchQuery || undefined,
        citations: searchResults.map((r, i) => ({
          index: i + 1,
          source: r.source,
          url: r.url,
          title: r.title,
        })),
        model,
      },
    };

    callbacks?.onComplete?.(assistantMessage);
    return assistantMessage;
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Chat failed');
    callbacks?.onError?.(err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY: Extract citations from response
// ─────────────────────────────────────────────────────────────────────────────

export function extractCitationsFromResponse(
  response: string,
  searchResults: SearchResult[]
): Citation[] {
  const citations: Citation[] = [];

  // Look for patterns like "According to ESPN", "Per NBA.com", etc.
  const citationPatterns = [
    /according to (\w+[\w.]*)/gi,
    /per (\w+[\w.]*)/gi,
    /(\w+[\w.]*) reports?/gi,
    /source:? (\w+[\w.]*)/gi,
  ];

  const mentionedSources = new Set<string>();

  for (const pattern of citationPatterns) {
    let match;
    while ((match = pattern.exec(response)) !== null) {
      mentionedSources.add(match[1].toLowerCase());
    }
  }

  // Match mentioned sources to search results
  searchResults.forEach((result, i) => {
    const sourceLower = result.source.toLowerCase();
    if (
      mentionedSources.has(sourceLower) ||
      Array.from(mentionedSources).some((m) => sourceLower.includes(m) || m.includes(sourceLower))
    ) {
      citations.push({
        index: i + 1,
        source: result.source,
        url: result.url,
        title: result.title,
      });
    }
  });

  return citations;
}

export default sendChatMessage;

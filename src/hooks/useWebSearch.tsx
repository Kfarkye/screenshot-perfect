/**
 * @hook useWebSearch
 * @description Production-grade web search integration with smart query detection,
 *              caching, and streaming support for real-time sports data
 *
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "features": [
 *     "Smart search trigger detection",
 *     "Result caching with TTL",
 *     "Streaming response support",
 *     "Source citation tracking",
 *     "Optimistic UI updates"
 *   ]
 * }
 */

import { useState, useCallback, useRef, useMemo } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  timestamp: number;
  cached: boolean;
}

export interface Citation {
  index: number;
  source: string;
  url: string;
  title: string;
}

export interface SearchState {
  isSearching: boolean;
  results: SearchResult[];
  citations: Citation[];
  error: string | null;
  lastQuery: string | null;
}

interface CacheEntry {
  response: SearchResponse;
  expiresAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for roster/player data
const CACHE_TTL_SCORES_MS = 30 * 1000; // 30 seconds for live scores
const MAX_CACHE_ENTRIES = 50;

// Keywords that should trigger web search
const SEARCH_TRIGGERS = {
  // Roster/Player queries - ALWAYS search
  roster: [
    'who is on',
    'who plays for',
    'roster',
    'starting lineup',
    'starting 5',
    'starting five',
    'who are the',
    'players on',
    'current team',
    'traded to',
    'signed with',
    'got traded',
    'which team',
    'what team is',
    'what team does',
    'which team does',
    'who does',
    'play for',
    ' on the ',  // with spaces to match "[player] on the [team]"
    ' for the ', // "[player] for the [team]"
  ],
  // Recent events - ALWAYS search
  recent: [
    'latest',
    'recent',
    'today',
    'yesterday',
    'this week',
    'last night',
    'just happened',
    'breaking',
    'news',
    'update',
  ],
  // Injury/Status - ALWAYS search
  status: [
    'injured',
    'injury',
    'out for',
    'playing tonight',
    'active',
    'inactive',
    'suspended',
    'questionable',
    'probable',
    'doubtful',
    'day to day',
    'IR',
    'injured reserve',
  ],
  // Current state - ALWAYS search
  current: [
    'current',
    'right now',
    'currently',
    'still on',
    'still with',
    'now plays',
    'this season',
    '2025',
    '2024-25',
    '2025-26',
  ],
  // Stats this season - ALWAYS search
  stats: [
    'averaging',
    'stats this',
    'ppg',
    'points per game',
    'this season stats',
    'season average',
  ],
};

// Keywords that should NOT trigger search (use LLM knowledge)
const NO_SEARCH_TRIGGERS = [
  'rules',
  'what is a',
  'how does',
  'explain',
  'definition',
  'history of',
  'when was',
  'who invented',
  'how many points',
  'how long is',
  'what are the rules',
  'strategy',
  'how to bet',
  'what does',
  'spread mean',
  'moneyline mean',
  'over under',
];

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH QUERY DETECTOR
// ─────────────────────────────────────────────────────────────────────────────

export type SearchCategory = 'roster' | 'recent' | 'status' | 'current' | 'stats' | 'none';

export function detectSearchIntent(query: string): {
  shouldSearch: boolean;
  category: SearchCategory;
  confidence: number;
} {
  const lowerQuery = query.toLowerCase();
  
  console.log('[Web Search] Testing query:', query);
  console.log('[Web Search] Lowercase:', lowerQuery);

  // First check if it's a static knowledge question
  for (const trigger of NO_SEARCH_TRIGGERS) {
    if (lowerQuery.includes(trigger)) {
      return { shouldSearch: false, category: 'none', confidence: 0.9 };
    }
  }

  // Check each search category
  for (const [category, triggers] of Object.entries(SEARCH_TRIGGERS)) {
    for (const trigger of triggers) {
      if (lowerQuery.includes(trigger)) {
        return {
          shouldSearch: true,
          category: category as SearchCategory,
          confidence: 0.95,
        };
      }
    }
  }

  // Check for team names + player context (likely roster question)
  const teamPatterns = [
    /lakers|celtics|warriors|bulls|heat|nets|knicks|mavericks|mavs|spurs|suns/i,
    /yankees|dodgers|red sox|mets|cubs|braves|astros|phillies/i,
    /chiefs|eagles|cowboys|49ers|bills|ravens|lions|packers/i,
    /avalanche|bruins|rangers|maple leafs|oilers|panthers|lightning/i,
  ];

  const playerContextWords = ['star', 'best', 'top', 'main', 'key', 'players', 'guys', 'names'];

  const hasTeam = teamPatterns.some((pattern) => pattern.test(lowerQuery));
  const hasPlayerContext = playerContextWords.some((word) => lowerQuery.includes(word));

  if (hasTeam && hasPlayerContext) {
    return { shouldSearch: true, category: 'roster', confidence: 0.85 };
  }

  // Default: don't search for ambiguous queries
  return { shouldSearch: false, category: 'none', confidence: 0.5 };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH QUERY BUILDER
// ─────────────────────────────────────────────────────────────────────────────

export function buildSearchQuery(userQuery: string, category: SearchCategory): string {
  const lowerQuery = userQuery.toLowerCase();

  // Extract team name if present
  const teamMatches = lowerQuery.match(
    /(lakers|celtics|warriors|bulls|heat|nets|knicks|mavericks|mavs|spurs|suns|yankees|dodgers|red sox|mets|cubs|braves|astros|phillies|chiefs|eagles|cowboys|49ers|bills|ravens|lions|packers|avalanche|bruins|rangers|maple leafs|oilers|panthers|lightning)/i
  );

  const team = teamMatches ? teamMatches[1] : '';

  switch (category) {
    case 'roster':
      return team ? `${team} current roster 2025` : `${userQuery} roster 2025`;

    case 'status':
      return team ? `${team} injury report today` : `${userQuery} injury status`;

    case 'recent':
      return `${userQuery} latest news`;

    case 'current':
      return `${userQuery} 2025`;

    case 'stats':
      return `${userQuery} stats 2025-26 season`;

    default:
      return userQuery;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH API (Replace with your preferred provider)
// ─────────────────────────────────────────────────────────────────────────────

interface SearchAPIOptions {
  provider?: 'parallel' | 'tavily' | 'serper' | 'brave' | 'custom';
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
}

async function executeSearch(
  query: string,
  options: SearchAPIOptions = {}
): Promise<SearchResult[]> {
  const { provider = 'parallel', maxResults = 5, searchDepth = 'basic' } = options;

  // ─────────────────────────────────────────────────────────────────────────
  // PARALLEL API (Via Supabase Edge Function for security)
  // ─────────────────────────────────────────────────────────────────────────
  if (provider === 'parallel') {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      'https://luohiaujigqcjpzicxiz.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1b2hpYXVqaWdxY2pwemljeGl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4MDA2MzEsImV4cCI6MjA2OTM3NjYzMX0.4pW5RXHUGaVe6acSxJbEN6Xd0qy7pxv-fua85GR4BbA'
    );

    const { data, error } = await supabase.functions.invoke('web-search', {
      body: { query, maxResults },
    });

    if (error) {
      throw new Error(`Search failed: ${error.message}`);
    }

    if (!data || !data.results) {
      throw new Error('No results returned from search');
    }

    return data.results;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TAVILY API (Recommended for AI applications)
  // ─────────────────────────────────────────────────────────────────────────
  if (provider === 'tavily') {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: import.meta.env.VITE_TAVILY_API_KEY,
        query,
        search_depth: searchDepth,
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed: ${response.status}`);
    }

    const data = await response.json();

    return data.results.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      source: new URL(r.url).hostname.replace('www.', ''),
      publishedAt: r.published_date,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SERPER API (Google results)
  // ─────────────────────────────────────────────────────────────────────────
  if (provider === 'serper') {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': import.meta.env.VITE_SERPER_API_KEY || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        num: maxResults,
      }),
    });

    if (!response.ok) {
      throw new Error(`Serper search failed: ${response.status}`);
    }

    const data = await response.json();

    return (data.organic || []).map((r: any) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
      source: new URL(r.link).hostname.replace('www.', ''),
      publishedAt: r.date,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BRAVE SEARCH API
  // ─────────────────────────────────────────────────────────────────────────
  if (provider === 'brave') {
    const params = new URLSearchParams({
      q: query,
      count: String(maxResults),
    });

    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        'X-Subscription-Token': import.meta.env.VITE_BRAVE_API_KEY || '',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Brave search failed: ${response.status}`);
    }

    const data = await response.json();

    return (data.web?.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      source: new URL(r.url).hostname.replace('www.', ''),
      publishedAt: r.age,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOM / SUPABASE EDGE FUNCTION
  // ─────────────────────────────────────────────────────────────────────────
  if (provider === 'custom') {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, maxResults }),
    });

    if (!response.ok) {
      throw new Error(`Custom search failed: ${response.status}`);
    }

    return response.json();
  }

  throw new Error(`Unknown search provider: ${provider}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULT FORMATTER (For AI Context)
// ─────────────────────────────────────────────────────────────────────────────

export function formatResultsForAI(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No search results found. Please answer based on your knowledge, but note that information may be outdated.';
  }

  const formatted = results
    .map(
      (r, i) =>
        `[Source ${i + 1}: ${r.source}]
Title: ${r.title}
${r.snippet}
${r.publishedAt ? `Published: ${r.publishedAt}` : ''}`
    )
    .join('\n\n');

  return `LIVE SEARCH RESULTS (Use these for current/accurate information):

${formatted}

INSTRUCTIONS:
- Prioritize information from these search results over your training data
- Cite sources when making factual claims (e.g., "According to ESPN...")
- If results conflict with your knowledge, trust the search results
- If results don't fully answer the question, supplement with your knowledge but note uncertainty`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HOOK
// ─────────────────────────────────────────────────────────────────────────────

interface UseWebSearchOptions {
  provider?: 'parallel' | 'tavily' | 'serper' | 'brave' | 'custom';
  maxResults?: number;
  enableCache?: boolean;
  autoDetect?: boolean;
}

export function useWebSearch(options: UseWebSearchOptions = {}) {
  const {
    provider = 'parallel',
    maxResults = 5,
    enableCache = true,
    autoDetect = true,
  } = options;

  const [state, setState] = useState<SearchState>({
    isSearching: false,
    results: [],
    citations: [],
    error: null,
    lastQuery: null,
  });

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  // ─────────────────────────────────────────────────────────────────────────
  // CACHE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  const getCached = useCallback((query: string): SearchResponse | null => {
    if (!enableCache) return null;

    const entry = cacheRef.current.get(query.toLowerCase());
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      cacheRef.current.delete(query.toLowerCase());
      return null;
    }

    return { ...entry.response, cached: true };
  }, [enableCache]);

  const setCache = useCallback((query: string, response: SearchResponse, category: SearchCategory) => {
    if (!enableCache) return;

    // Use shorter TTL for live data
    const ttl = category === 'status' || category === 'recent' 
      ? CACHE_TTL_SCORES_MS 
      : CACHE_TTL_MS;

    // Evict oldest if at capacity
    if (cacheRef.current.size >= MAX_CACHE_ENTRIES) {
      const oldest = Array.from(cacheRef.current.entries())
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
      if (oldest) cacheRef.current.delete(oldest[0]);
    }

    cacheRef.current.set(query.toLowerCase(), {
      response,
      expiresAt: Date.now() + ttl,
    });
  }, [enableCache]);

  // ─────────────────────────────────────────────────────────────────────────
  // SEARCH EXECUTION
  // ─────────────────────────────────────────────────────────────────────────

  const search = useCallback(async (userQuery: string): Promise<SearchResponse | null> => {
    // Detect if we should search
    const intent = autoDetect ? detectSearchIntent(userQuery) : { 
      shouldSearch: true, 
      category: 'none' as SearchCategory, 
      confidence: 1 
    };

    if (!intent.shouldSearch) {
      return null; // Let LLM handle with training data
    }

    // Build optimized search query
    const searchQuery = buildSearchQuery(userQuery, intent.category);

    // Check cache first
    const cached = getCached(searchQuery);
    if (cached) {
      setState((prev) => ({
        ...prev,
        results: cached.results,
        citations: cached.results.map((r, i) => ({
          index: i + 1,
          source: r.source,
          url: r.url,
          title: r.title,
        })),
        lastQuery: searchQuery,
      }));
      return cached;
    }

    // Execute search
    setState((prev) => ({ ...prev, isSearching: true, error: null }));

    try {
      const results = await executeSearch(searchQuery, { provider, maxResults });

      const response: SearchResponse = {
        query: searchQuery,
        results,
        timestamp: Date.now(),
        cached: false,
      };

      // Update cache
      setCache(searchQuery, response, intent.category);

      // Update state
      setState({
        isSearching: false,
        results,
        citations: results.map((r, i) => ({
          index: i + 1,
          source: r.source,
          url: r.url,
          title: r.title,
        })),
        error: null,
        lastQuery: searchQuery,
      });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Search failed';
      setState((prev) => ({
        ...prev,
        isSearching: false,
        error: errorMessage,
      }));
      return null;
    }
  }, [autoDetect, getCached, setCache, provider, maxResults]);

  // ─────────────────────────────────────────────────────────────────────────
  // CLEAR STATE
  // ─────────────────────────────────────────────────────────────────────────

  const clearResults = useCallback(() => {
    setState({
      isSearching: false,
      results: [],
      citations: [],
      error: null,
      lastQuery: null,
    });
  }, []);

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // MEMOIZED RETURN
  // ─────────────────────────────────────────────────────────────────────────

  return useMemo(
    () => ({
      ...state,
      search,
      clearResults,
      clearCache,
      formatForAI: () => formatResultsForAI(state.results),
      detectIntent: detectSearchIntent,
    }),
    [state, search, clearResults, clearCache]
  );
}

export default useWebSearch;

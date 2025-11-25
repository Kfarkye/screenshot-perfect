/**
 * SEARCH-ENABLED CHAT INTEGRATION GUIDE
 * =====================================
 * 
 * This package provides production-grade web search integration for your AI chat.
 * 
 * FILES CREATED:
 * 1. useWebSearch.tsx     - Core search hook with intent detection
 * 2. SearchAugmentedChat.ts - AI service with search injection
 * 3. SearchUI.tsx         - ESSENCE-compliant UI components
 * 4. SearchEnabledChat.tsx - Drop-in chat component
 */

// ─────────────────────────────────────────────────────────────────────────────
// QUICK START
// ─────────────────────────────────────────────────────────────────────────────

// 1. Add API keys to your .env:
// 
//    VITE_TAVILY_API_KEY=tvly-xxxxx       (recommended, $0.01/search)
//    VITE_SERPER_API_KEY=xxxxx            (alternative)
//    VITE_BRAVE_API_KEY=xxxxx             (alternative)
//    
//    VITE_ANTHROPIC_API_KEY=sk-ant-xxxxx  (for Claude)
//    VITE_OPENAI_API_KEY=sk-xxxxx         (for GPT)
//    VITE_GEMINI_API_KEY=xxxxx            (for Gemini)

// 2. Import and use the chat component:

import { SearchEnabledChat } from './SearchEnabledChat';

// Basic usage
export function AnalysisPage() {
  return (
    <div className="h-screen">
      <SearchEnabledChat
        model="claude"
        searchProvider="tavily"
        placeholder="Ask about a matchup, roster, or trend..."
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USAGE EXAMPLES
// ─────────────────────────────────────────────────────────────────────────────

// EXAMPLE 1: Replace your existing chat component
// ------------------------------------------------

/*
// Before:
<YourOldChat messages={messages} onSend={handleSend} />

// After:
<SearchEnabledChat
  initialMessages={existingMessages}
  onMessageSent={(msg) => saveToHistory(msg)}
  onMessageReceived={(msg) => saveToHistory(msg)}
/>
*/


// EXAMPLE 2: With game context injection
// --------------------------------------

import { SearchEnabledChat as Chat } from './SearchEnabledChat';

export function GameAnalysisChat({ game, odds }) {
  // Build context from your game data
  const gameContext = `
    CURRENT GAME: ${game.away_team} @ ${game.home_team}
    SPREAD: ${game.home_team} ${odds.spread}
    TOTAL: ${odds.total}
    MONEYLINE: ${game.away_team} ${odds.away_ml} / ${game.home_team} ${odds.home_ml}
  `;

  return (
    <Chat
      gameContext={gameContext}
      model="claude"
      placeholder={`Ask about ${game.away_team} vs ${game.home_team}...`}
    />
  );
}


// EXAMPLE 3: Using the hook directly (advanced)
// ---------------------------------------------

import { useWebSearch, detectSearchIntent, buildSearchQuery } from './useWebSearch';

export function CustomSearchImplementation() {
  const {
    isSearching,
    results,
    citations,
    error,
    search,
    formatForAI,
  } = useWebSearch({
    provider: 'tavily',
    maxResults: 5,
    enableCache: true,
  });

  const handleUserQuery = async (query: string) => {
    // Check if we should search
    const intent = detectSearchIntent(query);
    
    if (intent.shouldSearch) {
      // Execute search
      const response = await search(query);
      
      if (response) {
        // Get formatted context for AI
        const context = formatForAI();
        
        // Pass to your AI call
        await sendToAI(query, context);
      }
    } else {
      // Just use AI's training data
      await sendToAI(query);
    }
  };

  return (/* your UI */);
}


// EXAMPLE 4: Custom search trigger detection
// ------------------------------------------

import { detectSearchIntent } from './useWebSearch';

// The hook auto-detects when to search based on keywords:
//
// WILL SEARCH:
// - "Who is on the Lakers?" → roster query
// - "Is LeBron injured?" → status query
// - "Latest trade news" → recent events
// - "Warriors current roster" → current state
//
// WON'T SEARCH:
// - "What is a spread?" → static knowledge
// - "How does the over/under work?" → rules
// - "Explain moneyline betting" → concepts

const intent = detectSearchIntent("Who are the Lakers star players?");
// → { shouldSearch: true, category: 'roster', confidence: 0.95 }

const intent2 = detectSearchIntent("What is a point spread?");
// → { shouldSearch: false, category: 'none', confidence: 0.9 }


// ─────────────────────────────────────────────────────────────────────────────
// API PROVIDER OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

/*
TAVILY (Recommended for AI apps)
- Cost: ~$0.01/search
- Best for: AI-optimized results, clean snippets
- Sign up: https://tavily.com

SERPER (Google results)
- Cost: ~$0.001/search (cheapest)
- Best for: High volume, Google-quality results
- Sign up: https://serper.dev

BRAVE
- Cost: ~$0.005/search
- Best for: Privacy-focused, no tracking
- Sign up: https://brave.com/search/api
*/


// ─────────────────────────────────────────────────────────────────────────────
// SEARCH INTENT CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

/*
ROSTER QUERIES (always search):
- "who is on [team]"
- "who plays for [team]"
- "[team] roster"
- "starting lineup"
- "starting 5"

RECENT EVENTS (always search):
- "latest [topic]"
- "today's [topic]"
- "breaking news"
- "what happened"

STATUS QUERIES (always search):
- "is [player] injured"
- "injury report"
- "questionable"
- "playing tonight"

CURRENT STATE (always search):
- "current [stat/roster/standing]"
- "this season"
- "2025"
- "still on/with"

STATS (always search):
- "averaging"
- "ppg this season"
- "stats this year"

STATIC KNOWLEDGE (never search):
- "what is a [concept]"
- "how does [rule] work"
- "explain [strategy]"
- "history of"
*/


// ─────────────────────────────────────────────────────────────────────────────
// UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

import {
  SearchIndicator,    // Shows "Searching..." status
  SearchBadge,        // Compact badge for messages
  CitationPill,       // Inline [1] source link
  SourcesList,        // Expandable sources accordion
  SearchSkeleton,     // Loading skeleton
  SearchMessageWrapper, // Wraps message with search context
} from './SearchUI';

// Use individually in your own chat implementation:
/*
<SearchIndicator status="searching" query="Lakers roster 2025" />

<SearchBadge query="Who is on the Lakers" resultCount={5} />

<SourcesList results={searchResults} defaultExpanded={false} />

<CitationPill citation={{ index: 1, source: 'espn.com', url: '...', title: '...' }} />
*/


// ─────────────────────────────────────────────────────────────────────────────
// ARCHITECTURE
// ─────────────────────────────────────────────────────────────────────────────

/*
┌─────────────────────────────────────────────────────────────────┐
│                      User Query                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  detectSearchIntent()                            │
│  - Analyzes query for search triggers                           │
│  - Returns: { shouldSearch, category, confidence }              │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│   shouldSearch: NO  │         │  shouldSearch: YES  │
│                     │         │                     │
│  → Use LLM training │         │  → Execute search   │
│    data directly    │         │  → Format results   │
└─────────────────────┘         │  → Inject context   │
              │                 └─────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Send to AI Model                              │
│  - System prompt with search results (if any)                   │
│  - Conversation history                                          │
│  - User query                                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Stream Response + Citations                      │
└─────────────────────────────────────────────────────────────────┘
*/


// ─────────────────────────────────────────────────────────────────────────────
// TROUBLESHOOTING
// ─────────────────────────────────────────────────────────────────────────────

/*
SEARCH NOT TRIGGERING:
- Check that query matches trigger patterns in SEARCH_TRIGGERS
- detectSearchIntent() returns { shouldSearch: false } for static queries
- This is intentional to avoid unnecessary searches

SEARCH FAILING:
- Verify API key is set in .env
- Check console for specific error
- Try different provider (tavily → serper → brave)

WRONG INFORMATION STILL:
- Ensure search results are being injected into system prompt
- Check that AI model is prioritizing search results
- Increase maxResults for more context

STREAMING NOT WORKING:
- Verify your AI provider supports streaming
- Check that stream: true is passed to sendChatMessage
- Some providers require specific headers
*/

export default {};

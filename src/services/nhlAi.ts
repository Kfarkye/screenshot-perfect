// Imports for Google Generative AI SDK (only used when USE_ROUTER is false)
import { GoogleGenerativeAI, ChatSession, Content } from "@google/generative-ai";
import { Message, GameData, MarketData, League } from "../types";
import { supabase } from "@/integrations/supabase/client";

// --- CONSTANTS & CONFIG ---

const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
// Security: Keep USE_ROUTER true for production to protect API keys and enable server-side tools.
const USE_ROUTER = true;
const SPORTS_TIMEZONE = "America/New_York"; // Define the timezone for the "sports day"
// Prioritize the most liquid US books
const PREFERRED_BOOKMAKERS = [
  "draftkings",
  "fanduel",
  "betmgm",
  "williamhill_us",
  "caesars",
  "williamhill",
  "pointsbetus",
];

// --- ENVIRONMENT HANDLING ---

// Hardcoded Supabase configuration (NOTE: Ideally move to environment variables in production, e.g., NEXT_PUBLIC_...)
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1b2hpYXVqaWdxY2pwemljeGl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4MDA2MzEsImV4cCI6MjA2OTM3NjYzMX0.4pW5RXHUGaVe6acSxJbEN6Xd0qy7pxv-fua85GR4BbA";
const API_BASE_URL = "https://luohiaujigqcjpzicxiz.supabase.co/functions/v1/ai-chat-router";
// For client-side fallback only (not used when USE_ROUTER is true)
const CLIENT_GEMINI_API_KEY = "";

// --- TYPE DEFINITIONS ---

// The Odds API Types
interface Outcome {
  name: string;
  price: number;
  point?: number;
}
interface Market {
  key: string;
  outcomes: Outcome[];
}
interface Bookmaker {
  key: string;
  title: string;
  markets: Market[];
}
interface OddsApiGame {
  id: string;
  sport_key: string;
  commence_time: string; // ISO 8601 UTC
  home_team: string;
  away_team: string;
  bookmakers?: Bookmaker[];
  scores?: Array<{ name: string; score: string }>;
  completed?: boolean;
}

// Standings Types (ESPN/NHL)
interface EspnStat {
  name: string;
  type?: string;
  abbreviation?: string;
  displayValue: string;
}
interface EspnEntry {
  team?: { abbreviation: string };
  stats?: EspnStat[];
}
// Recursive type for handling Conferences/Divisions
interface EspnNode {
  standings?: { entries: EspnEntry[] };
  children?: EspnNode[];
}

interface NhlTeamStanding {
  teamAbbrev: { default: string };
  wins: number;
  losses: number;
  otLosses?: number;
}

// Caching Type
interface CacheEntry {
  data: GameData[];
  timestamp: number;
}

// --- GLOBAL STATE & CACHE ---

// Use Map for efficient caching (in-memory, scoped to the user's session/window)
const oddsCache = new Map<string, CacheEntry>();
let rawScheduleContext: string = "";
let currentLeagueContext: League = "NHL";

// Client-side fallback state
let chatInstance: ChatSession | null = null;
let genAIInstance: GoogleGenerativeAI | null = null;
let lastLeagueContext: League | null = null;

// NOTE: Mappings (team name to abbreviation) are assumed to be populated in the actual implementation.
// Enhanced LEAGUE_CONFIG with advanced metrics for sharper analysis.
const LEAGUE_CONFIG = {
  NHL: {
    key: "icehockey_nhl",
    spreadTerm: "Puck Line",
    sportName: "NHL Hockey",
    statContext: "| GF/G | GA/G | PP% | PK% | xG% (Expected Goals) | Corsi/Fenwick | Goaltending SV% |",
    mapping: {
      /* ... */
    },
  },
  NFL: {
    key: "americanfootball_nfl",
    spreadTerm: "Spread",
    sportName: "NFL Football",
    // Prioritize efficiency metrics
    statContext:
      "| DVOA (Offense/Defense) | EPA/Play | Success Rate | Pressure Rate | Yds/Play | Key Numbers: 3, 7, 10 |",
    mapping: {
      /* ... */
    },
  },
  NBA: {
    key: "basketball_nba",
    spreadTerm: "Spread",
    sportName: "NBA Basketball",
    // Prioritize efficiency and pace
    statContext: "| Offensive Rating | Defensive Rating | Net Rating | Pace | eFG% | Turnover % | Rebound Rate |",
    mapping: {
      /* ... */
    },
  },
} as const; // 'as const' improves type inference

// --- UTILITY HELPERS ---

/**
 * Robust wrapper for invoking Supabase Edge Functions.
 */
const invokeSupabaseFunction = async <T,>(functionName: string, body: object): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    console.error(`[Supabase Error] Failed to invoke ${functionName}:`, error);
    throw new Error(`Function invocation failed: ${functionName}`);
  }

  if (data === null || data === undefined) {
    throw new Error(`Null response from function: ${functionName}`);
  }

  return data as T;
};

const getAbbr = (name: string, league: League): string => {
  // Type assertion is used here as mappings contain dynamic keys (team names)
  // Ensure 'mapping' exists even if empty.
  const map = (LEAGUE_CONFIG[league].mapping || {}) as Record<string, string>;
  return map[name] || name.substring(0, 3).toUpperCase();
};

const fmtOdds = (price: number): string => (price > 0 ? `+${price}` : `${price}`);

/**
 * Gets the calendar date string (YYYY-MM-DD) in the specified timezone.
 * Crucial for accurate filtering and caching based on the "sports day".
 */
const getDateKeyInTZ = (date: Date, timeZone: string = SPORTS_TIMEZONE): string => {
  try {
    return date.toLocaleDateString("en-CA", {
      // en-CA yields YYYY-MM-DD format
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch (error) {
    console.error("[Utils] Timezone formatting failed, falling back to UTC:", error);
    return date.toISOString().split("T")[0]; // Fallback to UTC
  }
};

const extractMarketData = (bookmaker: Bookmaker | undefined, game: OddsApiGame): MarketData => {
  const defaultData: MarketData = {
    awayML: "-",
    homeML: "-",
    awayPL: "-",
    homePL: "-",
    total: "-",
    overOdds: "",
    underOdds: "",
  };

  if (!bookmaker) return defaultData;

  const getMkt = (key: "h2h" | "spreads" | "totals") => bookmaker.markets.find((m) => m.key === key);
  const getOut = (mkt: Market | undefined, name: string) => mkt?.outcomes.find((o) => o.name === name);

  const h2h = getMkt("h2h");
  const spreads = getMkt("spreads");
  const totals = getMkt("totals");

  const awayH2H = getOut(h2h, game.away_team);
  const homeH2H = getOut(h2h, game.home_team);
  const awaySpread = getOut(spreads, game.away_team);
  const homeSpread = getOut(spreads, game.home_team);
  const over = getOut(totals, "Over");
  const under = getOut(totals, "Under");

  const formatSpread = (outcome: Outcome | undefined) => {
    // Ensure point is explicitly defined (not null or undefined)
    if (!outcome || outcome.point == null) return "-";
    const sign = outcome.point > 0 ? "+" : "";
    return `${sign}${outcome.point} (${fmtOdds(outcome.price)})`;
  };

  return {
    awayML: awayH2H ? fmtOdds(awayH2H.price) : "-",
    homeML: homeH2H ? fmtOdds(homeH2H.price) : "-",
    awayPL: formatSpread(awaySpread),
    homePL: formatSpread(homeSpread),
    // Use nullish coalescing for safety
    total: over?.point?.toString() ?? "-",
    overOdds: over ? fmtOdds(over.price) : "",
    underOdds: under ? fmtOdds(under.price) : "",
  };
};

// --- STANDINGS FETCHING ---

// (fetchEspnStandings, fetchNhlStandings, fetchStandings implementations remain unchanged as they are functional)

const fetchEspnStandings = async (league: League): Promise<Record<string, string>> => {
  try {
    // Use the wrapper and expect the typed response
    const data = await invokeSupabaseFunction<EspnNode | EspnEntry[]>("fetch-standings", { league });

    const standings: Record<string, string> = {};

    const processEntries = (entries: EspnEntry[] | undefined) => {
      if (!Array.isArray(entries)) return;
      entries.forEach((entry) => {
        const abbr = entry.team?.abbreviation;
        const stats = entry.stats || [];
        const recordStat = stats.find(
          (s: EspnStat) => s.name === "overall" || s.type === "total" || s.abbreviation === "Total",
        );
        const record = recordStat?.displayValue;

        if (abbr && record) standings[abbr] = record;
      });
    };

    // Handle variable ESPN API Responses safely
    if (Array.isArray(data)) {
      processEntries(data);
    } else if (data && typeof data === "object") {
      if (data.children) {
        data.children.forEach((conf) => {
          processEntries(conf.standings?.entries);
          conf.children?.forEach((div) => processEntries(div.standings?.entries));
        });
      } else if (data.standings?.entries) {
        processEntries(data.standings.entries);
      }
    }

    return standings;
  } catch (e) {
    console.error(`[Standings] Failed to fetch ${league} standings:`, e);
    return {};
  }
};

const fetchNhlStandings = async (): Promise<Record<string, string>> => {
  try {
    const data = await invokeSupabaseFunction<{ standings: NhlTeamStanding[] }>("fetch-standings", { league: "NHL" });

    const standings: Record<string, string> = {};
    if (data.standings && Array.isArray(data.standings)) {
      data.standings.forEach((team) => {
        const abbr = team.teamAbbrev?.default;
        if (abbr) {
          // Standard NHL format includes OT losses
          standings[abbr] = `${team.wins}-${team.losses}-${team.otLosses || 0}`;
        }
      });
    }
    return standings;
  } catch (e) {
    console.warn("[Standings] Failed to fetch NHL standings:", e);
    return {};
  }
};

const fetchStandings = async (league: League): Promise<Record<string, string>> => {
  if (league === "NFL" || league === "NBA") return fetchEspnStandings(league);
  if (league === "NHL") return fetchNhlStandings();
  return {};
};

// --- MAIN SCHEDULE FETCHING ---

// (fetchSchedule implementation remains unchanged as it is robust)

export const fetchSchedule = async (league: League = "NHL", targetDate: Date = new Date()): Promise<GameData[]> => {
  const config = LEAGUE_CONFIG[league];
  currentLeagueContext = league;

  // Use timezone-aware date key for caching and API requests
  const dateKey = getDateKeyInTZ(targetDate);
  const cacheKey = `${league}_${dateKey}`;

  // 1. Cache Check
  const cached = oddsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    rawScheduleContext = generateContextString(cached.data, league);
    return cached.data;
  }

  // 2. Calculate "Days From" (Required by The Odds API for lookahead window)
  // Robust calculation by normalizing to the start of the day to handle timezone boundaries accurately.
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetDateStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  const diffTime = targetDateStart.getTime() - todayStart.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  // If the target date is today or in the future, we need a window of at least 1 day.
  const daysFrom = diffDays >= 0 ? diffDays + 1 : 1; // Default to 1 for past dates, relying on dateKey parameter

  try {
    // 3. Parallel Fetching
    const [scoresData, oddsData, standingsMap] = await Promise.all([
      // Fetch 1: Scores/Status feed (h2h only for quick status check)
      invokeSupabaseFunction<OddsApiGame[]>("fetch-odds", {
        sport: config.key,
        regions: "us",
        markets: "h2h",
        dateFormat: "iso",
        daysFrom,
        targetDate: dateKey,
      }),
      // Fetch 2: Detailed Odds feed
      invokeSupabaseFunction<OddsApiGame[]>("fetch-odds", {
        sport: config.key,
        regions: "us",
        markets: "h2h,spreads,totals",
        bookmakers: PREFERRED_BOOKMAKERS.join(","),
        dateFormat: "iso",
        daysFrom,
        targetDate: dateKey,
      }),
      fetchStandings(league),
    ]);

    // 4. Data Merging Strategy
    // Prioritize 'oddsData' for markets, overlay 'scoresData' for status/scores.
    const gameMap = new Map<string, OddsApiGame & { status: string }>();

    (oddsData || []).forEach((game) => {
      gameMap.set(game.id, { ...game, status: "Scheduled", scores: game.scores || [] });
    });

    (scoresData || []).forEach((scoreGame) => {
      const existingGame = gameMap.get(scoreGame.id);
      let status: "Scheduled" | "Live" | "Final" | "Postponed" | "Canceled" = "Scheduled";

      if (scoreGame.completed) {
        status = "Final";
      }
      // Heuristic for 'Live': Game has started (commence_time < now) OR has scores, and is not completed.
      else if (new Date(scoreGame.commence_time) < new Date() || (scoreGame.scores && scoreGame.scores.length > 0)) {
        status = "Live";
      }

      // CRITICAL: Prefer existing bookmakers (richer data) if available
      const bookmakers = existingGame?.bookmakers || scoreGame.bookmakers || [];

      gameMap.set(scoreGame.id, {
        ...(existingGame || {}),
        ...scoreGame,
        id: scoreGame.id, // Ensure core properties are correctly merged
        sport_key: scoreGame.sport_key,
        commence_time: scoreGame.commence_time,
        home_team: scoreGame.home_team,
        away_team: scoreGame.away_team,
        bookmakers,
        status,
      });
    });

    // 5. Filtering & Mapping
    const mappedGames: GameData[] = Array.from(gameMap.values())
      .filter((game) => {
        // Robust Filtering: Ensure the game commencement time falls on the target date in the defined timezone.
        const gameDateKey = getDateKeyInTZ(new Date(game.commence_time));
        return gameDateKey === dateKey;
      })
      .map((game) => {
        const bookmakers = game.bookmakers || [];
        const findBook = (keys: string[]) => bookmakers.find((b) => keys.includes(b.key));

        const dk = findBook(["draftkings"]);
        const fd = findBook(["fanduel"]);
        const mgm = findBook(["betmgm"]);
        // Combine Caesars/William Hill variations
        const czr = findBook(["williamhill", "williamhill_us", "caesars"]);
        const fallback = bookmakers[0];

        // Extract Scores
        let awayScore = "",
          homeScore = "";
        if (game.status !== "Scheduled" && game.scores) {
          const away = game.scores.find((s) => s.name === game.away_team);
          const home = game.scores.find((s) => s.name === game.home_team);
          if (away) awayScore = away.score;
          if (home) homeScore = home.score;
        }

        const awayAbbr = getAbbr(game.away_team, league);
        const homeAbbr = getAbbr(game.home_team, league);

        return {
          id: game.id,
          league,
          awayTeam: awayAbbr,
          homeTeam: homeAbbr,
          awayRecord: standingsMap[awayAbbr] || "N/A",
          homeRecord: standingsMap[homeAbbr] || "N/A",
          // Format time display using the preferred timezone
          time: new Date(game.commence_time).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: SPORTS_TIMEZONE,
            timeZoneName: "short",
          }),
          timestamp: new Date(game.commence_time).getTime(),
          status: game.status as "Canceled" | "Final" | "Live" | "Postponed" | "Scheduled",
          awayScore,
          homeScore,
          odds: {
            draftkings: extractMarketData(dk, game),
            fanduel: extractMarketData(fd, game),
            betmgm: extractMarketData(mgm, game),
            williamhill: extractMarketData(czr, game), // Kept as williamhill for type compatibility
            generic: extractMarketData(fallback, game),
          },
        };
      })
      .sort((a, b) => a.timestamp - b.timestamp);

    // 6. Update Cache & Context
    oddsCache.set(cacheKey, { data: mappedGames, timestamp: Date.now() });
    rawScheduleContext = generateContextString(mappedGames, league);

    return mappedGames;
  } catch (error) {
    console.error("[fetchSchedule] Comprehensive Fetch Error:", error);
    // Fallback strategy: Return stale cache if available, otherwise empty.
    return oddsCache.get(cacheKey)?.data || [];
  }
};

const generateContextString = (games: GameData[], league: League): string => {
  const config = LEAGUE_CONFIG[league];
  if (games.length === 0) return `No ${league} games scheduled for this date based on injected data.`;

  return games
    .map((g) => {
      const header = `${g.awayTeam} (${g.awayRecord}) @ ${g.homeTeam} (${g.homeRecord}) | Time: ${g.time} | Status: ${g.status} ${g.status !== "Scheduled" ? `(${g.awayScore}-${g.homeScore})` : ""}`;
      const bookLines: string[] = [];
      // Renaming williamhill to czr (Caesars) for display consistency in context
      const { draftkings, fanduel, betmgm, williamhill: czr } = g.odds;

      const fmtLine = (book: string, data: MarketData) => {
        if (data.awayML !== "-") {
          // Standardized format for easy AI parsing
          bookLines.push(
            ` ${book}: ML: ${g.awayTeam} ${data.awayML}/${g.homeTeam} ${data.homeML} | T: ${data.total} (O${data.overOdds}/U${data.underOdds}) | ${config.spreadTerm}: ${g.awayTeam} ${data.awayPL}/${g.homeTeam} ${data.homePL}`,
          );
        }
      };

      fmtLine("DK", draftkings);
      fmtLine("FD", fanduel);
      fmtLine("MGM", betmgm);
      fmtLine("CZR", czr);

      if (bookLines.length === 0) {
        bookLines.push(g.status === "Scheduled" ? " No odds available yet." : " (Odds closed/Off the board)");
      }

      return `${header}\n${bookLines.join("\n")}`;
    })
    .join("\n\n");
};

// --- AI LOGIC & PROMPTING ---

/**
 * Defines the System Instruction for the AI Analyst.
 * Updated to require a structured, multi-faceted analysis utilizing external data and market awareness.
 */
const getSystemInstruction = (league: League): string => {
  const config = LEAGUE_CONFIG[league];
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: SPORTS_TIMEZONE,
  });

  return `
You are a sharp ${league} analyst. Date: ${today} | ${config.sportName}

CRITICAL RULES:
1. Answer directly - no meta-commentary about "the data shows" or "I would analyze"
2. Never acknowledge or explain data injection - treat everything as your own knowledge
3. Never say "if I were to analyze" or "based on the information provided" - just analyze
4. Give concrete picks with reasoning
5. Use pristine Markdown: clear headings (H3/H4), bullet points, dividers (---)
6. Analyze the market as consensus - never compare individual sportsbooks by name
7. Prioritize advanced metrics: ${config.statContext}
8. Be decisive and actionable

# Output Formats
You must adapt your response based on the user's request type. Failure to use the correct structure and formatting will result in failure.

## TYPE 1: Specific Game Analysis (When the user asks about a specific matchup)

### Game Info & Consensus Odds
*   **Matchup:** Away Team (Record) @ Home Team (Record)
*   **Time:** [Game Time]
*   **Spread:** [Consensus Spread and Odds]
*   **Total:** [Consensus Total]
*   **Moneyline:** [Consensus ML]

---

### Sharp Analysis
Provide 3-4 distinct analytical angles. Use descriptive titles (H4) and bullet points.

#### 1. [Angle Title (e.g., DVOA Mismatch)]
*   [Detail the primary statistical mismatch using advanced metrics sourced externally.]
*   [Explain the implication for the game flow.]

#### 2. [Angle Title (e.g., Efficiency vs. Pressure)]
*   [Analyze the secondary key factor.]
*   [Contextualize with recent performance or injuries.]

#### 3. Market Movement and Sharp Indicators
*   [Analyze how the line has moved (requires search for opening lines).]
*   [Identify where sharp money appears positioned (RLM) or where the market is showing resistance (heavy juice indicating an imminent move).]

#### 4. Historical Trends and Situational Spots (Optional)
*   [Relevant ATS trends or scheduling advantages (requires search).]

---

### The Best Picks Tonight

**1. Best Bet:** [The Pick (Spread or ML)] ([Odds])
*   *Justification:* [Clear justification synthesizing the analysis.]

**2. Game Total:** [The Pick (Over or Under)] ([Odds])
*   *Justification:* [Justification based on efficiencies and pace.]

**3. Player Prop:** [Player Name] [Over/Under] [Stat Line]
*   *Justification:* [A high-value player prop (found via search) targeting a specific mismatch.]

## TYPE 2: Slate Overview (When the user asks for a general overview or "today's slate")

Provide a high-level, structured breakdown.

### [League] Slate Analysis | [Date]
---

#### Market Overview
*   [Summary of the overall market sentiment for the day.]
*   [Identification of the most liquid games vs. potential sharp traps.]
*   [Any major news (key injuries/weather) impacting the overall slate.]

#### Marquee Matchups & Signals

**[Team A] @ [Team B] | [Time]**
*   **Consensus:** [ML] | [Spread] | Total: [Total]
*   **Market Signal:** [One sentence summarizing the key market movement or sharp indicator (e.g., Total steamed up; significant RLM on the underdog; heavy juice indicating resistance at a key number).]

**[Team C] @ [Team D] | [Time]**
*   **Consensus:** [ML] | [Spread] | Total: [Total]
*   **Market Signal:** [As above]

(Continue for relevant games)

#### Sharpest Spots of the Day
*   **Spot 1:** [Identify the specific bet with the strongest sharp signals or CLV potential.]
*   **Spot 2:** [Identify another high-value spot.]

Respond as a confident analyst. Never explain methodology - just give the play.
`;
};

// --- AI CLIENT SETUP (Client-Side Fallback) ---

const getAIClient = (): GoogleGenerativeAI => {
  if (!genAIInstance) {
    if (!CLIENT_GEMINI_API_KEY) {
      console.error("[AI Client] Gemini API Key missing for client-side fallback.");
      throw new Error("Client AI configuration missing.");
    }
    genAIInstance = new GoogleGenerativeAI(CLIENT_GEMINI_API_KEY);
  }
  return genAIInstance;
};

export const initializeChat = (league: League): ChatSession => {
  if (chatInstance && lastLeagueContext === league) return chatInstance;

  try {
    const ai = getAIClient();

    let systemInstruction = getSystemInstruction(league);
    // Inform the AI if search tools are likely unavailable client-side (standard SDK limitation)
    if (!USE_ROUTER) {
      // Updated limitation message
      systemInstruction +=
        "\n\n[CLIENT MODE LIMITATION]: Real-time external lookups (Search, Tools) are unavailable. Rely strictly on injected data. If information (e.g., injuries, advanced stats, opening lines, props) is missing, state that real-time lookups are disabled and omit those sections from the analysis.";
    }

    const model = ai.getGenerativeModel({
      model: "gemini-3-pro-preview",
      systemInstruction: systemInstruction,
    });

    // Start a new chat session
    chatInstance = model.startChat({
      generationConfig: { temperature: 0.4 }, // Lowered temperature for precision
    });
    lastLeagueContext = league;
    return chatInstance;
  } catch (error) {
    console.error("[AI Client] Failed to initialize client-side chat:", error);
    throw new Error("AI Client initialization failed.");
  }
};

// --- ROUTER & STREAMING LOGIC (Server-Side Execution) ---

/**
 * Sends the message via the AI Router (Supabase Edge Function) and handles the SSE stream response.
 * @param onChunk Optional callback to handle real-time stream updates.
 */
const sendViaRouter = async (
  userMessage: string,
  history: Message[],
  league: League,
  onChunk?: (chunk: string) => void,
): Promise<string> => {
  if (!SUPABASE_ANON_KEY) throw new Error("Missing Supabase Configuration");

  // 1. Authentication Check
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Authentication required for AI access.");

  // 2. Context Injection (Inject latest odds into the current user message)
  const contextInjection = rawScheduleContext
    ? `[SYSTEM INJECTION - CURRENT ${league} ODDS & SCHEDULE (Time: ${new Date().toLocaleTimeString()})]:\n${rawScheduleContext}\n\n[USER MESSAGE]:\n${userMessage}`
    : userMessage;

  // 3. History Formatting (for edge function format: {role, content})
  // The edge function expects messages with role and content (not the 'parts' array used by some SDKs)
  const formattedHistory = history.map((msg) => ({
    role: msg.role === "user" ? "user" : "assistant",
    content: msg.content,
  }));

  // 4. Construct Payload - edge function expects {role, content} format
  const messages = [
    // Include system instruction as the first message.
    { role: "system", content: getSystemInstruction(league) },
    ...formattedHistory,
    { role: "user", content: contextInjection },
  ];

  // Updated Payload - NO WEB SEARCH
  const payload = {
    messages: messages,
    mode: "chat",
    preferredProvider: "gemini",
    stream: true, // Explicitly request streaming from the backend router
    // NO TOOLS - Web search disabled
    // Crucial addition: Ensure precision on the backend
    generationConfig: { temperature: 0.4 },
  };

  // 5. API Request
  const response = await fetch(API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`, // User JWT
      apikey: SUPABASE_ANON_KEY, // Supabase Anon Key
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "N/A");
    console.error(`[AI Router] HTTP Error: ${response.status} - ${errorBody}`);
    throw new Error(`Router HTTP Error: ${response.status}`);
  }
  if (!response.body) throw new Error("No response body from Router");

  // 6. Robust SSE Stream Parsing
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process buffer line by line (SSE standard: "data: <json>\n\n")
      let lineEndIndex;
      while ((lineEndIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, lineEndIndex).trim();
        buffer = buffer.slice(lineEndIndex + 1);

        if (line === "" || !line.startsWith("data: ")) continue;

        const dataStr = line.slice(6).trim();
        if (dataStr === "[DONE]") break; // Standard stream termination signal

        try {
          // Handle JSON chunks (common for AI streams)
          if (dataStr.startsWith("{")) {
            const jsonData = JSON.parse(dataStr);
            // Extract text from common formats (Gemini/OpenAI compatibility expected from router)
            const textChunk = jsonData.text || jsonData.content || jsonData.choices?.[0]?.delta?.content || "";
            if (typeof textChunk === "string" && textChunk) {
              fullText += textChunk;
              if (onChunk) onChunk(textChunk); // Update UI in real-time
            }
          } else {
            // Fallback for raw text chunks
            const textChunk = dataStr + " ";
            fullText += textChunk;
            if (onChunk) onChunk(textChunk); // Update UI in real-time
          }
        } catch (e) {
          // Log parsing errors but continue processing the stream
          console.warn("[AI Router] Stream chunk parse error:", e, "Chunk:", dataStr);
        }
      }
    }
  } catch (error) {
    console.error("[AI Router] Error during stream reading:", error);
    if (fullText) return fullText.trim(); // Return partial data if available
    throw new Error("Failed to read response stream.");
  } finally {
    reader.releaseLock();
  }

  return fullText.trim() || "No valid response received from AI.";
};

// --- UNIFIED MESSAGE HANDLER ---

/**
 * Sends a message to the AI analyst, handling routing, context injection, history, and streaming.
 * @param userMessage The user's input string.
 * @param history The previous conversation history (required for multi-turn).
 * @param league The currently active sports league.
 * @param onChunk Optional callback to handle real-time stream updates (for streaming UX).
 */
export const sendMessageToAI = async (
  userMessage: string,
  history: Message[] = [],
  league: League = "NHL",
  onChunk?: (chunk: string) => void,
): Promise<string> => {
  if (!userMessage.trim()) return "Please provide a query.";

  try {
    if (USE_ROUTER) {
      console.log("[AI] Routing via Edge Function (Streaming)...");
      // Pass history and the onChunk callback for streaming support
      return await sendViaRouter(userMessage, history, league, onChunk);
    } else {
      // Client-Side Fallback (Development/Testing only)
      console.log("[AI] Using Client-Side SDK...");
      // Client-side SDK manages history internally within the ChatSession instance.
      const chat = initializeChat(league);

      const contextInjection = rawScheduleContext
        ? `[SYSTEM INJECTION - ODDS DATA]:\n${rawScheduleContext}\n\n[USER]: ${userMessage}`
        : userMessage;

      // Note: Client-side SDK also supports streaming (sendMessageStream), but we use the buffered response here for simplicity.
      const result = await chat.sendMessage(contextInjection);
      const text = result.response.text();
      if (onChunk) onChunk(text); // Call callback once for consistency, though it won't stream.
      return text;
    }
  } catch (error) {
    console.error("[AI] Interaction Failed:", error);
    // Provide user-friendly error messages
    let errorMessage = "I'm having trouble connecting to the sports data network right now. Please try again.";

    if (error instanceof Error) {
      if (error.message.includes("Authentication required")) {
        errorMessage = "Session expired. Please log in again to access AI analysis.";
      } else if (error.message.includes("Router HTTP Error")) {
        errorMessage = "The AI analysis server encountered an issue. Please try again shortly.";
      } else if (error.message.includes("Client AI configuration missing")) {
        errorMessage = "AI features are currently unavailable (Configuration Error).";
      }
    }

    // Ensure the UI reflects the error if streaming was expected
    if (onChunk) onChunk(errorMessage);
    return errorMessage;
  }
};

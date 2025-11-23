import { GoogleGenAI, Chat } from "@google/genai";
import { Message, GameData, MarketData, League } from '../types';

const ODDS_API_KEY = '0e8fada7d6991609b61646b39e36c699';
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
const API_BASE = 'https://api.the-odds-api.com/v4/sports';

// Cache structure
const oddsCache: Record<string, { data: GameData[], timestamp: number }> = {};
let rawScheduleContext: string = "";
let currentLeagueContext: League = 'NHL';

// --- CONFIGURATION & MAPPINGS ---

const LEAGUE_CONFIG = {
  NHL: {
    key: 'icehockey_nhl',
    spreadTerm: 'Puck Line',
    sportName: 'NHL',
    statContext: "| GF/G | GA/G | PP% | PK% |",
    standingsUrl: 'https://api-web.nhle.com/v1/standings/now',
    mapping: {
      "Anaheim Ducks": "ANA", "Boston Bruins": "BOS", "Buffalo Sabres": "BUF",
      "Calgary Flames": "CGY", "Carolina Hurricanes": "CAR", "Chicago Blackhawks": "CHI",
      "Colorado Avalanche": "COL", "Columbus Blue Jackets": "CBJ", "Dallas Stars": "DAL",
      "Detroit Red Wings": "DET", "Edmonton Oilers": "EDM", "Florida Panthers": "FLA",
      "Los Angeles Kings": "LAK", "Minnesota Wild": "MIN", "Montreal Canadiens": "MTL",
      "Nashville Predators": "NSH", "New Jersey Devils": "NJD", "New York Islanders": "NYI",
      "New York Rangers": "NYR", "Ottawa Senators": "OTT", "Philadelphia Flyers": "PHI",
      "Pittsburgh Penguins": "PIT", "San Jose Sharks": "SJS", "Seattle Kraken": "SEA",
      "St. Louis Blues": "STL", "Tampa Bay Lightning": "TBL", "Toronto Maple Leafs": "TOR",
      "Utah Hockey Club": "UTA", "Vancouver Canucks": "VAN", "Vegas Golden Knights": "VGK",
      "Washington Capitals": "WSH", "Winnipeg Jets": "WPG"
    }
  },
  NFL: {
    key: 'americanfootball_nfl',
    spreadTerm: 'Spread',
    sportName: 'NFL',
    statContext: "| PTS/G | YDS/G | Pass Yds | Rush Yds |",
    standingsUrl: 'https://site.api.espn.com/apis/v2/sports/football/nfl/standings',
    mapping: {
      "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
      "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
      "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
      "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
      "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
      "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
      "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
      "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
      "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
      "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
      "Tennessee Titans": "TEN", "Washington Commanders": "WSH"
    }
  },
  NBA: {
    key: 'basketball_nba',
    spreadTerm: 'Spread',
    sportName: 'NBA',
    statContext: "| PTS/G | PA/G | FG% | 3P% |",
    standingsUrl: 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings',
    mapping: {
      "Atlanta Hawks": "ATL", "Boston Celtics": "BOS", "Brooklyn Nets": "BKN",
      "Charlotte Hornets": "CHA", "Chicago Bulls": "CHI", "Cleveland Cavaliers": "CLE",
      "Dallas Mavericks": "DAL", "Denver Nuggets": "DEN", "Detroit Pistons": "DET",
      "Golden State Warriors": "GSW", "Houston Rockets": "HOU", "Indiana Pacers": "IND",
      "Los Angeles Clippers": "LAC", "Los Angeles Lakers": "LAL", "Memphis Grizzlies": "MEM",
      "Miami Heat": "MIA", "Milwaukee Bucks": "MIL", "Minnesota Timberwolves": "MIN",
      "New Orleans Pelicans": "NOP", "New York Knicks": "NYK", "Oklahoma City Thunder": "OKC",
      "Orlando Magic": "ORL", "Philadelphia 76ers": "PHI", "Phoenix Suns": "PHX",
      "Portland Trail Blazers": "POR", "Sacramento Kings": "SAC", "San Antonio Spurs": "SAS",
      "Toronto Raptors": "TOR", "Utah Jazz": "UTA", "Washington Wizards": "WAS"
    }
  }
};

const getAbbr = (name: string, league: League) => {
  const map = LEAGUE_CONFIG[league].mapping as Record<string, string>;
  return map[name] || name.substring(0, 3).toUpperCase();
};

const fmtOdds = (price: number) => price > 0 ? `+${price}` : `${price}`;

// Helper to extract market data
const extractMarketData = (bookmaker: any, game: any): MarketData => {
  if (!bookmaker) {
    return { awayML: '-', homeML: '-', awayPL: '-', homePL: '-', total: '-', overOdds: '', underOdds: '' };
  }

  const h2h = bookmaker.markets.find((m: any) => m.key === 'h2h');
  const spreads = bookmaker.markets.find((m: any) => m.key === 'spreads');
  const totals = bookmaker.markets.find((m: any) => m.key === 'totals');

  const awayH2H = h2h?.outcomes.find((o: any) => o.name === game.away_team);
  const homeH2H = h2h?.outcomes.find((o: any) => o.name === game.home_team);
  const awaySpread = spreads?.outcomes.find((o: any) => o.name === game.away_team);
  const homeSpread = spreads?.outcomes.find((o: any) => o.name === game.home_team);
  const over = totals?.outcomes.find((o: any) => o.name === 'Over');
  const under = totals?.outcomes.find((o: any) => o.name === 'Under');

  return {
    awayML: awayH2H ? fmtOdds(awayH2H.price) : '-',
    homeML: homeH2H ? fmtOdds(homeH2H.price) : '-',
    awayPL: awaySpread ? `${awaySpread.point > 0 ? '+' : ''}${awaySpread.point} (${fmtOdds(awaySpread.price)})` : '-',
    homePL: homeSpread ? `${homeSpread.point > 0 ? '+' : ''}${homeSpread.point} (${fmtOdds(homeSpread.price)})` : '-',
    total: over ? `${over.point}` : '-',
    overOdds: over ? fmtOdds(over.price) : '',
    underOdds: under ? fmtOdds(under.price) : ''
  };
};

// --- STANDINGS FETCHING ---

// Generic ESPN Parser (Works for NFL and NBA)
const fetchEspnStandings = async (url: string): Promise<Record<string, string>> => {
  try {
    const res = await fetch(url);
    const data = await res.json();
    const standings: Record<string, string> = {};

    const processEntries = (entries: any[]) => {
      entries.forEach((entry: any) => {
        const abbr = entry.team.abbreviation;
        const record = entry.stats.find((s: any) => s.name === 'overall')?.displayValue;
        if (abbr && record) standings[abbr] = record;
      });
    };

    data.children?.forEach((conf: any) => {
      conf.children?.forEach((div: any) => {
        if (div.standings?.entries) processEntries(div.standings.entries);
      });
    });
    return standings;
  } catch (e) {
    console.warn("Failed to fetch ESPN standings:", e);
    return {};
  }
};

const fetchStandings = async (league: League): Promise<Record<string, string>> => {
  if (league === 'NFL' || league === 'NBA') {
    return fetchEspnStandings(LEAGUE_CONFIG[league].standingsUrl);
  }

  try {
    // NHL Specific Logic
    const res = await fetch(LEAGUE_CONFIG.NHL.standingsUrl);
    if (!res.ok) return {};
    const data = await res.json();
    const standings: Record<string, string> = {};
    if (data.standings) {
      data.standings.forEach((team: any) => {
        const abbr = team.teamAbbrev.default;
        const record = `${team.wins}-${team.losses}-${team.otLosses}`;
        standings[abbr] = record;
      });
    }
    return standings;
  } catch (e) {
    console.warn("Failed to fetch NHL standings:", e);
    return {};
  }
};

// --- MAIN API FETCHING ---

export const fetchSchedule = async (league: League = 'NHL', targetDate: Date = new Date()): Promise<GameData[]> => {
  const config = LEAGUE_CONFIG[league];
  currentLeagueContext = league;

  const dateKey = targetDate.toISOString().split('T')[0];
  const cacheKey = `${league}_${dateKey}`;

  // 1. Cache Check
  const cached = oddsCache[cacheKey];
  if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    rawScheduleContext = generateContextString(cached.data, league, targetDate);
    return cached.data;
  }

  // 2. Calculate Days From
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(targetDate); target.setHours(0,0,0,0);
  const diffTime = Math.abs(target.getTime() - today.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const daysFrom = target.getTime() < today.getTime() ? diffDays + 1 : 1;

  try {
    const [scoresResponse, oddsResponse, standingsMap] = await Promise.all([
      fetch(`${API_BASE}/${config.key}/scores/?daysFrom=${daysFrom}&apiKey=${ODDS_API_KEY}`),
      fetch(`${API_BASE}/${config.key}/odds/?regions=us&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${ODDS_API_KEY}&bookmakers=draftkings,fanduel,betmgm,williamhill,williamhill_us,caesars`),
      fetchStandings(league)
    ]);

    const scoresData = scoresResponse.ok ? await scoresResponse.json() : [];
    const oddsData = oddsResponse.ok ? await oddsResponse.json() : [];

    // 3. Merge Data
    const gameMap = new Map<string, any>();

    if (Array.isArray(oddsData)) {
      oddsData.forEach((game: any) => {
        gameMap.set(game.id, { ...game, status: 'Scheduled', scores: [] });
      });
    }

    if (Array.isArray(scoresData)) {
      scoresData.forEach((game: any) => {
        const existing = gameMap.get(game.id) || {};
        let status = 'Scheduled';
        if (game.completed) status = 'Final';
        else if (game.scores && game.scores.length > 0) status = 'Live';
        
        gameMap.set(game.id, { ...existing, ...game, status });
      });
    }

    // 4. Filter & Map
    const combinedGames = Array.from(gameMap.values()).filter((game: any) => {
      const gameDate = new Date(game.commence_time);
      return gameDate.getDate() === target.getDate() &&
             gameDate.getMonth() === target.getMonth() &&
             gameDate.getFullYear() === target.getFullYear();
    });

    const mappedGames: GameData[] = combinedGames.map((game: any) => {
      const bookmakers = game.bookmakers || [];
      
      // Helper to find specific books
      const findBook = (keys: string[]) => bookmakers.find((b: any) => keys.includes(b.key));
      
      const dk = findBook(['draftkings']);
      const fd = findBook(['fanduel']);
      const mgm = findBook(['betmgm']);
      const wh = findBook(['williamhill', 'williamhill_us', 'caesars']);
      const fallback = bookmakers[0];

      let awayScore = '', homeScore = '';
      if (game.scores) {
        const away = game.scores.find((s: any) => s.name === game.away_team);
        const home = game.scores.find((s: any) => s.name === game.home_team);
        if (away) awayScore = away.score;
        if (home) homeScore = home.score;
        if (game.status === 'Live') {
           if (!awayScore) awayScore = '0';
           if (!homeScore) homeScore = '0';
        }
      }

      const awayAbbr = getAbbr(game.away_team, league);
      const homeAbbr = getAbbr(game.home_team, league);

      return {
        id: game.id,
        league: league,
        awayTeam: awayAbbr,
        homeTeam: homeAbbr,
        awayRecord: standingsMap[awayAbbr] || '',
        homeRecord: standingsMap[homeAbbr] || '',
        time: new Date(game.commence_time).toLocaleTimeString('en-US', { hour: 'numeric', minute:'2-digit', timeZoneName: 'short' }),
        timestamp: new Date(game.commence_time).getTime(),
        status: game.status,
        awayScore,
        homeScore,
        odds: {
          draftkings: extractMarketData(dk, game),
          fanduel: extractMarketData(fd, game),
          betmgm: extractMarketData(mgm, game),
          williamhill: extractMarketData(wh, game),
          generic: extractMarketData(fallback, game)
        }
      };
    });

    mappedGames.sort((a, b) => a.timestamp - b.timestamp);
    
    oddsCache[cacheKey] = { data: mappedGames, timestamp: Date.now() };
    rawScheduleContext = generateContextString(mappedGames, league, targetDate);
    
    return mappedGames;

  } catch (error) {
    console.error("Fetch Error:", error);
    return [];
  }
};

const generateContextString = (games: GameData[], league: League, date?: Date): string => {
  const config = LEAGUE_CONFIG[league];
  return games.map(g => {
    const header = `${g.awayTeam} ${g.awayRecord} @ ${g.homeTeam} ${g.homeRecord} | Time: ${g.time} | Status: ${g.status} ${g.status !== 'Scheduled' ? `(${g.awayScore}-${g.homeScore})` : ''}`;
    const bookLines = [];
    const { draftkings, fanduel, betmgm, williamhill } = g.odds;

    const fmtLine = (book: string, data: MarketData) => {
       if (data.awayML !== '-') {
         bookLines.push(` ${book}: ${g.awayTeam} ${data.awayML}/${g.homeTeam} ${data.homeML} | T: ${data.total} | ${config.spreadTerm}: ${g.awayTeam} ${data.awayPL}/${g.homeTeam} ${data.homePL}`);
       }
    };

    fmtLine('DK', draftkings);
    fmtLine('FD', fanduel);
    fmtLine('MGM', betmgm);
    fmtLine('CZR', williamhill);

    if (bookLines.length === 0) bookLines.push(g.status === 'Scheduled' ? ' No odds available.' : ' (Odds closed)');
    
    return `${header}\n${bookLines.join('\n')}`;
  }).join('\n\n');
};

// --- AI LOGIC ---

const getSystemInstruction = (league: League): string => {
  const config = LEAGUE_CONFIG[league];
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return `
You are "SharpEdge," an elite institutional-grade ${config.sportName} betting analyst.
CURRENT DATE: ${today}
LEAGUE: ${league}

**MANDATE:** Provide decisive, data-backed intelligence in clipped, desk-note style. 
NO TOUT LANGUAGE (lock, guaranteed). Use "edge", "high-conviction", "mispriced".

**CORE CAPABILITY: RICH DATA TABLES**
You MUST use Markdown tables for all comparisons.

**RESPONSE PROTOCOLS**

1. **LINE SHOPPING**: Compare books. Mark best price with ✅.
   | Book | Odds | Edge |
   |---|---|---|
   | DK | -110 | |
   | FD | +100 | ✅ |

2. **MATCHUP ANALYSIS**:
   - **Snapshot**: 1-2 sentences.
   - **Tale of the Tape**:
     | Stat | Away | Home |
     |---|---|---|
     | Record | ... | ... |
     ${config.statContext}
   - **The Read**: 3-5 tight sentences on market/matchup.
   - **Sharp Angle**: "Team/Total @ Price". 1 line rationale.

3. **SLATE OVERVIEW**:
   - **Snapshot**: Macro angles.
   - **Board Signals**:
     | Matchup | Time | Open | Signal |
     |---|---|---|---|
     | A @ B | 7PM | -110 | SHARP ON FAV |
   - **Top 3 Edges**: Table of best bets.
   - **Feature Matchup**: Deep dive on best game.

**DATA HANDLING**:
- Use injected Odds API context for prices.
- Use googleSearch for injuries/trends.
- NO HALLUCINATIONS.
`;
};

let chatInstance: Chat | null = null;
let genAIInstance: GoogleGenAI | null = null;
let lastLeagueContext: League | null = null;

const getAIClient = (): GoogleGenAI => {
  if (!genAIInstance) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) throw new Error("API_KEY missing.");
    genAIInstance = new GoogleGenAI({ apiKey });
  }
  return genAIInstance;
};

export const initializeChat = (league: League): Chat => {
  if (chatInstance && lastLeagueContext === league) return chatInstance;
  const ai = getAIClient();
  chatInstance = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: { systemInstruction: getSystemInstruction(league), tools: [{ googleSearch: {} }] },
  });
  lastLeagueContext = league;
  return chatInstance;
};

// Edge function router integration (optional - can be toggled)
const USE_ROUTER = true; // Set to true to use the edge function router

const sendViaRouter = async (userMessage: string, league: League): Promise<string> => {
  console.log('[Router] Initializing Supabase client...');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    'https://luohiaujigqcjpzicxiz.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1b2hpYXVqaWdxY2pwemljeGl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4MDA2MzEsImV4cCI6MjA2OTM3NjYzMX0.4pW5RXHUGaVe6acSxJbEN6Xd0qy7pxv-fua85GR4BbA'
  );

  const contextInjection = rawScheduleContext 
    ? `Context: Current ${league} odds and games:\n${rawScheduleContext}\n\nQuestion: ${userMessage}`
    : userMessage;

  console.log('[Router] Calling ai-chat-router function...');
  const { data, error } = await supabase.functions.invoke('ai-chat-router', {
    body: {
      messages: [
        { role: 'system', content: getSystemInstruction(league) },
        { role: 'user', content: contextInjection }
      ],
      preferredProvider: 'gemini'
    }
  });

  if (error) {
    console.error('[Router] Supabase function error:', error);
    throw new Error(`Edge function error: ${error.message || JSON.stringify(error)}`);
  }

  console.log('[Router] Function response:', data);

  if (!data) {
    throw new Error('No data returned from edge function');
  }

  if (typeof data === 'object' && 'error' in data) {
    throw new Error(`Edge function returned error: ${data.error}`);
  }

  if (typeof data === 'object' && 'response' in data) {
    return data.response as string;
  }

  throw new Error(`Invalid response format: ${JSON.stringify(data)}`);
};

export const sendMessageToAI = async (userMessage: string, league: League = 'NHL'): Promise<string> => {
  if (!USE_ROUTER) {
    throw new Error('Direct API access is not configured. Please use the edge function router.');
  }

  try {
    console.log('[AI] Sending message via router...');
    const result = await sendViaRouter(userMessage, league);
    console.log('[AI] Router response received');
    return result;
  } catch (routerError) {
    console.error('[AI] Router error details:', routerError);
    throw new Error(`Failed to communicate with AI service: ${routerError instanceof Error ? routerError.message : 'Unknown error'}`);
  }
};
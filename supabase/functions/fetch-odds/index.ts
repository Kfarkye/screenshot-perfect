// Note: Supabase imports and related functions (getDbGames) from the original code are removed 
// as the strategy now relies on OddsAPI + ESPN aggregation.

// --- Types & Interfaces ---
interface Game {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: any[];
  scores?: { name: string, score: string }[];
  completed?: boolean;
  status?: string; // Added for ESPN enrichment (e.g., STATUS_IN_PROGRESS)
  [key: string]: any;
}

interface OddsApiParams {
  sport: string;
  regions?: string;
  markets?: string;
  dateFormat?: string;
  daysFrom?: number;
  bookmakers?: string;
}

// --- Configuration & Constants ---
const CONFIG = {
  TIMEOUT_MS: 5000, // Timeout for external API requests
  CACHE_TTL: 60,    // Edge cache (1 min for live data)
  SWR_TTL: 300,     // Stale-while-revalidate window (5 mins)
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Mapping OddsAPI sport keys to ESPN API identifiers (for scoreboard endpoint)
const SPORT_MAPPING: Record<string, { espn_sport: string; espn_league: string }> = {
    'americanfootball_nfl': { espn_sport: 'football', espn_league: 'nfl' },
    'basketball_nba': { espn_sport: 'basketball', espn_league: 'nba' },
    'icehockey_nhl': { espn_sport: 'hockey', espn_league: 'nhl' },
    'baseball_mlb': { espn_sport: 'baseball', espn_league: 'mlb' },
    'americanfootball_ncaaf': { espn_sport: 'football', espn_league: 'college-football' },
    'tennis_atp': { espn_sport: 'tennis', espn_league: 'atp' },
    'tennis_wta': { espn_sport: 'tennis', espn_league: 'wta' },
    // Add other mappings as needed
};

// --- Utility Functions ---

// 1. Resilient Fetcher
async function fetchWithTimeout(url: string, options: RequestInit = {}, retries = 1) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
  
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    
    // Retry on 5xx server errors
    if (res.status >= 500 && retries > 0) {
      console.warn(`[Fetch Retry] ${res.status} for ${url}`);
      return fetchWithTimeout(url, options, retries - 1);
    }
    return res;
  } catch (error) {
    clearTimeout(id);
    // Retry on AbortError (timeout) or TypeError (often network issues in Edge environments)
    if (retries > 0 && ((error as Error).name === 'AbortError' || (error as Error).name === 'TypeError')) {
        console.warn(`[Fetch Retry] Error ${(error as Error).name} for ${url}`);
        return fetchWithTimeout(url, options, retries - 1);
    }
    throw error;
  }
}

// 2. Team Name Normalization (Crucial for matching across different APIs)
function normalizeTeamName(name: string): string {
    if (!name) return '';
    // Lowercase, remove punctuation/special characters, and trim whitespace.
    return name.toLowerCase()
               .replace(/[^a-z0-9\s]/g, '')
               .replace(/\s+/g, ' ')
               .trim();
}

// 3. Game Key Generation (For merging OddsAPI and ESPN)
function generateGameKey(game: Partial<Game>): string {
    if (!game.commence_time || !game.home_team || !game.away_team) return '';
    
    // Key based on the date (YYYY-MM-DD) and normalized team names.
    // We ignore exact time as it often differs between APIs.
    const datePart = game.commence_time.substring(0, 10);
    const home = normalizeTeamName(game.home_team);
    const away = normalizeTeamName(game.away_team);

    // Ensure consistent ordering (alphabetical) to handle potential home/away swaps between APIs
    const teams = [home, away].sort();

    return `${datePart}_${teams[0]}_vs_${teams[1]}`;
}


// --- Service Layer: OddsAPI ---

// 1. Generalized OddsAPI Fetcher
async function fetchOddsApi(apiKey: string, params: Record<string, any>, endpoint: 'odds' | 'scores') {
    const query = new URLSearchParams({ apiKey, dateFormat: 'iso' });
  
    if (params.daysFrom !== undefined) query.append('daysFrom', params.daysFrom.toString());
  
    // Endpoint-specific parameters
    if (endpoint === 'odds') {
      query.append('regions', params.regions || 'us');
      query.append('markets', params.markets || 'h2h,spreads,totals');
      query.append('oddsFormat', 'american');
      if (params.bookmakers) query.append('bookmakers', params.bookmakers);
    }
  
    const url = `https://api.the-odds-api.com/v4/sports/${params.sport}/${endpoint}?${query}`;
    console.log(`[OddsAPI ${endpoint}] Fetching: ${url.replace(apiKey, 'KEY_HIDDEN')}`);
  
    try {
      const res = await fetchWithTimeout(url);
  
      if (res.status === 422) {
          console.warn(`[OddsAPI ${endpoint}] Validation error (422). Likely date/market unavailable.`);
          return [];
      }
      if (!res.ok) {
        const usage = `Remaining: ${res.headers.get('x-requests-remaining')}`;
        console.error(`[OddsAPI ${endpoint}] Error ${res.status} (${usage})`);
        throw new Error(`API Error ${res.status} for ${endpoint}`);
      }
  
      const data = await res.json();
      console.log(`[OddsAPI ${endpoint}] Returned ${Array.isArray(data) ? data.length : 0} games`);
      return data;
    } catch (e) {
      console.error(`[OddsAPI ${endpoint}] Fetch failed:`, (e as Error).message);
      return null;
    }
  }

// 2. Aggregated OddsAPI Service (Scores + Odds)
async function getAggregatedOddsApiData(apiKey: string, params: OddsApiParams): Promise<Game[]> {
    console.log(`[Aggregation] Fetching for markets: ${params.markets || 'h2h,spreads,totals'}`);
    
    // Fetch both odds and scores in parallel
    const [oddsResult, scoresResult] = await Promise.all([
        fetchOddsApi(apiKey, params, 'odds'),
        fetchOddsApi(apiKey, params, 'scores')
    ]);

    const odds = Array.isArray(oddsResult) ? oddsResult : [];
    const scores = Array.isArray(scoresResult) ? scoresResult : [];

    console.log(`[Aggregation] Odds: ${odds.length} games, Scores: ${scores.length} games`);

    // Merge the data based on Game ID (which is consistent within OddsAPI)
    const dataMap = new Map<string, Game>();

    // 1. Start with odds data as it contains bookmakers
    odds.forEach((game: any) => {
        const bookmakerCount = game.bookmakers?.length || 0;
        const marketTypes = game.bookmakers?.[0]?.markets?.map((m: any) => m.key).join(',') || 'none';
        console.log(`[Aggregation] Game ${game.id}: ${bookmakerCount} bookmakers, markets: ${marketTypes}`);
        dataMap.set(game.id, game);
    });

    // 2. Merge scores into the map
    scores.forEach((game: any) => {
        if (dataMap.has(game.id)) {
            const existing = dataMap.get(game.id)!;
            existing.scores = game.scores;
            existing.completed = game.completed;
        } else {
            // Game only found in scores (e.g., odds expired but game occurred)
            console.log(`[Aggregation] Game ${game.id} only in scores, no odds data`);
            dataMap.set(game.id, game);
        }
    });

    return Array.from(dataMap.values());
}

// --- Service Layer: ESPN Fallback/Enrichment ---

// 3. ESPN Schedule Service
async function getEspnSchedule(sportKey: string, targetDate: string) {
    const mapping = SPORT_MAPPING[sportKey];
    if (!mapping) {
      // Should be checked before calling, but provides a safe fallback
      return null;
    }
  
    // ESPN API expects date format YYYYMMDD
    const dateParam = targetDate.replace(/-/g, '');
    const url = `https://site.api.espn.com/apis/site/v2/sports/${mapping.espn_sport}/${mapping.espn_league}/scoreboard?dates=${dateParam}&limit=300`;
  
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`ESPN API Error ${res.status}`);
      
      const data = await res.json();
      return data.events || [];
    } catch (e) {
      console.error('[ESPN API] Fetch failed:', (e as Error).message);
      return null;
    }
}

// 4. ESPN Normalization
function normalizeEspnEvents(events: any[], sportKey: string): Game[] {
    const games: Game[] = [];
  
    for (const event of events) {
      const competition = event.competitions?.[0];
      if (!competition) continue;
  
      const homeCompetitor = competition.competitors.find((c:any) => c.homeAway === 'home');
      const awayCompetitor = competition.competitors.find((c:any) => c.homeAway === 'away');
  
      if (!homeCompetitor || !awayCompetitor) continue;

      const homeTeamName = homeCompetitor.team.displayName;
      const awayTeamName = awayCompetitor.team.displayName;
  
      // Normalize status and scores
      const status = competition.status.type.name;
      const completed = competition.status.type.completed;

      // Extract scores only if the game has started or finished (ESPN status logic)
      const scores = (status !== 'STATUS_SCHEDULED') ? [
        { name: homeTeamName, score: homeCompetitor.score || '0' },
        { name: awayTeamName, score: awayCompetitor.score || '0' }
      ] : undefined;
  
      games.push({
        id: `espn-${event.id}`, // Prefix ID to distinguish source
        sport_key: sportKey,
        commence_time: competition.date, // ISO 8601 format
        home_team: homeTeamName,
        away_team: awayTeamName,
        bookmakers: [], // ESPN doesn't provide detailed odds here
        scores: scores,
        status: status,
        completed: completed,
        source: 'espn',
      });
    }
    return games;
}


// --- Main Handler ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    // 1. Setup and Validation
    const env = Deno.env.toObject();
    // Supabase keys are no longer strictly required, but ODDS_API_KEY is essential.
    if (!env.ODDS_API_KEY) {
      throw new Error('Missing ODDS_API_KEY configuration');
    }

    const body = await req.json();
    const { sport, targetDate, daysFrom } = body;

    if (!sport) {
        return new Response(JSON.stringify({ error: "Missing 'sport' parameter" }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
    }

    // 2. Determine Interaction Mode and Parameters
    
    // Mode: Specific Date (user provided targetDate) vs Range (user provided daysFrom or nothing)
    const isSpecificDateRequest = !!targetDate;
    
    // The primary date for ESPN calls and filtering. Defaults to today if no targetDate.
    const queryDate = targetDate || new Date().toISOString().split('T')[0];

    // Prepare OddsAPI Params
    let oddsApiDaysFrom = daysFrom ? parseInt(daysFrom) : undefined;

    // Strategy: If requesting a specific date, it's safer to NOT provide daysFrom to OddsAPI.
    // We let OddsAPI return its default window and filter client-side.
    // This avoids potential 422 errors if the targetDate is far away.
    if (isSpecificDateRequest) {
        oddsApiDaysFrom = undefined; 
    } else if (!oddsApiDaysFrom) {
        // If no timeframe specified (default behavior), request a small window (e.g., 1 day).
        oddsApiDaysFrom = 1;
    }

    const oddsApiParams: OddsApiParams = {
        sport: sport,
        regions: body.regions,
        markets: body.markets,
        bookmakers: body.bookmakers,
        daysFrom: oddsApiDaysFrom,
    };

    console.log(`[Request] Sport: ${sport}, Mode: ${isSpecificDateRequest ? 'Specific Date ('+queryDate+')' : 'Range (daysFrom='+oddsApiDaysFrom+')'}`);

    // Determine if ESPN should be called. We only call ESPN for the primary queryDate if the sport is mapped.
    const shouldCallEspn = !!SPORT_MAPPING[sport];

    // 3. Parallel Execution Pattern
    // Fetch from OddsAPI (aggregated) and ESPN (if applicable) concurrently.
    const [oddsResult, espnResult] = await Promise.allSettled([
      getAggregatedOddsApiData(env.ODDS_API_KEY, oddsApiParams),
      // For range requests, we only enrich/fallback the primary date (today) with ESPN.
      // For specific date requests, we use that date for ESPN.
      shouldCallEspn ? getEspnSchedule(sport, queryDate) : Promise.resolve(null)
    ]);

    // 4. Process and Normalize Results
    let oddsGames: Game[] = [];
    if (oddsResult.status === 'fulfilled' && Array.isArray(oddsResult.value)) {
        oddsGames = oddsResult.value;
        
        // Client-side filter: ONLY if it was a specific date request.
        if (isSpecificDateRequest) {
            const initialCount = oddsGames.length;
            
            // Create date boundaries to account for late-night games (e.g., Monday Night Football)
            // Include games that start from 6 AM on target day through 5:59 AM next day
            const targetStart = new Date(queryDate + 'T06:00:00Z');
            const targetEnd = new Date(queryDate + 'T06:00:00Z');
            targetEnd.setDate(targetEnd.getDate() + 1);
            
            oddsGames = oddsGames.filter(game => {
                const gameTime = new Date(game.commence_time);
                return gameTime >= targetStart && gameTime < targetEnd;
            });
            
            console.log(`[OddsAPI Filtering] Filtered from ${initialCount} to ${oddsGames.length} games for ${queryDate} (${targetStart.toISOString()} to ${targetEnd.toISOString()}).`);
        }
    } else if (oddsResult.status === 'rejected') {
        console.error("[OddsAPI] Promise rejected:", oddsResult.reason);
    }

    let espnGames: Game[] = [];
    if (shouldCallEspn && espnResult.status === 'fulfilled' && Array.isArray(espnResult.value)) {
        // ESPN results are already filtered by date via the API call
        espnGames = normalizeEspnEvents(espnResult.value, sport);
    } else if (shouldCallEspn && espnResult.status === 'rejected') {
        console.error("[ESPN API] Promise rejected:", espnResult.reason);
    }

    // 5. Merging Strategy
    // Goal: Prioritize OddsAPI data. Enrich with ESPN (scores/status). Append ESPN-only games (fallback).
    
    // Start with OddsAPI games as the base.
    let responseData: Game[] = [...oddsGames];

    if (espnGames.length > 0) {
        if (responseData.length > 0) {
            // Both returned data. Merge them.
            
            // Create a map for ESPN data using the robust key generator.
            const espnMap = new Map<string, Game>();
            espnGames.forEach(g => {
                const key = generateGameKey(g);
                if (key) espnMap.set(key, g);
            });

            // Enrich OddsAPI data and track matched ESPN games
            responseData.forEach(game => {
                const key = generateGameKey(game);
                const espnMatch = espnMap.get(key);

                if (espnMatch) {
                    // Enrich with reliable status and scores from ESPN.
                    // We prioritize ESPN for live status/scores as it's often faster/more reliable than OddsAPI scores endpoint.
                    game.status = espnMatch.status;
                    game.completed = espnMatch.completed;
                    if (espnMatch.scores) {
                        game.scores = espnMatch.scores;
                    }
                    game.espn_id = espnMatch.id;

                    // Remove from the map so we know which ones are remaining (ESPN-only).
                    espnMap.delete(key);
                }
            });

            // Append remaining games from ESPN map (those not found in OddsAPI, e.g., too far in future)
            if (espnMap.size > 0) {
                console.log(`[Fallback] Appending ${espnMap.size} games from ESPN schedule (not found in OddsAPI).`);
                espnMap.forEach(game => {
                    responseData.push(game);
                });
            }
        } else {
            // OddsAPI is empty, use ESPN as the sole source
            console.log('[Fallback] Using ESPN schedule as primary source (OddsAPI empty).');
            responseData = espnGames;
        }
    }

    // 6. Final Sorting
    // Ensure the final list is sorted by commence time
    responseData.sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());

    // 7. Response with Edge Caching
    return new Response(JSON.stringify(responseData), {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        // Critical for Speed: Cache in CDN, serve stale while updating
        'Cache-Control': `public, s-maxage=${CONFIG.CACHE_TTL}, stale-while-revalidate=${CONFIG.SWR_TTL}`,
      },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Fatal] ${msg}`, (error as Error).stack);
    
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

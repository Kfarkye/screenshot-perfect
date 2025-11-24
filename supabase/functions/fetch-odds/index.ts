import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// --- Types & Interfaces ---
interface Game {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: any[];
  [key: string]: any;
}

interface OddsApiParams {
  sport: string;
  regions: string;
  markets: string;
  dateFormat: string;
  daysFrom?: number;
  bookmakers?: string;
}

// --- Configuration & Constants ---
const CONFIG = {
  TIMEOUT_MS: 4000, // Fail fast explicitly
  CACHE_TTL: 60,    // Browser cache
  SWR_TTL: 300,     // Stale-while-revalidate window
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// --- Utility: Resilient Fetcher ---
async function fetchWithTimeout(url: string, options: RequestInit = {}, retries = 1) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);
  
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    
    // Retry on 5xx server errors only
    if (res.status >= 500 && retries > 0) {
      console.warn(`[Fetch Retry] ${res.status} for ${url}`);
      return fetchWithTimeout(url, options, retries - 1);
    }
    return res;
  } catch (error) {
    clearTimeout(id);
    if (retries > 0) return fetchWithTimeout(url, options, retries - 1);
    throw error;
  }
}

// --- Service Layer ---

// 1. Database Service
async function getDbGames(
  supabase: SupabaseClient, 
  sport: string, 
  targetDate: string
) {
  const tableMap: Record<string, string> = {
    'americanfootball_nfl': 'nfl_games',
    'basketball_nba': 'nba_games',
    'icehockey_nhl': 'nhl_games'
  };

  const tableName = tableMap[sport];
  if (!tableName) return null;

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('game_date', targetDate)
    .order('start_time', { ascending: true });

  if (error) throw new Error(`DB Error: ${error.message}`);
  return data || [];
}

// 2. External API Service
async function getExternalOdds(apiKey: string, params: OddsApiParams) {
  const query = new URLSearchParams({
    apiKey,
    regions: params.regions || 'us',
    markets: params.markets || 'h2h,spreads,totals',
    oddsFormat: 'american',
    dateFormat: params.dateFormat || 'iso',
  });

  if (params.bookmakers) query.append('bookmakers', params.bookmakers);
  if (params.daysFrom) query.append('daysFrom', params.daysFrom.toString());

  const endpoint = (params.markets === 'h2h' && params.daysFrom) ? 'scores' : 'odds';
  const url = `https://api.the-odds-api.com/v4/sports/${params.sport}/${endpoint}?${query}`;

  try {
    const res = await fetchWithTimeout(url);
    
    if (res.status === 422) {
        console.warn('[Odds API] Market/Date unavailable (422)');
        return []; 
    }
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    
    return await res.json();
  } catch (e) {
    console.error('[Odds API] Fetch failed:', e);
    return null; // Return null to signal fallback/failure without crashing
  }
}

// --- Main Handler ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    // 1. Setup
    const env = Deno.env.toObject();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.ODDS_API_KEY) {
      throw new Error('Missing configuration');
    }

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { sport, targetDate } = body;
    const queryDate = targetDate || new Date().toISOString().split('T')[0];

    console.log(`[Request] Sport: ${sport}, Date: ${queryDate}`);

    // 2. Parallel Execution Pattern
    // We fire the DB request. If we intend to enrich, we COULD fire the API request 
    // simultaneously to save time, rather than waiting for DB to finish.
    // Here we check if the sport supports DB storage to decide strategy.
    const supportsDb = ['americanfootball_nfl', 'basketball_nba'].includes(sport);
    
    let responseData: Game[] = [];

    if (supportsDb) {
      // Strategy: Fetch DB. If successful, fetch API to enrich (lazy load).
      // To optimize speed, we assume we usually want live odds and fetch in parallel.
      const [dbResult, apiResult] = await Promise.allSettled([
        getDbGames(supabase, sport, queryDate),
        getExternalOdds(env.ODDS_API_KEY, body)
      ]);

      const dbGames = dbResult.status === 'fulfilled' ? dbResult.value : null;
      const liveOdds = apiResult.status === 'fulfilled' ? apiResult.value : null;

      if (dbGames && dbGames.length > 0) {
        // Transform DB Games
        responseData = dbGames.map((g: any) => ({
          id: g.game_id,
          sport_key: sport,
          sport_title: sport === 'americanfootball_nfl' ? 'NFL' : 'NBA',
          commence_time: g.start_time,
          home_team: g.home_team,
          away_team: g.away_team,
          bookmakers: [],
          ...(g.game_data || {})
        }));

        // Enrich with Live Odds (O(1) lookup)
        if (liveOdds && Array.isArray(liveOdds)) {
          const oddsMap = new Map(liveOdds.map((g: any) => [g.id, g])); // Ensure external ID matches DB ID
          responseData.forEach(game => {
            // Note: This assumes DB 'game_id' matches Odds API 'id'. 
            // If not, you need a fuzzy matcher here based on team names.
            const live = oddsMap.get(game.id); 
            if (live?.bookmakers) game.bookmakers = live.bookmakers;
          });
        }
      } else {
        // Fallback: DB empty/failed, use API result directly
        console.log('[Fallback] Using raw API response');
        responseData = Array.isArray(liveOdds) ? liveOdds : [];
      }
    } else {
      // Direct API Strategy (NHL, etc)
      const data = await getExternalOdds(env.ODDS_API_KEY, body);
      responseData = Array.isArray(data) ? data : [];
    }

    // 3. Response with Edge Caching
    return new Response(JSON.stringify(responseData), {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        // Critical for Speed: Cache in CDN for 60s, serve stale for up to 5 mins while updating
        'Cache-Control': `public, s-maxage=${CONFIG.CACHE_TTL}, stale-while-revalidate=${CONFIG.SWR_TTL}`,
      },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Fatal] ${msg}`);
    
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

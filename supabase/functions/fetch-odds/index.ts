import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sport, regions, markets, dateFormat, daysFrom, bookmakers, targetDate } = await req.json();
    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Calculate target date for query
    const queryDate = targetDate || new Date().toISOString().split('T')[0];
    
    // Map sport key to table name
    const tableMap: Record<string, string> = {
      'americanfootball_nfl': 'nfl_games',
      'basketball_nba': 'nba_games',
      'icehockey_nhl': 'nhl_games'
    };
    
    const tableName = tableMap[sport];
    
    // Try to fetch from database first (for NFL and NBA where we have seeded data)
    if (tableName && (sport === 'americanfootball_nfl' || sport === 'basketball_nba')) {
      console.log(`[Fetch Odds] Querying ${tableName} for date: ${queryDate}`);
      
      const { data: dbGames, error: dbError } = await supabase
        .from(tableName)
        .select('*')
        .eq('game_date', queryDate)
        .order('start_time', { ascending: true });
      
      if (dbError) {
        console.error('[Fetch Odds] Database error:', dbError);
      } else if (dbGames && dbGames.length > 0) {
        console.log(`[Fetch Odds] Found ${dbGames.length} games in database`);
        
        // Transform database games to Odds API format
        const transformedGames = dbGames.map((game: any) => ({
          id: game.game_id,
          sport_key: sport,
          sport_title: sport === 'americanfootball_nfl' ? 'NFL' : 'NBA',
          commence_time: game.start_time,
          home_team: game.home_team,
          away_team: game.away_team,
          bookmakers: [], // Will be enriched with live odds below if available
          ...(game.game_data || {})
        }));
        
        // Try to enrich with live odds from Odds API if API key available
        if (ODDS_API_KEY) {
          try {
            const params = new URLSearchParams({
              apiKey: ODDS_API_KEY,
              regions: regions || 'us',
              markets: markets || 'h2h,spreads,totals',
              oddsFormat: 'american',
              dateFormat: dateFormat || 'iso'
            });
            
            if (bookmakers) params.append('bookmakers', bookmakers);
            
            const endpoint = 'odds';
            const url = `https://api.the-odds-api.com/v4/sports/${sport}/${endpoint}?${params}`;
            
            console.log('[Odds API] Enriching with live odds...');
            const response = await fetch(url);
            
            if (response.ok) {
              const liveOdds = await response.json();
              
              // Merge live odds with database games
              const oddsMap = new Map(liveOdds.map((g: any) => [g.id, g]));
              
              transformedGames.forEach((game: any) => {
                const liveGame: any = oddsMap.get(game.id);
                if (liveGame?.bookmakers) {
                  game.bookmakers = liveGame.bookmakers;
                }
              });
              
              console.log('[Odds API] Successfully enriched with live odds');
            } else if (response.status === 422) {
              console.log('[Odds API] Odds not available for this date range (422), returning database games only');
            } else {
              console.warn(`[Odds API] Unexpected response ${response.status}, using database only`);
            }
          } catch (err) {
            console.warn('[Odds API] Could not fetch live odds, using database only:', err);
          }
        }
        
        return new Response(JSON.stringify(transformedGames), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        console.log(`[Fetch Odds] No games found in database for ${queryDate}, falling back to Odds API`);
      }
    }

    // Fallback to Odds API (for NHL or if database query failed/empty)
    if (!ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY not configured and no database fallback available');
    }

    const params = new URLSearchParams({
      apiKey: ODDS_API_KEY,
      regions: regions || 'us',
      markets: markets || 'h2h,spreads,totals',
      oddsFormat: 'american',
      dateFormat: dateFormat || 'iso'
    });

    if (daysFrom) params.append('daysFrom', daysFrom.toString());
    if (bookmakers) params.append('bookmakers', bookmakers);

    const endpoint = markets === 'h2h' && daysFrom ? 'scores' : 'odds';
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/${endpoint}?${params}`;
    
    console.log('[Odds API] Fetching:', url.replace(ODDS_API_KEY, 'REDACTED'));

    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 422) {
        console.log('[Odds API] No odds available for this date range (422), returning empty array');
        return new Response(JSON.stringify([]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('[Odds API] Error:', response.status, errorText);
      throw new Error(`Odds API error: ${response.status}`);
    }

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Odds API] Function error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

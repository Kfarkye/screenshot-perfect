import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OddsGame {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('[Seed NFL] Starting NFL schedule seed...');

    // Fetch NFL schedule from Odds API
    const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=american&dateFormat=iso`;
    
    console.log('[Seed NFL] Fetching from Odds API...');
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Seed NFL] API Error:', response.status, errorText);
      throw new Error(`Odds API error: ${response.status}`);
    }

    const games: OddsGame[] = await response.json();
    console.log(`[Seed NFL] Fetched ${games.length} games from API`);

    // Determine current season (year) and week
    const now = new Date();
    const season = now.getFullYear().toString();

    // Transform games for database
    const gamesToInsert = games.map((game, index) => {
      const commenceTime = new Date(game.commence_time);
      
      // Simple week calculation (this is approximate - can be refined)
      const seasonStart = new Date(season + '-09-01'); // NFL typically starts early September
      const weeksSinceStart = Math.floor((commenceTime.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const week = Math.max(1, Math.min(18, weeksSinceStart + 1)); // NFL regular season is 18 weeks

      return {
        game_id: game.id,
        away_team: game.away_team,
        home_team: game.home_team,
        game_date: commenceTime.toISOString().split('T')[0],
        start_time: commenceTime.toISOString(),
        season,
        week,
        status: commenceTime > now ? 'scheduled' : 'in_progress',
        game_data: {
          sport_key: game.sport_key,
          raw_data: game
        }
      };
    });

    console.log('[Seed NFL] Inserting games into database...');

    // Upsert games (insert or update if game_id already exists)
    const { data, error } = await supabase
      .from('nfl_games')
      .upsert(gamesToInsert, {
        onConflict: 'game_id',
        ignoreDuplicates: false
      })
      .select();

    if (error) {
      console.error('[Seed NFL] Database error:', error);
      throw error;
    }

    console.log(`[Seed NFL] Successfully seeded ${data?.length || 0} games`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Seeded ${data?.length || 0} NFL games`,
        season,
        games_seeded: data?.length || 0
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[Seed NFL] Function error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

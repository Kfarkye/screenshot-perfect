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

interface ESPNGame {
  id: string;
  date: string;
  name: string;
  shortName: string;
  season: { year: number };
  week: { number: number };
  competitions: Array<{
    id: string;
    date: string;
    competitors: Array<{
      homeAway: string;
      team: { displayName: string };
    }>;
    venue?: { fullName: string };
  }>;
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
    const now = new Date();
    const season = now.getFullYear().toString();

    // Step 1: Fetch from Odds API (games with active betting lines, 1-2 weeks out)
    console.log('[Seed NFL] Fetching from Odds API...');
    const oddsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=american&dateFormat=iso`;
    
    const oddsResponse = await fetch(oddsUrl);
    const oddsGames: OddsGame[] = oddsResponse.ok ? await oddsResponse.json() : [];
    console.log(`[Seed NFL] Fetched ${oddsGames.length} games from Odds API`);

    // Step 2: Fetch from ESPN API (full season schedule - fetch all weeks)
    console.log('[Seed NFL] Fetching full season from ESPN API...');
    const currentYear = now.getFullYear();
    const allESPNGames: ESPNGame[] = [];
    
    // NFL has 18 regular season weeks (seasontype=2 for regular season)
    for (let week = 1; week <= 18; week++) {
      try {
        // Remove dates parameter - let ESPN return all games for that week
        const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&limit=100`;
        console.log(`[Seed NFL] Fetching week ${week}...`);
        const espnResponse = await fetch(espnUrl);
        
        if (espnResponse.ok) {
          const espnData = await espnResponse.json();
          const weekGames: ESPNGame[] = espnData.events || [];
          allESPNGames.push(...weekGames);
          console.log(`[Seed NFL] Week ${week}: Fetched ${weekGames.length} games (Total so far: ${allESPNGames.length})`);
        } else {
          console.error(`[Seed NFL] Week ${week} failed: ${espnResponse.status} ${espnResponse.statusText}`);
        }
      } catch (err) {
        console.error(`[Seed NFL] Error fetching week ${week}:`, err);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`[Seed NFL] Fetched ${allESPNGames.length} total games from ESPN API`);

    // Step 3: Create a map for Odds API games by team matchup
    const oddsGameMap = new Map<string, OddsGame>();
    oddsGames.forEach(game => {
      // Create a key from sorted team names for matching
      const key = [game.away_team, game.home_team].sort().join('|');
      oddsGameMap.set(key, game);
    });

    // Step 4: Transform ESPN games and merge with Odds API data
    const gamesToInsert = allESPNGames.map((espnGame) => {
      const competition = espnGame.competitions[0];
      const homeCompetitor = competition.competitors.find((c: any) => c.homeAway === 'home');
      const awayCompetitor = competition.competitors.find((c: any) => c.homeAway === 'away');
      
      if (!homeCompetitor || !awayCompetitor) {
        return null;
      }

      const homeTeam = homeCompetitor.team.displayName;
      const awayTeam = awayCompetitor.team.displayName;
      const commenceTime = new Date(competition.date);
      
      // Try to find matching Odds API game
      const matchKey = [awayTeam, homeTeam].sort().join('|');
      const oddsGame = oddsGameMap.get(matchKey);

      // Use Odds API game_id if available, otherwise generate from ESPN
      const gameId = oddsGame?.id || competition.id;

      return {
        game_id: gameId,
        away_team: awayTeam,
        home_team: homeTeam,
        game_date: commenceTime.toISOString().split('T')[0],
        start_time: commenceTime.toISOString(),
        season: espnGame.season.year.toString(),
        week: espnGame.week.number,
        status: commenceTime > now ? 'scheduled' : 'in_progress',
        venue: competition.venue?.fullName || null,
        game_data: {
          sport_key: 'americanfootball_nfl',
          espn_id: espnGame.id,
          odds_id: oddsGame?.id || null,
          has_betting_lines: !!oddsGame
        }
      };
    }).filter((game: any) => game !== null);

    // Step 5: Deduplicate games by game_id (in case ESPN has duplicates)
    const gameMap = new Map();
    gamesToInsert.forEach((game: any) => {
      if (!gameMap.has(game.game_id)) {
        gameMap.set(game.game_id, game);
      }
    });
    const uniqueGames = Array.from(gameMap.values());
    
    console.log(`[Seed NFL] Inserting ${uniqueGames.length} unique games into database...`);

    // Upsert games (insert or update if game_id already exists)
    const { data, error } = await supabase
      .from('nfl_games')
      .upsert(uniqueGames, {
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
        games_seeded: data?.length || 0,
        odds_api_games: oddsGames.length,
        espn_games: allESPNGames.length
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

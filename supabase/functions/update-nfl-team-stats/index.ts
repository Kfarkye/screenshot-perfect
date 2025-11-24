import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

// =============================================================================
// Configuration
// =============================================================================

const ESPN_TEAM_STATS_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";
const FETCH_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// Types
// =============================================================================

interface TeamStats {
  team_abbreviation: string;
  season_year: number;
  season_type: string;
  week: number;
  points_per_game: number | null;
  points_allowed_per_game: number | null;
  total_yards_per_game: number | null;
  total_yards_allowed_per_game: number | null;
  passing_yards_per_game: number | null;
  passing_yards_allowed_per_game: number | null;
  rushing_yards_per_game: number | null;
  rushing_yards_allowed_per_game: number | null;
  third_down_pct: number | null;
  red_zone_pct: number | null;
  sacks_per_game: number | null;
  turnovers_per_game: number | null;
  takeaways_per_game: number | null;
}

// =============================================================================
// Utilities
// =============================================================================

const log = (level: string, message: string, context: Record<string, unknown> = {}) => {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...context }));
};

async function fetchWithRetry(url: string, retries: number): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok && response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`API_CLIENT_ERROR: ${response.status}`);
      }
      if (!response.ok) {
        throw new Error(`API_ERROR: ${response.status}`);
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, (2 ** i) * 100));
    }
  }
  throw new Error("Unreachable");
}

function extractStats(team: any): Partial<TeamStats> {
  const stats: Partial<TeamStats> = {};
  
  // Extract stats from the team statistics array
  const teamStats = team.record?.items?.[0]?.stats || [];
  
  for (const stat of teamStats) {
    const name = stat.name?.toLowerCase();
    const value = parseFloat(stat.value);
    
    if (isNaN(value)) continue;
    
    if (name?.includes('pointspergame')) stats.points_per_game = value;
    else if (name?.includes('pointsallowed')) stats.points_allowed_per_game = value;
    else if (name?.includes('totalyards') && !name.includes('allowed')) stats.total_yards_per_game = value;
    else if (name?.includes('totalyardsallowed')) stats.total_yards_allowed_per_game = value;
    else if (name?.includes('passingyards') && !name.includes('allowed')) stats.passing_yards_per_game = value;
    else if (name?.includes('passingyardsallowed')) stats.passing_yards_allowed_per_game = value;
    else if (name?.includes('rushingyards') && !name.includes('allowed')) stats.rushing_yards_per_game = value;
    else if (name?.includes('rushingyardsallowed')) stats.rushing_yards_allowed_per_game = value;
    else if (name?.includes('thirddownpct')) stats.third_down_pct = value;
    else if (name?.includes('redzonepct')) stats.red_zone_pct = value;
    else if (name?.includes('sacks')) stats.sacks_per_game = value;
    else if (name?.includes('turnovers')) stats.turnovers_per_game = value;
    else if (name?.includes('takeaways')) stats.takeaways_per_game = value;
  }
  
  return stats;
}

// =============================================================================
// Main Handler
// =============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = crypto.randomUUID();
  log('INFO', 'Starting NFL team stats update', { correlationId });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current season info
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const seasonYear = currentMonth >= 9 ? currentYear : currentYear - 1;
    
    // Fetch teams from ESPN
    const response = await fetchWithRetry(ESPN_TEAM_STATS_BASE, MAX_RETRIES);
    const data = await response.json();
    
    const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];
    log('INFO', `Fetched ${teams.length} teams from ESPN`, { correlationId });

    const statsToInsert: TeamStats[] = [];
    
    for (const teamObj of teams) {
      const team = teamObj.team;
      const abbrev = team.abbreviation;
      
      if (!abbrev) continue;
      
      const extractedStats = extractStats(team);
      
      // Get current NFL week (approximate)
      const weeksSinceSeasonStart = Math.max(1, Math.floor((Date.now() - new Date(seasonYear, 8, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)));
      const currentWeek = Math.min(18, weeksSinceSeasonStart);
      
      statsToInsert.push({
        team_abbreviation: abbrev,
        season_year: seasonYear,
        season_type: 'regular',
        week: currentWeek,
        ...extractedStats,
        points_per_game: extractedStats.points_per_game ?? null,
        points_allowed_per_game: extractedStats.points_allowed_per_game ?? null,
        total_yards_per_game: extractedStats.total_yards_per_game ?? null,
        total_yards_allowed_per_game: extractedStats.total_yards_allowed_per_game ?? null,
        passing_yards_per_game: extractedStats.passing_yards_per_game ?? null,
        passing_yards_allowed_per_game: extractedStats.passing_yards_allowed_per_game ?? null,
        rushing_yards_per_game: extractedStats.rushing_yards_per_game ?? null,
        rushing_yards_allowed_per_game: extractedStats.rushing_yards_allowed_per_game ?? null,
        third_down_pct: extractedStats.third_down_pct ?? null,
        red_zone_pct: extractedStats.red_zone_pct ?? null,
        sacks_per_game: extractedStats.sacks_per_game ?? null,
        turnovers_per_game: extractedStats.turnovers_per_game ?? null,
        takeaways_per_game: extractedStats.takeaways_per_game ?? null,
      });
    }

    // Upsert stats into database
    const { error } = await supabase
      .from('nfl_team_stats')
      .upsert(statsToInsert, {
        onConflict: 'team_abbreviation,season_year,season_type,week'
      });

    if (error) {
      throw error;
    }

    log('INFO', 'Successfully updated NFL team stats', { 
      correlationId,
      teamsUpdated: statsToInsert.length 
    });

    return new Response(
      JSON.stringify({
        success: true,
        teamsUpdated: statsToInsert.length,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    log('ERROR', 'Failed to update NFL team stats', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

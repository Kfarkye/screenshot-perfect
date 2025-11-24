const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[NFL Stats] Starting fetch from NFL.com API');
    
    // NFL.com API endpoint for team stats
    const currentYear = new Date().getFullYear();
    const statsUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams`;
    
    console.log('[NFL Stats] Fetching from:', statsUrl);
    
    const response = await fetch(statsUrl);
    
    if (!response.ok) {
      throw new Error(`NFL API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('[NFL Stats] Successfully fetched team data');

    // Transform and return the stats
    const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];
    const teamStats = teams.map((teamObj: any) => {
      const team = teamObj.team;
      return {
        team_abbreviation: team.abbreviation,
        team_name: team.displayName,
        record: team.record?.items?.[0]?.summary || 'N/A',
        standings: team.standingSummary || 'N/A',
        logo: team.logos?.[0]?.href || null,
      };
    });

    console.log(`[NFL Stats] Processed ${teamStats.length} teams`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        teams: teamStats,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[NFL Stats] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RosterEntry {
  playerName: string;
  teamName: string;
  position?: string;
  league: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('[Sync Knowledge] Starting sports data sync...');

    // Fetch NBA rosters from ESPN
    const nbaResponse = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams');
    if (!nbaResponse.ok) throw new Error('Failed to fetch NBA teams');
    
    const nbaData = await nbaResponse.json();
    const rosterEntries: any[] = [];

    // Process NBA rosters
    for (const team of nbaData.sports[0].leagues[0].teams) {
      const teamName = team.team.displayName;
      const teamAbbr = team.team.abbreviation;

      // Fetch team roster
      const rosterUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${team.team.id}/roster`;
      const rosterResponse = await fetch(rosterUrl);
      
      if (rosterResponse.ok) {
        const rosterData = await rosterResponse.json();
        
        if (rosterData.athletes) {
          for (const athlete of rosterData.athletes) {
            const playerName = athlete.fullName;
            const position = athlete.position?.abbreviation || null;

            rosterEntries.push({
              category: 'roster',
              league: 'NBA',
              entity: playerName,
              data: {
                team: teamName,
                teamAbbr: teamAbbr,
                position: position,
                playerId: athlete.id,
              },
              source_url: rosterUrl,
              valid_from: new Date().toISOString(),
              valid_until: null, // current roster
            });
          }
        }
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[Sync Knowledge] Processed ${rosterEntries.length} NBA roster entries`);

    // Invalidate old roster entries (set valid_until to now)
    const { error: invalidateError } = await supabase
      .from('sports_knowledge')
      .update({ valid_until: new Date().toISOString() })
      .eq('category', 'roster')
      .eq('league', 'NBA')
      .is('valid_until', null);

    if (invalidateError) {
      console.error('[Sync Knowledge] Error invalidating old rosters:', invalidateError);
    }

    // Insert new roster entries
    const { error: insertError } = await supabase
      .from('sports_knowledge')
      .insert(rosterEntries);

    if (insertError) {
      console.error('[Sync Knowledge] Error inserting rosters:', insertError);
      throw insertError;
    }

    console.log('[Sync Knowledge] Successfully synced NBA rosters');

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced: rosterEntries.length,
        league: 'NBA',
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Sync Knowledge] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { league } = await req.json();
    
    let url: string;
    switch (league) {
      case 'NHL':
        url = 'https://api-web.nhle.com/v1/standings/now';
        break;
      case 'NFL':
        url = 'https://site.api.espn.com/apis/v2/sports/football/nfl/standings';
        break;
      case 'NBA':
        url = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';
        break;
      default:
        throw new Error('Invalid league');
    }

    console.log(`[Standings API] Fetching ${league}:`, url);

    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Standings API] Error:', response.status, errorText);
      throw new Error(`Standings API error: ${response.status}`);
    }

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Standings API] Function error:', error);
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

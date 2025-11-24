const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sport, regions, markets, dateFormat, daysFrom, bookmakers } = await req.json();
    const ODDS_API_KEY = Deno.env.get('ODDS_API_KEY');

    if (!ODDS_API_KEY) {
      throw new Error('ODDS_API_KEY not configured');
    }

    // Build query params
    const params = new URLSearchParams({
      apiKey: ODDS_API_KEY,
      regions: regions || 'us',
      markets: markets || 'h2h,spreads,totals',
      oddsFormat: 'american',
      dateFormat: dateFormat || 'iso'
    });

    if (daysFrom) params.append('daysFrom', daysFrom.toString());
    if (bookmakers) params.append('bookmakers', bookmakers);

    // Determine endpoint (scores vs odds)
    const endpoint = markets === 'h2h' && daysFrom ? 'scores' : 'odds';
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/${endpoint}?${params}`;
    
    console.log('[Odds API] Fetching:', url.replace(ODDS_API_KEY, 'REDACTED'));

    const response = await fetch(url);
    
    if (!response.ok) {
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

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const { query, maxResults = 5 } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const PARALLEL_API_KEY = Deno.env.get('PARALLEL_API_KEY');
    if (!PARALLEL_API_KEY) {
      console.error('PARALLEL_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Search service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[WEB-SEARCH] Executing search:', { query, maxResults });

    // Call Parallel API
    const response = await fetch('https://api.parallel.ai/v1beta/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': PARALLEL_API_KEY,
        'parallel-beta': 'search-extract-2025-10-10',
      },
      body: JSON.stringify({
        objective: query,
        search_queries: [query],
        max_results: maxResults,
        excerpts: {
          max_chars_per_result: 5000,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[WEB-SEARCH] Parallel API error:', {
        status: response.status,
        error: errorText,
      });
      return new Response(
        JSON.stringify({ 
          error: `Search API error: ${response.status}`,
          details: errorText 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('[WEB-SEARCH] Search completed:', {
      query,
      resultCount: data.results?.length || 0,
    });

    // Transform results to match expected format
    const results = (data.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.excerpts?.[0] || '',
      source: new URL(r.url).hostname.replace('www.', ''),
      publishedAt: r.publish_date,
    }));

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[WEB-SEARCH] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

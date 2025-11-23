interface SearchQueryParams {
  query: string;
  conversationId?: string;
  userId: string;
  messages: Array<{ role: string; content: string }>;
  supabase: any;
  corsHeaders: Record<string, string>;
  userToken: string;
}

export async function handleSearchQuery(params: SearchQueryParams): Promise<Response> {
  const { query, userId, corsHeaders } = params;
  
  console.log('[SEARCH] Search query received:', { query, userId });
  
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      const message = "I'm experiencing high volatility in the market feeds right now. Analysis is temporarily unavailable.";
      
      // Send SSE formatted response
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "content", text: message })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      controller.close();
    }
  });
  
  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
    status: 200,
  });
}

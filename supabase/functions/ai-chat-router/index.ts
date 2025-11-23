const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { messages, preferredProvider } = await req.json();
    
    console.log('[AI-ROUTER] Request received', {
      messageCount: messages?.length,
      provider: preferredProvider
    });

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

    if (!GEMINI_API_KEY) {
      console.error('[AI-ROUTER] GEMINI_API_KEY not configured');
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Format messages for Gemini
    const geminiMessages = messages.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.content }]
    }));

    console.log('[AI-ROUTER] Calling Gemini API...');

    // Call Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: { 
            maxOutputTokens: 8000,
            temperature: 0.7
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[AI-ROUTER] Gemini API error:', {
        status: response.status,
        error
      });
      throw new Error(`Gemini API error: ${error}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

    console.log('[AI-ROUTER] Response generated successfully');

    return new Response(JSON.stringify({ 
      response: text, 
      provider: 'gemini' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('[AI-ROUTER] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});

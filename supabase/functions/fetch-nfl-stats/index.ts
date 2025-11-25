// =============================================================================
// Configuration & Constants
// =============================================================================

const ESPN_API_ENDPOINT = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";
const FETCH_TIMEOUT_MS = 4000;
const MAX_RETRIES = 3;
const CACHE_TTL_SECONDS = 1800;

// =============================================================================
// TypeScript Interfaces
// =============================================================================

interface EspnTeam {
  abbreviation: string;
  displayName: string;
  record?: { items?: Array<{ summary?: string }> };
  standingSummary?: string;
  logos?: Array<{ href?: string }>;
}

interface EspnApiResponse {
  sports?: Array<{ leagues?: Array<{ teams?: Array<{ team: EspnTeam }> }> }>;
}

interface ProcessedTeamStats {
  team_abbreviation: string;
  team_name: string;
  record: string;
  standings: string;
  logo: string | null;
}

interface ApiResponse {
  success: boolean;
  data?: ProcessedTeamStats[];
  timestamp?: string;
  error?: string;
  correlationId?: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

const log = (level: 'INFO' | 'WARN' | 'ERROR', message: string, correlationId: string, context: Record<string, unknown> = {}) => {
  const logEntry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    correlationId,
    context
  });
  console.log(logEntry);
};

const getCorsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'X-Content-Type-Options': 'nosniff',
});

async function fetchWithRetry(url: string, retries: number, correlationId: string): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const attempt = i + 1;
    let timeoutId: number | null = null;

    try {
      log('INFO', `Fetching upstream API (Attempt ${attempt}/${retries})`, correlationId, { url });
      
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      timeoutId = null;

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'N/A');
        log('WARN', `Upstream API error (Attempt ${attempt})`, correlationId, { 
          status: response.status, 
          body: errorBody.substring(0, 500) 
        });

        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`API_CLIENT_ERROR: ${response.status}`);
        }
        throw new Error(`API_RETRYABLE_ERROR: ${response.status}`);
      }
      return response;

    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.name : 'UnknownError';
      
      log('WARN', `Fetch attempt ${attempt} failed`, correlationId, { error: errorMessage, type: errorType });
      
      if (i === retries - 1) {
        throw error;
      }
      
      const backoff = (2 ** i) * 100;
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
  throw new Error("Fetch logic error: Should be unreachable");
}

async function generateETag(body: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(body);
  const hashBuffer = await crypto.subtle.digest('SHA-1', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `W/"${hashHex}"`;
}

// =============================================================================
// Data Processing
// =============================================================================

const transformTeamData = (data: EspnApiResponse, correlationId: string): ProcessedTeamStats[] => {
  const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];
  
  if (teams.length === 0) {
    log('WARN', 'Upstream API returned an empty teams array or unexpected structure.', correlationId);
  }

  return teams.map((teamObj) => {
    const team = teamObj.team;
    return {
      team_abbreviation: team.abbreviation || 'N/A',
      team_name: team.displayName || 'Unknown Team',
      record: team.record?.items?.[0]?.summary ?? 'N/A',
      standings: team.standingSummary ?? 'N/A',
      logo: team.logos?.[0]?.href ?? null,
    };
  });
};

// =============================================================================
// Main Handler
// =============================================================================

Deno.serve(async (req) => {
  const startTime = performance.now();
  const correlationId = req.headers.get('x-correlation-id') || crypto.randomUUID();
  const headers = getCorsHeaders();

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method Not Allowed', correlationId }),
      { status: 405, headers: { ...headers, 'Content-Type': 'application/json' } }
    );
  }

  log('INFO', 'Request initiated', correlationId, { method: req.method });

  try {
    const response = await fetchWithRetry(ESPN_API_ENDPOINT, MAX_RETRIES, correlationId);
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('INVALID_CONTENT_TYPE');
    }

    const data: EspnApiResponse = await response.json();
    const teamStats = transformTeamData(data, correlationId);

    const payload: ApiResponse = {
      success: true,
      data: teamStats,
      timestamp: new Date().toISOString(),
    };
    const responseBody = JSON.stringify(payload);

    const etag = await generateETag(responseBody);
    
    if (req.headers.get('If-None-Match') === etag) {
      const duration = performance.now() - startTime;
      log('INFO', 'Resource not modified (304)', correlationId, { durationMs: duration.toFixed(2) });
      return new Response(null, { 
        status: 304, 
        headers: { ...headers, 'ETag': etag }
      });
    }

    const duration = performance.now() - startTime;
    log('INFO', 'Sending success response (200)', correlationId, { durationMs: duration.toFixed(2) });

    return new Response(responseBody, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=600`,
        'ETag': etag,
        'X-Response-Time': `${duration.toFixed(2)}ms`,
        'X-Correlation-ID': correlationId,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    const errorType = error instanceof Error ? error.name : 'UnknownError';
    
    log('ERROR', 'Request processing failed', correlationId, { error: errorMessage, type: errorType });

    let status = 500;
    let clientErrorMessage = "Internal Server Error";

    if (errorType === 'AbortError') {
      status = 504;
      clientErrorMessage = "Upstream request timed out";
    } else if (errorMessage.startsWith('API_') || errorMessage === 'INVALID_CONTENT_TYPE') {
      status = 502;
      clientErrorMessage = "Error communicating with upstream service";
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: clientErrorMessage,
        correlationId 
      }),
      {
        status,
        headers: { 
          ...headers, 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Correlation-ID': correlationId 
        },
      }
    );
  }
});

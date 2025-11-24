import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';

// =============================================================================
// Configuration & Constants
// =============================================================================
const API_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const FETCH_TIMEOUT_MS = 10000; // Increased to accommodate parallel requests
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 200;
const CONCURRENCY_LIMIT = 6; // Optimized balance for edge execution and potential API rate limits
const TEAM_FETCH_LIMIT = 35; // Buffer for potential league expansion

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// Error Taxonomy
// =============================================================================
class ConfigurationError extends Error {
  constructor(message: string) { super(message); this.name = "ConfigurationError"; }
}
class AuthorizationError extends Error {
  constructor(message: string) { super(message); this.name = "AuthorizationError"; }
}
class ApiError extends Error {
  constructor(message: string, public status?: number) { super(message); this.name = "ApiError"; }
}
class ValidationError extends Error {
  constructor(message: string, public issues: unknown) { super(message); this.name = "ValidationError"; }
}

// =============================================================================
// API Schema Definitions (Zod)
// Input validation for untrusted upstream data sources.
// =============================================================================

// 1. Scoreboard Schema (for Season Context)
const ZScoreboard = z.object({
  season: z.object({
    year: z.number().int().min(2000),
    type: z.number().int().min(1).max(4), // 1: Pre, 2: Reg, 3: Post, 4: Off
  }),
  week: z.object({
    number: z.number().int().min(1).max(22),
  }),
}).passthrough(); // Allow extra fields from ESPN

// 2. Teams List Schema
const ZTeamItem = z.object({
  team: z.object({
    id: z.string().min(1),
    abbreviation: z.string().min(2).max(4),
  }).passthrough(),
});
const ZTeamsList = z.object({
  sports: z.array(z.object({
    leagues: z.array(z.object({
      teams: z.array(ZTeamItem),
    })).nonempty(),
  })).nonempty(),
}).passthrough();

// 3. Team Statistics Schema
const ZStatMetric = z.object({
  name: z.string(),
  // ESPN sometimes sends numbers as strings, so we must accept both
  value: z.union([z.number(), z.string()]),
}).passthrough();
const ZStatCategory = z.object({
  name: z.string(),
  stats: z.array(ZStatMetric),
}).passthrough();
const ZTeamStatistics = z.object({
  // 'results' might be missing, so we default to an empty array
  results: z.array(ZStatCategory).optional().default([]),
}).passthrough();

// =============================================================================
// Domain Types
// =============================================================================
type SeasonTypeString = 'preseason' | 'regular' | 'postseason' | 'offseason';

interface SeasonInfo {
  year: number;
  type: number;
  week: number;
  seasonTypeString: SeasonTypeString;
}

// Database Schema (Target)
interface TeamStatsDBRecord {
  team_id: string;
  team_abbreviation: string;
  season_year: number;
  season_type: SeasonTypeString;
  week: number;
  // Offensive
  points_per_game: number | null;
  total_yards_per_game: number | null;
  passing_yards_per_game: number | null;
  rushing_yards_per_game: number | null;
  third_down_pct: number | null;
  red_zone_pct: number | null;
  turnovers_per_game: number | null; // Giveaways
  sacks_allowed: number | null;
  // Defensive
  points_allowed_per_game: number | null;
  total_yards_allowed_per_game: number | null;
  passing_yards_allowed_per_game: number | null;
  rushing_yards_allowed_per_game: number | null;
  takeaways_per_game: number | null;
  sacks_per_game: number | null;
}

// Inferred Types
type TeamItem = z.infer<typeof ZTeamItem>;

// =============================================================================
// Utilities & Infrastructure
// =============================================================================

/**
 * Structured Logger
 * Outputs JSON for ingestion by observability platforms (e.g., Datadog, Vercel Logs).
 * Ensures proper serialization of Error objects.
 */
const log = (level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, data?: unknown) => {
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (data) {
    if (data instanceof Error) {
      payload.errorName = data.name;
      payload.errorMessage = data.message;
      // Include stack trace for severe errors
      if (level === 'ERROR' || level === 'WARN') {
        payload.stack = data.stack;
      }
      // @ts-ignore: 'cause' is widely supported but might not be in all TS environments
      if ('cause' in data && data.cause) payload.cause = data.cause;
    } else {
       try {
         // Safely serialize other data types
         payload.data = JSON.parse(JSON.stringify(data));
       } catch (e) {
         payload.data = "Log Serialization Error: " + String(data);
       }
    }
  }
  
  console.log(JSON.stringify(payload));
};

/**
 * Resilient Fetch with Exponential Backoff, Jitter, and Schema Validation.
 * Guarantees the return type matches the schema.
 */
async function fetchAndValidate<T>(url: string, schema: z.ZodType<T>, retries: number = MAX_RETRIES): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new ApiError(`HTTP Error: ${res.status} from ${url}`, res.status);
      }
      
      const jsonData = await res.json();

      // CRITICAL: Validate the data structure
      const parsedData = schema.safeParse(jsonData);
      if (!parsedData.success) {
        log('ERROR', 'Upstream API Schema Validation Failed', { url, issues: parsedData.error.format() });
        // Do not retry validation errors as they indicate a structural change in the API
        throw new ValidationError("API_SCHEMA_VIOLATION", parsedData.error.format());
      }

      return parsedData.data;

    } catch (err: unknown) {
      // Determine if retry is appropriate (Transient errors: Network errors, 5xx statuses)
      // We explicitly do NOT retry on 4xx errors (client errors) or Validation errors.
      const isTransient = (err instanceof ApiError && err.status && err.status >= 500) || 
                          (err instanceof Error && (err.name === 'AbortError' || err.name === 'TypeError')); // TypeError often indicates network issues in fetch

      if (i === retries - 1 || !isTransient) {
        if (!(err instanceof ValidationError)) {
            log('WARN', `Fetch failed permanently or non-transient error for ${url}`, err);
        }
        throw err;
      }

      log('DEBUG', `Transient failure fetching ${url}. Retrying ${i+1}/${retries}...`, { error: err instanceof Error ? err.message : 'Unknown' });

      // Exponential backoff + Jitter (to prevent Thundering Herd)
      const backoff = BASE_BACKOFF_MS * Math.pow(2, i);
      const jitter = Math.random() * 0.5 * backoff; // Jitter up to 50% of the backoff time
      await new Promise(r => setTimeout(r, backoff + jitter));
    }
  }
  throw new Error("Max retries exceeded (unreachable code path)");
}

// =============================================================================
// Logic Modules
// =============================================================================

/**
 * Module: Season State
 * Retrieves authoritative current week/season data.
 */
async function getCurrentSeasonInfo(): Promise<SeasonInfo> {
  // Reduced retries for the initial state check as it's critical and fast
  const data = await fetchAndValidate(`${API_BASE}/scoreboard`, ZScoreboard, 2);

  const mapType = (type: number): SeasonTypeString => {
    switch (type) {
      case 1: return 'preseason';
      case 2: return 'regular';
      case 3: return 'postseason';
      default: return 'offseason';
    }
  };

  return {
    year: data.season.year,
    type: data.season.type,
    week: data.week.number,
    seasonTypeString: mapType(data.season.type),
  };
}

/**
 * Module: Stat Normalizer
 * Maps validated ESPN statistic structures to the internal DB Schema.
 * This layer must be highly defensive.
 */
function normalizeStats(statsData: any): Partial<TeamStatsDBRecord> {
  const categories = statsData.results || [];
  const stats: Partial<TeamStatsDBRecord> = {};

  // Helper to safely parse numeric values
  const parseNumeric = (value: string | number): number | null => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    // Guard against NaN and Infinity
    return Number.isFinite(num) ? num : null;
  };

  // Helper to find value in deep ESPN structure
  const findStat = (catName: string, statName: string): number | null => {
    const category = categories.find((c: any) => c.name === catName);
    if (!category) return null;
    
    const metric = category.stats.find((s: any) => s.name === statName);
    return metric ? parseNumeric(metric.value) : null;
  };

  // Offensive Mappings
  stats.points_per_game = findStat('scoring', 'totalPointsPerGame');
  stats.total_yards_per_game = findStat('general', 'totalYardsPerGame');
  stats.passing_yards_per_game = findStat('passing', 'netPassingYardsPerGame');
  stats.rushing_yards_per_game = findStat('rushing', 'rushingYardsPerGame');
  
  // Defensive fallback for potential ESPN typos (Converstion vs Conversion)
  stats.third_down_pct = findStat('downConversions', 'thirdDownConverstionPct') // Typo seen in the wild
                        ?? findStat('downConversions', 'thirdDownConversionPct'); // Correct spelling

  stats.red_zone_pct = findStat('miscellaneous', 'redZoneEfficiencyPct') 
                      ?? findStat('scoring', 'redZoneEfficiencyPct');
                      
  stats.turnovers_per_game = findStat('general', 'turnoversPerGame');
  stats.sacks_allowed = findStat('passing', 'sacksAllowed') ?? findStat('offensive', 'sacksAllowed');

  
  // Defensive Mappings 
  // Assuming standard keys based on common API patterns, with fallbacks if the API separates 'opponent' stats.
  
  stats.points_allowed_per_game = findStat('scoring', 'totalPointsAllowedPerGame') 
                                ?? findStat('opponentScoring', 'totalPointsPerGame');
                                
  stats.total_yards_allowed_per_game = findStat('general', 'totalYardsAllowedPerGame') 
                                      ?? findStat('opponentGeneral', 'totalYardsPerGame');

  stats.passing_yards_allowed_per_game = findStat('passing', 'netPassingYardsAllowedPerGame') 
                                        ?? findStat('opponentPassing', 'netPassingYardsPerGame');

  stats.rushing_yards_allowed_per_game = findStat('rushing', 'rushingYardsAllowedPerGame') 
                                        ?? findStat('opponentRushing', 'rushingYardsPerGame');
  
  stats.takeaways_per_game = findStat('defensive', 'takeawaysPerGame') 
                            ?? findStat('general', 'takeawaysPerGame');

  // 'sacks' often returns total sacks. If 'sacksPerGame' exists, prefer it.
  stats.sacks_per_game = findStat('defensive', 'sacksPerGame') 
                        ?? findStat('defensive', 'sacks'); 

  return stats;
}

/**
 * Module: Team Processor
 * Fetches and normalizes stats for a single team.
 */
async function processTeam(t: TeamItem, seasonInfo: SeasonInfo): Promise<TeamStatsDBRecord> {
    const teamItem = t.team;
    const teamId = teamItem.id;
    
    // Explicitly request the stats for the determined season year for determinism.
    const specificStatsUrl = `${API_BASE}/teams/${teamId}/statistics?season=${seasonInfo.year}`;

    // This might throw an error (fetch failure or validation failure), 
    // which will be caught by Promise.allSettled in the main handler.
    const detailedStats = await fetchAndValidate(specificStatsUrl, ZTeamStatistics);
    const normalized = normalizeStats(detailedStats);

    return {
        team_id: teamId,
        team_abbreviation: teamItem.abbreviation,
        season_year: seasonInfo.year,
        season_type: seasonInfo.seasonTypeString,
        week: seasonInfo.week,
        points_per_game: normalized.points_per_game ?? null,
        total_yards_per_game: normalized.total_yards_per_game ?? null,
        passing_yards_per_game: normalized.passing_yards_per_game ?? null,
        rushing_yards_per_game: normalized.rushing_yards_per_game ?? null,
        third_down_pct: normalized.third_down_pct ?? null,
        red_zone_pct: normalized.red_zone_pct ?? null,
        turnovers_per_game: normalized.turnovers_per_game ?? null,
        sacks_allowed: normalized.sacks_allowed ?? null,
        points_allowed_per_game: normalized.points_allowed_per_game ?? null,
        total_yards_allowed_per_game: normalized.total_yards_allowed_per_game ?? null,
        passing_yards_allowed_per_game: normalized.passing_yards_allowed_per_game ?? null,
        rushing_yards_allowed_per_game: normalized.rushing_yards_allowed_per_game ?? null,
        takeaways_per_game: normalized.takeaways_per_game ?? null,
        sacks_per_game: normalized.sacks_per_game ?? null,
    };
}

// =============================================================================
// Main Execution Handler
// =============================================================================

async function handler(req: Request): Promise<Response> {
  // Handle Preflight
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS, status: 204 });

  const correlationId = crypto.randomUUID();
  const startTime = performance.now();
  log('INFO', 'Sync Process Started', { correlationId, concurrency: CONCURRENCY_LIMIT });

  try {
    // 1. Environment Validation & Security
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    // CRON_AUTHORIZATION_SECRET must be set in the environment variables
    const CRON_SECRET = Deno.env.get('CRON_AUTHORIZATION_SECRET');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CRON_SECRET) {
        throw new ConfigurationError("Missing critical environment variables (Supabase or CRON_SECRET).");
    }

    // Authorization Check: Prevents unauthorized execution
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
        log('WARN', 'Unauthorized access attempt', { correlationId, ip: req.headers.get('x-forwarded-for') || 'unknown' });
        throw new AuthorizationError("Unauthorized");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Get Deterministic Context (Week/Year)
    const seasonInfo = await getCurrentSeasonInfo();
    log('INFO', 'Season Context Acquired', seasonInfo);

    // Optimization: Skip processing during the offseason if not required
    if (seasonInfo.seasonTypeString === 'offseason') {
        log('INFO', 'Offseason detected. Skipping sync.');
        return new Response(JSON.stringify({ success: true, message: "Offseason, sync skipped.", updated: 0 }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
    }

    // 3. Team Discovery
    const teamsData = await fetchAndValidate(`${API_BASE}/teams?limit=${TEAM_FETCH_LIMIT}`, ZTeamsList);
    // Safely access the deeply nested array due to validation
    const teams = teamsData.sports[0]?.leagues[0]?.teams || [];
    log('INFO', 'Team Discovery Complete', { count: teams.length });

    if (teams.length < 32) {
        log('WARN', 'Expected at least 32 teams, found less.', { count: teams.length });
    }

    // 4. Parallel Processing (Batched Concurrency with Resilience)
    const statsToUpsert: TeamStatsDBRecord[] = [];
    let failureCount = 0;
    
    // Process in serialized batches to manage load and memory
    for (let i = 0; i < teams.length; i += CONCURRENCY_LIMIT) {
      const batch = teams.slice(i, i + CONCURRENCY_LIMIT);
      log('DEBUG', `Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}`, { size: batch.length });
      
      // Use Promise.allSettled to ensure failures don't stop the batch
      const batchResults = await Promise.allSettled(
        batch.map(t => processTeam(t, seasonInfo))
      );

      // Process results and handle failures
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
            statsToUpsert.push(result.value);
        } else {
            failureCount++;
            const teamInfo = batch[j].team;
            // Log the specific reason for the failure (e.g., API down, validation error on specific team)
            log('ERROR', `Failed to process team: ${teamInfo.abbreviation} (ID: ${teamInfo.id})`, { reason: result.reason, correlationId });
        }
      }
    }

    // 5. Database Persistence (Bulk Upsert)
    if (statsToUpsert.length > 0) {
      log('INFO', 'Starting Database Upsert', { count: statsToUpsert.length });
      const { error } = await supabase
        .from('nfl_team_stats')
        .upsert(statsToUpsert, {
          // Use stable team_id for conflict resolution (Idempotency Key)
          onConflict: 'team_id,season_year,season_type,week'
        });

      if (error) {
        throw new ApiError(`Supabase Upsert Failed: ${error.message}`);
      }
    }

    // 6. Finalize
    const durationMs = performance.now() - startTime;
    log('INFO', 'Sync Process Complete', { 
        correlationId, 
        durationMs: durationMs.toFixed(2), 
        successCount: statsToUpsert.length, 
        failureCount 
    });

    // Determine status code: 200 OK, 206 Partial Content, or 500 Internal Server Error (if nothing succeeded)
    let statusCode = 200;
    if (failureCount > 0) {
        // 206 Partial Content if some succeeded, 500 if all failed
        statusCode = statsToUpsert.length > 0 ? 206 : 500;
    }

    // Respond with success metrics
    return new Response(JSON.stringify({ 
        success: statsToUpsert.length > 0, 
        updated: statsToUpsert.length,
        failures: failureCount,
        context: seasonInfo,
        correlationId
    }), {
      status: statusCode,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    // Global error handler
    const durationMs = (performance.now() - startTime).toFixed(2);
    
    // Determine status code based on error type for better monitoring
    let statusCode = 500;
    if (error instanceof ConfigurationError) statusCode = 503; // Service Unavailable
    else if (error instanceof ValidationError) statusCode = 502; // Bad Gateway (Upstream data invalid)
    else if (error instanceof AuthorizationError) statusCode = 401;
    
    // Do not log 401s as system errors
    if (!(error instanceof AuthorizationError)) {
        log('ERROR', 'Fatal Execution Failure', error);
    }
    
    return new Response(JSON.stringify({ 
        success: false, 
        // Provide specific error message if AuthorizationError, otherwise generic for security
        error: error instanceof AuthorizationError ? error.message : "Internal Server Error",
        correlationId,
        durationMs: durationMs
    }), {
      status: statusCode,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }
}

// Entry point for Deno/Vercel Edge (if configured for Deno)
Deno.serve(handler);

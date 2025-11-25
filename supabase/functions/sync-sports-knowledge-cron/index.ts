// ════════════════════════════════════════════════════════════════════════════
// SPORTS KNOWLEDGE SYNC CRON
// Production-grade scheduled sync for rosters, injuries, and news
// ════════════════════════════════════════════════════════════════════════════
//
// @metanotes
// {
//   "version": "3.0.0",
//   "author": "SharpEdge",
//   "purpose": "Scheduled sync of sports data that LLMs get wrong",
//   "schedule": {
//     "rosters": "daily at 6am ET",
//     "injuries": "every 4 hours",
//     "news": "every hour"
//   },
//   "sources": ["ESPN API", "NBA.com"],
//   "schema": "sports_data.sports_knowledge",
//   "last_updated": "2025-11-25"
// }
// ════════════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  
  // Rate limiting (be nice to ESPN)
  DELAY_BETWEEN_TEAMS_MS: 150,
  DELAY_BETWEEN_REQUESTS_MS: 100,
  
  // Timeouts
  FETCH_TIMEOUT_MS: 10000,
  
  // Batch settings
  BATCH_SIZE: 50,
  
  // ESPN API endpoints
  ESPN_BASE_URL: 'https://site.api.espn.com/apis/site/v2/sports',
} as const;

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

type League = 'NBA' | 'NFL' | 'MLB' | 'NHL';
type KnowledgeCategory = 'roster' | 'trade' | 'injury' | 'news' | 'suspension';
type SyncAction = 'sync_rosters' | 'sync_injuries' | 'sync_news' | 'sync_all' | 'manual_upsert';

interface SyncRequest {
  action: SyncAction;
  league?: League;
  teams?: string[];  // Optional: specific teams to sync
  dryRun?: boolean;  // If true, don't write to DB
}

interface SyncStats {
  processed: number;
  inserted: number;
  updated: number;
  errorCount: number;
  skipped: number;
  errorDetails: string[];
}

interface SyncResult {
  success: boolean;
  action: SyncAction;
  league: League;
  stats: {
    processed: number;
    inserted: number;
    updated: number;
    errors: number;
    skipped: number;
  };
  errors: string[];
  durationMs: number;
  requestId: string;
  timestamp: string;
}

interface PlayerData {
  entity: string;
  category: KnowledgeCategory;
  league: League;
  data: Record<string, unknown>;
  source: string;
  sourceUrl: string | null;
  confidence: number;
}

interface ESPNAthlete {
  id: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  jersey?: string;
  position?: { abbreviation?: string; name?: string };
  displayHeight?: string;
  displayWeight?: string;
  age?: number;
  experience?: { years?: number };
  status?: { type?: string; name?: string };
  injuries?: Array<{
    type?: { name?: string; description?: string };
    status?: string;
    date?: string;
    details?: { returnDate?: string };
  }>;
}

interface InjuryInfo {
  type?: { name?: string; description?: string };
  status?: string;
  date?: string;
  details?: { returnDate?: string };
}

interface ESPNTeam {
  id: string;
  name: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName?: string;
  location?: string;
  color?: string;
  alternateColor?: string;
  logo?: string;
}

// ════════════════════════════════════════════════════════════════════════════
// LOGGING
// ════════════════════════════════════════════════════════════════════════════

const Logger = {
  info: (message: string, ctx?: Record<string, unknown>) => {
    console.log(JSON.stringify({ 
      level: 'info', 
      service: 'sports-sync-cron', 
      message, 
      ...ctx,
      ts: new Date().toISOString() 
    }));
  },
  error: (message: string, error: unknown, ctx?: Record<string, unknown>) => {
    const errorData = error instanceof Error
      ? { message: error.message, name: error.name, stack: error.stack?.split('\n').slice(0, 3) }
      : { message: String(error) };
    console.error(JSON.stringify({ 
      level: 'error', 
      service: 'sports-sync-cron', 
      message, 
      error: errorData, 
      ...ctx,
      ts: new Date().toISOString() 
    }));
  },
  warn: (message: string, ctx?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ 
      level: 'warn', 
      service: 'sports-sync-cron', 
      message, 
      ...ctx,
      ts: new Date().toISOString() 
    }));
  },
};

// ════════════════════════════════════════════════════════════════════════════
// TEAM MAPPINGS
// ════════════════════════════════════════════════════════════════════════════

const NBA_TEAMS: Record<string, { name: string; abbrev: string; espnId: string; conference: string; division: string }> = {
  // Eastern Conference - Atlantic
  'celtics': { name: 'Boston Celtics', abbrev: 'BOS', espnId: '2', conference: 'East', division: 'Atlantic' },
  'nets': { name: 'Brooklyn Nets', abbrev: 'BKN', espnId: '17', conference: 'East', division: 'Atlantic' },
  'knicks': { name: 'New York Knicks', abbrev: 'NYK', espnId: '18', conference: 'East', division: 'Atlantic' },
  'sixers': { name: 'Philadelphia 76ers', abbrev: 'PHI', espnId: '20', conference: 'East', division: 'Atlantic' },
  'raptors': { name: 'Toronto Raptors', abbrev: 'TOR', espnId: '28', conference: 'East', division: 'Atlantic' },
  
  // Eastern Conference - Central
  'bulls': { name: 'Chicago Bulls', abbrev: 'CHI', espnId: '4', conference: 'East', division: 'Central' },
  'cavaliers': { name: 'Cleveland Cavaliers', abbrev: 'CLE', espnId: '5', conference: 'East', division: 'Central' },
  'pistons': { name: 'Detroit Pistons', abbrev: 'DET', espnId: '8', conference: 'East', division: 'Central' },
  'pacers': { name: 'Indiana Pacers', abbrev: 'IND', espnId: '11', conference: 'East', division: 'Central' },
  'bucks': { name: 'Milwaukee Bucks', abbrev: 'MIL', espnId: '15', conference: 'East', division: 'Central' },
  
  // Eastern Conference - Southeast
  'hawks': { name: 'Atlanta Hawks', abbrev: 'ATL', espnId: '1', conference: 'East', division: 'Southeast' },
  'hornets': { name: 'Charlotte Hornets', abbrev: 'CHA', espnId: '30', conference: 'East', division: 'Southeast' },
  'heat': { name: 'Miami Heat', abbrev: 'MIA', espnId: '14', conference: 'East', division: 'Southeast' },
  'magic': { name: 'Orlando Magic', abbrev: 'ORL', espnId: '19', conference: 'East', division: 'Southeast' },
  'wizards': { name: 'Washington Wizards', abbrev: 'WAS', espnId: '27', conference: 'East', division: 'Southeast' },
  
  // Western Conference - Northwest
  'nuggets': { name: 'Denver Nuggets', abbrev: 'DEN', espnId: '7', conference: 'West', division: 'Northwest' },
  'timberwolves': { name: 'Minnesota Timberwolves', abbrev: 'MIN', espnId: '16', conference: 'West', division: 'Northwest' },
  'thunder': { name: 'Oklahoma City Thunder', abbrev: 'OKC', espnId: '25', conference: 'West', division: 'Northwest' },
  'blazers': { name: 'Portland Trail Blazers', abbrev: 'POR', espnId: '22', conference: 'West', division: 'Northwest' },
  'jazz': { name: 'Utah Jazz', abbrev: 'UTA', espnId: '26', conference: 'West', division: 'Northwest' },
  
  // Western Conference - Pacific
  'warriors': { name: 'Golden State Warriors', abbrev: 'GSW', espnId: '9', conference: 'West', division: 'Pacific' },
  'clippers': { name: 'Los Angeles Clippers', abbrev: 'LAC', espnId: '12', conference: 'West', division: 'Pacific' },
  'lakers': { name: 'Los Angeles Lakers', abbrev: 'LAL', espnId: '13', conference: 'West', division: 'Pacific' },
  'suns': { name: 'Phoenix Suns', abbrev: 'PHX', espnId: '21', conference: 'West', division: 'Pacific' },
  'kings': { name: 'Sacramento Kings', abbrev: 'SAC', espnId: '23', conference: 'West', division: 'Pacific' },
  
  // Western Conference - Southwest
  'mavericks': { name: 'Dallas Mavericks', abbrev: 'DAL', espnId: '6', conference: 'West', division: 'Southwest' },
  'rockets': { name: 'Houston Rockets', abbrev: 'HOU', espnId: '10', conference: 'West', division: 'Southwest' },
  'grizzlies': { name: 'Memphis Grizzlies', abbrev: 'MEM', espnId: '29', conference: 'West', division: 'Southwest' },
  'pelicans': { name: 'New Orleans Pelicans', abbrev: 'NOP', espnId: '3', conference: 'West', division: 'Southwest' },
  'spurs': { name: 'San Antonio Spurs', abbrev: 'SAS', espnId: '24', conference: 'West', division: 'Southwest' },
};

const NFL_TEAMS: Record<string, { name: string; abbrev: string; espnId: string; conference: string; division: string }> = {
  // AFC East
  'bills': { name: 'Buffalo Bills', abbrev: 'BUF', espnId: '2', conference: 'AFC', division: 'East' },
  'dolphins': { name: 'Miami Dolphins', abbrev: 'MIA', espnId: '15', conference: 'AFC', division: 'East' },
  'patriots': { name: 'New England Patriots', abbrev: 'NE', espnId: '17', conference: 'AFC', division: 'East' },
  'jets': { name: 'New York Jets', abbrev: 'NYJ', espnId: '20', conference: 'AFC', division: 'East' },
  
  // AFC North
  'ravens': { name: 'Baltimore Ravens', abbrev: 'BAL', espnId: '33', conference: 'AFC', division: 'North' },
  'bengals': { name: 'Cincinnati Bengals', abbrev: 'CIN', espnId: '4', conference: 'AFC', division: 'North' },
  'browns': { name: 'Cleveland Browns', abbrev: 'CLE', espnId: '5', conference: 'AFC', division: 'North' },
  'steelers': { name: 'Pittsburgh Steelers', abbrev: 'PIT', espnId: '23', conference: 'AFC', division: 'North' },
  
  // AFC South
  'texans': { name: 'Houston Texans', abbrev: 'HOU', espnId: '34', conference: 'AFC', division: 'South' },
  'colts': { name: 'Indianapolis Colts', abbrev: 'IND', espnId: '11', conference: 'AFC', division: 'South' },
  'jaguars': { name: 'Jacksonville Jaguars', abbrev: 'JAX', espnId: '30', conference: 'AFC', division: 'South' },
  'titans': { name: 'Tennessee Titans', abbrev: 'TEN', espnId: '10', conference: 'AFC', division: 'South' },
  
  // AFC West
  'broncos': { name: 'Denver Broncos', abbrev: 'DEN', espnId: '7', conference: 'AFC', division: 'West' },
  'chiefs': { name: 'Kansas City Chiefs', abbrev: 'KC', espnId: '12', conference: 'AFC', division: 'West' },
  'raiders': { name: 'Las Vegas Raiders', abbrev: 'LV', espnId: '13', conference: 'AFC', division: 'West' },
  'chargers': { name: 'Los Angeles Chargers', abbrev: 'LAC', espnId: '24', conference: 'AFC', division: 'West' },
  
  // NFC East
  'cowboys': { name: 'Dallas Cowboys', abbrev: 'DAL', espnId: '6', conference: 'NFC', division: 'East' },
  'giants': { name: 'New York Giants', abbrev: 'NYG', espnId: '19', conference: 'NFC', division: 'East' },
  'eagles': { name: 'Philadelphia Eagles', abbrev: 'PHI', espnId: '21', conference: 'NFC', division: 'East' },
  'commanders': { name: 'Washington Commanders', abbrev: 'WAS', espnId: '28', conference: 'NFC', division: 'East' },
  
  // NFC North
  'bears': { name: 'Chicago Bears', abbrev: 'CHI', espnId: '3', conference: 'NFC', division: 'North' },
  'lions': { name: 'Detroit Lions', abbrev: 'DET', espnId: '8', conference: 'NFC', division: 'North' },
  'packers': { name: 'Green Bay Packers', abbrev: 'GB', espnId: '9', conference: 'NFC', division: 'North' },
  'vikings': { name: 'Minnesota Vikings', abbrev: 'MIN', espnId: '16', conference: 'NFC', division: 'North' },
  
  // NFC South
  'falcons': { name: 'Atlanta Falcons', abbrev: 'ATL', espnId: '1', conference: 'NFC', division: 'South' },
  'panthers': { name: 'Carolina Panthers', abbrev: 'CAR', espnId: '29', conference: 'NFC', division: 'South' },
  'saints': { name: 'New Orleans Saints', abbrev: 'NO', espnId: '18', conference: 'NFC', division: 'South' },
  'buccaneers': { name: 'Tampa Bay Buccaneers', abbrev: 'TB', espnId: '27', conference: 'NFC', division: 'South' },
  
  // NFC West
  'cardinals': { name: 'Arizona Cardinals', abbrev: 'ARI', espnId: '22', conference: 'NFC', division: 'West' },
  'rams': { name: 'Los Angeles Rams', abbrev: 'LAR', espnId: '14', conference: 'NFC', division: 'West' },
  '49ers': { name: 'San Francisco 49ers', abbrev: 'SF', espnId: '25', conference: 'NFC', division: 'West' },
  'seahawks': { name: 'Seattle Seahawks', abbrev: 'SEA', espnId: '26', conference: 'NFC', division: 'West' },
};

function getTeamsForLeague(league: League): Record<string, { name: string; abbrev: string; espnId: string; conference: string; division: string }> {
  switch (league) {
    case 'NBA': return NBA_TEAMS;
    case 'NFL': return NFL_TEAMS;
    default: return {};
  }
}

function getESPNSportPath(league: League): string {
  switch (league) {
    case 'NBA': return 'basketball/nba';
    case 'NFL': return 'football/nfl';
    case 'MLB': return 'baseball/mlb';
    case 'NHL': return 'hockey/nhl';
    default: return '';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// HTTP UTILITIES
// ════════════════════════════════════════════════════════════════════════════

async function fetchWithRetry(
  url: string,
  options: { retries?: number; timeout?: number } = {}
): Promise<Response> {
  const { retries = CONFIG.MAX_RETRIES, timeout = CONFIG.FETCH_TIMEOUT_MS } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return response;
      }
      
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
        Logger.warn('Rate limited, waiting', { url, retryAfter, attempt });
        await sleep(retryAfter * 1000);
        continue;
      }
      
      // Don't retry client errors (4xx except 429)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Server error - retry
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new Error(`Request timeout after ${timeout}ms`);
      }
    }
    
    if (attempt < retries) {
      const delay = CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
      Logger.warn('Retrying request', { url, attempt, delay });
      await sleep(delay);
    }
  }
  
  throw lastError || new Error('Unknown fetch error');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ════════════════════════════════════════════════════════════════════════════
// ESPN DATA FETCHERS
// ════════════════════════════════════════════════════════════════════════════

async function fetchTeamRoster(
  league: League,
  teamId: string,
  teamInfo: { name: string; abbrev: string }
): Promise<ESPNAthlete[]> {
  const sportPath = getESPNSportPath(league);
  const url = `${CONFIG.ESPN_BASE_URL}/${sportPath}/teams/${teamId}/roster`;
  
  try {
    const response = await fetchWithRetry(url);
    const data = await response.json();
    
    // ESPN roster structure varies slightly by sport
    const athletes: ESPNAthlete[] = [];
    
    if (data.athletes) {
      // NBA/NFL format: athletes is an array of position groups
      for (const group of data.athletes) {
        if (group.items) {
          athletes.push(...group.items);
        }
      }
    }
    
    // Also check for flat roster format
    if (data.roster?.entries) {
      for (const entry of data.roster.entries) {
        if (entry.athlete) {
          athletes.push(entry.athlete);
        }
      }
    }
    
    Logger.info('Fetched roster', { league, team: teamInfo.abbrev, players: athletes.length });
    
    return athletes;
    
  } catch (error) {
    Logger.error('Failed to fetch roster', error, { league, team: teamInfo.abbrev, teamId });
    return [];
  }
}

async function fetchTeamInjuries(
  league: League,
  teamId: string,
  teamInfo: { name: string; abbrev: string }
): Promise<Array<{ player: string; injury: InjuryInfo }>> {
  const sportPath = getESPNSportPath(league);
  const url = `${CONFIG.ESPN_BASE_URL}/${sportPath}/teams/${teamId}/injuries`;
  
  try {
    const response = await fetchWithRetry(url);
    const data = await response.json();
    
    const injuries: Array<{ player: string; injury: InjuryInfo }> = [];
    
    if (data.team?.injuries) {
      for (const item of data.team.injuries) {
        if (item.athlete && item.injuries?.[0]) {
          injuries.push({
            player: item.athlete.displayName || item.athlete.fullName,
            injury: item.injuries[0],
          });
        }
      }
    }
    
    // Alternative format
    if (data.injuries) {
      for (const item of data.injuries) {
        if (item.athlete && item.type) {
          injuries.push({
            player: item.athlete.displayName,
            injury: {
              type: item.type,
              status: item.status,
              date: item.date,
            },
          });
        }
      }
    }
    
    Logger.info('Fetched injuries', { league, team: teamInfo.abbrev, count: injuries.length });
    
    return injuries;
    
  } catch (error) {
    Logger.error('Failed to fetch injuries', error, { league, team: teamInfo.abbrev });
    return [];
  }
}

// ════════════════════════════════════════════════════════════════════════════
// DATA TRANSFORMERS
// ════════════════════════════════════════════════════════════════════════════

function transformPlayerToKnowledge(
  athlete: ESPNAthlete,
  team: { name: string; abbrev: string; conference: string; division: string },
  league: League
): PlayerData {
  const data: Record<string, unknown> = {
    team: team.name,
    teamAbbr: team.abbrev,
    conference: team.conference,
    division: team.division,
    position: athlete.position?.abbreviation || athlete.position?.name || null,
    jerseyNumber: athlete.jersey ? parseInt(athlete.jersey, 10) : null,
    height: athlete.displayHeight || null,
    weight: athlete.displayWeight || null,
    age: athlete.age || null,
    experience: athlete.experience?.years || null,
    espnId: athlete.id,
    status: athlete.status?.type || 'active',
  };
  
  return {
    entity: athlete.displayName,
    category: 'roster',
    league,
    data,
    source: 'espn',
    sourceUrl: `https://www.espn.com/${getESPNSportPath(league).replace('/', '/')}/player/_/id/${athlete.id}`,
    confidence: 1.0,
  };
}

function transformInjuryToKnowledge(
  playerName: string,
  injury: InjuryInfo,
  team: { name: string; abbrev: string },
  league: League
): PlayerData {
  // Map ESPN status to our enum
  const statusMap: Record<string, string> = {
    'out': 'out',
    'doubtful': 'doubtful',
    'questionable': 'questionable',
    'probable': 'probable',
    'day-to-day': 'day-to-day',
    'injured reserve': 'out',
    'ir': 'out',
    'pup': 'out',
    'suspended': 'out',
  };
  
  const rawStatus = (injury.status || injury.type?.name || 'questionable').toLowerCase();
  const status = statusMap[rawStatus] || 'questionable';
  
  const data: Record<string, unknown> = {
    team: team.name,
    teamAbbr: team.abbrev,
    status,
    description: injury.type?.description || injury.type?.name || 'Injury',
    returnDate: injury.details?.returnDate || null,
    injuryDate: injury.date || null,
    lastUpdated: new Date().toISOString(),
  };
  
  return {
    entity: playerName,
    category: 'injury',
    league,
    data,
    source: 'espn',
    sourceUrl: null,
    confidence: 0.9, // Injury data can change quickly
  };
}

// ════════════════════════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ════════════════════════════════════════════════════════════════════════════

async function upsertKnowledge(
  supabase: SupabaseClient,
  entries: PlayerData[],
  dryRun: boolean
): Promise<{ inserted: number; updated: number; errors: number; errorDetails: string[] }> {
  const stats = { inserted: 0, updated: 0, errors: 0, errorDetails: [] as string[] };
  
  if (dryRun) {
    Logger.info('Dry run - would upsert entries', { count: entries.length });
    return { ...stats, inserted: entries.length };
  }
  
  // Process in batches
  for (let i = 0; i < entries.length; i += CONFIG.BATCH_SIZE) {
    const batch = entries.slice(i, i + CONFIG.BATCH_SIZE);
    
    for (const entry of batch) {
      try {
        // First, invalidate old records by setting valid_until
        const { error: expireError } = await supabase
          .from('sports_knowledge')
          .update({ valid_until: new Date().toISOString() })
          .eq('entity', entry.entity)
          .eq('category', entry.category)
          .eq('league', entry.league)
          .is('valid_until', null);
        
        if (expireError && !expireError.message.includes('0 rows')) {
          Logger.warn('Error expiring old record', { entity: entry.entity, error: expireError.message });
        }
        
        // Insert new record
        const { error: insertError } = await supabase
          .from('sports_knowledge')
          .insert({
            category: entry.category,
            league: entry.league,
            entity: entry.entity,
            data: entry.data,
            valid_from: new Date().toISOString(),
            valid_until: null, // Currently valid
            source: entry.source,
            source_url: entry.sourceUrl,
          });
        
        if (insertError) {
          throw insertError;
        }
        
        stats.inserted++;
        
      } catch (error) {
        stats.errors++;
        const errorMsg = `${entry.entity}: ${error instanceof Error ? error.message : String(error)}`;
        stats.errorDetails.push(errorMsg);
        
        if (stats.errors <= 5) {
          Logger.error('Upsert failed', error, { entity: entry.entity });
        }
      }
    }
    
    // Progress log for large batches
    if (entries.length > CONFIG.BATCH_SIZE) {
      Logger.info('Batch progress', { 
        processed: Math.min(i + CONFIG.BATCH_SIZE, entries.length), 
        total: entries.length 
      });
    }
  }
  
  return stats;
}

// ════════════════════════════════════════════════════════════════════════════
// SYNC ORCHESTRATORS
// ════════════════════════════════════════════════════════════════════════════

async function syncRosters(
  supabase: SupabaseClient,
  league: League,
  specificTeams?: string[],
  dryRun = false
): Promise<SyncStats> {
  const teams = getTeamsForLeague(league);
  const teamKeys = specificTeams || Object.keys(teams);
  
  const allPlayers: PlayerData[] = [];
  const errorDetails: string[] = [];
  
  Logger.info('Starting roster sync', { league, teamCount: teamKeys.length, dryRun });
  
  for (const teamKey of teamKeys) {
    const teamInfo = teams[teamKey];
    if (!teamInfo) {
      errorDetails.push(`Unknown team: ${teamKey}`);
      continue;
    }
    
    const athletes = await fetchTeamRoster(league, teamInfo.espnId, teamInfo);
    
    for (const athlete of athletes) {
      const playerData = transformPlayerToKnowledge(athlete, teamInfo, league);
      allPlayers.push(playerData);
    }
    
    // Rate limiting
    await sleep(CONFIG.DELAY_BETWEEN_TEAMS_MS);
  }
  
  Logger.info('Fetched all rosters', { league, totalPlayers: allPlayers.length });
  
  // Upsert to database
  const dbStats = await upsertKnowledge(supabase, allPlayers, dryRun);
  
  return {
    processed: allPlayers.length,
    inserted: dbStats.inserted,
    updated: dbStats.updated,
    errorCount: dbStats.errors,
    skipped: allPlayers.length - dbStats.inserted - dbStats.updated - dbStats.errors,
    errorDetails: [...errorDetails, ...dbStats.errorDetails.slice(0, 10)],
  };
}

async function syncInjuries(
  supabase: SupabaseClient,
  league: League,
  specificTeams?: string[],
  dryRun = false
): Promise<SyncStats> {
  const teams = getTeamsForLeague(league);
  const teamKeys = specificTeams || Object.keys(teams);
  
  const allInjuries: PlayerData[] = [];
  const errorDetails: string[] = [];
  
  Logger.info('Starting injury sync', { league, teamCount: teamKeys.length, dryRun });
  
  for (const teamKey of teamKeys) {
    const teamInfo = teams[teamKey];
    if (!teamInfo) {
      errorDetails.push(`Unknown team: ${teamKey}`);
      continue;
    }
    
    const injuries = await fetchTeamInjuries(league, teamInfo.espnId, teamInfo);
    
    for (const { player, injury } of injuries) {
      const injuryData = transformInjuryToKnowledge(player, injury, teamInfo, league);
      allInjuries.push(injuryData);
    }
    
    await sleep(CONFIG.DELAY_BETWEEN_TEAMS_MS);
  }
  
  Logger.info('Fetched all injuries', { league, totalInjuries: allInjuries.length });
  
  const dbStats = await upsertKnowledge(supabase, allInjuries, dryRun);
  
  return {
    processed: allInjuries.length,
    inserted: dbStats.inserted,
    updated: dbStats.updated,
    errorCount: dbStats.errors,
    skipped: allInjuries.length - dbStats.inserted - dbStats.updated - dbStats.errors,
    errorDetails: [...errorDetails, ...dbStats.errorDetails.slice(0, 10)],
  };
}

// ════════════════════════════════════════════════════════════════════════════
// CORS HEADERS
// ════════════════════════════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();
  
  Logger.info('Sync request received', { requestId, method: req.method });
  
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }
  
  try {
    // Initialize Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    // Parse request
    const body: SyncRequest = await req.json();
    const { action, league = 'NBA', teams, dryRun = false } = body;
    
    Logger.info('Processing sync', { requestId, action, league, dryRun, teams: teams?.length });
    
    let stats: SyncStats;
    
    switch (action) {
      case 'sync_rosters':
        stats = await syncRosters(supabase, league, teams, dryRun);
        break;
        
      case 'sync_injuries':
        stats = await syncInjuries(supabase, league, teams, dryRun);
        break;
        
      case 'sync_all':
        const rosterStats = await syncRosters(supabase, league, teams, dryRun);
        const injuryStats = await syncInjuries(supabase, league, teams, dryRun);
        
        stats = {
          processed: rosterStats.processed + injuryStats.processed,
          inserted: rosterStats.inserted + injuryStats.inserted,
          updated: rosterStats.updated + injuryStats.updated,
          errorCount: rosterStats.errorCount + injuryStats.errorCount,
          skipped: rosterStats.skipped + injuryStats.skipped,
          errorDetails: [...rosterStats.errorDetails, ...injuryStats.errorDetails],
        };
        break;
        
      case 'manual_upsert':
        // For manual entry - expects body to include entry data
        return new Response(
          JSON.stringify({ error: 'manual_upsert not implemented in this endpoint' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
        
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
    
    const durationMs = Date.now() - startTime;
    
    const result: SyncResult = {
      success: stats.errorCount === 0,
      action,
      league,
      stats: {
        processed: stats.processed,
        inserted: stats.inserted,
        updated: stats.updated,
        errors: stats.errorCount,
        skipped: stats.skipped,
      },
      errors: stats.errorDetails.slice(0, 20), // Limit error output
      durationMs,
      requestId,
      timestamp: new Date().toISOString(),
    };
    
    Logger.info('Sync completed', { requestId, durationMs, stats: result.stats });
    
    return new Response(
      JSON.stringify(result),
      { 
        status: result.success ? 200 : 207, // 207 = Multi-Status (partial success)
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    Logger.error('Sync failed', error, { requestId, durationMs });
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
        durationMs,
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

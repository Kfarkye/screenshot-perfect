/**
 * @hook useLiveGame
 * @description Polls ESPN Scoreboard API for live game data with automatic refresh
 * 
 * @metanotes {
 *   "data_source": "ESPN Scoreboard API (unofficial)",
 *   "polling_interval": "30s for live games, disabled for final/scheduled",
 *   "features": [
 *     "Auto-polling during live games",
 *     "Manual refresh support",
 *     "Graceful error handling",
 *     "Connection state tracking"
 *   ]
 * }
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { League } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type GameStatus = 'scheduled' | 'live' | 'final' | 'postponed' | 'delayed';

export interface LiveGameState {
  gameId: string;
  status: GameStatus;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period: number;
  periodDisplay: string;
  clock: string;
  possession?: 'home' | 'away';
  lastPlay?: string;
  situation?: string;
  venue?: string;
  startTime: Date;
  isComplete: boolean;
}

export interface UseLiveGameOptions {
  pollingInterval?: number; // ms, default 30000
  enabled?: boolean;
}

export interface UseLiveGameReturn {
  game: LiveGameState | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  isLive: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_POLLING_INTERVAL = 30000; // 30 seconds

const LEAGUE_TO_ESPN_SPORT: Record<League, string> = {
  NFL: 'football/nfl',
  NBA: 'basketball/nba',
  NHL: 'hockey/nhl',
};

const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports';

// ─────────────────────────────────────────────────────────────────────────────
// ESPN RESPONSE TYPES (Partial)
// ─────────────────────────────────────────────────────────────────────────────

interface ESPNCompetitor {
  id: string;
  team: {
    id: string;
    abbreviation: string;
    displayName: string;
  };
  score: string;
  homeAway: 'home' | 'away';
}

interface ESPNSituation {
  lastPlay?: {
    text?: string;
  };
  downDistanceText?: string;
  possessionText?: string;
  possession?: string;
}

interface ESPNEvent {
  id: string;
  date: string;
  status: {
    clock: number;
    displayClock: string;
    period: number;
    type: {
      id: string;
      name: string;
      state: 'pre' | 'in' | 'post';
      completed: boolean;
      description: string;
    };
  };
  competitions: Array<{
    id: string;
    venue?: { fullName: string };
    competitors: ESPNCompetitor[];
    situation?: ESPNSituation;
  }>;
}

interface ESPNScoreboardResponse {
  events: ESPNEvent[];
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER
// ─────────────────────────────────────────────────────────────────────────────

function parseESPNEvent(event: ESPNEvent, league: League): LiveGameState {
  const competition = event.competitions[0];
  const homeCompetitor = competition.competitors.find(c => c.homeAway === 'home');
  const awayCompetitor = competition.competitors.find(c => c.homeAway === 'away');

  if (!homeCompetitor || !awayCompetitor) {
    throw new Error('Invalid game data: missing competitors');
  }

  // Map ESPN status to our status
  let status: GameStatus = 'scheduled';
  if (event.status.type.state === 'in') {
    status = 'live';
  } else if (event.status.type.state === 'post') {
    status = 'final';
  } else if (event.status.type.name === 'STATUS_POSTPONED') {
    status = 'postponed';
  } else if (event.status.type.name === 'STATUS_DELAYED') {
    status = 'delayed';
  }

  // Get period display
  const periodDisplay = getPeriodDisplay(league, event.status.period, status);

  // Get possession (NFL/NBA specific)
  let possession: 'home' | 'away' | undefined;
  if (competition.situation?.possession) {
    const possessionTeamId = competition.situation.possession;
    if (possessionTeamId === homeCompetitor.team.id) {
      possession = 'home';
    } else if (possessionTeamId === awayCompetitor.team.id) {
      possession = 'away';
    }
  }

  return {
    gameId: event.id,
    status,
    homeTeam: homeCompetitor.team.abbreviation,
    awayTeam: awayCompetitor.team.abbreviation,
    homeScore: parseInt(homeCompetitor.score || '0', 10),
    awayScore: parseInt(awayCompetitor.score || '0', 10),
    period: event.status.period,
    periodDisplay,
    clock: event.status.displayClock || '--:--',
    possession,
    lastPlay: competition.situation?.lastPlay?.text,
    situation: competition.situation?.downDistanceText,
    venue: competition.venue?.fullName,
    startTime: new Date(event.date),
    isComplete: event.status.type.completed,
  };
}

function getPeriodDisplay(league: League, period: number, status: GameStatus): string {
  if (status === 'scheduled') return 'Scheduled';
  if (status === 'final') return 'Final';
  if (status === 'postponed') return 'Postponed';
  if (status === 'delayed') return 'Delayed';

  const labels: Record<League, Record<number, string>> = {
    NFL: { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: 'OT' },
    NBA: { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: 'OT', 6: '2OT', 7: '3OT' },
    NHL: { 1: '1st', 2: '2nd', 3: '3rd', 4: 'OT', 5: 'SO' },
  };

  return labels[league]?.[period] || `P${period}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

export function useLiveGame(
  gameId: string | undefined,
  league: League,
  options: UseLiveGameOptions = {}
): UseLiveGameReturn {
  const { 
    pollingInterval = DEFAULT_POLLING_INTERVAL,
    enabled = true 
  } = options;

  const [game, setGame] = useState<LiveGameState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch game data
  const fetchGame = useCallback(async (isRefresh = false) => {
    if (!gameId || !enabled) return;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const sport = LEAGUE_TO_ESPN_SPORT[league];
      const url = `${ESPN_BASE_URL}/${sport}/scoreboard`;

      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`ESPN API error: ${response.status}`);
      }

      const data: ESPNScoreboardResponse = await response.json();

      // Find our game in the events
      const event = data.events.find(e => e.id === gameId);

      if (!event) {
        // Game might not be on today's scoreboard
        // Try to preserve existing state if we had it
        if (!game) {
          throw new Error('Game not found in scoreboard');
        }
        return;
      }

      const parsedGame = parseESPNEvent(event, league);
      setGame(parsedGame);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Ignore abort errors
        return;
      }
      console.error('[useLiveGame] Fetch error:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [gameId, league, enabled, game]);

  // Manual refresh
  const refresh = useCallback(async () => {
    await fetchGame(true);
  }, [fetchGame]);

  // Initial fetch
  useEffect(() => {
    fetchGame(false);
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [gameId, league, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling for live games
  useEffect(() => {
    // Only poll if game is live
    const shouldPoll = enabled && game?.status === 'live' && !game?.isComplete;

    if (shouldPoll) {
      pollingRef.current = setInterval(() => {
        fetchGame(true);
      }, pollingInterval);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [enabled, game?.status, game?.isComplete, pollingInterval, fetchGame]);

  // Derived state
  const isLive = useMemo(() => {
    return game?.status === 'live' && !game?.isComplete;
  }, [game?.status, game?.isComplete]);

  return {
    game,
    isLoading,
    isRefreshing,
    error,
    lastUpdated,
    refresh,
    isLive,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER HOOK: Determine which modal to show
// ─────────────────────────────────────────────────────────────────────────────

export type ModalType = 'pick' | 'live' | 'result';

export function useGameModalType(status: GameStatus | undefined): ModalType {
  return useMemo(() => {
    if (!status) return 'pick';
    
    switch (status) {
      case 'live':
      case 'delayed':
        return 'live';
      case 'final':
        return 'result';
      case 'scheduled':
      case 'postponed':
      default:
        return 'pick';
    }
  }, [status]);
}

export default useLiveGame;

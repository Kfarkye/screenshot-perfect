/**
 * @hook useFeaturedPicks
 * @description Fetches AI-generated picks filtered by sport/league
 * 
 * @metanotes {
 *   "fixes": [
 *     "Filter analysis_memory by sport column",
 *     "Query correct games table per league",
 *     "Handle missing game data gracefully"
 *   ],
 *   "schema_dependency": "analysis_memory.sport column must exist"
 * }
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { League } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface FeaturedPick {
  id: string;
  title: string;
  author: string;
  timeAgo: string;
  imageUrl: string;
  type: 'Analysis' | 'Pick' | 'Video' | 'Props';
  league: League;
  tag: string;
  confidence?: number;
  isPremium?: boolean;
  gameId?: string;
  pickSide?: string;
  reasoning?: string;
}

interface AnalysisMemoryRow {
  id: string;
  game_id: string;
  market_type: string;
  pick_side: string;
  confidence_score: number;
  reasoning_text: string;
  created_at: string;
  sport: string;
}

interface GameRow {
  game_id: string;
  away_team: string;
  home_team: string;
  game_date: string;
  start_time: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps League enum to database sport value
 * Must match values stored in analysis_memory.sport column
 */
const LEAGUE_TO_SPORT = {
  NHL: 'NHL',
  NFL: 'NFL', 
  NBA: 'NBA',
} as const;

/**
 * Maps League to the correct games table
 */
const LEAGUE_TO_TABLE: Record<League, string> = {
  NHL: 'nhl_games', // Note: You may need to create this table
  NFL: 'nfl_games',
  NBA: 'nba_games',
};

/**
 * Sport-specific placeholder images
 */
const LEAGUE_IMAGES: Record<League, readonly string[]> = {
  NHL: [
    'https://images.unsplash.com/photo-1515703407324-5f753afd8be8?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1580748141549-71748dbe0bdc?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1599307222108-6878b6680a65?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1551103212-f4728f321d5a?q=80&w=600&auto=format&fit=crop',
  ],
  NFL: [
    'https://images.unsplash.com/photo-1628717341663-0007b0ee2597?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1598550476439-6847785fcea6?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1518605348400-43ded60bdf08?q=80&w=600&auto=format&fit=crop',
  ],
  NBA: [
    'https://images.unsplash.com/photo-1504450758481-7338eba7524a?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1519861531473-920026393112?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=600&auto=format&fit=crop',
  ],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const getRandomImage = (league: League, index: number): string => {
  const images = LEAGUE_IMAGES[league];
  // Use index for deterministic selection (avoids flicker on re-render)
  return images[index % images.length];
};

const getTimeAgo = (dateString: string): string => {
  const now = Date.now();
  const created = new Date(dateString).getTime();
  const diffMs = now - created;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return `${Math.floor(diffDays / 7)}w`;
};

const getMarketTag = (marketType: string): string => {
  const tags: Record<string, string> = {
    spread: 'Spread Pick',
    puckline: 'Puck Line',
    moneyline: 'Moneyline',
    total: 'Over/Under',
    prop: 'Player Props',
    player_prop: 'Player Props',
  };
  return tags[marketType?.toLowerCase()] || 'Best Bet';
};

const getArticleType = (marketType: string): FeaturedPick['type'] => {
  const lower = marketType?.toLowerCase() || '';
  if (lower.includes('prop')) return 'Props';
  if (lower === 'moneyline' || lower === 'spread' || lower === 'puckline') return 'Pick';
  return 'Analysis';
};

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

export const useFeaturedPicks = (league: League) => {
  const [picks, setPicks] = useState<FeaturedPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPicks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const sport = LEAGUE_TO_SPORT[league];

      // ─────────────────────────────────────────────────────────────────────
      // Step 1: Fetch picks filtered by sport
      // ─────────────────────────────────────────────────────────────────────
      const { data: memoryData, error: memoryError } = await supabase
        .from('analysis_memory')
        .select('id, game_id, market_type, pick_side, confidence_score, reasoning_text, created_at, sport')
        .eq('sport', sport) // ← CRITICAL FIX: Filter by sport
        .gte('confidence_score', 65) // Slightly lower threshold to get more picks
        .order('confidence_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(8);

      if (memoryError) {
        console.error('[useFeaturedPicks] analysis_memory query failed:', memoryError);
        throw memoryError;
      }

      if (!memoryData || memoryData.length === 0) {
        setPicks([]);
        return;
      }

      // ─────────────────────────────────────────────────────────────────────
      // Step 2: Fetch game details from correct table
      // ─────────────────────────────────────────────────────────────────────
      const gameIds = [...new Set(memoryData.map((m) => m.game_id))];

      let gamesMap = new Map<string, GameRow>();

      // Query the appropriate table based on league
      try {
        let gamesData: GameRow[] | null = null;

        if (league === 'NFL') {
          const { data, error } = await supabase
            .from('nfl_games')
            .select('game_id, away_team, home_team, game_date, start_time')
            .in('game_id', gameIds);
          if (!error && data) gamesData = data;
        } else if (league === 'NBA') {
          const { data, error } = await supabase
            .from('nba_games')
            .select('game_id, away_team, home_team, game_date, start_time')
            .in('game_id', gameIds);
          if (!error && data) gamesData = data;
        }
        // NHL table may not exist yet - falls through to empty gamesMap

        if (gamesData) {
          gamesMap = new Map(gamesData.map((g) => [g.game_id, g]));
        }
      } catch (gamesError) {
        // Log but don't fail - picks can display without game context
        console.warn(`[useFeaturedPicks] Games query failed for ${league}:`, gamesError);
      }

      // ─────────────────────────────────────────────────────────────────────
      // Step 3: Transform to FeaturedPick[]
      // ─────────────────────────────────────────────────────────────────────
      const featuredPicks: FeaturedPick[] = memoryData.map((pick, idx) => {
        const game = gamesMap.get(pick.game_id);
        const isPremium = pick.confidence_score >= 80;
        const marketTag = getMarketTag(pick.market_type);

        // Build title with or without game context
        let title: string;
        if (game) {
          title = `${game.away_team} @ ${game.home_team}: ${pick.pick_side}`;
        } else {
          // Fallback: use pick_side which often contains team info
          title = `${marketTag}: ${pick.pick_side}`;
        }

        return {
          id: pick.id,
          title,
          author: 'SharpEdge AI',
          timeAgo: getTimeAgo(pick.created_at),
          imageUrl: getRandomImage(league, idx),
          type: getArticleType(pick.market_type),
          league,
          tag: isPremium ? 'Premium Pick' : marketTag,
          confidence: pick.confidence_score,
          isPremium,
          gameId: pick.game_id,
          pickSide: pick.pick_side,
          reasoning: pick.reasoning_text,
        };
      });

      setPicks(featuredPicks);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch picks';
      console.error('[useFeaturedPicks] Error:', message);
      setError(message);
      setPicks([]);
    } finally {
      setLoading(false);
    }
  }, [league]);

  // Fetch on mount and league change
  useEffect(() => {
    fetchPicks();
  }, [fetchPicks]);

  // Expose refetch for manual refresh
  return { 
    picks, 
    loading, 
    error,
    refetch: fetchPicks,
  };
};

export default useFeaturedPicks;

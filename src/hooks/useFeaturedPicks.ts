import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { League } from '@/types';

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
}

const LEAGUE_IMAGES: Record<League, string[]> = {
  NHL: [
    'https://images.unsplash.com/photo-1515703407324-5f753afd8be8?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1580748141549-71748dbe0bdc?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1599307222108-6878b6680a65?q=80&w=600&auto=format&fit=crop',
  ],
  NFL: [
    'https://images.unsplash.com/photo-1628717341663-0007b0ee2597?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1598550476439-6847785fcea6?q=80&w=600&auto=format&fit=crop',
  ],
  NBA: [
    'https://images.unsplash.com/photo-1504450758481-7338eba7524a?q=80&w=600&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1519861531473-920026393112?q=80&w=600&auto=format&fit=crop',
  ],
};

const getRandomImage = (league: League): string => {
  const images = LEAGUE_IMAGES[league];
  return images[Math.floor(Math.random() * images.length)];
};

const getTimeAgo = (date: string): string => {
  const now = new Date();
  const created = new Date(date);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
};

const getMarketTag = (marketType: string): string => {
  const tags: Record<string, string> = {
    spread: 'Spread Pick',
    moneyline: 'Moneyline',
    total: 'Over/Under',
    prop: 'Player Props',
  };
  return tags[marketType] || 'Best Bet';
};

export const useFeaturedPicks = (league: League) => {
  const [picks, setPicks] = useState<FeaturedPick[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPicks = async () => {
      try {
        setLoading(true);
        
        const sportMap: Record<League, string> = {
          NHL: 'icehockey_nhl',
          NFL: 'americanfootball_nfl',
          NBA: 'basketball_nba',
        };

        // Fetch recent picks with high confidence (premium picks)
        const { data: memoryData, error: memoryError } = await supabase
          .from('analysis_memory')
          .select('*')
          .gte('confidence_score', 70)
          .order('created_at', { ascending: false })
          .limit(6);

        if (memoryError) throw memoryError;

        if (!memoryData || memoryData.length === 0) {
          setPicks([]);
          return;
        }

        // Fetch game details for these picks
        const gameIds = [...new Set(memoryData.map(m => m.game_id))];
        
        const { data: gamesData, error: gamesError } = await supabase
          .from('nfl_games')
          .select('*')
          .in('game_id', gameIds);

        if (gamesError) throw gamesError;

        const gamesMap = new Map(gamesData?.map(g => [g.game_id, g]) || []);

        const featuredPicks: FeaturedPick[] = memoryData.map((pick, idx) => {
          const game = gamesMap.get(pick.game_id);
          const isPremium = pick.confidence_score >= 80;
          
          return {
            id: pick.id,
            title: game 
              ? `${game.away_team} vs ${game.home_team}: ${getMarketTag(pick.market_type)} - ${pick.pick_side}`
              : `${getMarketTag(pick.market_type)}: ${pick.pick_side}`,
            author: 'SharpEdge AI',
            timeAgo: getTimeAgo(pick.created_at),
            imageUrl: getRandomImage(league),
            type: pick.market_type === 'prop' ? 'Props' : 'Pick',
            league,
            tag: isPremium ? 'Premium Pick' : getMarketTag(pick.market_type),
            confidence: pick.confidence_score,
            isPremium,
          };
        });

        setPicks(featuredPicks);
      } catch (error) {
        console.error('Error fetching featured picks:', error);
        setPicks([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPicks();
  }, [league]);

  return { picks, loading };
};

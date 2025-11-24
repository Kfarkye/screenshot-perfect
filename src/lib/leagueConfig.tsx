import { Trophy, Disc, Circle } from 'lucide-react';
import type { League } from '@/types';

export interface LeagueConfig {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  gradient: string;
  marketLabels: {
    moneyline: string;
    spread: string;
    total: string;
  };
}

export const LEAGUE_CONFIGS: Record<League, LeagueConfig> = {
  NHL: {
    name: 'NHL',
    icon: Disc,
    color: 'hsl(199 89% 48%)', // Ice blue
    gradient: 'from-blue-500 to-cyan-500',
    marketLabels: {
      moneyline: 'ML',
      spread: 'Puck Line',
      total: 'Total',
    },
  },
  NFL: {
    name: 'NFL',
    icon: Trophy,
    color: 'hsl(142 76% 36%)', // Green
    gradient: 'from-green-600 to-emerald-600',
    marketLabels: {
      moneyline: 'ML',
      spread: 'Spread',
      total: 'Total',
    },
  },
  NBA: {
    name: 'NBA',
    icon: Circle,
    color: 'hsl(24 95% 53%)', // Orange
    gradient: 'from-orange-500 to-red-500',
    marketLabels: {
      moneyline: 'ML',
      spread: 'Spread',
      total: 'Total',
    },
  },
};

export const ALL_LEAGUES: League[] = ['NHL', 'NFL', 'NBA'];

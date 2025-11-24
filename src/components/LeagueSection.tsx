import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LEAGUE_CONFIGS } from '@/lib/leagueConfig';
import { GameRow } from './GameRow';
import type { GameData, League } from '@/types';

interface LeagueSectionProps {
  league: League;
  games: GameData[];
  bookmaker: string;
}

export function LeagueSection({ league, games, bookmaker }: LeagueSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const config = LEAGUE_CONFIGS[league];
  const Icon = config.icon;

  if (games.length === 0) {
    return null;
  }

  return (
    <section className="mb-6">
      {/* Section Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-secondary hover:bg-surface-tertiary/50 transition-colors duration-200 group"
        aria-expanded={!isCollapsed}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-5 h-5 flex items-center justify-center"
            style={{ color: config.color }}
          >
            <Icon className="w-full h-full" />
          </div>
          <h2 className="text-sm font-bold text-content-primary uppercase tracking-wide">
            {config.name}
          </h2>
          <span className="text-xs text-content-tertiary font-medium">
            · {games.length} {games.length === 1 ? 'game' : 'games'}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-content-tertiary transition-transform duration-200",
            "group-hover:text-content-secondary",
            isCollapsed && "rotate-180"
          )}
        />
      </button>

      {/* Games List */}
      {!isCollapsed && (
        <div className="divide-y divide-border">
          {games.map((game) => (
            <GameRow
              key={game.id}
              game={game}
              bookmaker={bookmaker}
            />
          ))}
        </div>
      )}
    </section>
  );
}

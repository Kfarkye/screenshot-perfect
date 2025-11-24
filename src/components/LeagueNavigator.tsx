import { useState } from 'react';
import { cn } from '@/lib/utils';
import { LEAGUE_CONFIGS, ALL_LEAGUES } from '@/lib/leagueConfig';
import type { League } from '@/types';

interface LeagueNavigatorProps {
  selectedLeagues: League[];
  onLeagueToggle: (league: League) => void;
}

export function LeagueNavigator({ selectedLeagues, onLeagueToggle }: LeagueNavigatorProps) {
  const [showAll, setShowAll] = useState(selectedLeagues.length === ALL_LEAGUES.length);

  const handleAllClick = () => {
    if (showAll) {
      // Deselect all
      ALL_LEAGUES.forEach(league => {
        if (selectedLeagues.includes(league)) {
          onLeagueToggle(league);
        }
      });
    } else {
      // Select all
      ALL_LEAGUES.forEach(league => {
        if (!selectedLeagues.includes(league)) {
          onLeagueToggle(league);
        }
      });
    }
    setShowAll(!showAll);
  };

  return (
    <nav 
      className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border"
      aria-label="League selection"
    >
      <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
        {/* ALL button */}
        <button
          onClick={handleAllClick}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-all duration-200",
            "hover:bg-surface-secondary active:scale-95",
            showAll
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-surface-secondary text-content-secondary"
          )}
          aria-pressed={showAll}
        >
          <span className="text-sm">ALL</span>
        </button>

        <div className="w-px h-6 bg-border" />

        {/* League buttons */}
        {ALL_LEAGUES.map((league) => {
          const config = LEAGUE_CONFIGS[league];
          const Icon = config.icon;
          const isSelected = selectedLeagues.includes(league);

          return (
            <button
              key={league}
              onClick={() => onLeagueToggle(league)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-all duration-200",
                "hover:bg-surface-secondary active:scale-95",
                isSelected
                  ? "bg-surface-secondary text-content-primary shadow-sm border-2"
                  : "bg-transparent text-content-tertiary border-2 border-transparent"
              )}
              style={isSelected ? { borderColor: config.color } : undefined}
              aria-pressed={isSelected}
              aria-label={`${config.name} games`}
            >
              <Icon 
                className="w-4 h-4" 
              />
              <span className="text-sm font-semibold">{config.name}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

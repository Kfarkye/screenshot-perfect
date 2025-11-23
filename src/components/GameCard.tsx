import React, { useState, useMemo, useCallback } from 'react';
import type { GameData, MarketData } from '../types';
import { Clock, TrendingUp, Activity, Lock, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

const LOGO_SIZE = 40;

const getEspnLogoUrl = (abbr: string, league: 'NHL' | 'NFL' = 'NHL'): string => {
    const code = abbr.toLowerCase();
    const sportPath = league === 'NHL' ? 'nhl' : 'nfl';
    const size = LOGO_SIZE * 2;
    return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500/${code}.png&h=${size}&w=${size}&lossy=1`;
}

const parseLine = (plString: string | undefined): { line: string, juice: string } => {
    if (!plString || plString === '-' || plString === 'N/A') {
        return { line: '-', juice: '' };
    }
    const match = plString.match(/([+-]?\d*\.?\d+|PK)\s*\(?([+-]?\d+)?\)?/i);
    if (match && match[1]) {
        return { line: match[1], juice: match[2] || '' };
    }
    return { line: plString.trim(), juice: '' };
};

interface TeamLogoProps {
    teamAbbr: string;
    teamName: string;
    league: 'NHL' | 'NFL';
}

const TeamLogo = React.memo(({ teamAbbr, teamName, league }: TeamLogoProps) => {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const src = useMemo(() => getEspnLogoUrl(teamAbbr, league), [teamAbbr, league]);

  const handleError = useCallback(() => {
    if (loadState !== 'error') {
        setLoadState('error');
    }
  }, [loadState]);

  const handleLoad = useCallback(() => {
    setLoadState('loaded');
  }, []);

  if (loadState === 'error') {
    return (
      <div className="w-10 h-10 rounded-lg bg-surfaceHighlight flex items-center justify-center border border-border/10 shadow-inner" title={`${teamName} logo failed to load`}>
        <span className="text-xs font-bold text-textSecondary tracking-wider">{teamAbbr.substring(0, 3)}</span>
      </div>
    );
  }

  return (
    <>
      <img
        src={src}
        alt={`${teamName} logo`}
        className={cn(
          "w-10 h-10 object-contain transition-opacity duration-300",
          loadState === 'loaded' ? 'opacity-100' : 'opacity-0'
        )}
        onError={handleError}
        onLoad={handleLoad}
        loading="lazy"
      />
      {loadState === 'loading' && (
        <div className="absolute inset-0 w-10 h-10 rounded-lg bg-surfaceHighlight animate-pulse" />
      )}
    </>
  );
});

TeamLogo.displayName = 'TeamLogo';

interface GameCardProps {
  game: GameData;
  selectedBook: string;
  onAnalyze?: (game: GameData) => void;
}

export const GameCard: React.FC<GameCardProps> = ({ game, selectedBook, onAnalyze }) => {
  const homeMarket = game.markets[selectedBook]?.home;
  const awayMarket = game.markets[selectedBook]?.away;

  const gameTime = new Date(game.startTime);
  const timeStr = gameTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const handleAnalyzeClick = useCallback(() => {
    if (onAnalyze) {
      onAnalyze(game);
    }
  }, [game, onAnalyze]);

  return (
    <div className="group bg-card border border-border rounded-lg p-4 hover:border-primary/40 transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-textSecondary text-sm">
          <Clock size={14} />
          <span className="font-medium">{timeStr}</span>
        </div>
        {game.status === 'live' && (
          <div className="flex items-center gap-1.5 text-success text-xs font-semibold">
            <Activity size={12} className="animate-pulse" />
            LIVE
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TeamLogo teamAbbr={game.awayAbbr} teamName={game.awayTeam} league={game.league} />
            <div>
              <p className="font-semibold text-foreground">{game.awayTeam}</p>
              <p className="text-xs text-textSecondary">Away</p>
            </div>
          </div>
          <div className="flex gap-3 text-sm font-mono">
            <span className={cn("min-w-[60px] text-right", awayMarket?.spread ? "text-foreground" : "text-muted-foreground")}>
              {parseLine(awayMarket?.spread).line}
            </span>
            <span className={cn("min-w-[60px] text-right", awayMarket?.moneyline ? "text-foreground" : "text-muted-foreground")}>
              {awayMarket?.moneyline || '-'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TeamLogo teamAbbr={game.homeAbbr} teamName={game.homeTeam} league={game.league} />
            <div>
              <p className="font-semibold text-foreground">{game.homeTeam}</p>
              <p className="text-xs text-textSecondary">Home</p>
            </div>
          </div>
          <div className="flex gap-3 text-sm font-mono">
            <span className={cn("min-w-[60px] text-right", homeMarket?.spread ? "text-foreground" : "text-muted-foreground")}>
              {parseLine(homeMarket?.spread).line}
            </span>
            <span className={cn("min-w-[60px] text-right", homeMarket?.moneyline ? "text-foreground" : "text-muted-foreground")}>
              {homeMarket?.moneyline || '-'}
            </span>
          </div>
        </div>
      </div>

      {onAnalyze && (
        <button
          onClick={handleAnalyzeClick}
          className="w-full mt-4 py-2 px-4 bg-primary/10 hover:bg-primary/20 text-primary rounded-md text-sm font-medium transition-colors duration-200 flex items-center justify-center gap-2"
        >
          <TrendingUp size={16} />
          Analyze Game
        </button>
      )}
    </div>
  );
};

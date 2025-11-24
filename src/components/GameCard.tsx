
import React, { useState, useMemo, useCallback } from 'react';
import type { GameData, MarketData } from '../types';
import { Clock, TrendingUp, Activity, Lock, ArrowUp, ArrowDown, AlertTriangle, Sparkles } from 'lucide-react';
import { PickDisplay } from './PickDisplay';
import { PickDetailModal } from './PickDetailModal';
import { generatePick } from '../services/pickGenerator';
import { useToast } from '../hooks/use-toast';

const observability = {
  trackEvent: (event: string, properties: Record<string, unknown> = {}) => {},
  logError: (error: unknown, context: string, metadata: Record<string, any> = {}) => {
    console.error(JSON.stringify({ level: 'error', timestamp: new Date().toISOString(), context, error: error instanceof Error ? error.message : String(error), metadata }));
  }
};

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

const LOGO_SIZE = 40;

const getEspnLogoUrl = (abbr: string, league: 'NHL' | 'NFL' | 'NBA' = 'NHL'): string => {
    // Basic mapping check - NFL generally uses simple codes, NHL has quirks
    // We lowercase abbr for ESPN CDN pattern
    const code = abbr.toLowerCase();
    const sportPath = league === 'NHL' ? 'nhl' : league === 'NFL' ? 'nfl' : 'nba';
    // NFL uses same CDN structure
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
    league: 'NHL' | 'NFL' | 'NBA';
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
    <div className="w-10 h-10 flex items-center justify-center relative">
       {loadState === 'loading' && (
           <div className="absolute inset-0 rounded-lg bg-surfaceHighlight/50 animate-pulse" aria-hidden="true" />
       )}
       <img 
         src={src} 
         alt={`${teamName} logo`}
         className={cn(
            "w-full h-full object-contain transition-all duration-500 ease-cubic-bezier",
            loadState === 'loaded' ? 'opacity-100 scale-100 group-hover/card:scale-110 drop-shadow-md' : 'opacity-0 scale-90'
         )}
         onError={handleError}
         onLoad={handleLoad}
         loading="lazy"
         decoding="async"
         width={LOGO_SIZE}
         height={LOGO_SIZE}
       />
    </div>
  );
});
TeamLogo.displayName = 'TeamLogo';

interface OddsCellProps {
  label: string;
  main: string;
  sub?: string;
  isFavorite?: boolean;
  isDisabled?: boolean;
  movement?: 'up' | 'down' | 'none';
  onClick?: () => void;
}

const OddsCell = React.memo(({ label, main, sub, isFavorite = false, isDisabled = false, movement = 'none', onClick }: OddsCellProps) => {
    const isInteractive = !!onClick && !isDisabled && main !== '-';
    
    const ariaLabel = useMemo(() => {
        if (isDisabled || main === '-') return `${label} currently unavailable`;
        return `${label}: ${main} ${sub ? `at ${sub} odds` : ''}.${isFavorite ? ' Favorite.' : ''}`;
    }, [label, main, sub, isFavorite, isDisabled]);

    const mainColor = useMemo(() => {
        if (isDisabled) return 'text-textTertiary/70';
        if (movement === 'up') return 'text-success';
        if (movement === 'down') return 'text-danger';
        return isFavorite ? 'text-accent' : 'text-textPrimary';
    }, [isFavorite, isDisabled, movement]);

    return (
        <button
            onClick={isInteractive ? onClick : undefined}
            disabled={!isInteractive}
            aria-label={ariaLabel}
            className={cn(
                "group/odds relative flex flex-col items-center justify-center py-3.5 px-2 rounded-xl border transition-all duration-300 select-none focus-visible:outline-none overflow-hidden",
                !isInteractive
                ? 'bg-transparent border-transparent opacity-40 cursor-default'
                : isFavorite
                    ? 'bg-accent/8 border-accent/25 hover:bg-accent/14 hover:border-accent/40 shadow-glow-accent-sm hover:shadow-md cursor-pointer motion-safe:hover:scale-105 active:scale-100'
                    : 'bg-surfaceHighlight/50 border-border/10 hover:border-border/30 hover:bg-surfaceHighlight/80 cursor-pointer motion-safe:hover:scale-105 active:scale-100 hover:shadow-sm',
                isInteractive && "focus-visible:ring-2 focus-visible:ring-accent focus-visible:z-10"
            )}
            style={isInteractive ? { willChange: 'transform' } : undefined}
        >
            {/* Subtle shimmer effect on hover */}
            {isInteractive && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover/odds:opacity-100 group-hover/odds:translate-x-full transition-all duration-700 -translate-x-full" aria-hidden="true" />
            )}

            {movement !== 'none' && isInteractive && (
                <div className="absolute left-1.5 top-1.5 z-10" aria-hidden="true">
                    {movement === 'up' ? <ArrowUp size={11} className="text-success" strokeWidth={3} /> : <ArrowDown size={11} className="text-danger" strokeWidth={3} />}
                </div>
            )}
            <span className={cn("font-mono text-base font-bold tabular-nums tracking-tight z-10 transition-colors duration-300", mainColor)}>
                {main}
            </span>
            {sub && (
                <span className={cn("text-[10px] font-mono mt-1 tabular-nums z-10 transition-colors duration-300", isFavorite && isInteractive ? 'text-accent/70 group-hover/odds:text-accent' : 'text-textSecondary group-hover/odds:text-textPrimary')}>
                    {sub}
                </span>
            )}
        </button>
    );
});
OddsCell.displayName = 'OddsCell';

interface StatusBadgeProps {
    status: GameData['status'];
    time: string;
}

const StatusBadge = React.memo(({ status, time }: StatusBadgeProps) => {
    switch (status) {
        case 'Live':
            return (
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-danger/15 border border-danger/30 shadow-md" role="status" aria-label="Game is live">
                    <Activity size={12} className="text-danger motion-safe:animate-pulse" strokeWidth={3} />
                    <span className="text-xs font-bold text-danger tracking-wider uppercase">Live</span>
                </div>
            );
        case 'Final': return <span className="text-xs font-semibold text-textTertiary uppercase tracking-widest">Final</span>;
        case 'Postponed':
        case 'Canceled':
            return (
                 <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/20 border border-warning/40">
                    <AlertTriangle size={12} className="text-warning" />
                    <span className="text-[11px] font-bold text-warning tracking-wider uppercase">{status === 'Postponed' ? 'PPD' : status}</span>
                </div>
            );
        default:
            return (
                <div className="flex items-center gap-2 text-textSecondary hover:text-textPrimary transition-colors">
                    <Clock size={14} />
                    <span className="text-sm font-medium font-mono tracking-tight">{time} ET</span>
                </div>
            );
    }
});
StatusBadge.displayName = 'StatusBadge';

interface GameCardProps {
  game: GameData;
  selectedBook: string;
  onAnalyze?: (game: GameData) => void;
  onBetClick?: (gameId: string, betType: string, team: 'away' | 'home' | 'over' | 'under', odds: MarketData) => void;
}

export const GameCard = React.memo(({ game, selectedBook, onAnalyze, onBetClick }: GameCardProps) => {
  const { id, status, awayTeam, homeTeam, awayRecord, homeRecord, time, odds: allOdds, league } = game;
  const [pickData, setPickData] = useState(game.pick);
  const [isGeneratingPick, setIsGeneratingPick] = useState(false);
  const [showPickModal, setShowPickModal] = useState(false);
  const { toast } = useToast();
  const awayTeamName = awayTeam; 
  const homeTeamName = homeTeam;

  const isLive = status === 'Live';
  const isFinal = status === 'Final';
  const isConcluded = isFinal || status === 'Canceled' || status === 'Postponed';

  const scores = useMemo(() => ({
    away: parseInt(game.awayScore || '0', 10) || 0,
    home: parseInt(game.homeScore || '0', 10) || 0,
  }), [game.awayScore, game.homeScore]);

  const showScores = isLive || isFinal;

  const winner = useMemo(() => {
    if (!isFinal) return null;
    if (scores.away > scores.home) return 'away';
    if (scores.home > scores.away) return 'home';
    return 'tie'; 
  }, [isFinal, scores]);

  const odds = useMemo(() => {
    return allOdds[selectedBook] || allOdds.generic || null;
  }, [allOdds, selectedBook]);

  const processedOdds = useMemo(() => {
    if (!odds) return null;
    const awayPL = parseLine(odds.awayPL);
    const homePL = parseLine(odds.homePL);
    const total = (odds.total && odds.total !== 'N/A' && odds.total !== '-') ? odds.total.trim() : '-';
    const awayML = parseInt(odds.awayML, 10) || 0;
    const homeML = parseInt(odds.homeML, 10) || 0;
    let mlFavorite: 'away' | 'home' | 'pickem' | null = null;
    if (awayML < 0 && homeML >= 0) mlFavorite = 'away';
    else if (homeML < 0 && awayML >= 0) mlFavorite = 'home';
    else if (awayML < 0 && homeML < 0) mlFavorite = 'pickem';
    
    return { ...odds, awayPL, homePL, total, mlFavorite, movement: {} as any };
  }, [odds]);

  const hasOdds = processedOdds !== null;
  const boardLocked = isConcluded || !hasOdds;
  
  // Terminology Switch
  const spreadLabel = league === 'NHL' ? 'Puck Line' : 'Spread';

  const handleAnalyzeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (onAnalyze) onAnalyze(game);
  }, [onAnalyze, game]);

  const handleBet = useCallback((type: string, team: 'away' | 'home' | 'over' | 'under') => {
      if (onBetClick && odds && !boardLocked) onBetClick(id, type, team, odds);
  }, [onBetClick, id, odds, selectedBook, boardLocked]);

  const handleGeneratePick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (boardLocked) {
      toast({
        title: "Markets Closed",
        description: "Cannot generate picks for concluded games.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingPick(true);
    
    try {
      const pick = await generatePick(game, 'moneyline');
      setPickData(pick);
      toast({
        title: "Pick Generated",
        description: `${pick.confidence_score}% confidence on ${pick.pick_side}`,
      });
    } catch (error) {
      console.error('Pick generation failed:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Could not generate pick",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPick(false);
    }
  }, [game, boardLocked, toast]);

  return (
    <article
        className="relative overflow-hidden mb-4 rounded-2xl border border-gray-200/50 dark:border-white/10 bg-noise group/card transition-all duration-500 ease-out hover:border-gray-300 dark:hover:border-white/20 shadow-glass hover:shadow-md backdrop-blur-sm bg-white dark:bg-black/60 motion-safe:hover:scale-[1.005]"
        style={{ willChange: 'transform' }}
    >
      {/* Subtle gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/0 via-accent/0 to-accent/5 opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 pointer-events-none" aria-hidden="true" />

      <div className="flex flex-col md:flex-row relative z-10">
        <div className="flex-1 p-5 md:p-6 relative">
          <div className="absolute top-5 right-5 md:top-6 md:right-6 z-10">
            <StatusBadge status={status} time={time} />
          </div>
          <div className="flex flex-col justify-center h-full gap-6 pt-8 md:pt-0" role="grid">
            <div className="flex items-center justify-between" role="row">
              <div className="flex items-center gap-4" role="gridcell">
                <TeamLogo teamAbbr={awayTeam} teamName={awayTeamName} league={league} />
                <div className="flex flex-col">
                  <span className={cn("text-lg font-bold tracking-tight transition-colors duration-300", winner === 'home' ? 'text-textSecondary opacity-70' : 'text-textPrimary')}>
                    {awayTeam}
                  </span>
                  <span className="text-[10px] font-mono text-textTertiary tracking-wide">{awayRecord}</span>
                </div>
              </div>
              {showScores && (
                <span className={cn("text-3xl font-mono font-bold tabular-nums transition-colors duration-300", winner === 'home' ? 'text-textTertiary opacity-50' : 'text-textPrimary')} role="gridcell">
                  {scores.away}
                </span>
              )}
            </div>
            <div className="w-full h-px bg-border/10" aria-hidden="true" />
            <div className="flex items-center justify-between" role="row">
              <div className="flex items-center gap-4" role="gridcell">
                <TeamLogo teamAbbr={homeTeam} teamName={homeTeamName} league={league} />
                <div className="flex flex-col">
                  <span className={cn("text-lg font-bold tracking-tight transition-colors duration-300", winner === 'away' ? 'text-textSecondary opacity-70' : 'text-textPrimary')}>
                    {homeTeam}
                  </span>
                  <span className="text-[10px] font-mono text-textTertiary tracking-wide">{homeRecord}</span>
                </div>
              </div>
              {showScores && (
                <span className={cn("text-3xl font-mono font-bold tabular-nums transition-colors duration-300", winner === 'away' ? 'text-textTertiary opacity-50' : 'text-textPrimary')} role="gridcell">
                  {scores.home}
                </span>
              )}
            </div>
          </div>
          <div className="absolute bottom-5 right-5 md:bottom-6 md:right-6 flex gap-2 opacity-0 motion-safe:translate-y-3 group-hover/card:opacity-100 group-hover/card:motion-safe:translate-y-0 transition-all duration-500 ease-out focus-within:opacity-100 focus-within:translate-y-0">
            {onAnalyze && (
              <button
                onClick={handleAnalyzeClick}
                className="glass-button-vibrant px-5 py-2.5 rounded-xl flex items-center gap-2.5 shadow-md hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:hover:scale-105 active:scale-100"
                style={{ willChange: 'transform, opacity' }}
              >
                <TrendingUp size={16} strokeWidth={2.5} className="text-accent" />
                <span className="text-sm font-bold text-textPrimary">Analyze</span>
              </button>
            )}
            <button
              onClick={handleGeneratePick}
              disabled={isGeneratingPick || boardLocked}
              className="glass-button-vibrant px-5 py-2.5 rounded-xl flex items-center gap-2.5 shadow-md hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:hover:scale-105 active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ willChange: 'transform, opacity' }}
            >
              {isGeneratingPick ? (
                <>
                  <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  <span className="text-sm font-bold text-textPrimary">Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles size={16} strokeWidth={2.5} className="text-accent" />
                  <span className="text-sm font-bold text-textPrimary">Get Pick</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Pick Display Section */}
        {(pickData || isGeneratingPick) && (
          <div className="px-5 md:px-6 pb-5 relative z-10">
            {isGeneratingPick ? (
              <PickDisplay pick={{} as any} isLoading />
            ) : pickData ? (
              <PickDisplay pick={pickData} onClick={() => setShowPickModal(true)} />
            ) : null}
          </div>
        )}

        {/* Pick Detail Modal */}
        {pickData && (
          <PickDetailModal
            pick={pickData}
            isOpen={showPickModal}
            onClose={() => setShowPickModal(false)}
            gameInfo={{
              awayTeam: game.awayTeam,
              homeTeam: game.homeTeam,
              time: game.time
            }}
          />
        )}

        <div className="relative bg-surfaceHighlight/30 dark:bg-surfaceHighlight/20 backdrop-blur-md p-5 md:w-[380px] flex flex-col justify-center border-t md:border-t-0 md:border-l border-border/20">
          {boardLocked && (
             <div className="absolute inset-0 bg-surface/50 backdrop-blur-sm z-20 flex items-center justify-center flex-col gap-3">
                <Lock size={24} className="text-textSecondary" />
                <p className="text-sm font-semibold text-textSecondary">{isConcluded ? "Markets Closed" : "Market Data Unavailable"}</p>
             </div>
          )}
          <div role="grid">
              <div className="grid grid-cols-3 gap-3 mb-4 px-1" role="row">
                <span className="text-[9px] font-extrabold text-textTertiary/80 uppercase tracking-[0.15em] text-center" role="columnheader">{spreadLabel}</span>
                <span className="text-[9px] font-extrabold text-textTertiary/80 uppercase tracking-[0.15em] text-center" role="columnheader">Total</span>
                <span className="text-[9px] font-extrabold text-textTertiary/80 uppercase tracking-[0.15em] text-center" role="columnheader">Moneyline</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3" role="row">
                <OddsCell label={`${awayTeamName} Spread`} main={processedOdds?.awayPL.line || '-'} sub={processedOdds?.awayPL.juice} isDisabled={boardLocked} onClick={onBetClick ? () => handleBet('PL', 'away') : undefined} />
                <OddsCell label={`Over ${processedOdds?.total || ''}`} main={processedOdds?.total !== '-' ? `O ${processedOdds?.total}` : '-'} sub={processedOdds?.overOdds} isDisabled={boardLocked} onClick={onBetClick ? () => handleBet('Total', 'over') : undefined} />
                <OddsCell label={`${awayTeamName} Moneyline`} main={processedOdds?.awayML || '-'} isFavorite={hasOdds && processedOdds?.mlFavorite === 'away'} isDisabled={boardLocked} onClick={onBetClick ? () => handleBet('ML', 'away') : undefined} />
              </div>
              <div className="grid grid-cols-3 gap-3" role="row">
                <OddsCell label={`${homeTeamName} Spread`} main={processedOdds?.homePL.line || '-'} sub={processedOdds?.homePL.juice} isDisabled={boardLocked} onClick={onBetClick ? () => handleBet('PL', 'home') : undefined} />
                <OddsCell label={`Under ${processedOdds?.total || ''}`} main={processedOdds?.total !== '-' ? `U ${processedOdds?.total}` : '-'} sub={processedOdds?.underOdds} isDisabled={boardLocked} onClick={onBetClick ? () => handleBet('Total', 'under') : undefined} />
                <OddsCell label={`${homeTeamName} Moneyline`} main={processedOdds?.homeML || '-'} isFavorite={hasOdds && processedOdds?.mlFavorite === 'home'} isDisabled={boardLocked} onClick={onBetClick ? () => handleBet('ML', 'home') : undefined} />
              </div>
          </div>
        </div>
      </div>
    </article>
  );
});
GameCard.displayName = 'GameCard';
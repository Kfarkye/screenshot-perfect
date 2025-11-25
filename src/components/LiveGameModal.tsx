/**
 * @component LiveGameModal
 * @description Real-time game tracking modal with live scores, line movement, and AI analysis
 * 
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "features": [
 *     "Real-time score updates (polling)",
 *     "Period/quarter/clock display",
 *     "Live line movement tracking",
 *     "Pick performance tracking",
 *     "Integrated AI chat",
 *     "Responsive layout"
 *   ],
 *   "data_sources": {
 *     "scores": "ESPN Scoreboard API",
 *     "lines": "Odds API via betting_lines_history"
 *   }
 * }
 */

import React, { useState, useMemo, useCallback, useEffect, useRef, type FC } from 'react';
import {
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Send,
  Brain,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Activity,
  Target,
  BarChart3,
  Zap,
  Radio,
  ChevronUp,
  ChevronDown,
  Circle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { useStreamingAIChat, ChatMessage } from '@/hooks/useStreamingAIChat';
import { calculateEV } from '@/utils/bettingMath';
import type { PickData, GameData, League } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface LiveGameData {
  id: string;
  league: League;
  awayTeam: string;
  homeTeam: string;
  homeScore: number;
  awayScore: number;
  period: number;
  periodDisplay: string;
  clock: string;
  startTime?: Date;
  possession?: 'home' | 'away';
  lastPlay?: string;
  situation?: string;
}

interface LineMovement {
  timestamp: string;
  spread: number;
  total: number;
  homeML: number;
  awayML: number;
}

interface LiveGameModalProps {
  readonly pick: PickData;
  readonly game: LiveGameData;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly lineHistory?: LineMovement[];
  readonly onRefresh?: () => void;
  readonly isRefreshing?: boolean;
  readonly lastUpdated?: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

const formatSpread = (spread: number): string => {
  if (spread === 0) return 'PK';
  return spread > 0 ? `+${spread}` : `${spread}`;
};

const formatOdds = (odds: number): string => {
  return odds > 0 ? `+${odds}` : `${odds}`;
};

const getPeriodLabel = (league: League, period: number): string => {
  const labels: Record<League, Record<number, string>> = {
    NFL: { 1: '1st Qtr', 2: '2nd Qtr', 3: '3rd Qtr', 4: '4th Qtr', 5: 'OT' },
    NBA: { 1: '1st Qtr', 2: '2nd Qtr', 3: '3rd Qtr', 4: '4th Qtr', 5: 'OT', 6: '2OT' },
    NHL: { 1: '1st Period', 2: '2nd Period', 3: '3rd Period', 4: 'OT', 5: 'SO' },
  };
  return labels[league]?.[period] || `Period ${period}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// LIVE INDICATOR
// ─────────────────────────────────────────────────────────────────────────────

const LiveIndicator: FC<{ lastUpdated?: Date }> = React.memo(({ lastUpdated }) => {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-semantic-error opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-semantic-error" />
      </div>
      <span className="text-caption-1 font-bold text-semantic-error uppercase tracking-wider">
        Live
      </span>
      {lastUpdated && (
        <span className="text-caption-2 text-content-tertiary">
          Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
});
LiveIndicator.displayName = 'LiveIndicator';

// ─────────────────────────────────────────────────────────────────────────────
// SCOREBOARD
// ─────────────────────────────────────────────────────────────────────────────

interface ScoreboardProps {
  game: LiveGameData;
}

const Scoreboard: FC<ScoreboardProps> = React.memo(({ game }) => {
  const { homeTeam, awayTeam, homeScore, awayScore, period, clock, possession, league } = game;
  
  const periodLabel = getPeriodLabel(league, period);
  const homeWinning = homeScore > awayScore;
  const awayWinning = awayScore > homeScore;

  return (
    <div className="bg-glass-surface border border-glass-border rounded-2xl p-6 backdrop-blur-xl">
      {/* Period & Clock */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <div className="px-3 py-1.5 bg-semantic-error/10 border border-semantic-error/30 rounded-full">
          <span className="text-caption-1 font-bold text-semantic-error uppercase tracking-wider">
            {periodLabel}
          </span>
        </div>
        <div className="text-title-2 font-mono font-bold text-content-primary tabular-nums">
          {clock}
        </div>
      </div>

      {/* Teams & Scores */}
      <div className="grid grid-cols-3 gap-4 items-center">
        {/* Away Team */}
        <div className={cn(
          'text-center transition-opacity duration-200',
          homeWinning && 'opacity-60'
        )}>
          <div className="flex items-center justify-center gap-2 mb-2">
            {possession === 'away' && (
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            )}
            <span className="text-body font-semibold text-content-secondary uppercase tracking-wide">
              {awayTeam}
            </span>
          </div>
          <div className={cn(
            'text-5xl font-bold font-mono tabular-nums',
            awayWinning ? 'text-content-primary' : 'text-content-secondary'
          )}>
            {awayScore}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center justify-center">
          <span className="text-content-tertiary text-title-3 font-light">@</span>
        </div>

        {/* Home Team */}
        <div className={cn(
          'text-center transition-opacity duration-200',
          awayWinning && 'opacity-60'
        )}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-body font-semibold text-content-secondary uppercase tracking-wide">
              {homeTeam}
            </span>
            {possession === 'home' && (
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            )}
          </div>
          <div className={cn(
            'text-5xl font-bold font-mono tabular-nums',
            homeWinning ? 'text-content-primary' : 'text-content-secondary'
          )}>
            {homeScore}
          </div>
        </div>
      </div>

      {/* Situation (NFL specific) */}
      {game.situation && (
        <div className="mt-4 pt-4 border-t border-glass-border text-center">
          <span className="text-caption-1 text-content-tertiary">{game.situation}</span>
        </div>
      )}
    </div>
  );
});
Scoreboard.displayName = 'Scoreboard';

// ─────────────────────────────────────────────────────────────────────────────
// PICK TRACKER
// ─────────────────────────────────────────────────────────────────────────────

interface PickTrackerProps {
  pick: PickData;
  game: LiveGameData;
  currentLine?: LineMovement;
}

const PickTracker: FC<PickTrackerProps> = React.memo(({ pick, game, currentLine }) => {
  const { homeScore, awayScore, homeTeam, awayTeam } = game;
  
  // Determine if pick is covering
  const scoreDiff = homeScore - awayScore; // positive = home winning
  
  // Parse pick to determine side
  const pickIsHome = pick.pick_side.includes(homeTeam);
  const pickIsOver = pick.pick_side.toLowerCase().includes('over');
  const pickIsUnder = pick.pick_side.toLowerCase().includes('under');
  
  // Calculate current cover status
  let coverStatus: 'covering' | 'pushing' | 'losing' | 'unknown' = 'unknown';
  let coverMargin = 0;
  
  if (pick.pick_side.includes('spread') || (!pickIsOver && !pickIsUnder)) {
    // Spread pick
    const spread = currentLine?.spread ?? 0;
    if (pickIsHome) {
      coverMargin = scoreDiff + spread; // Home needs to beat spread
    } else {
      coverMargin = -scoreDiff - spread; // Away needs to beat spread
    }
    
    if (coverMargin > 0) coverStatus = 'covering';
    else if (coverMargin === 0) coverStatus = 'pushing';
    else coverStatus = 'losing';
  } else if (pickIsOver || pickIsUnder) {
    // Total pick
    const total = currentLine?.total ?? 0;
    const currentTotal = homeScore + awayScore;
    
    if (pickIsOver) {
      coverMargin = currentTotal - total;
    } else {
      coverMargin = total - currentTotal;
    }
    
    if (coverMargin > 0) coverStatus = 'covering';
    else if (coverMargin === 0) coverStatus = 'pushing';
    else coverStatus = 'losing';
  }

  const statusConfig = {
    covering: { color: 'text-semantic-success', bg: 'bg-semantic-success/10', border: 'border-semantic-success/30', icon: TrendingUp, label: 'Covering' },
    pushing: { color: 'text-semantic-warning', bg: 'bg-semantic-warning/10', border: 'border-semantic-warning/30', icon: Minus, label: 'Push' },
    losing: { color: 'text-semantic-error', bg: 'bg-semantic-error/10', border: 'border-semantic-error/30', icon: TrendingDown, label: 'Not Covering' },
    unknown: { color: 'text-content-tertiary', bg: 'bg-surface-secondary/50', border: 'border-glass-border', icon: Circle, label: 'Tracking' },
  };

  const config = statusConfig[coverStatus];
  const StatusIcon = config.icon;

  return (
    <div className={cn(
      'rounded-xl border p-4 transition-all duration-300',
      config.bg,
      config.border
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-accent" />
          <span className="text-caption-1 font-semibold text-content-secondary uppercase tracking-wider">
            Your Pick
          </span>
        </div>
        <div className={cn('flex items-center gap-1.5', config.color)}>
          <StatusIcon size={14} />
          <span className="text-caption-1 font-bold uppercase tracking-wider">
            {config.label}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-title-3 font-bold text-content-primary">
            {pick.pick_side}
          </div>
          <div className="text-caption-1 text-content-tertiary font-mono">
            Opened: {formatOdds(pick.odds_at_generation)}
          </div>
        </div>
        
        {coverStatus !== 'unknown' && (
          <div className={cn('text-right', config.color)}>
            <div className="text-title-2 font-bold font-mono tabular-nums">
              {coverMargin > 0 ? '+' : ''}{coverMargin.toFixed(1)}
            </div>
            <div className="text-caption-2">pts margin</div>
          </div>
        )}
      </div>

      {/* Confidence reminder */}
      <div className="mt-3 pt-3 border-t border-glass-border/50 flex items-center justify-between">
        <span className="text-caption-2 text-content-tertiary">Model Confidence</span>
        <span className={cn(
          'text-caption-1 font-bold',
          pick.confidence_score >= 70 ? 'text-semantic-success' : 
          pick.confidence_score >= 50 ? 'text-semantic-warning' : 'text-content-tertiary'
        )}>
          {pick.confidence_score}%
        </span>
      </div>
    </div>
  );
});
PickTracker.displayName = 'PickTracker';

// ─────────────────────────────────────────────────────────────────────────────
// LINE MOVEMENT TRACKER
// ─────────────────────────────────────────────────────────────────────────────

interface LineMovementProps {
  history: LineMovement[];
  currentLine?: LineMovement;
  openLine?: LineMovement;
}

const LineMovementTracker: FC<LineMovementProps> = React.memo(({ history, currentLine, openLine }) => {
  if (!currentLine || !openLine) return null;

  const spreadMovement = currentLine.spread - openLine.spread;
  const totalMovement = currentLine.total - openLine.total;

  return (
    <div className="bg-glass-surface border border-glass-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} className="text-accent" />
        <span className="text-caption-1 font-semibold text-content-secondary uppercase tracking-wider">
          Live Lines
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Spread */}
        <div>
          <div className="text-caption-2 text-content-tertiary mb-1">Spread</div>
          <div className="flex items-center gap-2">
            <span className="text-body font-bold font-mono text-content-primary">
              {formatSpread(currentLine.spread)}
            </span>
            {spreadMovement !== 0 && (
              <span className={cn(
                'text-caption-1 font-mono flex items-center gap-0.5',
                spreadMovement > 0 ? 'text-semantic-success' : 'text-semantic-error'
              )}>
                {spreadMovement > 0 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {Math.abs(spreadMovement).toFixed(1)}
              </span>
            )}
          </div>
          <div className="text-caption-2 text-content-tertiary">
            Open: {formatSpread(openLine.spread)}
          </div>
        </div>

        {/* Total */}
        <div>
          <div className="text-caption-2 text-content-tertiary mb-1">Total</div>
          <div className="flex items-center gap-2">
            <span className="text-body font-bold font-mono text-content-primary">
              {currentLine.total}
            </span>
            {totalMovement !== 0 && (
              <span className={cn(
                'text-caption-1 font-mono flex items-center gap-0.5',
                totalMovement > 0 ? 'text-semantic-success' : 'text-semantic-error'
              )}>
                {totalMovement > 0 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {Math.abs(totalMovement).toFixed(1)}
              </span>
            )}
          </div>
          <div className="text-caption-2 text-content-tertiary">
            Open: {openLine.total}
          </div>
        </div>
      </div>

      {/* Moneylines */}
      <div className="mt-4 pt-4 border-t border-glass-border/50 grid grid-cols-2 gap-4">
        <div>
          <div className="text-caption-2 text-content-tertiary mb-1">Away ML</div>
          <span className="text-body-sm font-mono text-content-primary">
            {formatOdds(currentLine.awayML)}
          </span>
        </div>
        <div>
          <div className="text-caption-2 text-content-tertiary mb-1">Home ML</div>
          <span className="text-body-sm font-mono text-content-primary">
            {formatOdds(currentLine.homeML)}
          </span>
        </div>
      </div>
    </div>
  );
});
LineMovementTracker.displayName = 'LineMovementTracker';

// ─────────────────────────────────────────────────────────────────────────────
// AI CHAT PANEL (Reused from PickDetailModal, enhanced for live context)
// ─────────────────────────────────────────────────────────────────────────────

interface AIChatPanelProps {
  game: LiveGameData;
  pick: PickData;
}

const ChatBubble: FC<{ message: ChatMessage | { content: string; role: 'stream' } }> = React.memo(({ message }) => (
  <div
    className={cn(
      'p-3 rounded-xl text-body-sm whitespace-pre-wrap transition-all duration-150',
      message.role === 'user' && 'bg-accent text-content-inverse ml-8 self-end shadow-md',
      (message.role === 'assistant' || message.role === 'stream') && 
        'bg-glass-surface text-content-primary mr-8 self-start shadow-sm border border-glass-border'
    )}
  >
    {message.content}
    {message.role === 'stream' && (
      <span className="inline-block w-1 h-4 bg-accent ml-1 align-text-bottom animate-pulse" />
    )}
  </div>
));
ChatBubble.displayName = 'ChatBubble';

const AIChatPanel: FC<AIChatPanelProps> = ({ game, pick }) => {
  // Convert LiveGameData to GameData for the hook
  const gameData: GameData = {
    ...game,
    time: game.clock,
    timestamp: game.startTime?.getTime() || Date.now(),
    status: 'Live' as const,
    odds: {},
    homeScore: String(game.homeScore),
    awayScore: String(game.awayScore),
  };
  
  const { messages, isLoading, currentStream, sendMessage, chatEndRef, resetChat } = useStreamingAIChat(gameData, pick);
  const [inputMessage, setInputMessage] = useState('');

  const handleSubmit = useCallback(() => {
    if (inputMessage.trim() && !isLoading) {
      sendMessage(inputMessage);
      setInputMessage('');
    }
  }, [inputMessage, sendMessage, isLoading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // Suggested live questions
  const liveQuestions = [
    'How is the pick looking right now?',
    'Should I hedge this bet?',
    'What would need to happen to cover?',
  ];

  return (
    <div className="w-full lg:w-1/3 border-l border-glass-border flex flex-col bg-surface-primary/95 h-full">
      <div className="p-4 border-b border-glass-border bg-surface-secondary/30 flex justify-between items-center shrink-0">
        <h3 className="text-body font-semibold text-content-primary flex items-center gap-2">
          <Brain size={18} className="text-accent" />
          Live Analysis
        </h3>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={resetChat} 
          disabled={isLoading}
          className="h-8 w-8 text-content-tertiary hover:text-content-primary"
        >
          <RefreshCw size={14} />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="text-center py-8 px-4">
              <Brain size={32} className="mx-auto mb-4 text-accent/50" />
              <p className="text-body-sm text-content-tertiary mb-4">
                Ask about the live game situation
              </p>
              <div className="space-y-2">
                {liveQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(q)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-glass-surface border border-glass-border text-caption-1 text-content-secondary hover:bg-surface-secondary/50 hover:text-content-primary transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}

          {currentStream && <ChatBubble message={{ content: currentStream, role: 'stream' }} />}

          {isLoading && !currentStream && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-glass-surface text-content-tertiary mr-8 self-start">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              <span className="text-body-sm">Analyzing live data...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-glass-border bg-surface-secondary/30 shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the live game..."
            className="resize-none text-body-sm bg-surface-primary border-glass-border focus-visible:ring-accent flex-1"
            rows={1}
            disabled={isLoading}
          />
          <Button
            onClick={handleSubmit}
            disabled={!inputMessage.trim() || isLoading}
            size="icon"
            className="shrink-0 bg-accent hover:bg-accent-hover"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const LiveGameModal: FC<LiveGameModalProps> = ({
  pick,
  game,
  isOpen,
  onClose,
  lineHistory = [],
  onRefresh,
  isRefreshing,
  lastUpdated,
}) => {
  const [showAIChat, setShowAIChat] = useState(true); // Default open for live games

  const currentLine = lineHistory[lineHistory.length - 1];
  const openLine = lineHistory[0];

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] max-h-[90vh] bg-surface-primary border-glass-border backdrop-blur-xl shadow-2xl p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-glass-border bg-surface-primary/95 backdrop-blur-xl sticky top-0 z-10 shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <LiveIndicator lastUpdated={lastUpdated} />
              <div>
                <div className="text-title-3 font-bold text-content-primary tracking-tight">
                  {game.awayTeam} @ {game.homeTeam}
                </div>
                <div className="text-caption-1 text-content-tertiary mt-0.5">
                  {game.league} • Live Game
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {onRefresh && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="gap-2 text-content-tertiary hover:text-content-primary"
                >
                  <RefreshCw size={14} className={cn(isRefreshing && 'animate-spin')} />
                  Refresh
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAIChat(!showAIChat)}
                className={cn(
                  'gap-2 transition-colors duration-200',
                  showAIChat 
                    ? 'bg-accent/10 text-accent border-accent/30 hover:bg-accent/20' 
                    : 'hover:bg-surface-secondary'
                )}
              >
                <Brain size={16} />
                {showAIChat ? 'Hide Chat' : 'Live Analysis'}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Main Content */}
          <div className={cn(
            'transition-all duration-300 ease-standard overflow-hidden',
            showAIChat ? 'w-full lg:w-2/3' : 'w-full'
          )}>
            <ScrollArea className="h-full">
              <div className="p-6 space-y-6">
                {/* Scoreboard */}
                <Scoreboard game={game} />

                {/* Pick Tracker */}
                <PickTracker pick={pick} game={game} currentLine={currentLine} />

                {/* Line Movement */}
                {lineHistory.length > 0 && (
                  <LineMovementTracker 
                    history={lineHistory}
                    currentLine={currentLine}
                    openLine={openLine}
                  />
                )}

                {/* Last Play (if available) */}
                {game.lastPlay && (
                  <div className="bg-glass-surface border border-glass-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Radio size={14} className="text-accent" />
                      <span className="text-caption-1 font-semibold text-content-secondary uppercase tracking-wider">
                        Last Play
                      </span>
                    </div>
                    <p className="text-body-sm text-content-primary">
                      {game.lastPlay}
                    </p>
                  </div>
                )}

                {/* Original Analysis */}
                <div className="bg-surface-secondary/30 border border-glass-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 size={14} className="text-content-tertiary" />
                    <span className="text-caption-1 font-semibold text-content-tertiary uppercase tracking-wider">
                      Pre-Game Analysis
                    </span>
                  </div>
                  <p className="text-body-sm text-content-secondary leading-relaxed">
                    {pick.reasoning_text || 'No analysis available.'}
                  </p>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* AI Chat Panel */}
          {showAIChat && (
            <AIChatPanel key={`live-${game.id}`} game={game} pick={pick} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LiveGameModal;

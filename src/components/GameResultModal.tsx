/**
 * @component GameResultModal
 * @description Post-game result modal showing final scores, pick outcomes, and P&L
 * 
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "features": [
 *     "Final score display",
 *     "Pick outcome (hit/miss/push)",
 *     "P&L calculation",
 *     "Cover margin display",
 *     "Original analysis review",
 *     "Performance tracking integration"
 *   ]
 * }
 */

import React, { useMemo, useState, type FC } from 'react';
import {
  Trophy,
  XCircle,
  MinusCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  BarChart3,
  Target,
  DollarSign,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Brain,
  Calendar,
  Percent,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import type { PickData, GameData, League } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type PickOutcome = 'win' | 'loss' | 'push' | 'pending';

export interface FinalGameData {
  id: string;
  league: League;
  awayTeam: string;
  homeTeam: string;
  time: string;
  homeScore: number;
  awayScore: number;
  finalPeriod?: string; // "Final", "Final OT", etc.
}

export interface GameResultModalProps {
  readonly pick: PickData;
  readonly game: FinalGameData;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly unitSize?: number; // User's betting unit for P&L calc
  readonly closingLine?: {
    spread: number;
    total: number;
    homeML: number;
    awayML: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

const formatOdds = (odds: number): string => {
  return odds > 0 ? `+${odds}` : `${odds}`;
};

const oddsToDecimal = (americanOdds: number): number => {
  if (americanOdds > 0) {
    return (americanOdds / 100) + 1;
  }
  return (100 / Math.abs(americanOdds)) + 1;
};

const calculatePayout = (odds: number, stake: number): number => {
  const decimal = oddsToDecimal(odds);
  return stake * decimal;
};

const calculateProfit = (odds: number, stake: number): number => {
  return calculatePayout(odds, stake) - stake;
};

// ─────────────────────────────────────────────────────────────────────────────
// OUTCOME CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────

interface OutcomeResult {
  outcome: PickOutcome;
  margin: number;
  description: string;
}

function calculateOutcome(
  pick: PickData,
  game: FinalGameData,
  closingSpread?: number,
  closingTotal?: number
): OutcomeResult {
  const { homeScore, awayScore, homeTeam, awayTeam } = game;
  const scoreDiff = homeScore - awayScore; // positive = home won
  const totalPoints = homeScore + awayScore;

  const pickSide = pick.pick_side.toLowerCase();
  
  // Determine pick type and calculate
  const isOver = pickSide.includes('over');
  const isUnder = pickSide.includes('under');
  const isMoneyline = pickSide.includes('ml') || pickSide.includes('moneyline');
  
  // Total picks
  if (isOver || isUnder) {
    const line = closingTotal ?? extractNumberFromPick(pick.pick_side) ?? 0;
    const margin = isOver ? totalPoints - line : line - totalPoints;
    
    if (margin > 0) {
      return { 
        outcome: 'win', 
        margin: Math.abs(totalPoints - line),
        description: `Total: ${totalPoints} (Line: ${line})`
      };
    } else if (margin === 0) {
      return { 
        outcome: 'push', 
        margin: 0,
        description: `Total: ${totalPoints} (Line: ${line})`
      };
    } else {
      return { 
        outcome: 'loss', 
        margin: Math.abs(totalPoints - line),
        description: `Total: ${totalPoints} (Line: ${line})`
      };
    }
  }

  // Moneyline picks
  if (isMoneyline) {
    const pickIsHome = pickSide.includes(homeTeam.toLowerCase());
    const pickIsAway = pickSide.includes(awayTeam.toLowerCase());
    
    if (pickIsHome) {
      if (scoreDiff > 0) return { outcome: 'win', margin: scoreDiff, description: `${homeTeam} won by ${scoreDiff}` };
      if (scoreDiff < 0) return { outcome: 'loss', margin: Math.abs(scoreDiff), description: `${homeTeam} lost by ${Math.abs(scoreDiff)}` };
      return { outcome: 'push', margin: 0, description: 'Game ended in tie' };
    } else if (pickIsAway) {
      if (scoreDiff < 0) return { outcome: 'win', margin: Math.abs(scoreDiff), description: `${awayTeam} won by ${Math.abs(scoreDiff)}` };
      if (scoreDiff > 0) return { outcome: 'loss', margin: scoreDiff, description: `${awayTeam} lost by ${scoreDiff}` };
      return { outcome: 'push', margin: 0, description: 'Game ended in tie' };
    }
  }

  // Spread picks (default)
  const pickIsHome = pickSide.includes(homeTeam.toLowerCase());
  const spread = closingSpread ?? extractNumberFromPick(pick.pick_side) ?? 0;
  
  let coverMargin: number;
  let description: string;
  
  if (pickIsHome) {
    // Home team needs to beat the spread
    // If spread is -7, home needs to win by more than 7
    coverMargin = scoreDiff + spread;
    description = `${homeTeam} ${scoreDiff > 0 ? 'won' : 'lost'} by ${Math.abs(scoreDiff)} (Spread: ${formatOdds(spread)})`;
  } else {
    // Away team needs to beat the spread
    coverMargin = -scoreDiff - spread;
    description = `${awayTeam} ${scoreDiff < 0 ? 'won' : 'lost'} by ${Math.abs(scoreDiff)} (Spread: ${formatOdds(-spread)})`;
  }

  if (coverMargin > 0) {
    return { outcome: 'win', margin: coverMargin, description };
  } else if (coverMargin === 0) {
    return { outcome: 'push', margin: 0, description };
  } else {
    return { outcome: 'loss', margin: Math.abs(coverMargin), description };
  }
}

function extractNumberFromPick(pickSide: string): number | null {
  const match = pickSide.match(/[+-]?\d+\.?\d*/);
  return match ? parseFloat(match[0]) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTCOME BADGE
// ─────────────────────────────────────────────────────────────────────────────

interface OutcomeBadgeProps {
  outcome: PickOutcome;
  size?: 'sm' | 'lg';
}

const OutcomeBadge: FC<OutcomeBadgeProps> = React.memo(({ outcome, size = 'lg' }) => {
  const config = {
    win: {
      icon: Trophy,
      label: 'Winner',
      bg: 'bg-semantic-success/10',
      border: 'border-semantic-success/30',
      text: 'text-semantic-success',
      iconColor: 'text-semantic-success',
    },
    loss: {
      icon: XCircle,
      label: 'Loss',
      bg: 'bg-semantic-error/10',
      border: 'border-semantic-error/30',
      text: 'text-semantic-error',
      iconColor: 'text-semantic-error',
    },
    push: {
      icon: MinusCircle,
      label: 'Push',
      bg: 'bg-semantic-warning/10',
      border: 'border-semantic-warning/30',
      text: 'text-semantic-warning',
      iconColor: 'text-semantic-warning',
    },
    pending: {
      icon: Clock,
      label: 'Pending',
      bg: 'bg-surface-secondary/50',
      border: 'border-glass-border',
      text: 'text-content-tertiary',
      iconColor: 'text-content-tertiary',
    },
  };

  const c = config[outcome];
  const Icon = c.icon;
  const isLarge = size === 'lg';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border',
        c.bg,
        c.border,
        isLarge ? 'px-4 py-2' : 'px-3 py-1'
      )}
    >
      <Icon size={isLarge ? 20 : 14} className={c.iconColor} />
      <span
        className={cn(
          'font-bold uppercase tracking-wider',
          c.text,
          isLarge ? 'text-body' : 'text-caption-1'
        )}
      >
        {c.label}
      </span>
    </div>
  );
});
OutcomeBadge.displayName = 'OutcomeBadge';

// ─────────────────────────────────────────────────────────────────────────────
// FINAL SCORE DISPLAY
// ─────────────────────────────────────────────────────────────────────────────

interface FinalScoreProps {
  game: FinalGameData;
}

const FinalScore: FC<FinalScoreProps> = React.memo(({ game }) => {
  const { homeTeam, awayTeam, homeScore, awayScore, finalPeriod = 'Final' } = game;
  const homeWon = homeScore > awayScore;
  const awayWon = awayScore > homeScore;

  return (
    <div className="bg-glass-surface border border-glass-border rounded-2xl p-6 backdrop-blur-xl">
      {/* Final indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <CheckCircle2 size={16} className="text-content-tertiary" />
        <span className="text-caption-1 font-bold text-content-tertiary uppercase tracking-wider">
          {finalPeriod}
        </span>
      </div>

      {/* Scores */}
      <div className="grid grid-cols-3 gap-4 items-center">
        {/* Away */}
        <div className={cn('text-center', homeWon && 'opacity-50')}>
          <div className="text-body font-semibold text-content-secondary uppercase tracking-wide mb-2">
            {awayTeam}
          </div>
          <div
            className={cn(
              'text-5xl font-bold font-mono tabular-nums',
              awayWon ? 'text-content-primary' : 'text-content-secondary'
            )}
          >
            {awayScore}
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center justify-center">
          <span className="text-content-tertiary text-title-3 font-light">@</span>
        </div>

        {/* Home */}
        <div className={cn('text-center', awayWon && 'opacity-50')}>
          <div className="text-body font-semibold text-content-secondary uppercase tracking-wide mb-2">
            {homeTeam}
          </div>
          <div
            className={cn(
              'text-5xl font-bold font-mono tabular-nums',
              homeWon ? 'text-content-primary' : 'text-content-secondary'
            )}
          >
            {homeScore}
          </div>
        </div>
      </div>
    </div>
  );
});
FinalScore.displayName = 'FinalScore';

// ─────────────────────────────────────────────────────────────────────────────
// P&L CARD
// ─────────────────────────────────────────────────────────────────────────────

interface PLCardProps {
  outcome: PickOutcome;
  odds: number;
  unitSize: number;
  margin: number;
}

const PLCard: FC<PLCardProps> = React.memo(({ outcome, odds, unitSize, margin }) => {
  const profit = useMemo(() => {
    if (outcome === 'win') return calculateProfit(odds, unitSize);
    if (outcome === 'loss') return -unitSize;
    return 0; // push
  }, [outcome, odds, unitSize]);

  const payout = useMemo(() => {
    if (outcome === 'win') return calculatePayout(odds, unitSize);
    if (outcome === 'push') return unitSize;
    return 0;
  }, [outcome, odds, unitSize]);

  const isPositive = profit > 0;
  const isNegative = profit < 0;

  return (
    <div className="bg-glass-surface border border-glass-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign size={16} className="text-accent" />
        <span className="text-caption-1 font-semibold text-content-secondary uppercase tracking-wider">
          Result Summary
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Profit/Loss */}
        <div>
          <div className="text-caption-2 text-content-tertiary mb-1">Profit/Loss</div>
          <div
            className={cn(
              'text-title-2 font-bold font-mono tabular-nums',
              isPositive && 'text-semantic-success',
              isNegative && 'text-semantic-error',
              !isPositive && !isNegative && 'text-content-tertiary'
            )}
          >
            {isPositive ? '+' : ''}
            ${profit.toFixed(2)}
          </div>
        </div>

        {/* Payout */}
        <div>
          <div className="text-caption-2 text-content-tertiary mb-1">Payout</div>
          <div className="text-title-2 font-bold font-mono tabular-nums text-content-primary">
            ${payout.toFixed(2)}
          </div>
        </div>

        {/* Odds */}
        <div>
          <div className="text-caption-2 text-content-tertiary mb-1">Odds at Pick</div>
          <div className="text-body font-mono text-content-primary">{formatOdds(odds)}</div>
        </div>

        {/* Margin */}
        <div>
          <div className="text-caption-2 text-content-tertiary mb-1">Cover Margin</div>
          <div
            className={cn(
              'text-body font-mono',
              outcome === 'win' && 'text-semantic-success',
              outcome === 'loss' && 'text-semantic-error',
              outcome === 'push' && 'text-semantic-warning'
            )}
          >
            {outcome === 'win' ? '+' : outcome === 'loss' ? '-' : ''}
            {margin.toFixed(1)} pts
          </div>
        </div>
      </div>
    </div>
  );
});
PLCard.displayName = 'PLCard';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE REVIEW
// ─────────────────────────────────────────────────────────────────────────────

interface ConfidenceReviewProps {
  confidence: number;
  outcome: PickOutcome;
}

const ConfidenceReview: FC<ConfidenceReviewProps> = React.memo(({ confidence, outcome }) => {
  // Assess if confidence was calibrated
  const wasCalibrated = useMemo(() => {
    // High confidence should win more than low confidence
    // This is a simplified heuristic
    if (confidence >= 70 && outcome === 'win') return 'calibrated';
    if (confidence >= 70 && outcome === 'loss') return 'overconfident';
    if (confidence < 50 && outcome === 'win') return 'underconfident';
    if (confidence < 50 && outcome === 'loss') return 'calibrated';
    return 'neutral';
  }, [confidence, outcome]);

  const calibrationConfig = {
    calibrated: { color: 'text-semantic-success', label: 'Well Calibrated' },
    overconfident: { color: 'text-semantic-error', label: 'Overconfident' },
    underconfident: { color: 'text-semantic-warning', label: 'Underconfident' },
    neutral: { color: 'text-content-tertiary', label: 'Neutral' },
  };

  const c = calibrationConfig[wasCalibrated];

  return (
    <div className="flex items-center justify-between p-3 bg-surface-secondary/30 rounded-lg">
      <div className="flex items-center gap-2">
        <Percent size={14} className="text-content-tertiary" />
        <span className="text-caption-1 text-content-secondary">Model Confidence</span>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'text-body font-bold font-mono',
            confidence >= 70 ? 'text-semantic-success' : confidence >= 50 ? 'text-semantic-warning' : 'text-content-tertiary'
          )}
        >
          {confidence}%
        </span>
        <span className={cn('text-caption-2', c.color)}>{c.label}</span>
      </div>
    </div>
  );
});
ConfidenceReview.displayName = 'ConfidenceReview';

// ─────────────────────────────────────────────────────────────────────────────
// ANALYSIS ACCORDION
// ─────────────────────────────────────────────────────────────────────────────

interface AnalysisAccordionProps {
  reasoning: string;
}

const AnalysisAccordion: FC<AnalysisAccordionProps> = React.memo(({ reasoning }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!reasoning) return null;

  return (
    <div className="border border-glass-border rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-surface-secondary/30 hover:bg-surface-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-content-tertiary" />
          <span className="text-caption-1 font-semibold text-content-secondary uppercase tracking-wider">
            Pre-Game Analysis
          </span>
        </div>
        {isOpen ? (
          <ChevronUp size={16} className="text-content-tertiary" />
        ) : (
          <ChevronDown size={16} className="text-content-tertiary" />
        )}
      </button>

      {isOpen && (
        <div className="p-4 bg-surface-secondary/10 border-t border-glass-border">
          <p className="text-body-sm text-content-secondary leading-relaxed whitespace-pre-wrap">
            {reasoning}
          </p>
        </div>
      )}
    </div>
  );
});
AnalysisAccordion.displayName = 'AnalysisAccordion';

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const GameResultModal: FC<GameResultModalProps> = ({
  pick,
  game,
  isOpen,
  onClose,
  unitSize = 100,
  closingLine,
}) => {
  // Calculate outcome
  const outcomeResult = useMemo(() => {
    return calculateOutcome(pick, game, closingLine?.spread, closingLine?.total);
  }, [pick, game, closingLine]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] bg-surface-primary border-glass-border backdrop-blur-xl shadow-2xl p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-glass-border bg-surface-primary/95 shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <div>
              <div className="text-title-3 font-bold text-content-primary tracking-tight">
                {game.awayTeam} @ {game.homeTeam}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Calendar size={12} className="text-content-tertiary" />
                <span className="text-caption-1 text-content-tertiary">
                  {game.league} • {new Date(game.time).toLocaleDateString()}
                </span>
              </div>
            </div>
            <OutcomeBadge outcome={outcomeResult.outcome} size="lg" />
          </DialogTitle>
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Final Score */}
            <FinalScore game={game} />

            {/* Pick Result */}
            <div className="bg-glass-surface border border-glass-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target size={16} className="text-accent" />
                <span className="text-caption-1 font-semibold text-content-secondary uppercase tracking-wider">
                  Your Pick
                </span>
              </div>

              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-title-3 font-bold text-content-primary">{pick.pick_side}</div>
                  <div className="text-caption-1 text-content-tertiary font-mono">
                    {formatOdds(pick.odds_at_generation)}
                  </div>
                </div>
                <OutcomeBadge outcome={outcomeResult.outcome} size="sm" />
              </div>

              <div className="text-body-sm text-content-secondary">{outcomeResult.description}</div>
            </div>

            {/* P&L */}
            <PLCard
              outcome={outcomeResult.outcome}
              odds={pick.odds_at_generation}
              unitSize={unitSize}
              margin={outcomeResult.margin}
            />

            {/* Confidence Review */}
            <ConfidenceReview confidence={pick.confidence_score} outcome={outcomeResult.outcome} />

            {/* Original Analysis */}
            <AnalysisAccordion reasoning={pick.reasoning_text} />

            {/* Timestamp */}
            <div className="flex items-center gap-2 text-caption-2 text-content-tertiary pt-4 border-t border-glass-border">
              <Clock size={12} />
              <span>Pick generated: {new Date(pick.created_at).toLocaleString()}</span>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-glass-border bg-surface-secondary/30 shrink-0">
          <Button onClick={onClose} variant="outline" className="w-full">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GameResultModal;

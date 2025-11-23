import React from 'react';
import { PickData } from '../types';
import { TrendingUp, Clock, Zap } from 'lucide-react';

interface PickDisplayProps {
  pick: PickData;
  isLoading?: boolean;
}

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export const PickDisplay: React.FC<PickDisplayProps> = ({ pick, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="mt-4 p-4 rounded-xl bg-accent/5 border border-accent/20 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 rounded bg-accent/30"></div>
          <div className="h-4 w-24 rounded bg-accent/30"></div>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-accent/20"></div>
          <div className="h-3 w-3/4 rounded bg-accent/20"></div>
        </div>
      </div>
    );
  }

  const confidenceColor = 
    pick.confidence_score >= 75 ? 'text-success' :
    pick.confidence_score >= 50 ? 'text-yellow-500' :
    'text-textSecondary';

  const confidenceBg =
    pick.confidence_score >= 75 ? 'bg-success/10 border-success/20' :
    pick.confidence_score >= 50 ? 'bg-yellow-500/10 border-yellow-500/20' :
    'bg-surfaceHighlight/50 border-border/20';

  return (
    <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-accent/5 via-accent/3 to-transparent border border-accent/20 shadow-md backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-accent" strokeWidth={2.5} />
          <span className="text-xs font-bold text-accent uppercase tracking-wider">AI Pick</span>
        </div>
        <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold", confidenceBg)}>
          <TrendingUp size={12} className={confidenceColor} strokeWidth={2.5} />
          <span className={confidenceColor}>{pick.confidence_score}%</span>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-sm font-bold text-textPrimary mb-1">
          Recommendation: <span className="text-accent">{pick.pick_side}</span>
        </div>
        <div className="text-xs text-textSecondary">
          @ {pick.odds_at_generation > 0 ? '+' : ''}{pick.odds_at_generation}
        </div>
      </div>

      <div className="text-xs text-textSecondary leading-relaxed bg-surface/30 rounded-lg p-3 border border-border/10">
        {pick.reasoning_text}
      </div>

      <div className="flex items-center gap-1.5 mt-3 text-[10px] text-textTertiary">
        <Clock size={10} strokeWidth={2} />
        <span>Generated {new Date(pick.created_at).toLocaleTimeString()}</span>
      </div>
    </div>
  );
};

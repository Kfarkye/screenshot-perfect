import React from 'react';
import { PickData } from '../types';
import { TrendingUp, Zap, ChevronRight } from 'lucide-react';

interface PickDisplayProps {
  pick: PickData;
  isLoading?: boolean;
  onClick?: () => void;
}

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export const PickDisplay: React.FC<PickDisplayProps> = ({ pick, isLoading = false, onClick }) => {
  if (isLoading) {
    return (
      <div className="p-3 rounded-lg bg-accent/5 border border-accent/20 animate-pulse">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 rounded bg-accent/30"></div>
          <div className="h-4 w-20 rounded bg-accent/30"></div>
        </div>
        <div className="h-3 w-32 rounded bg-accent/20"></div>
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
    <button
      onClick={onClick}
      className="w-full p-3 rounded-lg bg-gradient-to-br from-accent/5 via-accent/3 to-transparent border border-accent/20 hover:border-accent/40 transition-all duration-200 text-left group"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-accent" strokeWidth={2.5} />
          <span className="text-xs font-bold text-accent uppercase tracking-wider">AI Pick</span>
        </div>
        <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-bold", confidenceBg)}>
          <TrendingUp size={10} className={confidenceColor} strokeWidth={2.5} />
          <span className={confidenceColor}>{pick.confidence_score}%</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-textPrimary">
            <span className="text-accent">{pick.pick_side}</span>
            <span className="text-textSecondary text-xs ml-2">
              @ {pick.odds_at_generation > 0 ? '+' : ''}{pick.odds_at_generation}
            </span>
          </div>
        </div>
        <ChevronRight size={16} className="text-textTertiary group-hover:text-accent transition-colors" strokeWidth={2} />
      </div>
    </button>
  );
};

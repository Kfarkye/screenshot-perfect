import React from 'react';
import { PickData } from '../types';
import { ChevronRight } from 'lucide-react';

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
      <div className="p-4 rounded-lg bg-gray-100/80 dark:bg-white/10 border border-gray-200/50 dark:border-white/20 animate-pulse">
        <div className="flex items-center justify-between mb-2">
          <div className="h-5 w-24 rounded bg-gray-300 dark:bg-white/10"></div>
          <div className="h-4 w-12 rounded-full bg-gray-300 dark:bg-white/10"></div>
        </div>
        <div className="h-3 w-32 rounded bg-gray-200 dark:bg-white/5"></div>
      </div>
    );
  }

  const isHigh = pick.confidence_score >= 70;
  const isMedium = pick.confidence_score >= 50 && pick.confidence_score < 70;

  return (
    <button
      onClick={onClick}
      className="w-full p-4 rounded-lg bg-gray-100/80 dark:bg-white/10 border border-gray-200/50 dark:border-white/20 hover:border-gray-300 dark:hover:border-white/30 hover:bg-gray-200/80 dark:hover:bg-white/15 transition-all duration-300 ease-out text-left group"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
            {pick.pick_side}
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
            {pick.odds_at_generation > 0 ? '+' : ''}{pick.odds_at_generation}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn(
            "px-2.5 py-1 rounded-full border text-xs font-semibold tracking-wide",
            isHigh ? "bg-success/10 border-success/30 text-success" :
            isMedium ? "bg-warning/10 border-warning/30 text-warning" :
            "bg-foreground/5 border-border/30 text-textSecondary"
          )}>
            {pick.confidence_score}%
          </div>
          <ChevronRight size={16} className="text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" strokeWidth={2} />
        </div>
      </div>

      <div className="text-xs text-gray-600 dark:text-gray-400">
        View analysis →
      </div>
    </button>
  );
};

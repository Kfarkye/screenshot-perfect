import React from 'react';
import { PickData } from '../types';
import { Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface PickDetailModalProps {
  pick: PickData;
  isOpen: boolean;
  onClose: () => void;
  gameInfo?: {
    awayTeam: string;
    homeTeam: string;
    time: string;
  };
}

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

export const PickDetailModal: React.FC<PickDetailModalProps> = ({ 
  pick, 
  isOpen, 
  onClose,
  gameInfo 
}) => {
  const isHigh = pick.confidence_score >= 70;
  const isMedium = pick.confidence_score >= 50 && pick.confidence_score < 70;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card border-border backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            Pick Analysis
          </DialogTitle>
        </DialogHeader>

        {gameInfo && (
          <div className="text-sm text-muted-foreground -mt-2 mb-4 font-mono">
            {gameInfo.awayTeam} @ {gameInfo.homeTeam} • {gameInfo.time}
          </div>
        )}

        <div className="space-y-6">
          {/* Pick Header */}
          <div className="flex items-end justify-between pb-6 border-b border-border">
            <div>
              <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">
                Recommended Pick
              </div>
              <div className="text-4xl font-bold tracking-tight text-foreground mb-1">
                {pick.pick_side}
              </div>
              <div className="text-lg text-muted-foreground font-mono">
                {pick.odds_at_generation > 0 ? '+' : ''}{pick.odds_at_generation}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">
                Confidence
              </div>
              <div className={cn(
                "text-4xl font-bold tracking-tight",
                isHigh ? "text-success" :
                isMedium ? "text-warning" :
                "text-muted-foreground"
              )}>
                {pick.confidence_score}%
              </div>
            </div>
          </div>

          {/* Reasoning */}
          <div>
            <div className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-semibold">
              Reasoning
            </div>
            <div className="text-sm text-foreground leading-relaxed">
              {pick.reasoning_text}
            </div>
          </div>

          {/* Timestamp */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-4 border-t border-border">
            <Clock size={12} strokeWidth={2} />
            <span>Generated {new Date(pick.created_at).toLocaleString()}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

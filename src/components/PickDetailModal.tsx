import React from 'react';
import { PickData } from '../types';
import { TrendingUp, Clock, Zap, X } from 'lucide-react';
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

export const PickDetailModal: React.FC<PickDetailModalProps> = ({ 
  pick, 
  isOpen, 
  onClose,
  gameInfo 
}) => {
  const confidenceColor = 
    pick.confidence_score >= 75 ? 'text-success' :
    pick.confidence_score >= 50 ? 'text-yellow-500' :
    'text-textSecondary';

  const confidenceBg =
    pick.confidence_score >= 75 ? 'bg-success/10 border-success/20' :
    pick.confidence_score >= 50 ? 'bg-yellow-500/10 border-yellow-500/20' :
    'bg-surfaceHighlight/50 border-border/20';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-surface border-border/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-textPrimary">
            <Zap size={20} className="text-accent" strokeWidth={2.5} />
            AI Pick Analysis
          </DialogTitle>
        </DialogHeader>

        {gameInfo && (
          <div className="text-sm text-textSecondary mb-4">
            {gameInfo.awayTeam} @ {gameInfo.homeTeam} • {gameInfo.time}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-surfaceHighlight/30 border border-border/20">
            <div>
              <div className="text-xs text-textSecondary mb-1 uppercase tracking-wider">Recommendation</div>
              <div className="text-2xl font-bold text-accent">{pick.pick_side}</div>
              <div className="text-sm text-textSecondary mt-1">
                @ {pick.odds_at_generation > 0 ? '+' : ''}{pick.odds_at_generation}
              </div>
            </div>
            <div className={`flex flex-col items-center gap-2 px-6 py-3 rounded-lg border ${confidenceBg}`}>
              <TrendingUp size={24} className={confidenceColor} strokeWidth={2.5} />
              <div className={`text-2xl font-bold ${confidenceColor}`}>{pick.confidence_score}%</div>
              <div className="text-xs text-textSecondary uppercase tracking-wider">Confidence</div>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-textPrimary mb-2 uppercase tracking-wider">
              Analysis
            </div>
            <div className="text-sm text-textSecondary leading-relaxed bg-surfaceHighlight/20 rounded-lg p-4 border border-border/10">
              {pick.reasoning_text}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-textTertiary pt-2 border-t border-border/10">
            <Clock size={12} strokeWidth={2} />
            <span>Generated {new Date(pick.created_at).toLocaleString()}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

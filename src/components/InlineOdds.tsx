import { cn } from '@/lib/utils';
import type { MarketData } from '@/types';

interface InlineOddsProps {
  odds: MarketData;
  isAway?: boolean;
  compact?: boolean;
}

export function InlineOdds({ odds, isAway = false, compact = false }: InlineOddsProps) {
  const spread = isAway ? odds.awayPL : odds.homePL;
  const moneyline = isAway ? odds.awayML : odds.homeML;

  // Parse spread to check if favorite
  const spreadMatch = spread?.match(/([-+]?\d+\.?\d*)/);
  const spreadValue = spreadMatch ? parseFloat(spreadMatch[1]) : 0;
  const isFavorite = spreadValue < 0;

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-content-secondary">
        {spread && (
          <span className={cn(
            "font-medium",
            isFavorite && "text-content-primary"
          )}>
            {spread}
          </span>
        )}
        {moneyline && (
          <span className="text-content-tertiary">
            {moneyline}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      {spread && (
        <span className={cn(
          "font-medium",
          isFavorite ? "text-content-primary" : "text-content-secondary"
        )}>
          {spread}
        </span>
      )}
      {odds.total && (
        <span className="text-content-tertiary">
          O/U {odds.total}
        </span>
      )}
    </div>
  );
}

import { useState } from 'react';
import { ChevronRight, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineOdds } from './InlineOdds';
import { PickDetailModal } from './PickDetailModal';
import type { GameData } from '@/types';

interface GameRowProps {
  game: GameData;
  bookmaker: string;
}

function getEspnLogoUrl(teamName: string, league: string): string {
  const teamSlug = teamName.toLowerCase().replace(/\s+/g, '-');
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${league.toLowerCase()}/500/${teamSlug}.png&h=40&w=40`;
}

export function GameRow({ game, bookmaker }: GameRowProps) {
  const [showPickModal, setShowPickModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const odds = game.odds[bookmaker];
  const isLive = game.status === 'Live';
  const isFinal = game.status === 'Final';
  const hasPick = !!game.pick;

  const handleRowClick = () => {
    if (hasPick) {
      setShowPickModal(true);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  const statusColor = isLive ? 'text-semantic-error' : 
                      isFinal ? 'text-content-tertiary' : 
                      'text-content-secondary';

  return (
    <>
      <div
        onClick={handleRowClick}
        className={cn(
          "group relative bg-surface-primary hover:bg-surface-secondary",
          "border-b border-border transition-colors duration-200 cursor-pointer",
          hasPick && "border-l-4 border-l-primary"
        )}
      >
        {/* Away Team Row */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Team Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <img
              src={getEspnLogoUrl(game.awayTeam, game.league)}
              alt={`${game.awayTeam} logo`}
              className="w-8 h-8 object-contain flex-shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-content-primary truncate">
                  {game.awayTeam}
                </span>
                {game.awayRecord && (
                  <span className="text-xs text-content-tertiary">
                    {game.awayRecord}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status/Time */}
          <div className={cn("text-sm font-medium min-w-[80px] text-right", statusColor)}>
            {isLive && '⚡ '}
            {isFinal ? 'FINAL' : game.time}
          </div>

          {/* Odds */}
          {odds && (
            <div className="min-w-[100px] text-right">
              <InlineOdds odds={odds} isAway={true} compact />
            </div>
          )}

          {/* Action Indicator */}
          <div className="flex items-center gap-2 min-w-[120px] justify-end">
            {hasPick && (
              <div className="flex items-center gap-1 text-primary">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-semibold">AI Pick</span>
              </div>
            )}
            <ChevronRight className={cn(
              "w-4 h-4 text-content-tertiary transition-transform duration-200",
              "group-hover:text-content-secondary group-hover:translate-x-1"
            )} />
          </div>
        </div>

        {/* Home Team Row */}
        <div className="flex items-center gap-3 px-4 pb-3">
          {/* Team Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <img
              src={getEspnLogoUrl(game.homeTeam, game.league)}
              alt={`${game.homeTeam} logo`}
              className="w-8 h-8 object-contain flex-shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-content-primary truncate">
                  {game.homeTeam}
                </span>
                {game.homeRecord && (
                  <span className="text-xs text-content-tertiary">
                    {game.homeRecord}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Empty space for alignment */}
          <div className="min-w-[80px]" />

          {/* Odds */}
          {odds && (
            <div className="min-w-[100px] text-right">
              <InlineOdds odds={odds} isAway={false} compact />
            </div>
          )}

          {/* Empty space for alignment */}
          <div className="min-w-[120px]" />
        </div>

        {/* Scores for Live/Final games */}
        {(isLive || isFinal) && (
          <div className="absolute top-3 right-36 flex flex-col items-end gap-2 text-lg font-bold">
            <span className={cn(
              "tabular-nums",
              game.awayScore && game.homeScore && parseInt(game.awayScore) > parseInt(game.homeScore)
                ? "text-content-primary"
                : "text-content-tertiary"
            )}>
              {game.awayScore || '0'}
            </span>
            <span className={cn(
              "tabular-nums",
              game.awayScore && game.homeScore && parseInt(game.homeScore) > parseInt(game.awayScore)
                ? "text-content-primary"
                : "text-content-tertiary"
            )}>
              {game.homeScore || '0'}
            </span>
          </div>
        )}
      </div>

      {/* Pick Detail Modal */}
      {hasPick && game.pick && (
        <PickDetailModal
          pick={game.pick}
          game={game}
          isOpen={showPickModal}
          onClose={() => setShowPickModal(false)}
        />
      )}
    </>
  );
}

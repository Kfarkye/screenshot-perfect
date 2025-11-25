/**
 * @component GameModalRouter
 * @description Automatically routes to the correct modal based on game status
 * 
 * @metanotes {
 *   "pattern": "State-based routing",
 *   "modals": {
 *     "scheduled": "PickDetailModal",
 *     "live": "LiveGameModal", 
 *     "final": "GameResultModal"
 *   }
 * }
 */

import React, { type FC } from 'react';
import { PickDetailModal } from './PickDetailModal';
import { LiveGameModal } from './LiveGameModal';
import { GameResultModal } from './GameResultModal';
import { useLiveGame, useGameModalType, type GameStatus } from '@/hooks/useLiveGame';
import type { PickData, GameData, League } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface LineMovement {
  timestamp: string;
  spread: number;
  total: number;
  homeML: number;
  awayML: number;
}

interface GameModalRouterProps {
  readonly pick: PickData;
  readonly game: GameData;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly lineHistory?: LineMovement[];
  readonly closingLine?: {
    spread: number;
    total: number;
    homeML: number;
    awayML: number;
  };
  readonly unitSize?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const GameModalRouter: FC<GameModalRouterProps> = ({
  pick,
  game,
  isOpen,
  onClose,
  lineHistory = [],
  closingLine,
  unitSize = 100,
}) => {
  // Fetch live data when modal is open (game.id is the ESPN game ID)
  const {
    game: liveGameData,
    refresh,
    isRefreshing,
    lastUpdated,
    isLive,
  } = useLiveGame(game.id, game.league as League, {
    enabled: isOpen,
    pollingInterval: 30000,
  });

  // Determine current game status (prefer live data over static)
  const currentStatus: GameStatus = liveGameData?.status ?? (game.status === 'Live' ? 'live' : game.status === 'Final' ? 'final' : 'scheduled');

  // Determine which modal to show
  const modalType = useGameModalType(currentStatus);

  // Parse scores from game if available
  const staticHomeScore = typeof game.homeScore === 'number' ? game.homeScore : parseInt(game.homeScore || '0', 10);
  const staticAwayScore = typeof game.awayScore === 'number' ? game.awayScore : parseInt(game.awayScore || '0', 10);

  // Merge static game data with live data
  const enrichedGame = {
    ...game,
    ...(liveGameData && {
      homeScore: liveGameData.homeScore,
      awayScore: liveGameData.awayScore,
      period: liveGameData.period,
      periodDisplay: liveGameData.periodDisplay,
      clock: liveGameData.clock,
      possession: liveGameData.possession,
      lastPlay: liveGameData.lastPlay,
      situation: liveGameData.situation,
      status: liveGameData.status,
      startTime: liveGameData.startTime,
    }),
    // Ensure we have scores for final games (fallback to static data)
    homeScore: liveGameData?.homeScore ?? staticHomeScore,
    awayScore: liveGameData?.awayScore ?? staticAwayScore,
  };

  // Route to appropriate modal
  switch (modalType) {
    case 'live':
      return (
        <LiveGameModal
          pick={pick}
          game={enrichedGame as any}
          isOpen={isOpen}
          onClose={onClose}
          lineHistory={lineHistory}
          onRefresh={refresh}
          isRefreshing={isRefreshing}
          lastUpdated={lastUpdated ?? undefined}
        />
      );

    case 'result':
      return (
        <GameResultModal
          pick={pick}
          game={enrichedGame as any}
          isOpen={isOpen}
          onClose={onClose}
          closingLine={closingLine}
          unitSize={unitSize}
        />
      );

    case 'pick':
    default:
      return (
        <PickDetailModal
          pick={pick}
          game={game}
          isOpen={isOpen}
          onClose={onClose}
        />
      );
  }
};

export default GameModalRouter;

import { supabase } from '../integrations/supabase/client';
import { GameData, MarketType, PickData } from '../types';

export interface GeneratePickParams {
  game_id: string;
  current_odds: number;
  game_context: Record<string, any>;
  market_type: MarketType;
}

export const generatePick = async (
  game: GameData,
  marketType: MarketType = 'moneyline'
): Promise<PickData> => {
  // Extract current odds based on market type
  const odds = game.odds.draftkings || game.odds.generic;
  let currentOdds = -110; // default

  if (marketType === 'moneyline') {
    // Use home team moneyline as reference
    const homeML = parseInt(odds.homeML, 10);
    if (!isNaN(homeML)) currentOdds = homeML;
  }

  // Build game context
  const gameContext = {
    away_team: game.awayTeam,
    home_team: game.homeTeam,
    away_record: game.awayRecord,
    home_record: game.homeRecord,
    league: game.league,
    time: game.time,
    status: game.status,
    moneyline_away: odds.awayML,
    moneyline_home: odds.homeML,
    spread_away: odds.awayPL,
    spread_home: odds.homePL,
    total: odds.total,
  };

  const { data, error } = await supabase.functions.invoke('generate-pick', {
    body: {
      game_id: game.id,
      current_odds: currentOdds,
      game_context: gameContext,
      market_type: marketType,
    },
  });

  if (error) {
    console.error('Pick generation error:', error);
    throw new Error(`Failed to generate pick: ${error.message}`);
  }

  if (!data) {
    throw new Error('No data returned from pick generation');
  }

  return data as PickData;
};

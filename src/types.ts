export type League = 'NHL' | 'NFL' | 'NBA';

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  isError?: boolean;
  metadata?: Record<string, any>;
  status: 'pending' | 'processing' | 'complete' | 'error' | 'cancelled';
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

export enum SuggestionType {
  SLATE = "Today's Slate",
  TRENDS = "Recent Trends",
  INJURIES = "Key Injuries",
  GAME_EXAMPLE = "Rangers vs Devils",
  PROMO_STRATEGY = "Optimize a No-Loss Bet"
}

export interface MarketData {
  awayML: string;
  homeML: string;
  awayPL: string; // Puck Line, Spread, or Run Line
  homePL: string;
  total: string;
  overOdds: string;
  underOdds: string;
}

export type MarketType = 'moneyline' | 'puckline' | 'total' | 'prop';

export interface PickData {
  pick_side: string;
  confidence_score: number;
  reasoning_text: string;
  created_at: string;
  odds_at_generation: number;
}

export interface GameData {
  id: string;
  league: League;
  awayTeam: string;
  homeTeam: string;
  awayRecord?: string;
  homeRecord?: string;
  time: string;
  timestamp: number; // Unix timestamp for accurate sorting
  status: 'Scheduled' | 'Live' | 'Final' | 'Postponed' | 'Canceled';
  awayScore?: string;
  homeScore?: string;
  // Map of bookmaker key (e.g., 'draftkings') to their specific odds
  odds: Record<string, MarketData>;
  // AI-generated pick data
  pick?: PickData;
  isLoadingPick?: boolean;
}

export type AppTheme = 'light' | 'dark';
export type League = 'NHL' | 'NFL';
export type AppTheme = 'light' | 'dark';

export interface MarketData {
  spread?: string;
  moneyline?: string;
  total?: string;
  [key: string]: string | undefined;
}

export interface GameData {
  id: string;
  league: League;
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  startTime: string;
  status: 'scheduled' | 'live' | 'final';
  markets: {
    [bookmaker: string]: {
      home: MarketData;
      away: MarketData;
    };
  };
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

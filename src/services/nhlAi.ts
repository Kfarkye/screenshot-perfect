import type { GameData, League } from '../types';

// Mock data generator for demonstration
export async function fetchSchedule(league: League, date: Date = new Date()): Promise<GameData[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const dateStr = date.toISOString().split('T')[0];
  
  // Generate mock games based on league
  if (league === 'NHL') {
    return [
      {
        id: `nhl-${dateStr}-1`,
        league: 'NHL',
        homeTeam: 'Toronto Maple Leafs',
        awayTeam: 'Montreal Canadiens',
        homeAbbr: 'TOR',
        awayAbbr: 'MTL',
        startTime: new Date(date.setHours(19, 0, 0, 0)).toISOString(),
        status: 'scheduled',
        markets: {
          draftkings: {
            home: { spread: '-1.5 (-110)', moneyline: '-185', total: 'O 6.5 (-105)' },
            away: { spread: '+1.5 (-110)', moneyline: '+165', total: 'U 6.5 (-115)' }
          }
        }
      },
      {
        id: `nhl-${dateStr}-2`,
        league: 'NHL',
        homeTeam: 'Boston Bruins',
        awayTeam: 'New York Rangers',
        homeAbbr: 'BOS',
        awayAbbr: 'NYR',
        startTime: new Date(date.setHours(20, 0, 0, 0)).toISOString(),
        status: 'scheduled',
        markets: {
          draftkings: {
            home: { spread: '-1.5 (+120)', moneyline: '-150', total: 'O 6.0 (-110)' },
            away: { spread: '+1.5 (-140)', moneyline: '+130', total: 'U 6.0 (-110)' }
          }
        }
      }
    ];
  } else {
    return [
      {
        id: `nfl-${dateStr}-1`,
        league: 'NFL',
        homeTeam: 'Kansas City Chiefs',
        awayTeam: 'Buffalo Bills',
        homeAbbr: 'KC',
        awayAbbr: 'BUF',
        startTime: new Date(date.setHours(16, 25, 0, 0)).toISOString(),
        status: 'scheduled',
        markets: {
          draftkings: {
            home: { spread: '-2.5 (-110)', moneyline: '-140', total: 'O 54.5 (-110)' },
            away: { spread: '+2.5 (-110)', moneyline: '+120', total: 'U 54.5 (-110)' }
          }
        }
      }
    ];
  }
}

export async function analyzeGame(gameId: string, query: string): Promise<string> {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return `Analysis for ${gameId}: ${query}\n\nThis is a mock response. Connect Gemini AI for real analysis.`;
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { LeagueNavigator } from './LeagueNavigator';
import { LeagueSection } from './LeagueSection';
import { GameRow } from './GameRow';
import { Skeleton } from './ui/skeleton';
import type { GameData, League } from '@/types';
import { ALL_LEAGUES } from '@/lib/leagueConfig';

interface ScheduleViewProps {
  onAnalyze?: (game: GameData) => void;
  league: League;
}

export function ScheduleView({ league }: ScheduleViewProps) {
  const [games, setGames] = useState<GameData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBookmaker, setSelectedBookmaker] = useState('fanduel');
  const [selectedLeagues, setSelectedLeagues] = useState<League[]>([league]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Load data for all selected leagues
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // Fetch games for all selected leagues
      const allGames: GameData[] = [];
      
      for (const leagueType of selectedLeagues) {
        let scheduleData: any[] = [];
        
        if (leagueType === 'NHL') {
          const response = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateStr.replace(/-/g, '')}`
          );
          if (!response.ok) throw new Error(`Failed to fetch ${leagueType} schedule`);
          const data = await response.json();
          scheduleData = data.events || [];
        } else if (leagueType === 'NFL') {
          const { data, error } = await supabase
            .from('nfl_games')
            .select('*')
            .eq('game_date', dateStr);
          
          if (error) throw error;
          scheduleData = data || [];
        } else if (leagueType === 'NBA') {
          const { data, error } = await supabase
            .from('nba_games')
            .select('*')
            .eq('game_date', dateStr);
          
          if (error) throw error;
          scheduleData = data || [];
        }

        // Transform to GameData format
        scheduleData.forEach((event: any) => {
          let gameData: GameData;
          
          if (leagueType === 'NHL') {
            const competition = event.competitions?.[0];
            const awayTeam = competition?.competitors?.find((c: any) => c.homeAway === 'away');
            const homeTeam = competition?.competitors?.find((c: any) => c.homeAway === 'home');
            
            gameData = {
              id: event.id,
              league: 'NHL',
              awayTeam: awayTeam?.team?.displayName || 'TBD',
              homeTeam: homeTeam?.team?.displayName || 'TBD',
              awayRecord: awayTeam?.records?.[0]?.summary,
              homeRecord: homeTeam?.records?.[0]?.summary,
              time: new Date(event.date).toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              }),
              timestamp: new Date(event.date).getTime(),
              status: event.status?.type?.state === 'in' ? 'Live' :
                      event.status?.type?.state === 'post' ? 'Final' : 'Scheduled',
              awayScore: awayTeam?.score,
              homeScore: homeTeam?.score,
              odds: {},
            };
          } else {
            // NFL/NBA from Supabase
            gameData = {
              id: event.game_id,
              league: leagueType,
              awayTeam: event.away_team,
              homeTeam: event.home_team,
              time: new Date(event.start_time).toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              }),
              timestamp: new Date(event.start_time).getTime(),
              status: event.status === 'scheduled' ? 'Scheduled' :
                      event.status === 'in_progress' ? 'Live' : 
                      event.status === 'final' ? 'Final' : 'Scheduled',
              awayScore: event.away_score?.toString(),
              homeScore: event.home_score?.toString(),
              odds: {},
            };
          }
          
          allGames.push(gameData);
        });
      }

      // Fetch analysis picks for all games
      const gameIds = allGames.map(g => g.id);
      if (gameIds.length > 0) {
        const { data: picks } = await supabase
          .from('analysis_memory')
          .select('*')
          .in('game_id', gameIds);

        if (picks) {
          allGames.forEach(game => {
            const pick = picks.find(p => p.game_id === game.id);
            if (pick) {
              game.pick = {
                pick_side: pick.pick_side,
                confidence_score: pick.confidence_score,
                reasoning_text: pick.reasoning_text,
                created_at: pick.created_at,
                odds_at_generation: pick.odds_at_generation || 0,
              };
            }
          });
        }
      }

      // Sort by timestamp
      allGames.sort((a, b) => a.timestamp - b.timestamp);
      
      setGames(allGames);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error loading games:', err);
      setError(err instanceof Error ? err.message : 'Failed to load games');
    } finally {
      setLoading(false);
    }
  }, [currentDate, selectedLeagues]);

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 60 seconds if viewing today
    const isToday = currentDate.toDateString() === new Date().toDateString();
    if (!isToday) return;

    const interval = setInterval(() => {
      loadData();
    }, 60000);

    return () => clearInterval(interval);
  }, [loadData, currentDate]);

  const handleLeagueToggle = (toggledLeague: League) => {
    setSelectedLeagues(prev => {
      if (prev.includes(toggledLeague)) {
        return prev.filter(l => l !== toggledLeague);
      } else {
        return [...prev, toggledLeague];
      }
    });
  };

  // Group games by league
  const gamesByLeague = useMemo(() => {
    const grouped: Record<League, GameData[]> = {
      NHL: [],
      NFL: [],
      NBA: [],
    };

    games.forEach(game => {
      grouped[game.league].push(game);
    });

    return grouped;
  }, [games]);

  const gamesWithPicks = useMemo(() => {
    return games.filter(g => g.pick);
  }, [games]);

  if (loading) {
    return (
      <div className="space-y-6">
        <LeagueNavigator 
          selectedLeagues={selectedLeagues}
          onLeagueToggle={handleLeagueToggle}
        />
        <div className="px-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <LeagueNavigator 
          selectedLeagues={selectedLeagues}
          onLeagueToggle={handleLeagueToggle}
        />
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <p className="text-content-secondary text-center mb-4">{error}</p>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <LeagueNavigator 
        selectedLeagues={selectedLeagues}
        onLeagueToggle={handleLeagueToggle}
      />

      {/* MY PICKS Section */}
      {gamesWithPicks.length > 0 && (
        <section className="mb-6 mt-6">
          <div className="px-4 py-3 bg-primary/10 border-l-4 border-primary">
            <h2 className="text-sm font-bold text-primary uppercase tracking-wide">
              MY PICKS · {gamesWithPicks.length} {gamesWithPicks.length === 1 ? 'game' : 'games'}
            </h2>
          </div>
          <div className="divide-y divide-border">
            {gamesWithPicks.map((game) => (
              <GameRow
                key={game.id}
                game={game}
                bookmaker={selectedBookmaker}
              />
            ))}
          </div>
        </section>
      )}

      {/* League Sections */}
      <div className="space-y-0">
        {ALL_LEAGUES.map(leagueType => (
          selectedLeagues.includes(leagueType) && (
            <LeagueSection
              key={leagueType}
              league={leagueType}
              games={gamesByLeague[leagueType]}
              bookmaker={selectedBookmaker}
            />
          )
        ))}
      </div>

      {/* Empty State */}
      {games.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <p className="text-content-secondary mb-2">No games scheduled</p>
          <p className="text-content-tertiary text-sm">
            Try selecting different leagues or check back later
          </p>
        </div>
      )}

      {/* Last Updated */}
      {lastUpdated && (
        <div className="text-center py-4 text-xs text-content-tertiary">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

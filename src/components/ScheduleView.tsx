import React, { useEffect, useState, useRef, useCallback } from 'react';
import { fetchSchedule } from '../services/nhlAi';
import { GameData, League } from '../types';
import { GameCard } from './GameCard';
import { RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

interface ScheduleViewProps {
  onAnalyze?: (game: GameData) => void;
  league: League;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({ onAnalyze, league }) => {
  const [games, setGames] = useState<GameData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedBook, setSelectedBook] = useState<string>('draftkings');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  const refreshIntervalRef = useRef<number | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(false);
    try {
      const data = await fetchSchedule(league, currentDate);
      if (data) { 
        setGames(data);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [league, currentDate]);

  useEffect(() => {
    loadData();

    const today = new Date();
    const isToday = currentDate.getDate() === today.getDate() && 
                    currentDate.getMonth() === today.getMonth();
    
    if (isToday) {
        refreshIntervalRef.current = window.setInterval(() => {
            loadData(true); 
        }, 30000);
    }

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [loadData, currentDate]);

  const changeDate = (days: number) => {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + days);
      setCurrentDate(newDate);
  };
  
  const formatDate = (date: Date) => {
      const today = new Date();
      if (date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear()) {
          return "Today";
      }
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (isLoading && games.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw size={32} className="animate-spin text-primary" />
          <p className="text-textSecondary">Loading schedule...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <AlertCircle size={32} className="text-danger" />
          <p className="text-textSecondary">Failed to load schedule</p>
          <button
            onClick={() => loadData()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => changeDate(-1)}
            className="p-2 rounded-lg bg-secondary hover:bg-accent transition-colors"
            aria-label="Previous day"
          >
            <ChevronLeft size={20} />
          </button>
          
          <div className="flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg">
            <Calendar size={18} className="text-primary" />
            <span className="font-semibold text-foreground">{formatDate(currentDate)}</span>
          </div>
          
          <button
            onClick={() => changeDate(1)}
            className="p-2 rounded-lg bg-secondary hover:bg-accent transition-colors"
            aria-label="Next day"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-textSecondary">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
          <button
            onClick={() => loadData()}
            className={cn(
              "p-2 rounded-lg bg-secondary hover:bg-accent transition-colors",
              isLoading && "animate-spin"
            )}
            aria-label="Refresh"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {games.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-textSecondary">No games scheduled for this date</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              selectedBook={selectedBook}
              onAnalyze={onAnalyze}
            />
          ))}
        </div>
      )}
    </div>
  );
};

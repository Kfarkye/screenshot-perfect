
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
  
  // Date State
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  const refreshIntervalRef = useRef<number | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(false);
    try {
      // Pass the selected currentDate to the fetcher
      const data = await fetchSchedule(league, currentDate);
      if (data) { 
        // Set initial games without picks
        setGames(data);
        
        // Auto-generate picks in batches to avoid overwhelming the API
        const { generatePick } = await import('../services/pickGenerator');
        
        const gamesToProcess = data.filter(game => 
          game.status !== 'Final' && 
          game.status !== 'Canceled' && 
          game.status !== 'Postponed' &&
          !game.pick &&
          (game.odds?.draftkings?.awayML !== '-' || game.odds?.generic?.awayML !== '-')
        );

        // Process in batches of 3 with delays between batches
        const BATCH_SIZE = 3;
        const BATCH_DELAY = 2000; // 2 seconds between batches
        
        const allGames = [...data];
        
        for (let i = 0; i < gamesToProcess.length; i += BATCH_SIZE) {
          const batch = gamesToProcess.slice(i, i + BATCH_SIZE);
          
          const batchResults = await Promise.allSettled(
            batch.map(game => generatePick(game, 'moneyline'))
          );
          
          // Update games with results
          batchResults.forEach((result, idx) => {
            const game = batch[idx];
            const gameIndex = allGames.findIndex(g => g.id === game.id);
            
            if (result.status === 'fulfilled') {
              allGames[gameIndex] = { ...game, pick: result.value };
            } else {
              console.error(`Failed to generate pick for ${game.id}:`, result.reason);
            }
          });
          
          // Update UI after each batch
          setGames([...allGames]);
          
          // Add delay between batches (except for the last batch)
          if (i + BATCH_SIZE < gamesToProcess.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
          }
        }
        
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [league, currentDate]);

  // Initial load and auto-refresh
  useEffect(() => {
    loadData();

    // Auto-refresh every 30s only if looking at Today or Future
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

  // Handle Date Navigation
  const changeDate = (days: number) => {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + days);
      setCurrentDate(newDate);
  };
  
  const formatDate = (date: Date) => {
      const today = new Date();
      // Check if Today
      if (date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear()) {
          return "Today";
      }
      
      // Check if Tomorrow
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (date.getDate() === tomorrow.getDate() && date.getMonth() === tomorrow.getMonth() && date.getFullYear() === tomorrow.getFullYear()) {
          return "Tomorrow";
      }
      
      // Check if Yesterday
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth() && date.getFullYear() === yesterday.getFullYear()) {
          return "Yesterday";
      }

      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const books = [
    { id: 'draftkings', label: 'DK' },
    { id: 'fanduel', label: 'FD' },
    { id: 'betmgm', label: 'MGM' },
    { id: 'williamhill', label: 'CZR' },
  ];

  if (isLoading && games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5">
        <div className="relative">
          <div className="w-10 h-10 border-3 border-accent/30 border-t-accent rounded-full motion-safe:animate-spin"></div>
          <div className="absolute inset-0 w-10 h-10 border-3 border-transparent border-t-accent/50 rounded-full motion-safe:animate-ping"></div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-foreground font-bold uppercase tracking-[0.15em] motion-safe:animate-pulse">Syncing {league} Odds</p>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-accent rounded-full motion-safe:animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-1.5 h-1.5 bg-accent rounded-full motion-safe:animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-1.5 h-1.5 bg-accent rounded-full motion-safe:animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 motion-safe:animate-slide-up">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-5 border border-destructive/20 shadow-lg backdrop-blur-sm">
          <AlertCircle className="w-7 h-7 text-destructive" strokeWidth={2.5} />
        </div>
        <h3 className="text-xl font-bold text-foreground mb-2.5 tracking-tight">Market Unavailable</h3>
        <p className="text-sm text-muted-foreground mb-7 max-w-xs mx-auto leading-relaxed">
          Could not retrieve the slate for this date. The market might be closed.
        </p>
        <button
          onClick={() => loadData(false)}
          className="glass-button px-7 py-3 rounded-xl text-sm font-bold text-foreground flex items-center gap-2.5 shadow-md hover:shadow-xl motion-safe:hover:scale-105 active:scale-100 transition-all duration-300"
          style={{ willChange: 'transform' }}
        >
          <RefreshCw size={15} strokeWidth={2.5} />
          <span>Retry Sync</span>
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-3 pb-20 animate-slide-up">
      {/* Date Navigation & Controls Header */}
      <div className="flex flex-col gap-5 mb-6">

          {/* Top Row: League/Status & Last Update */}
          <div className="flex items-center justify-between px-1">
             <div className="flex items-center gap-3.5">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success shadow-glow-accent-sm"></span>
                </span>
                 <div className="flex flex-col">
                   <h2 className="text-xs font-extrabold text-muted-foreground tracking-[0.12em] uppercase">{league} Board</h2>
                   <span className="text-[9px] text-muted-foreground/70 font-mono hidden md:block mt-0.5">
                     Updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                   </span>
                 </div>
            </div>

            {/* Premium Date Navigator */}
            <div className="flex items-center bg-muted/80 border border-border/50 rounded-full p-1 shadow-sm backdrop-blur-sm">
                <button
                    onClick={() => changeDate(-1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-card text-muted-foreground hover:text-foreground transition-all duration-300 motion-safe:hover:scale-110 active:scale-95"
                    aria-label="Previous Day"
                    style={{ willChange: 'transform' }}
                >
                    <ChevronLeft size={16} strokeWidth={2.5} />
                </button>
                <div className="px-5 min-w-[110px] text-center">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wide">
                        {formatDate(currentDate)}
                    </span>
                </div>
                <button
                    onClick={() => changeDate(1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-card text-muted-foreground hover:text-foreground transition-all duration-300 motion-safe:hover:scale-110 active:scale-95"
                    aria-label="Next Day"
                    style={{ willChange: 'transform' }}
                >
                    <ChevronRight size={16} strokeWidth={2.5} />
                </button>
            </div>
          </div>
          
          {/* Premium Bookmaker Selector */}
          <div className="flex justify-end px-1">
            <div className="flex bg-muted/80 border border-border/50 rounded-xl p-1 shadow-sm backdrop-blur-sm gap-1">
              {books.map((book) => (
                 <button
                   key={book.id}
                   onClick={() => setSelectedBook(book.id)}
                   className={cn(
                     "px-3 md:px-4 py-1.5 text-[10px] font-extrabold rounded-lg transition-all duration-500 uppercase tracking-wide",
                     selectedBook === book.id
                       ? 'bg-card shadow-md text-accent border border-accent/20 motion-safe:scale-105'
                       : 'text-muted-foreground hover:text-foreground hover:bg-card/50 motion-safe:hover:scale-105 active:scale-95'
                   )}
                   style={{ willChange: 'transform' }}
                 >
                   {book.label}
                 </button>
              ))}
            </div>
          </div>
      </div>
      
      <div className="space-y-0">
        {games.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-50">
             <Calendar className="w-8 h-8 mb-3 text-muted-foreground" />
             <p className="text-sm font-medium">No {league} games scheduled for {formatDate(currentDate)}.</p>
          </div>
        ) : (
          games.map((game, idx) => (
            <GameCard key={game.id || idx} game={game} selectedBook={selectedBook} onAnalyze={onAnalyze} />
          ))
        )}
      </div>
      
      <div className="flex flex-col items-center mt-12 gap-2 opacity-50 hover:opacity-100 transition-opacity">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
           SharpEdge Analytics Engine
        </span>
        <div className="h-px w-12 bg-border/20"></div>
      </div>
    </div>
  );
};
/**
 * @component ScheduleView
 * @description Game schedule browser with date navigation, sportsbook selector, and status filters
 *
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "features": [
 *     "Date navigation with Today/Tomorrow shortcuts",
 *     "Game status filters (All, Live, Upcoming, Final)",
 *     "Multi-sportsbook odds comparison",
 *     "Auto-refresh for live games",
 *     "Pre-generated picks integration",
 *     "Empty/Error/Loading states"
 *   ]
 * }
 */

import React, { useEffect, useState, useRef, useCallback, useMemo, type FC } from "react";
import {
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Zap,
  Filter,
  Radio,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { fetchSchedule } from "../services/nhlAi";
import { GameCard } from "./GameCard";
import type { GameData, League, PickData } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type GameStatus = "all" | "live" | "upcoming" | "final";
type Sportsbook = "draftkings" | "fanduel" | "betmgm" | "caesars";

interface ScheduleViewProps {
  readonly onAnalyze?: (game: GameData) => void;
  readonly league: League;
  readonly className?: string;
}

interface GameWithPick extends GameData {
  pick?: PickData;
}

interface SportsbookConfig {
  id: Sportsbook;
  label: string;
  shortLabel: string;
}

interface StatusFilterConfig {
  id: GameStatus;
  label: string;
  icon: typeof Radio;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 30000;

const SPORTSBOOKS: SportsbookConfig[] = [
  { id: "draftkings", label: "DraftKings", shortLabel: "DK" },
  { id: "fanduel", label: "FanDuel", shortLabel: "FD" },
  { id: "betmgm", label: "BetMGM", shortLabel: "MGM" },
  { id: "caesars", label: "Caesars", shortLabel: "CZR" },
];

const STATUS_FILTERS: StatusFilterConfig[] = [
  { id: "all", label: "All Games", icon: Filter },
  { id: "live", label: "Live", icon: Radio },
  { id: "upcoming", label: "Upcoming", icon: Clock },
  { id: "final", label: "Final", icon: CheckCircle2 },
];

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(" ");
};

const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getDate() === date2.getDate() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getFullYear() === date2.getFullYear()
  );
};

const formatDateLabel = (date: Date): string => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, tomorrow)) return "Tomorrow";
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const getGameStatus = (game: GameData): GameStatus => {
  const status = game.status?.toLowerCase() || "";
  if (status === "live" || status === "in_progress" || status === "in") return "live";
  if (status === "final" || status === "completed" || status === "post") return "final";
  return "upcoming";
};

// ─────────────────────────────────────────────────────────────────────────────
// LOADING STATE
// ─────────────────────────────────────────────────────────────────────────────

interface LoadingStateProps {
  league: League;
}

const LoadingState: FC<LoadingStateProps> = React.memo(({ league }) => (
  <div
    className="flex flex-col items-center justify-center h-full min-h-[400px] gap-5"
    role="status"
    aria-label={`Loading ${league} schedule`}
  >
    {/* Spinner */}
    <div className="relative">
      <div
        className={cn(
          "w-10 h-10 rounded-full",
          "border-3 border-accent/30 border-t-accent",
          "motion-safe:animate-spin",
        )}
      />
      <div
        className={cn(
          "absolute inset-0 w-10 h-10 rounded-full",
          "border-3 border-transparent border-t-accent/50",
          "motion-safe:animate-ping",
        )}
      />
    </div>

    {/* Text */}
    <div className="flex flex-col items-center gap-2">
      <p
        className={cn(
          "text-caption-1 font-bold text-content-primary",
          "uppercase tracking-widest",
          "motion-safe:animate-pulse",
        )}
      >
        Syncing {league} Odds
      </p>
      <div className="flex gap-1.5">
        {[0, 150, 300].map((delay) => (
          <div
            key={delay}
            className="w-1.5 h-1.5 bg-accent rounded-full motion-safe:animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  </div>
));

LoadingState.displayName = "LoadingState";

// ─────────────────────────────────────────────────────────────────────────────
// ERROR STATE
// ─────────────────────────────────────────────────────────────────────────────

interface ErrorStateProps {
  onRetry: () => void;
}

const ErrorState: FC<ErrorStateProps> = React.memo(({ onRetry }) => (
  <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8" role="alert">
    {/* Icon */}
    <div
      className={cn(
        "w-16 h-16 rounded-2xl mb-5",
        "bg-semantic-error/10 border border-semantic-error/20",
        "flex items-center justify-center",
        "shadow-lg backdrop-blur-sm",
      )}
    >
      <AlertCircle size={28} className="text-semantic-error" strokeWidth={2} />
    </div>

    {/* Text */}
    <h3 className="text-title-3 font-bold text-content-primary mb-2 tracking-tight">Market Unavailable</h3>
    <p className="text-body-sm text-content-secondary mb-7 max-w-xs leading-relaxed">
      Could not retrieve the slate for this date. The market might be closed or there may be a connection issue.
    </p>

    {/* Retry button */}
    <button
      onClick={onRetry}
      className={cn(
        "px-6 py-3 rounded-xl",
        "bg-glass-surface border border-glass-border",
        "text-body-sm font-bold text-content-primary",
        "flex items-center gap-2.5",
        "shadow-md backdrop-blur-xl",
        "transition-all duration-200 ease-standard",
        "hover:shadow-lg hover:border-content-tertiary/50",
        "hover:bg-surface-secondary/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        "active:scale-[0.98]",
      )}
    >
      <RefreshCw size={16} strokeWidth={2} />
      <span>Retry Sync</span>
    </button>
  </div>
));

ErrorState.displayName = "ErrorState";

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  league: League;
  dateLabel: string;
}

const EmptyState: FC<EmptyStateProps> = React.memo(({ league, dateLabel }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div
      className={cn(
        "w-14 h-14 rounded-2xl mb-4",
        "bg-surface-secondary/50 border border-glass-border",
        "flex items-center justify-center",
      )}
    >
      <Calendar size={24} className="text-content-tertiary" />
    </div>
    <p className="text-body-sm font-medium text-content-secondary">
      No {league} games scheduled for {dateLabel}
    </p>
    <p className="text-caption-1 text-content-tertiary mt-1">Try selecting a different date</p>
  </div>
));

EmptyState.displayName = "EmptyState";

// ─────────────────────────────────────────────────────────────────────────────
// DATE NAVIGATOR
// ─────────────────────────────────────────────────────────────────────────────

interface DateNavigatorProps {
  currentDate: Date;
  onDateChange: (days: number) => void;
  onGoToToday: () => void;
}

const DateNavigator: FC<DateNavigatorProps> = React.memo(({ currentDate, onDateChange, onGoToToday }) => {
  const dateLabel = useMemo(() => formatDateLabel(currentDate), [currentDate]);
  const isToday = useMemo(() => isSameDay(currentDate, new Date()), [currentDate]);

  return (
    <div className="flex items-center gap-2">
      {/* Navigator pill */}
      <div
        className={cn(
          "flex items-center",
          "bg-glass-surface border border-glass-border",
          "rounded-full p-1",
          "shadow-sm backdrop-blur-xl",
        )}
      >
        <button
          onClick={() => onDateChange(-1)}
          className={cn(
            "w-8 h-8 rounded-full",
            "flex items-center justify-center",
            "text-content-tertiary",
            "transition-all duration-150 ease-standard",
            "hover:bg-surface-secondary hover:text-content-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            "active:scale-95",
          )}
          aria-label="Previous day"
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
        </button>

        <div className="px-4 min-w-[100px] text-center">
          <span className="text-caption-1 font-bold text-content-primary uppercase tracking-wide">{dateLabel}</span>
        </div>

        <button
          onClick={() => onDateChange(1)}
          className={cn(
            "w-8 h-8 rounded-full",
            "flex items-center justify-center",
            "text-content-tertiary",
            "transition-all duration-150 ease-standard",
            "hover:bg-surface-secondary hover:text-content-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            "active:scale-95",
          )}
          aria-label="Next day"
        >
          <ChevronRight size={16} strokeWidth={2.5} />
        </button>
      </div>

      {/* Today shortcut */}
      {!isToday && (
        <button
          onClick={onGoToToday}
          className={cn(
            "px-3 py-1.5 rounded-lg",
            "bg-accent/10 border border-accent/20",
            "text-caption-2 font-semibold text-accent",
            "transition-all duration-150 ease-standard",
            "hover:bg-accent/20",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            "active:scale-95",
          )}
        >
          Today
        </button>
      )}
    </div>
  );
});

DateNavigator.displayName = "DateNavigator";

// ─────────────────────────────────────────────────────────────────────────────
// SPORTSBOOK SELECTOR
// ─────────────────────────────────────────────────────────────────────────────

interface SportsbookSelectorProps {
  selected: Sportsbook;
  onSelect: (book: Sportsbook) => void;
}

const SportsbookSelector: FC<SportsbookSelectorProps> = React.memo(({ selected, onSelect }) => (
  <div
    className={cn(
      "flex",
      "bg-glass-surface border border-glass-border",
      "rounded-xl p-1 gap-1",
      "shadow-sm backdrop-blur-xl",
    )}
    role="radiogroup"
    aria-label="Select sportsbook"
  >
    {SPORTSBOOKS.map((book) => {
      const isSelected = selected === book.id;

      return (
        <button
          key={book.id}
          onClick={() => onSelect(book.id)}
          role="radio"
          aria-checked={isSelected}
          aria-label={book.label}
          className={cn(
            "px-3 py-1.5 rounded-lg",
            "text-caption-2 font-bold uppercase tracking-wide",
            "transition-all duration-200 ease-standard",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            isSelected
              ? cn("bg-surface-primary shadow-md", "text-accent border border-accent/20", "scale-105")
              : cn(
                  "text-content-tertiary",
                  "hover:text-content-primary hover:bg-surface-secondary/50",
                  "active:scale-95",
                ),
          )}
        >
          {book.shortLabel}
        </button>
      );
    })}
  </div>
));

SportsbookSelector.displayName = "SportsbookSelector";

// ─────────────────────────────────────────────────────────────────────────────
// STATUS FILTER
// ─────────────────────────────────────────────────────────────────────────────

interface StatusFilterProps {
  selected: GameStatus;
  onSelect: (status: GameStatus) => void;
  counts: Record<GameStatus, number>;
}

const StatusFilter: FC<StatusFilterProps> = React.memo(({ selected, onSelect, counts }) => (
  <div
    className={cn("flex gap-2 overflow-x-auto", "scrollbar-hide", "-mx-4 px-4 md:mx-0 md:px-0")}
    role="radiogroup"
    aria-label="Filter by game status"
  >
    {STATUS_FILTERS.map((filter) => {
      const isSelected = selected === filter.id;
      const count = counts[filter.id];
      const Icon = filter.icon;

      return (
        <button
          key={filter.id}
          onClick={() => onSelect(filter.id)}
          role="radio"
          aria-checked={isSelected}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-xl",
            "text-caption-1 font-semibold whitespace-nowrap",
            "transition-all duration-150 ease-standard",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            "border",
            isSelected
              ? cn(
                  "bg-accent/10 border-accent/30 text-accent",
                  filter.id === "live" && "bg-semantic-success/10 border-semantic-success/30 text-semantic-success",
                )
              : "bg-glass-surface border-glass-border text-content-secondary hover:text-content-primary hover:border-content-tertiary/50",
          )}
        >
          <Icon size={14} className={cn(filter.id === "live" && isSelected && "animate-pulse")} />
          <span>{filter.label}</span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded-md text-caption-2 font-mono",
              isSelected ? "bg-white/20 text-inherit" : "bg-surface-secondary text-content-tertiary",
            )}
          >
            {count}
          </span>
        </button>
      );
    })}
  </div>
));

StatusFilter.displayName = "StatusFilter";

// ─────────────────────────────────────────────────────────────────────────────
// LIVE INDICATOR BADGE
// ─────────────────────────────────────────────────────────────────────────────

interface LiveIndicatorProps {
  lastUpdated: Date;
  isRefreshing: boolean;
}

const LiveIndicator: FC<LiveIndicatorProps> = React.memo(({ lastUpdated, isRefreshing }) => (
  <div className="flex items-center gap-3">
    {/* Pulse dot */}
    <span className="relative flex h-2.5 w-2.5">
      <span
        className={cn(
          "absolute inline-flex h-full w-full rounded-full",
          "bg-semantic-success opacity-75",
          "motion-safe:animate-ping",
        )}
      />
      <span
        className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", "bg-semantic-success shadow-glow-success-sm")}
      />
    </span>

    {/* Status text */}
    <div className="flex flex-col">
      <span className="text-caption-2 font-bold text-content-tertiary uppercase tracking-widest">Live Board</span>
      <span className="text-caption-2 text-content-tertiary/70 font-mono hidden md:block">
        {isRefreshing ? (
          <span className="flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" />
            Refreshing...
          </span>
        ) : (
          `Updated ${formatTime(lastUpdated)}`
        )}
      </span>
    </div>
  </div>
));

LiveIndicator.displayName = "LiveIndicator";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ScheduleView: FC<ScheduleViewProps> = ({ onAnalyze, league, className }) => {
  // State
  const [games, setGames] = useState<GameWithPick[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Sportsbook>("draftkings");
  const [selectedStatus, setSelectedStatus] = useState<GameStatus>("all");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Refs
  const refreshIntervalRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // DATA FETCHING
  // ─────────────────────────────────────────────────────────────────────────

  const loadData = useCallback(
    async (silent = false) => {
      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      if (!silent) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(false);

      try {
        const data = await fetchSchedule(league, currentDate);

        if (!data) {
          setGames([]);
          return;
        }

        // Fetch pre-generated picks
        const { supabase } = await import("@/integrations/supabase/client");
        const gameIds = data.map((g) => g.id);

        const { data: picks, error: picksError } = await supabase
          .from("analysis_memory")
          .select("game_id, pick_side, confidence_score, reasoning_text, odds_at_generation, created_at")
          .in("game_id", gameIds)
          .eq("market_type", "moneyline");

        if (picksError) {
          console.error("[PICKS_FETCH_ERROR]", picksError);
        }

        // Map picks to games
        const pickMap = new Map(
          (picks || []).map((p) => [
            p.game_id,
            {
              id: p.game_id,
              pick_side: p.pick_side,
              confidence_score: p.confidence_score,
              reasoning_text: p.reasoning_text,
              odds_at_generation: p.odds_at_generation,
              created_at: p.created_at,
              market_type: "moneyline" as const,
            },
          ]),
        );

        const gamesWithPicks: GameWithPick[] = data.map((game) => ({
          ...game,
          pick: pickMap.get(game.id),
        }));

        setGames(gamesWithPicks);
        setLastUpdated(new Date());
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          console.error("[SCHEDULE_FETCH_ERROR]", e);
          setError(true);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [league, currentDate],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // EFFECTS
  // ─────────────────────────────────────────────────────────────────────────

  // Initial load and auto-refresh
  useEffect(() => {
    loadData();

    // Auto-refresh only for today's games
    const isToday = isSameDay(currentDate, new Date());

    if (isToday) {
      refreshIntervalRef.current = window.setInterval(() => {
        loadData(true);
      }, REFRESH_INTERVAL_MS);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadData, currentDate]);

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handleDateChange = useCallback((days: number) => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + days);
      return newDate;
    });
  }, []);

  const handleGoToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const handleRetry = useCallback(() => {
    loadData(false);
  }, [loadData]);

  // ─────────────────────────────────────────────────────────────────────────
  // COMPUTED VALUES
  // ─────────────────────────────────────────────────────────────────────────

  const dateLabel = useMemo(() => formatDateLabel(currentDate), [currentDate]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<GameStatus, number> = {
      all: games.length,
      live: 0,
      upcoming: 0,
      final: 0,
    };

    games.forEach((game) => {
      const status = getGameStatus(game);
      counts[status]++;
    });

    return counts;
  }, [games]);

  // Filtered games
  const filteredGames = useMemo(() => {
    if (selectedStatus === "all") return games;
    return games.filter((game) => getGameStatus(game) === selectedStatus);
  }, [games, selectedStatus]);

  // Has live games
  const hasLiveGames = useMemo(() => statusCounts.live > 0, [statusCounts]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // Loading state (initial only)
  if (isLoading && games.length === 0) {
    return <LoadingState league={league} />;
  }

  // Error state
  if (error) {
    return <ErrorState onRetry={handleRetry} />;
  }

  return (
    <div className={cn("px-4 md:px-6 py-4 pb-24", className)}>
      {/* Header Section */}
      <div className="flex flex-col gap-4 mb-6">
        {/* Top row: Status indicator + Date navigator */}
        <div className="flex items-center justify-between">
          <LiveIndicator lastUpdated={lastUpdated} isRefreshing={isRefreshing} />
          <DateNavigator currentDate={currentDate} onDateChange={handleDateChange} onGoToToday={handleGoToToday} />
        </div>

        {/* Second row: Status filters */}
        <StatusFilter selected={selectedStatus} onSelect={setSelectedStatus} counts={statusCounts} />

        {/* Third row: Sportsbook selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-caption-2 text-content-tertiary uppercase tracking-wider font-semibold">
              Odds from
            </span>
          </div>
          <SportsbookSelector selected={selectedBook} onSelect={setSelectedBook} />
        </div>
      </div>

      {/* Games List */}
      <div className="space-y-0" role="list" aria-label={`${league} games`}>
        {filteredGames.length === 0 ? (
          selectedStatus !== "all" ? (
            <div className="text-center py-12 text-content-tertiary">
              <p className="text-body-sm">
                No {selectedStatus} games. Showing all {games.length} games instead.
              </p>
              <button
                onClick={() => setSelectedStatus("all")}
                className="mt-3 text-accent text-caption-1 font-semibold hover:underline"
              >
                View all games
              </button>
            </div>
          ) : (
            <EmptyState league={league} dateLabel={dateLabel} />
          )
        ) : (
          filteredGames.map((game, idx) => (
            <GameCard key={game.id || idx} game={game} selectedBook={selectedBook} onAnalyze={onAnalyze} />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col items-center mt-12 gap-2 opacity-40 hover:opacity-70 transition-opacity duration-300">
        <div className="flex items-center gap-2">
          <Zap size={10} className="text-accent" />
          <span className="text-caption-2 font-bold text-content-tertiary uppercase tracking-widest">
            SharpEdge Analytics Engine
          </span>
          <Zap size={10} className="text-accent" />
        </div>
        <div className="h-px w-16 bg-glass-border" />
      </div>
    </div>
  );
};

export default ScheduleView;

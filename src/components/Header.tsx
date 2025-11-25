import React, { useMemo } from "react";
import { Sun, Moon, WifiOff, AlertTriangle, Clock, Activity } from "lucide-react";
import type { AppTheme, League } from "../types";

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(" ");
};

type MarketStatus = "Live" | "Closed" | "Delayed" | "Error" | "Connecting";

interface StatusIndicatorProps {
  status: MarketStatus;
  isOnline: boolean;
}

const StatusIndicator = React.memo(({ status, isOnline }: StatusIndicatorProps) => {
  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20">
        <WifiOff size={14} className="text-red-500" />
        <span className="text-[10px] font-bold text-red-500 tracking-wider uppercase">Offline</span>
      </div>
    );
  }

  const config = useMemo(() => {
    switch (status) {
      case "Live":
        return { color: "bg-emerald-500", text: "text-emerald-500", label: "Live Market", icon: Activity };
      case "Error":
        return { color: "bg-red-500", text: "text-red-500", label: "Error", icon: AlertTriangle };
      case "Delayed":
        return { color: "bg-amber-500", text: "text-amber-500", label: "Delayed", icon: Clock };
      default:
        return { color: "bg-blue-500", text: "text-blue-500", label: "Connecting", icon: Activity };
    }
  }, [status]);

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border border-border/50 backdrop-blur-sm">
      <div className="relative flex h-2 w-2">
        <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", config.color)}></span>
        <span className={cn("relative inline-flex rounded-full h-2 w-2", config.color)}></span>
      </div>
      <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
        {config.label}
      </span>
    </div>
  );
});
StatusIndicator.displayName = "StatusIndicator";

interface HeaderProps {
  theme: AppTheme;
  toggleTheme: () => void;
  activeLeague: League;
  onLeagueChange: (league: League) => void;
  marketStatus?: MarketStatus;
  isOnline?: boolean;
  onSignOut?: () => void;
}

export const Header = React.memo(
  ({
    theme,
    toggleTheme,
    activeLeague,
    onLeagueChange,
    marketStatus = "Connecting",
    isOnline = true,
    onSignOut,
  }: HeaderProps) => {

    return (
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo Area */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 group cursor-pointer">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/30 transition-all duration-300">
                <Activity className="text-white w-5 h-5" strokeWidth={2.5} />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight leading-none">
                  Sharp<span className="text-blue-500">Edge</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">
                  Pro Terminal
                </span>
              </div>
            </div>

            {/* Desktop Nav / League Switcher */}
            <div className="hidden md:flex items-center p-1 bg-muted/50 rounded-full border border-white/5 backdrop-blur-md">
              {(["NHL", "NFL", "NBA"] as League[]).map((league) => (
                <button
                  key={league}
                  onClick={() => onLeagueChange(league)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300",
                    activeLeague === league
                      ? "bg-background text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                  )}
                >
                  {league}
                </button>
              ))}
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:block">
              <StatusIndicator status={marketStatus} isOnline={isOnline} />
            </div>

            <div className="h-6 w-px bg-border/50 hidden sm:block" />

            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              {onSignOut && (
                <button
                  onClick={onSignOut}
                  className="text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 text-foreground px-4 py-2 rounded-full transition-all duration-300"
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>
      </header>
    );
  },
);
Header.displayName = "Header";

import React, { useEffect, useState, useMemo } from "react";
import type { AppTheme, League } from "../types";

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(" ");
};

const useScrollPosition = (threshold: number = 5) => {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScroll = () => {
      setIsScrolled(window.scrollY > threshold);
    };

    // Initialize on mount
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  return isScrolled;
};

type MarketStatus = "Live" | "Closed" | "Delayed" | "Error" | "Connecting";

interface StatusIndicatorProps {
  status: MarketStatus;
  isOnline: boolean;
}

const StatusIndicator = React.memo(({ status, isOnline }: StatusIndicatorProps) => {
  if (!isOnline) {
    return (
      <div
        className="flex items-center gap-2.5"
        role="status"
        aria-label="Network status: offline"
        aria-live="assertive"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-destructive/60 animate-ping-slow opacity-70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
        </span>
        <span className="text-xs font-semibold text-destructive tracking-wider uppercase hidden md:inline">
          Offline
        </span>
      </div>
    );
  }

  const config = useMemo(() => {
    let indicatorColor = "bg-muted-foreground";
    let textColor = "text-muted-foreground";
    let label = "Market Closed";
    let animate = false;

    switch (status) {
      case "Live":
        indicatorColor = "bg-emerald-500";
        textColor = "text-emerald-400";
        label = "Market Live";
        animate = true;
        break;
      case "Error":
        indicatorColor = "bg-destructive";
        textColor = "text-destructive";
        label = "Feed Error";
        break;
      case "Delayed":
        indicatorColor = "bg-amber-400";
        textColor = "text-amber-300";
        label = "Data Delayed";
        break;
      case "Connecting":
        indicatorColor = "bg-accent";
        textColor = "text-accent";
        label = "Connecting";
        animate = true;
        break;
      case "Closed":
      default:
        indicatorColor = "bg-muted-foreground";
        textColor = "text-muted-foreground";
        label = "Market Closed";
        break;
    }

    return { indicatorColor, textColor, label, animate };
  }, [status]);

  return (
    <div className="flex items-center gap-2.5 group cursor-default" role="status" aria-label={config.label}>
      <span className="relative flex h-2.5 w-2.5">
        {config.animate && (
          <span
            className={cn(
              "motion-safe:animate-ping-slow absolute inline-flex h-full w-full rounded-full opacity-70",
              config.indicatorColor,
            )}
          />
        )}
        <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", config.indicatorColor)} />
      </span>
      <span
        className={cn(
          "text-xs font-semibold tracking-wider uppercase hidden md:inline transition-colors",
          config.textColor,
          "group-hover:text-foreground",
        )}
      >
        {config.label}
      </span>
    </div>
  );
});
StatusIndicator.displayName = "StatusIndicator";

interface ThemeToggleProps {
  theme: AppTheme;
  toggleTheme: () => void;
}

const ThemeToggleButton = React.memo(({ theme, toggleTheme }: ThemeToggleProps) => {
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      className="relative inline-flex items-center justify-between px-2.5 py-1.5 rounded-full bg-muted/60 hover:bg-muted border border-border/60 text-[11px] font-semibold tracking-[0.16em] uppercase transition-all duration-300 ease-cubic-bezier focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className={cn("px-1", !isDark && "text-foreground", isDark && "text-muted-foreground")}>Light</span>
      <span className={cn("px-1", isDark && "text-foreground", !isDark && "text-muted-foreground")}>Dark</span>
      <span
        className={cn(
          "absolute inset-y-0 my-0.5 w-[50%] rounded-full bg-background shadow-sm border border-border transition-transform duration-300 ease-cubic-bezier",
          isDark ? "translate-x-[100%]" : "translate-x-0",
        )}
        aria-hidden="true"
      />
    </button>
  );
});
ThemeToggleButton.displayName = "ThemeToggleButton";

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
    const isScrolled = useScrollPosition(10);

    const sliderPositionClass = useMemo(() => {
      switch (activeLeague) {
        case "NHL":
          return "translate-x-0";
        case "NFL":
          return "translate-x-[calc(100%+4px)]";
        case "NBA":
          return "translate-x-[calc(200%+8px)]";
        default:
          return "translate-x-0";
      }
    }, [activeLeague]);

    return (
      <header
        className={cn(
          "flex-shrink-0 z-50 sticky top-0 transition-all duration-300",
          isScrolled
            ? "bg-background/95 backdrop-blur-xl border-b border-border shadow-sm"
            : "bg-background/80 backdrop-blur-md border-b border-border/50",
        )}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand + League Switcher */}


import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Sun, Moon, WifiOff, AlertTriangle, Clock } from 'lucide-react';
import type { AppTheme, League } from '../types';

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

const useScrollPosition = (threshold: number = 5) => {
  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleScroll = () => {
      const scrolled = window.scrollY > threshold;
      if (scrolled !== isScrolled) setIsScrolled(scrolled);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isScrolled, threshold]);
  return isScrolled;
};

type MarketStatus = 'Live' | 'Closed' | 'Delayed' | 'Error' | 'Connecting';

interface StatusIndicatorProps {
    status: MarketStatus;
    isOnline: boolean;
}

const StatusIndicator = React.memo(({ status, isOnline }: StatusIndicatorProps) => {
    if (!isOnline) {
        return (
            <div className="flex items-center gap-2.5" role="status" aria-label="Network Status: Offline" aria-live="assertive">
                <WifiOff size={16} className="text-warning" />
                <span className="text-xs font-semibold text-warning tracking-wider uppercase hidden md:inline">Offline</span>
            </div>
        );
    }
    const config = useMemo(() => {
        let indicatorColor = 'bg-muted-foreground';
        let textColor = 'text-muted-foreground';
        let label = 'Market Closed';
        let Icon: React.ElementType | null = null;
        let animate = false;
        switch (status) {
            case 'Live': indicatorColor = 'bg-green-500'; textColor = 'text-green-500'; label = 'Market Live'; animate = true; break;
            case 'Error': indicatorColor = 'bg-red-500'; textColor = 'text-red-500'; label = 'Feed Error'; Icon = AlertTriangle; break;
            case 'Delayed': indicatorColor = 'bg-yellow-500'; textColor = 'text-yellow-500'; label = 'Data Delayed'; Icon = Clock; break;
            case 'Connecting': indicatorColor = 'bg-accent'; textColor = 'text-accent'; label = 'Connecting'; animate = true; break;
        }
        return { indicatorColor, textColor, label, Icon, animate };
    }, [status]);

    return (
        <div className="flex items-center gap-2.5 group cursor-default" role="status">
            {config.Icon ? (
                <config.Icon size={16} className={cn(config.textColor, "group-hover:opacity-80 transition-opacity")} />
            ) : (
                <span className="relative flex h-2.5 w-2.5">
                    {config.animate && <span className={cn("motion-safe:animate-ping-slow absolute inline-flex h-full w-full rounded-full opacity-70", config.indicatorColor)}></span>}
                    <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", config.indicatorColor)}></span>
                </span>
            )}
            <span className={cn("text-xs font-semibold tracking-wider uppercase hidden md:inline transition-colors", config.textColor, "group-hover:text-foreground")}>
                {config.label}
            </span>
        </div>
    );
});
StatusIndicator.displayName = 'StatusIndicator';

interface ThemeToggleProps {
    theme: AppTheme;
    toggleTheme: () => void;
}

const ThemeToggleButton = React.memo(({ theme, toggleTheme }: ThemeToggleProps) => {
    const isDark = theme === 'dark';
    return (
        <button
            onClick={toggleTheme}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-95 border border-transparent hover:border-border"
            role="switch"
            aria-checked={isDark}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
            <div className="relative w-5 h-5">
                {isDark ? (
                    <Sun size={18} strokeWidth={2.5} className="text-foreground" />
                ) : (
                    <Moon size={18} strokeWidth={2.5} className="text-foreground" />
                )}
            </div>
        </button>
    );
});
ThemeToggleButton.displayName = 'ThemeToggleButton';

interface HeaderProps {
  theme: AppTheme;
  toggleTheme: () => void;
  activeLeague: League;
  onLeagueChange: (league: League) => void;
  marketStatus?: MarketStatus;
  isOnline?: boolean;
  onSignOut?: () => void;
}

export const Header = React.memo(({ theme, toggleTheme, activeLeague, onLeagueChange, marketStatus = 'Connecting', isOnline = true, onSignOut }: HeaderProps) => {
  const isScrolled = useScrollPosition(10);

  // Calculate slider position based on active league
  const getSliderPosition = () => {
      switch (activeLeague) {
          case 'NHL': return 'translate-x-0';
          case 'NFL': return 'translate-x-[calc(100%+4px)]';
          case 'NBA': return 'translate-x-[calc(200%+8px)]';
          default: return 'translate-x-0';
      }
  };

  return (
    <header className={cn(
      "flex-shrink-0 z-50 sticky top-0 transition-all duration-300",
      isScrolled 
        ? 'bg-background/95 backdrop-blur-xl border-b border-border shadow-sm' 
        : 'bg-background/80 backdrop-blur-md border-b border-border/50'
    )}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        
        <div className="flex items-center gap-3 sm:gap-6">
            <a href="/" className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:rounded-md p-1 -m-1">
            <div className="flex flex-col justify-center h-full">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tighter text-foreground leading-none">
                    Sharp<span className="text-accent">Edge</span>
                </h1>
            </div>
            </a>
            
            {/* League Toggle Pill */}
            <div className="flex bg-muted/80 border border-border rounded-full p-1 relative shadow-sm">
                 <button
                    onClick={() => onLeagueChange('NHL')}
                    className={cn(
                        "px-4 py-1.5 text-xs sm:text-sm font-bold rounded-full transition-all duration-300 relative z-10 tracking-wide uppercase",
                        activeLeague === 'NHL' ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                 >
                    NHL
                 </button>
                 <button
                    onClick={() => onLeagueChange('NFL')}
                    className={cn(
                        "px-4 py-1.5 text-xs sm:text-sm font-bold rounded-full transition-all duration-300 relative z-10 tracking-wide uppercase",
                        activeLeague === 'NFL' ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                 >
                    NFL
                 </button>
                 <button
                    onClick={() => onLeagueChange('NBA')}
                    className={cn(
                        "px-4 py-1.5 text-xs sm:text-sm font-bold rounded-full transition-all duration-300 relative z-10 tracking-wide uppercase",
                        activeLeague === 'NBA' ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                 >
                    NBA
                 </button>
                 {/* Sliding Indicator */}
                 <div
                    className={cn(
                        "absolute top-1 bottom-1 w-[calc(33.33%-4px)] bg-background shadow-md rounded-full transition-all duration-300 ease-out z-0 border border-border",
                        getSliderPosition()
                    )}
                 />
            </div>
        </div>

        <nav className="flex items-center gap-3 sm:gap-6">
           <StatusIndicator status={marketStatus} isOnline={isOnline} />
           {onSignOut && (
             <>
               <div className="w-px h-6 bg-border hidden sm:block" aria-hidden="true"></div>
               <button
                 onClick={onSignOut}
                 className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
               >
                 Sign Out
               </button>
             </>
           )}
           <div className="w-px h-6 bg-border hidden sm:block" aria-hidden="true"></div>
           <ThemeToggleButton theme={theme} toggleTheme={toggleTheme} />
        </nav>
      </div>
      <style>{`
        .ease-cubic-bezier { transition-timing-function: cubic-bezier(0.645, 0.045, 0.355, 1); }
        @keyframes ping-slow { 75%, 100% { transform: scale(2.5); opacity: 0; } }
        .animate-ping-slow { animation: ping-slow 3s cubic-bezier(0, 0, 0.2, 1) infinite; }
         @media (prefers-reduced-motion: reduce) {
             .motion-safe\:transform { transform: none !important; }
             .motion-safe\:animate-ping-slow { animation: none !important; }
        }
      `}</style>
    </header>
  );
});
Header.displayName = 'Header';

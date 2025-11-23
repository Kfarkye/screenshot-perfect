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
            <div className="flex items-center gap-3" role="status" aria-label="Network Status: Offline" aria-live="assertive">
                <WifiOff size={16} className="text-yellow-500" />
                <span className="text-xs font-semibold text-yellow-500 tracking-wider uppercase hidden md:inline">Offline</span>
            </div>
        );
    }
    const config = useMemo(() => {
        let indicatorColor = 'bg-gray-500';
        let textColor = 'text-textSecondary';
        let label = 'Market Closed';
        let Icon: React.ElementType | null = null;
        let animate = false;
        switch (status) {
            case 'Live': indicatorColor = 'bg-success'; textColor = 'text-success'; label = 'Market Live'; animate = true; break;
            case 'Error': indicatorColor = 'bg-danger'; textColor = 'text-danger'; label = 'Feed Error'; Icon = AlertTriangle; break;
            case 'Delayed': indicatorColor = 'bg-warning'; textColor = 'text-warning'; label = 'Data Delayed'; Icon = Clock; break;
            case 'Connecting': indicatorColor = 'bg-blue-500'; textColor = 'text-blue-500'; label = 'Connecting'; animate = true; break;
        }
        return { indicatorColor, textColor, label, Icon, animate };
    }, [status]);

    return (
        <div className="flex items-center gap-3 group cursor-default" role="status">
            {config.Icon ? (
                <config.Icon size={16} className={cn(config.textColor, "group-hover:opacity-80 transition-opacity")} />
            ) : (
                <span className="relative flex h-2.5 w-2.5">
                    {config.animate && <span className={cn("motion-safe:animate-ping-slow absolute inline-flex h-full w-full rounded-full opacity-70", config.indicatorColor)}></span>}
                    <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", config.indicatorColor)}></span>
                </span>
            )}
            <span className={cn("text-xs font-semibold tracking-wider uppercase hidden md:inline transition-colors", status !== 'Closed' ? config.textColor : 'text-textSecondary', "group-hover:text-textPrimary")}>
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
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-transparent hover:bg-surfaceHighlight/80 text-textSecondary hover:text-textPrimary transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:hover:scale-110 active:scale-95 border border-transparent hover:border-border/20"
            role="switch"
            aria-checked={isDark}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            style={{ willChange: 'transform' }}
        >
            <div className="relative w-5 h-5 overflow-hidden">
                <Sun size={18} strokeWidth={2.5} className={cn("absolute inset-0 transition-all duration-700 ease-out", isDark ? "opacity-100 motion-safe:rotate-0 motion-safe:scale-100" : "opacity-0 motion-safe:rotate-180 motion-safe:scale-0")} aria-hidden={!isDark} />
                <Moon size={18} strokeWidth={2.5} className={cn("absolute inset-0 transition-all duration-700 ease-out", isDark ? "opacity-0 motion-safe:-rotate-180 motion-safe:scale-0" : "opacity-100 motion-safe:rotate-0 motion-safe:scale-100")} aria-hidden={isDark} />
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
    <header className={cn("flex-shrink-0 z-50 sticky top-0 transition-all duration-500 ease-out", isScrolled ? 'bg-surface/70 backdrop-blur-2xl shadow-glass border-b border-border/20' : 'bg-transparent border-b border-transparent')}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        
        <div className="flex items-center gap-3 sm:gap-6">
            <a href="/" className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:rounded-md p-1 -m-1">
            <div className="flex flex-col justify-center h-full">
                <h1 className="text-xl font-extrabold tracking-tighter text-textPrimary leading-none">
                    Sharp<span className="text-accent">Edge</span>
                </h1>
            </div>
            </a>
            
            {/* League Toggle Pill - Premium Vercel-style */}
            <div className="flex bg-surfaceHighlight/60 border border-border/15 rounded-full p-1 relative shadow-glass-inset backdrop-blur-sm">
                 <button
                    onClick={() => onLeagueChange('NHL')}
                    className={cn(
                        "px-4 py-1.5 text-[11px] font-extrabold rounded-full transition-all duration-500 relative z-10 tracking-wide",
                        activeLeague === 'NHL' ? "text-textPrimary" : "text-textTertiary hover:text-textSecondary"
                    )}
                 >
                    NHL
                 </button>
                 <button
                    onClick={() => onLeagueChange('NFL')}
                    className={cn(
                        "px-4 py-1.5 text-[11px] font-extrabold rounded-full transition-all duration-500 relative z-10 tracking-wide",
                        activeLeague === 'NFL' ? "text-textPrimary" : "text-textTertiary hover:text-textSecondary"
                    )}
                 >
                    NFL
                 </button>
                 <button
                    onClick={() => onLeagueChange('NBA')}
                    className={cn(
                        "px-4 py-1.5 text-[11px] font-extrabold rounded-full transition-all duration-500 relative z-10 tracking-wide",
                        activeLeague === 'NBA' ? "text-textPrimary" : "text-textTertiary hover:text-textSecondary"
                    )}
                 >
                    NBA
                 </button>
                 {/* Sliding Indicator with shadow */}
                 <div
                    className={cn(
                        "absolute top-1 bottom-1 w-[calc(33.33%-4px)] bg-surface shadow-md rounded-full transition-all duration-500 ease-out z-0 border border-border/10",
                        getSliderPosition()
                    )}
                 />
            </div>
        </div>

        <nav className="flex items-center gap-3 sm:gap-6">
           <StatusIndicator status={marketStatus} isOnline={isOnline} />
           {onSignOut && (
             <>
               <div className="w-px h-6 bg-border/20" aria-hidden="true"></div>
               <button
                 onClick={onSignOut}
                 className="text-xs font-medium text-textSecondary hover:text-textPrimary transition-colors px-3 py-1.5 rounded-lg hover:bg-surfaceHighlight/50"
               >
                 Sign Out
               </button>
             </>
           )}
           <div className="w-px h-6 bg-border/20 hidden sm:block" aria-hidden="true"></div>
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

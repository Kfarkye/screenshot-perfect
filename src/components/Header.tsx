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
                <WifiOff size={16} className="text-warning" />
                <span className="text-xs font-semibold text-warning tracking-wider uppercase hidden md:inline">Offline</span>
            </div>
        );
    }
    const config = useMemo(() => {
        let indicatorColor = 'bg-muted-foreground';
        let textColor = 'text-textSecondary';
        let label = 'Market Closed';
        let Icon: React.ElementType | null = null;
        let animate = false;
        switch (status) {
            case 'Live': indicatorColor = 'bg-success'; textColor = 'text-success'; label = 'Market Live'; animate = true; break;
            case 'Error': indicatorColor = 'bg-danger'; textColor = 'text-danger'; label = 'Feed Error'; Icon = AlertTriangle; break;
            case 'Delayed': indicatorColor = 'bg-warning'; textColor = 'text-warning'; label = 'Data Delayed'; Icon = Clock; break;
            case 'Connecting': indicatorColor = 'bg-primary'; textColor = 'text-primary'; label = 'Connecting'; animate = true; break;
        }
        return { indicatorColor, textColor, label, Icon, animate };
    }, [status]);

    return (
        <div className="flex items-center gap-3 group cursor-default" role="status">
            {config.Icon ? (
                <config.Icon size={16} className={cn(config.textColor, "group-hover:opacity-80 transition-opacity")} />
            ) : (
                <span className={cn("relative flex h-3 w-3", config.animate && "animate-pulse")}>
                    <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", config.indicatorColor, config.animate && "animate-ping")} />
                    <span className={cn("relative inline-flex rounded-full h-3 w-3", config.indicatorColor)} />
                </span>
            )}
            <span className={cn("text-xs font-semibold tracking-wider uppercase hidden md:inline", config.textColor)}>
                {config.label}
            </span>
        </div>
    );
});

StatusIndicator.displayName = 'StatusIndicator';

interface HeaderProps {
    theme: AppTheme;
    onThemeToggle: () => void;
    league: League;
    onLeagueChange: (league: League) => void;
    marketStatus?: MarketStatus;
}

export const Header: React.FC<HeaderProps> = ({
    theme,
    onThemeToggle,
    league,
    onLeagueChange,
    marketStatus = 'Closed'
}) => {
    const [isOnline, setIsOnline] = useState(true);
    const isScrolled = useScrollPosition(10);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        setIsOnline(navigator.onLine);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleLeagueClick = useCallback((newLeague: League) => {
        if (newLeague !== league) {
            onLeagueChange(newLeague);
        }
    }, [league, onLeagueChange]);

    return (
        <header className={cn(
            "sticky top-0 z-50 w-full transition-all duration-300",
            isScrolled ? "bg-background/95 backdrop-blur-md border-b border-border shadow-lg" : "bg-background border-b border-border"
        )}>
            <div className="container mx-auto px-4">
                <div className="flex h-16 items-center justify-between">
                    <div className="flex items-center gap-6">
                        <h1 className="text-xl font-bold text-foreground">
                            SharpEdge <span className="text-primary">Sports</span>
                        </h1>
                        
                        <div className="hidden md:flex items-center gap-1 bg-secondary rounded-lg p-1">
                            {(['NHL', 'NFL'] as League[]).map((l) => (
                                <button
                                    key={l}
                                    onClick={() => handleLeagueClick(l)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200",
                                        league === l
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                                    )}
                                >
                                    {l}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <StatusIndicator status={marketStatus} isOnline={isOnline} />
                        
                        <button
                            onClick={onThemeToggle}
                            className="p-2 rounded-lg bg-secondary hover:bg-accent transition-colors duration-200"
                            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                        >
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};

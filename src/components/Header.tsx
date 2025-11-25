/**
 * @component Header
 * @description Institutional-grade navigation header for SharpEdge Pro Terminal
 *
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "features": [
 *     "Mobile-responsive with slide-out menu",
 *     "Real-time market status indicator",
 *     "Keyboard navigation",
 *     "Theme toggle with system preference",
 *     "Optional user profile display"
 *   ],
 *   "accessibility": {
 *     "keyboard_nav": "Full tab + arrow key support",
 *     "aria_labels": "Complete semantic markup",
 *     "reduced_motion": "Respects prefers-reduced-motion"
 *   }
 * }
 */

import React, { useState, useCallback, useEffect, useMemo, type FC } from "react";
import {
  Sun,
  Moon,
  WifiOff,
  AlertTriangle,
  Clock,
  Activity,
  Menu,
  X,
  ChevronDown,
  Zap,
  TrendingUp,
  User,
  LogOut,
  Settings,
} from "lucide-react";
import type { AppTheme, League } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type MarketStatus = "live" | "closed" | "delayed" | "error" | "connecting";

interface UserProfile {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  tier?: "free" | "pro" | "enterprise";
}

interface HeaderProps {
  readonly theme: AppTheme;
  readonly toggleTheme: () => void;
  readonly activeLeague: League;
  readonly onLeagueChange: (league: League) => void;
  readonly marketStatus?: MarketStatus;
  readonly isOnline?: boolean;
  readonly user?: UserProfile | null;
  readonly onSignOut?: () => void;
  readonly onSettingsClick?: () => void;
  readonly className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(" ");
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const LEAGUES: readonly League[] = ["NHL", "NFL", "NBA"] as const;

const LEAGUE_CONFIG: Record<League, { icon: typeof Activity; color: string; label: string }> = {
  NHL: { icon: Activity, color: "text-blue-400", label: "Hockey" },
  NFL: { icon: Activity, color: "text-green-400", label: "Football" },
  NBA: { icon: Activity, color: "text-orange-400", label: "Basketball" },
};

const STATUS_CONFIG: Record<
  MarketStatus,
  {
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
    icon: typeof Activity;
    pulse: boolean;
  }
> = {
  live: {
    color: "text-semantic-success",
    bgColor: "bg-semantic-success/10",
    borderColor: "border-semantic-success/30",
    label: "Markets Live",
    icon: Activity,
    pulse: true,
  },
  closed: {
    color: "text-content-tertiary",
    bgColor: "bg-surface-secondary/50",
    borderColor: "border-glass-border",
    label: "Markets Closed",
    icon: Clock,
    pulse: false,
  },
  delayed: {
    color: "text-semantic-warning",
    bgColor: "bg-semantic-warning/10",
    borderColor: "border-semantic-warning/30",
    label: "Data Delayed",
    icon: Clock,
    pulse: true,
  },
  error: {
    color: "text-semantic-error",
    bgColor: "bg-semantic-error/10",
    borderColor: "border-semantic-error/30",
    label: "Connection Error",
    icon: AlertTriangle,
    pulse: false,
  },
  connecting: {
    color: "text-accent",
    bgColor: "bg-accent/10",
    borderColor: "border-accent/30",
    label: "Connecting",
    icon: Activity,
    pulse: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STATUS INDICATOR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface StatusIndicatorProps {
  status: MarketStatus;
  isOnline: boolean;
  compact?: boolean;
}

const StatusIndicator: FC<StatusIndicatorProps> = React.memo(({ status, isOnline, compact = false }) => {
  // Offline state takes precedence
  if (!isOnline) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-semantic-error/10 border border-semantic-error/30"
        role="status"
        aria-label="You are offline"
      >
        <WifiOff size={12} className="text-semantic-error" />
        {!compact && (
          <span className="text-caption-2 font-bold text-semantic-error tracking-wider uppercase">Offline</span>
        )}
      </div>
    );
  }

  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-sm",
        "border transition-all duration-250 ease-standard",
        config.bgColor,
        config.borderColor,
      )}
      role="status"
      aria-label={config.label}
    >
      {/* Pulse dot */}
      <div className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              config.color.replace("text-", "bg-"),
            )}
          />
        )}
        <span className={cn("relative inline-flex rounded-full h-2 w-2", config.color.replace("text-", "bg-"))} />
      </div>

      {!compact && (
        <span className={cn("text-caption-2 font-bold tracking-wider uppercase", config.color)}>{config.label}</span>
      )}
    </div>
  );
});

StatusIndicator.displayName = "StatusIndicator";

// ─────────────────────────────────────────────────────────────────────────────
// LEAGUE SWITCHER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface LeagueSwitcherProps {
  activeLeague: League;
  onLeagueChange: (league: League) => void;
  variant?: "desktop" | "mobile";
}

const LeagueSwitcher: FC<LeagueSwitcherProps> = React.memo(({ activeLeague, onLeagueChange, variant = "desktop" }) => {
  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, league: League) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onLeagueChange(league);
      }

      // Arrow key navigation
      const currentIndex = LEAGUES.indexOf(activeLeague);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % LEAGUES.length;
        onLeagueChange(LEAGUES[nextIndex]);
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + LEAGUES.length) % LEAGUES.length;
        onLeagueChange(LEAGUES[prevIndex]);
      }
    },
    [activeLeague, onLeagueChange],
  );

  if (variant === "mobile") {
    return (
      <nav className="flex flex-col gap-1" role="tablist" aria-label="League selection">
        {LEAGUES.map((league) => (
          <button
            key={league}
            role="tab"
            aria-selected={activeLeague === league}
            onClick={() => onLeagueChange(league)}
            onKeyDown={(e) => handleKeyDown(e, league)}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl",
              "text-body-sm font-semibold",
              "transition-all duration-150 ease-standard",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              activeLeague === league
                ? "bg-accent/10 text-accent border border-accent/30"
                : "text-content-secondary hover:text-content-primary hover:bg-surface-secondary/50",
            )}
          >
            <span className="text-lg">{league}</span>
            <span className="text-content-tertiary text-caption-1">{LEAGUE_CONFIG[league].label}</span>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav
      className="flex items-center p-1 bg-surface-secondary/50 rounded-full border border-glass-border backdrop-blur-md"
      role="tablist"
      aria-label="League selection"
    >
      {LEAGUES.map((league) => (
        <button
          key={league}
          role="tab"
          aria-selected={activeLeague === league}
          onClick={() => onLeagueChange(league)}
          onKeyDown={(e) => handleKeyDown(e, league)}
          className={cn(
            "px-4 py-1.5 rounded-full text-caption-1 font-bold",
            "transition-all duration-200 ease-standard",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
            activeLeague === league
              ? "bg-surface-primary text-content-primary shadow-sm border border-glass-border"
              : "text-content-tertiary hover:text-content-primary hover:bg-surface-primary/50",
          )}
        >
          {league}
        </button>
      ))}
    </nav>
  );
});

LeagueSwitcher.displayName = "LeagueSwitcher";

// ─────────────────────────────────────────────────────────────────────────────
// THEME TOGGLE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface ThemeToggleProps {
  theme: AppTheme;
  onToggle: () => void;
}

const ThemeToggle: FC<ThemeToggleProps> = React.memo(({ theme, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative w-9 h-9 flex items-center justify-center rounded-full",
        "text-content-tertiary hover:text-content-primary",
        "hover:bg-surface-secondary/80",
        "transition-all duration-200 ease-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      )}
    >
      <span className="sr-only">{theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}</span>
      {theme === "dark" ? (
        <Sun size={18} strokeWidth={2} className="motion-safe:animate-[spin_0.5s_ease-out]" />
      ) : (
        <Moon size={18} strokeWidth={2} className="motion-safe:animate-[spin_0.5s_ease-out]" />
      )}
    </button>
  );
});

ThemeToggle.displayName = "ThemeToggle";

// ─────────────────────────────────────────────────────────────────────────────
// USER MENU COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface UserMenuProps {
  user: UserProfile;
  onSignOut?: () => void;
  onSettingsClick?: () => void;
}

const UserMenu: FC<UserMenuProps> = React.memo(({ user, onSignOut, onSettingsClick }) => {
  const [isOpen, setIsOpen] = useState(false);

  const initials = useMemo(() => {
    if (user.name) {
      return user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  }, [user.name, user.email]);

  const tierBadge = useMemo(() => {
    if (user.tier === "pro") return { label: "Pro", color: "text-semantic-warning bg-semantic-warning/10" };
    if (user.tier === "enterprise") return { label: "Enterprise", color: "text-accent bg-accent/10" };
    return null;
  }, [user.tier]);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-full",
          "hover:bg-surface-secondary/80",
          "transition-all duration-150 ease-standard",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        )}
      >
        {/* Avatar */}
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover border border-glass-border" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
            <span className="text-caption-2 font-bold text-accent">{initials}</span>
          </div>
        )}

        <ChevronDown
          size={14}
          className={cn("text-content-tertiary transition-transform duration-200", isOpen && "rotate-180")}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden="true" />

          {/* Menu */}
          <div
            className={cn(
              "absolute right-0 top-full mt-2 w-56 z-50",
              "bg-glass-surface backdrop-blur-xl border border-glass-border",
              "rounded-xl shadow-xl overflow-hidden",
              "motion-safe:animate-[fadeIn_0.15s_ease-out]",
            )}
            role="menu"
          >
            {/* User info */}
            <div className="px-4 py-3 border-b border-glass-border">
              <div className="flex items-center gap-2">
                <p className="text-body-sm font-semibold text-content-primary truncate">
                  {user.name || user.email || "User"}
                </p>
                {tierBadge && (
                  <span className={cn("px-1.5 py-0.5 rounded text-caption-2 font-bold", tierBadge.color)}>
                    {tierBadge.label}
                  </span>
                )}
              </div>
              {user.email && user.name && (
                <p className="text-caption-1 text-content-tertiary truncate mt-0.5">{user.email}</p>
              )}
            </div>

            {/* Actions */}
            <div className="py-1">
              {onSettingsClick && (
                <button
                  onClick={() => {
                    onSettingsClick();
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-body-sm text-content-secondary hover:text-content-primary hover:bg-surface-secondary/50 transition-colors"
                  role="menuitem"
                >
                  <Settings size={16} />
                  Settings
                </button>
              )}

              {onSignOut && (
                <button
                  onClick={() => {
                    onSignOut();
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-body-sm text-semantic-error hover:bg-semantic-error/5 transition-colors"
                  role="menuitem"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
});

UserMenu.displayName = "UserMenu";

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE MENU COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeLeague: League;
  onLeagueChange: (league: League) => void;
  marketStatus: MarketStatus;
  isOnline: boolean;
  user?: UserProfile | null;
  onSignOut?: () => void;
}

const MobileMenu: FC<MobileMenuProps> = React.memo(
  ({ isOpen, onClose, activeLeague, onLeagueChange, marketStatus, isOnline, user, onSignOut }) => {
    // Close on escape
    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      if (isOpen) {
        document.addEventListener("keydown", handleEscape);
        document.body.style.overflow = "hidden";
      }
      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "";
      };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 z-50 md:hidden">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-surface-primary/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

        {/* Panel */}
        <div
          className={cn(
            "absolute right-0 top-0 h-full w-80 max-w-[85vw]",
            "bg-surface-primary border-l border-glass-border",
            "flex flex-col",
            "motion-safe:animate-[slideIn_0.2s_ease-out]",
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-16 border-b border-glass-border">
            <span className="text-body-sm font-semibold text-content-primary">Menu</span>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-secondary text-content-tertiary hover:text-content-primary transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Status */}
            <div>
              <h3 className="text-caption-2 font-bold text-content-tertiary uppercase tracking-wider mb-3">
                Market Status
              </h3>
              <StatusIndicator status={marketStatus} isOnline={isOnline} />
            </div>

            {/* Leagues */}
            <div>
              <h3 className="text-caption-2 font-bold text-content-tertiary uppercase tracking-wider mb-3">
                Select League
              </h3>
              <LeagueSwitcher
                activeLeague={activeLeague}
                onLeagueChange={(league) => {
                  onLeagueChange(league);
                  onClose();
                }}
                variant="mobile"
              />
            </div>
          </div>

          {/* Footer */}
          {user && onSignOut && (
            <div className="p-4 border-t border-glass-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
                  <User size={18} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-semibold text-content-primary truncate">{user.name || user.email}</p>
                  {user.tier && user.tier !== "free" && (
                    <p className="text-caption-2 text-semantic-warning font-medium">
                      {user.tier === "pro" ? "Pro" : "Enterprise"} Plan
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  onSignOut();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-semantic-error/10 text-semantic-error text-body-sm font-semibold hover:bg-semantic-error/20 transition-colors"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          )}
        </div>

        <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
      </div>
    );
  },
);

MobileMenu.displayName = "MobileMenu";

// ─────────────────────────────────────────────────────────────────────────────
// LOGO COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const Logo: FC = React.memo(() => (
  <div className="flex items-center gap-2.5 group cursor-pointer select-none">
    {/* Icon */}
    <div
      className={cn(
        "relative w-9 h-9 rounded-xl flex items-center justify-center",
        "bg-gradient-to-br from-accent to-accent/80",
        "shadow-lg shadow-accent/20",
        "group-hover:shadow-accent/30 group-hover:scale-105",
        "transition-all duration-300 ease-standard",
      )}
    >
      <TrendingUp className="text-content-inverse w-5 h-5" strokeWidth={2.5} />

      {/* Shine effect */}
      <div
        className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        aria-hidden="true"
      />
    </div>

    {/* Text */}
    <div className="flex flex-col">
      <span className="text-title-3 font-bold tracking-tight leading-none">
        Sharp<span className="text-accent">Edge</span>
      </span>
      <span className="text-caption-2 text-content-tertiary font-medium tracking-wider uppercase">Pro Terminal</span>
    </div>
  </div>
));

Logo.displayName = "Logo";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HEADER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const Header: FC<HeaderProps> = React.memo(
  ({
    theme,
    toggleTheme,
    activeLeague,
    onLeagueChange,
    marketStatus = "connecting",
    isOnline = true,
    user,
    onSignOut,
    onSettingsClick,
    className,
  }) => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
    const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

    return (
      <>
        <header
          className={cn(
            "sticky top-0 z-40 w-full",
            "border-b border-glass-border",
            "bg-surface-primary/80 backdrop-blur-xl backdrop-saturate-150",
            "supports-[backdrop-filter]:bg-surface-primary/60",
            className,
          )}
          role="banner"
        >
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            {/* Left: Logo + League Switcher */}
            <div className="flex items-center gap-8">
              <Logo />

              {/* Desktop League Switcher */}
              <div className="hidden md:block">
                <LeagueSwitcher activeLeague={activeLeague} onLeagueChange={onLeagueChange} variant="desktop" />
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              {/* Desktop Status */}
              <div className="hidden sm:block">
                <StatusIndicator status={marketStatus} isOnline={isOnline} />
              </div>

              {/* Divider */}
              <div className="hidden sm:block h-6 w-px bg-glass-border" aria-hidden="true" />

              {/* Theme Toggle */}
              <ThemeToggle theme={theme} onToggle={toggleTheme} />

              {/* User Menu (Desktop) */}
              {user && (
                <div className="hidden sm:block">
                  <UserMenu user={user} onSignOut={onSignOut} onSettingsClick={onSettingsClick} />
                </div>
              )}

              {/* Sign Out (Desktop, no user object) */}
              {!user && onSignOut && (
                <button
                  onClick={onSignOut}
                  className={cn(
                    "hidden sm:flex items-center gap-2",
                    "text-caption-1 font-semibold",
                    "bg-surface-secondary/50 hover:bg-surface-secondary",
                    "border border-glass-border",
                    "text-content-secondary hover:text-content-primary",
                    "px-4 py-2 rounded-full",
                    "transition-all duration-200 ease-standard",
                  )}
                >
                  Sign Out
                </button>
              )}

              {/* Mobile Menu Button */}
              <button
                onClick={openMobileMenu}
                aria-label="Open menu"
                aria-expanded={mobileMenuOpen}
                className={cn(
                  "md:hidden w-9 h-9 flex items-center justify-center rounded-full",
                  "hover:bg-surface-secondary/80",
                  "text-content-tertiary hover:text-content-primary",
                  "transition-colors duration-150",
                )}
              >
                <Menu size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Menu */}
        <MobileMenu
          isOpen={mobileMenuOpen}
          onClose={closeMobileMenu}
          activeLeague={activeLeague}
          onLeagueChange={onLeagueChange}
          marketStatus={marketStatus}
          isOnline={isOnline}
          user={user}
          onSignOut={onSignOut}
        />
      </>
    );
  },
);

Header.displayName = "Header";

export default Header;

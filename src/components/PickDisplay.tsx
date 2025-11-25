/**
 * @component PickDisplay
 * @description Compact pick card for displaying AI-generated betting picks
 *
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "variants": ["default", "compact", "expanded"],
 *   "features": [
 *     "Confidence visualization",
 *     "EV indicator",
 *     "Market type badge",
 *     "Loading skeleton",
 *     "Keyboard accessible"
 *   ]
 * }
 */

import React, { useMemo, type FC } from "react";
import { ChevronRight, TrendingUp, TrendingDown, Minus, Target, Zap, Clock, BarChart3 } from "lucide-react";
import type { PickData } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type PickVariant = "default" | "compact" | "expanded";
type MarketType = "spread" | "moneyline" | "total" | "prop";

interface PickDisplayProps {
  readonly pick: PickData;
  readonly isLoading?: boolean;
  readonly onClick?: () => void;
  readonly variant?: PickVariant;
  readonly showTimestamp?: boolean;
  readonly showEV?: boolean;
  readonly className?: string;
}

interface ConfidenceConfig {
  label: string;
  bg: string;
  border: string;
  text: string;
  icon: typeof TrendingUp;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLDS = {
  HIGH: 70,
  MEDIUM: 50,
} as const;

const MARKET_LABELS: Record<MarketType, string> = {
  spread: "Spread",
  moneyline: "ML",
  total: "O/U",
  prop: "Prop",
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(" ");
};

const formatOdds = (odds: number): string => {
  return odds > 0 ? `+${odds}` : `${odds}`;
};

const getMarketType = (pickSide: string): MarketType => {
  const lower = pickSide.toLowerCase();
  if (lower.includes("over") || lower.includes("under")) return "total";
  if (lower.includes("ml") || lower.includes("moneyline")) return "moneyline";
  if (lower.includes("prop")) return "prop";
  return "spread";
};

const calculateEV = (confidence: number, odds: number): number => {
  const impliedProb = odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
  const modelProb = confidence / 100;
  return ((modelProb - impliedProb) / impliedProb) * 100;
};

const getConfidenceConfig = (confidence: number): ConfidenceConfig => {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
    return {
      label: "High",
      bg: "bg-semantic-success/10",
      border: "border-semantic-success/30",
      text: "text-semantic-success",
      icon: TrendingUp,
    };
  }
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) {
    return {
      label: "Medium",
      bg: "bg-semantic-warning/10",
      border: "border-semantic-warning/30",
      text: "text-semantic-warning",
      icon: Minus,
    };
  }
  return {
    label: "Low",
    bg: "bg-surface-secondary/50",
    border: "border-glass-border",
    text: "text-content-tertiary",
    icon: TrendingDown,
  };
};

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

// ─────────────────────────────────────────────────────────────────────────────
// LOADING SKELETON
// ─────────────────────────────────────────────────────────────────────────────

interface SkeletonProps {
  variant: PickVariant;
}

const LoadingSkeleton: FC<SkeletonProps> = React.memo(({ variant }) => {
  if (variant === "compact") {
    return (
      <div
        className={cn("p-3 rounded-xl", "bg-glass-surface border border-glass-border", "animate-pulse")}
        aria-hidden="true"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-20 rounded-md bg-surface-tertiary" />
            <div className="h-4 w-10 rounded bg-surface-tertiary" />
          </div>
          <div className="h-6 w-12 rounded-full bg-surface-tertiary" />
        </div>
      </div>
    );
  }

  if (variant === "expanded") {
    return (
      <div
        className={cn("p-5 rounded-2xl", "bg-glass-surface border border-glass-border", "animate-pulse")}
        aria-hidden="true"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-2">
            <div className="h-6 w-32 rounded-md bg-surface-tertiary" />
            <div className="h-4 w-20 rounded bg-surface-tertiary" />
          </div>
          <div className="h-8 w-16 rounded-full bg-surface-tertiary" />
        </div>
        <div className="flex gap-3">
          <div className="h-8 w-20 rounded-lg bg-surface-tertiary" />
          <div className="h-8 w-20 rounded-lg bg-surface-tertiary" />
        </div>
      </div>
    );
  }

  // Default
  return (
    <div
      className={cn("p-4 rounded-xl", "bg-glass-surface border border-glass-border", "animate-pulse")}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-5 w-24 rounded-md bg-surface-tertiary" />
          <div className="h-4 w-12 rounded bg-surface-tertiary" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-6 w-14 rounded-full bg-surface-tertiary" />
          <div className="h-4 w-4 rounded bg-surface-tertiary" />
        </div>
      </div>
      <div className="h-3 w-28 rounded bg-surface-tertiary" />
    </div>
  );
});

LoadingSkeleton.displayName = "LoadingSkeleton";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE BADGE
// ─────────────────────────────────────────────────────────────────────────────

interface ConfidenceBadgeProps {
  confidence: number;
  size?: "sm" | "md";
}

const ConfidenceBadge: FC<ConfidenceBadgeProps> = React.memo(({ confidence, size = "md" }) => {
  const config = getConfidenceConfig(confidence);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border",
        config.bg,
        config.border,
        size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1",
      )}
    >
      <span
        className={cn(
          "font-mono font-bold tabular-nums",
          config.text,
          size === "sm" ? "text-caption-2" : "text-caption-1",
        )}
      >
        {confidence}%
      </span>
    </div>
  );
});

ConfidenceBadge.displayName = "ConfidenceBadge";

// ─────────────────────────────────────────────────────────────────────────────
// MARKET BADGE
// ─────────────────────────────────────────────────────────────────────────────

interface MarketBadgeProps {
  marketType: MarketType;
}

const MarketBadge: FC<MarketBadgeProps> = React.memo(({ marketType }) => (
  <span
    className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-md",
      "bg-accent/10 border border-accent/20",
      "text-caption-2 font-semibold text-accent uppercase tracking-wider",
    )}
  >
    {MARKET_LABELS[marketType]}
  </span>
));

MarketBadge.displayName = "MarketBadge";

// ─────────────────────────────────────────────────────────────────────────────
// EV INDICATOR
// ─────────────────────────────────────────────────────────────────────────────

interface EVIndicatorProps {
  ev: number;
}

const EVIndicator: FC<EVIndicatorProps> = React.memo(({ ev }) => {
  const isPositive = ev > 0;
  const isNeutral = Math.abs(ev) < 1;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-lg",
        "border",
        isPositive
          ? "bg-semantic-success/5 border-semantic-success/20 text-semantic-success"
          : isNeutral
            ? "bg-surface-secondary/50 border-glass-border text-content-tertiary"
            : "bg-semantic-error/5 border-semantic-error/20 text-semantic-error",
      )}
    >
      <BarChart3 size={12} strokeWidth={2} />
      <span className="text-caption-2 font-mono font-semibold tabular-nums">
        {isPositive ? "+" : ""}
        {ev.toFixed(1)}% EV
      </span>
    </div>
  );
});

EVIndicator.displayName = "EVIndicator";

// ─────────────────────────────────────────────────────────────────────────────
// COMPACT VARIANT
// ─────────────────────────────────────────────────────────────────────────────

interface CompactPickProps {
  pick: PickData;
  onClick?: () => void;
  className?: string;
}

const CompactPick: FC<CompactPickProps> = React.memo(({ pick, onClick, className }) => {
  const marketType = useMemo(() => getMarketType(pick.pick_side), [pick.pick_side]);

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "w-full p-3 rounded-xl text-left",
        "bg-glass-surface border border-glass-border",
        "transition-all duration-150 ease-standard",
        onClick && "cursor-pointer hover:border-content-tertiary/50 hover:bg-surface-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        !onClick && "cursor-default",
        className,
      )}
      aria-label={`Pick: ${pick.pick_side} at ${formatOdds(pick.odds_at_generation)}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-body-sm font-bold text-content-primary truncate">{pick.pick_side}</span>
          <span className="text-caption-1 text-content-tertiary font-mono flex-shrink-0">
            {formatOdds(pick.odds_at_generation)}
          </span>
        </div>
        <ConfidenceBadge confidence={pick.confidence_score} size="sm" />
      </div>
    </button>
  );
});

CompactPick.displayName = "CompactPick";

// ─────────────────────────────────────────────────────────────────────────────
// EXPANDED VARIANT
// ─────────────────────────────────────────────────────────────────────────────

interface ExpandedPickProps {
  pick: PickData;
  onClick?: () => void;
  showTimestamp?: boolean;
  showEV?: boolean;
  className?: string;
}

const ExpandedPick: FC<ExpandedPickProps> = React.memo(
  ({ pick, onClick, showTimestamp = true, showEV = true, className }) => {
    const marketType = useMemo(() => getMarketType(pick.pick_side), [pick.pick_side]);
    const ev = useMemo(
      () => calculateEV(pick.confidence_score, pick.odds_at_generation),
      [pick.confidence_score, pick.odds_at_generation],
    );
    const timeAgo = useMemo(() => formatTimeAgo(pick.created_at), [pick.created_at]);
    const confidenceConfig = useMemo(() => getConfidenceConfig(pick.confidence_score), [pick.confidence_score]);

    const ConfidenceIcon = confidenceConfig.icon;

    return (
      <button
        onClick={onClick}
        disabled={!onClick}
        className={cn(
          "group w-full p-5 rounded-2xl text-left",
          "bg-glass-surface backdrop-blur-xl border border-glass-border",
          "transition-all duration-200 ease-standard",
          onClick && "cursor-pointer hover:border-content-tertiary/50 hover:shadow-lg hover:bg-surface-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary",
          !onClick && "cursor-default",
          className,
        )}
        aria-label={`Pick: ${pick.pick_side} at ${formatOdds(pick.odds_at_generation)}, ${pick.confidence_score}% confidence`}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <MarketBadge marketType={marketType} />
              {showTimestamp && (
                <span className="flex items-center gap-1 text-caption-2 text-content-tertiary">
                  <Clock size={10} />
                  {timeAgo}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-title-3 font-bold text-content-primary">{pick.pick_side}</span>
              <span className="text-body font-mono text-content-secondary">{formatOdds(pick.odds_at_generation)}</span>
            </div>
          </div>

          {/* Confidence */}
          <div className="flex flex-col items-end gap-1">
            <ConfidenceBadge confidence={pick.confidence_score} size="md" />
            <span className={cn("text-caption-2 flex items-center gap-1", confidenceConfig.text)}>
              <ConfidenceIcon size={10} />
              {confidenceConfig.label}
            </span>
          </div>
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-3">
          {showEV && <EVIndicator ev={ev} />}

          {onClick && (
            <div
              className={cn(
                "ml-auto flex items-center gap-1",
                "text-caption-1 text-content-tertiary",
                "group-hover:text-accent transition-colors duration-150",
              )}
            >
              <span>View analysis</span>
              <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-150" />
            </div>
          )}
        </div>

        {/* Reasoning preview */}
        {pick.reasoning_text && (
          <p className="mt-3 pt-3 border-t border-glass-border text-caption-1 text-content-secondary line-clamp-2">
            {pick.reasoning_text}
          </p>
        )}
      </button>
    );
  },
);

ExpandedPick.displayName = "ExpandedPick";

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT VARIANT
// ─────────────────────────────────────────────────────────────────────────────

interface DefaultPickProps {
  pick: PickData;
  onClick?: () => void;
  showTimestamp?: boolean;
  className?: string;
}

const DefaultPick: FC<DefaultPickProps> = React.memo(({ pick, onClick, showTimestamp = false, className }) => {
  const marketType = useMemo(() => getMarketType(pick.pick_side), [pick.pick_side]);
  const timeAgo = useMemo(() => formatTimeAgo(pick.created_at), [pick.created_at]);

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "group w-full p-4 rounded-xl text-left",
        "bg-glass-surface border border-glass-border",
        "transition-all duration-150 ease-standard",
        onClick && "cursor-pointer hover:border-content-tertiary/50 hover:bg-surface-secondary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        !onClick && "cursor-default",
        className,
      )}
      aria-label={`Pick: ${pick.pick_side} at ${formatOdds(pick.odds_at_generation)}`}
    >
      {/* Main row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-body font-bold text-content-primary tracking-tight truncate">{pick.pick_side}</span>
          <span className="text-body-sm text-content-tertiary font-mono flex-shrink-0">
            {formatOdds(pick.odds_at_generation)}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <ConfidenceBadge confidence={pick.confidence_score} size="md" />
          {onClick && (
            <ChevronRight
              size={16}
              strokeWidth={2}
              className={cn(
                "text-content-tertiary",
                "group-hover:text-content-primary group-hover:translate-x-0.5",
                "transition-all duration-150",
              )}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MarketBadge marketType={marketType} />
          {showTimestamp && (
            <span className="flex items-center gap-1 text-caption-2 text-content-tertiary">
              <Clock size={10} />
              {timeAgo}
            </span>
          )}
        </div>

        {onClick && (
          <span
            className={cn(
              "text-caption-1 text-content-tertiary",
              "group-hover:text-accent transition-colors duration-150",
            )}
          >
            View analysis →
          </span>
        )}
      </div>
    </button>
  );
});

DefaultPick.displayName = "DefaultPick";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const PickDisplay: FC<PickDisplayProps> = ({
  pick,
  isLoading = false,
  onClick,
  variant = "default",
  showTimestamp = false,
  showEV = true,
  className,
}) => {
  if (isLoading) {
    return <LoadingSkeleton variant={variant} />;
  }

  switch (variant) {
    case "compact":
      return <CompactPick pick={pick} onClick={onClick} className={className} />;

    case "expanded":
      return (
        <ExpandedPick
          pick={pick}
          onClick={onClick}
          showTimestamp={showTimestamp}
          showEV={showEV}
          className={className}
        />
      );

    case "default":
    default:
      return <DefaultPick pick={pick} onClick={onClick} showTimestamp={showTimestamp} className={className} />;
  }
};

export default PickDisplay;

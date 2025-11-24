import React, { useState, useMemo, useCallback } from "react";
import type { GameData, MarketData } from "../types";
import { Clock, TrendingUp, Activity, Lock, ArrowUp, ArrowDown, AlertTriangle, Sparkles } from "lucide-react";
import { PickDisplay } from "./PickDisplay";
import { PickDetailModal } from "./PickDetailModal";
import { generatePick } from "../services/pickGenerator";
import { useToast } from "../hooks/use-toast";

// Observability (Logic unchanged)
const observability = {
  trackEvent: (event: string, properties: Record<string, unknown> = {}) => {},
  logError: (error: unknown, context: string, metadata: Record<string, any> = {}) => {
    console.error(
      JSON.stringify({
        level: "error",
        timestamp: new Date().toISOString(),
        context,
        error: error instanceof Error ? error.message : String(error),
        metadata,
      }),
    );
  },
};

// Utility
const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(" ");
};

// Constants aligned with ESSENCE spacing (40px = spacing-10)
const LOGO_SIZE = 40;

// Helpers (Logic unchanged)
const getEspnLogoUrl = (abbr: string, league: "NHL" | "NFL" | "NBA" = "NHL"): string => {
  const code = abbr.toLowerCase();
  const sportPath = league === "NHL" ? "nhl" : league === "NFL" ? "nfl" : "nba";
  const size = LOGO_SIZE * 2; // Retina optimization
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500/${code}.png&h=${size}&w=${size}&lossy=1`;
};

const parseLine = (plString: string | undefined): { line: string; juice: string } => {
  if (!plString || plString === "-" || plString === "N/A") {
    return { line: "-", juice: "" };
  }
  const match = plString.match(/([+-]?\d*\.?\d+|PK)\s*\(?([+-]?\d+)?\)?/i);
  if (match && match[1]) {
    return { line: match[1], juice: match[2] || "" };
  }
  return { line: plString.trim(), juice: "" };
};

// ============================================================================
// TEAM LOGO COMPONENT - ESSENCE v3.0 Refinement
// ============================================================================

interface TeamLogoProps {
  teamAbbr: string;
  teamName: string;
  league: "NHL" | "NFL" | "NBA";
}

const TeamLogo = React.memo(({ teamAbbr, teamName, league }: TeamLogoProps) => {
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const src = useMemo(() => getEspnLogoUrl(teamAbbr, league), [teamAbbr, league]);

  const handleError = useCallback(() => {
    if (loadState !== "error") {
      setLoadState("error");
    }
  }, [loadState]);

  const handleLoad = useCallback(() => {
    setLoadState("loaded");
  }, []);

  // ESSENCE Fallback: Machined aluminum look (surface-secondary) and precise typography.
  if (loadState === "error") {
    return (
      <div
        className="w-10 h-10 rounded-lg bg-surface-secondary flex items-center justify-center border border-surface-tertiary shadow-inner"
        title={`${teamName} logo failed to load`}
      >
        {/* Typography: caption-1 (12px), content-tertiary */}
        <span className="text-caption-1 font-bold text-content-tertiary tracking-wider">
          {teamAbbr.substring(0, 3)}
        </span>
      </div>
    );
  }

  return (
    <div className="w-10 h-10 flex items-center justify-center relative">
      {/* ESSENCE Loading State: Subtle pulse on surface-secondary */}
      {loadState === "loading" && (
        <div className="absolute inset-0 rounded-lg bg-surface-secondary/50 animate-pulse" aria-hidden="true" />
      )}
      <img
        src={src}
        alt={`${teamName} logo`}
        // ESSENCE Motion: duration-400, ease-decelerate for loading in.
        className={cn(
          "w-full h-full object-contain transition-all duration-400 ease-decelerate",
          // Subtle scale effect on card hover
          loadState === "loaded"
            ? "opacity-100 scale-100 group-hover/card:scale-110 drop-shadow-md"
            : "opacity-0 scale-90",
        )}
        onError={handleError}
        onLoad={handleLoad}
        loading="lazy"
        decoding="async"
        width={LOGO_SIZE}
        height={LOGO_SIZE}
      />
    </div>
  );
});
TeamLogo.displayName = "TeamLogo";

// ============================================================================
// ODDS CELL COMPONENT - ESSENCE v3.0 Interaction & Materiality
// ============================================================================

interface OddsCellProps {
  label: string;
  main: string;
  sub?: string;
  isFavorite?: boolean;
  isDisabled?: boolean;
  movement?: "up" | "down" | "none";
  onClick?: () => void;
}

const OddsCell = React.memo(
  ({ label, main, sub, isFavorite = false, isDisabled = false, movement = "none", onClick }: OddsCellProps) => {
    const isInteractive = !!onClick && !isDisabled && main !== "-";

    const ariaLabel = useMemo(() => {
      if (isDisabled || main === "-") return `${label} currently unavailable`;
      return `${label}: ${main} ${sub ? `at ${sub} odds` : ""}.${isFavorite ? " Favorite." : ""}`;
    }, [label, main, sub, isFavorite, isDisabled]);

    // ESSENCE Color System: Semantic colors for movement, accent for favorites.
    const mainColor = useMemo(() => {
      if (isDisabled) return "text-content-tertiary/70";
      if (movement === "up") return "text-semantic-success";
      if (movement === "down") return "text-semantic-error";
      return isFavorite ? "text-accent" : "text-content-primary";
    }, [isFavorite, isDisabled, movement]);

    return (
      <button
        onClick={isInteractive ? onClick : undefined}
        disabled={!isInteractive}
        aria-label={ariaLabel}
        // ESSENCE Button Styling: Utilizing 'Machined Aluminum' aesthetic (surface-secondary).
        className={cn(
          // Base styles: rounded-xl (16px), duration-150, ease-standard
          "group/odds relative flex flex-col items-center justify-center py-3.5 px-2 rounded-xl border transition-all duration-150 ease-standard select-none focus-visible:outline-none overflow-hidden",

          // Disabled State
          !isInteractive
            ? "bg-transparent border-transparent opacity-40 cursor-default"
            : // Interactive States
              cn(
                "cursor-pointer motion-safe:hover:scale-105 active:scale-95",

                // Favorite: Accent emphasized variant
                isFavorite
                  ? "bg-accent/10 border-accent/30 hover:bg-accent/20 hover:border-accent/50 shadow-md hover:shadow-lg"
                  : // Standard: surface-secondary (Machined Aluminum)
                    "bg-surface-secondary/50 border-surface-tertiary hover:border-content-tertiary/50 hover:bg-surface-secondary hover:shadow-sm",
              ),

          // ESSENCE A11y: Focus ring
          isInteractive && "focus-visible:ring-2 focus-visible:ring-accent focus-visible:z-10",
        )}
      >
        {/* Subtle shimmer effect on hover (Enhances materiality) */}
        {isInteractive && (
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 dark:via-white/5 to-transparent opacity-0 group-hover/odds:opacity-100 group-hover/odds:translate-x-full transition-all duration-700 -translate-x-full"
            aria-hidden="true"
          />
        )}

        {/* Movement Indicator */}
        {movement !== "none" && isInteractive && (
          <div className="absolute left-1.5 top-1.5 z-10" aria-hidden="true">
            {movement === "up" ? (
              <ArrowUp size={11} className="text-semantic-success" strokeWidth={3} />
            ) : (
              <ArrowDown size={11} className="text-semantic-error" strokeWidth={3} />
            )}
          </div>
        )}

        {/* Main Line/Odds - Typography: SF Mono (font-mono), body (16px), tabular-nums */}
        <span
          className={cn(
            "font-mono text-body font-bold tabular-nums tracking-tight z-10 transition-colors duration-150",
            mainColor,
          )}
        >
          {main}
        </span>

        {/* Juice/Subtext - Typography: caption-2 (11px) */}
        {sub && (
          <span
            className={cn(
              "text-caption-2 font-mono mt-1 tabular-nums z-10 transition-colors duration-150",
              // Context aware coloring for subtext
              isFavorite && isInteractive
                ? "text-accent/70 group-hover/odds:text-accent"
                : "text-content-secondary group-hover/odds:text-content-primary",
            )}
          >
            {sub}
          </span>
        )}
      </button>
    );
  },
);
OddsCell.displayName = "OddsCell";

// ============================================================================
// STATUS BADGE COMPONENT - ESSENCE v3.0 Semantic Precision
// ============================================================================

interface StatusBadgeProps {
  status: GameData["status"];
  time: string;
}

const StatusBadge = React.memo(({ status, time }: StatusBadgeProps) => {
  switch (status) {
    case "Live":
      // ESSENCE Live Indicator: Semantic Error (Red) for high visibility.
      return (
        <div
          className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-semantic-error/15 border border-semantic-error/30 shadow-sm backdrop-blur-sm"
          role="status"
          aria-label="Game is live"
        >
          <Activity size={12} className="text-semantic-error motion-safe:animate-pulse" strokeWidth={3} />
          {/* Typography: caption-1 (12px) */}
          <span className="text-caption-1 font-bold text-semantic-error tracking-wider uppercase">Live</span>
        </div>
      );
    case "Final":
      // Typography: caption-1 (12px), content-secondary
      return (
        <span className="text-caption-1 font-semibold text-content-secondary uppercase tracking-widest">Final</span>
      );
    case "Postponed":
    case "Canceled":
      // ESSENCE Warning Indicator: Semantic Warning (Amber).
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-semantic-warning/20 border border-semantic-warning/40 backdrop-blur-sm">
          <AlertTriangle size={12} className="text-semantic-warning" />
          {/* Typography: caption-2 (11px) */}
          <span className="text-caption-2 font-bold text-semantic-warning tracking-wider uppercase">
            {status === "Postponed" ? "PPD" : status}
          </span>
        </div>
      );
    default:
      // Default Time Display: content-secondary, SF Mono for time.
      return (
        <div className="flex items-center gap-2 text-content-secondary hover:text-content-primary transition-colors duration-150 ease-standard">
          <Clock size={14} />
          {/* Typography: body-sm (14px) */}
          <span className="text-body-sm font-medium font-mono tracking-tight">{time} ET</span>
        </div>
      );
  }
});
StatusBadge.displayName = "StatusBadge";

// ============================================================================
// GAME CARD COMPONENT - ESSENCE v3.0 Orchestration
// ============================================================================

interface GameCardProps {
  game: GameData;
  selectedBook: string;
  onAnalyze?: (game: GameData) => void;
  onBetClick?: (gameId: string, betType: string, team: "away" | "home" | "over" | "under", odds: MarketData) => void;
}

export const GameCard = React.memo(({ game, selectedBook, onAnalyze, onBetClick }: GameCardProps) => {
  const { id, status, awayTeam, homeTeam, awayRecord, homeRecord, time, odds: allOdds, league } = game;
  const [pickData, setPickData] = useState(game.pick);
  const [isGeneratingPick, setIsGeneratingPick] = useState(false);
  const [showPickModal, setShowPickModal] = useState(false);
  const { toast } = useToast();
  const awayTeamName = awayTeam;
  const homeTeamName = homeTeam;

  // State calculations (Logic unchanged)
  const isLive = status === "Live";
  const isFinal = status === "Final";
  const isConcluded = isFinal || status === "Canceled" || status === "Postponed";

  const scores = useMemo(
    () => ({
      away: parseInt(game.awayScore || "0", 10) || 0,
      home: parseInt(game.homeScore || "0", 10) || 0,
    }),
    [game.awayScore, game.homeScore],
  );

  const showScores = isLive || isFinal;

  const winner = useMemo(() => {
    if (!isFinal) return null;
    if (scores.away > scores.home) return "away";
    if (scores.home > scores.away) return "home";
    return "tie";
  }, [isFinal, scores]);

  const odds = useMemo(() => {
    return allOdds[selectedBook] || allOdds.generic || null;
  }, [allOdds, selectedBook]);

  const processedOdds = useMemo(() => {
    if (!odds) return null;
    const awayPL = parseLine(odds.awayPL);
    const homePL = parseLine(odds.homePL);
    const total = odds.total && odds.total !== "N/A" && odds.total !== "-" ? odds.total.trim() : "-";
    const awayML = parseInt(odds.awayML, 10) || 0;
    const homeML = parseInt(odds.homeML, 10) || 0;
    let mlFavorite: "away" | "home" | null = null;

    // The lower number (more negative or less positive) is always the favorite in American odds.
    if (awayML !== 0 && homeML !== 0 && awayML !== homeML) {
      if (awayML < homeML) mlFavorite = "away";
      else if (homeML < awayML) mlFavorite = "home";
    }

    return { ...odds, awayPL, homePL, total, mlFavorite, movement: {} as any }; // Movement logic omitted
  }, [odds]);

  const hasOdds = processedOdds !== null;
  const boardLocked = isConcluded || !hasOdds;

  const spreadLabel = league === "NHL" ? "Puck Line" : "Spread";

  // Handlers (Logic mostly unchanged, updated toast calls)
  const handleAnalyzeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onAnalyze) onAnalyze(game);
    },
    [onAnalyze, game],
  );

  const handleBet = useCallback(
    (type: string, team: "away" | "home" | "over" | "under") => {
      if (onBetClick && odds && !boardLocked) onBetClick(id, type, team, odds);
    },
    [onBetClick, id, odds, boardLocked],
  );

  const handleGeneratePick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      if (boardLocked) {
        toast({
          title: "Markets Closed",
          description: "Cannot generate picks for concluded games.",
          variant: "destructive",
        });
        return;
      }
      setIsGeneratingPick(true);
      try {
        const pick = await generatePick(game, "moneyline");
        setPickData(pick);
        toast({ title: "Pick Generated", description: `${pick.confidence_score}% confidence on ${pick.pick_side}` });
      } catch (error) {
        observability.logError(error, "GameCard:handleGeneratePick");
        toast({ title: "Generation Failed", description: "Could not generate pick", variant: "destructive" });
      } finally {
        setIsGeneratingPick(false);
      }
    },
    [game, boardLocked, toast],
  );

  // ESSENCE v3.0 Implementation: Glass Materiality for the main card.
  return (
    <article
      // Radius: 2xl (24px), Shadow: lg -> xl on hover. Motion: duration-250, ease-standard.
      // Materiality: bg-glass-surface, backdrop-blur-xl, border-glass-border.
      className="relative overflow-hidden mb-4 rounded-2xl border border-glass-border group/card transition-all duration-250 ease-standard hover:shadow-xl shadow-lg backdrop-blur-xl bg-glass-surface backdrop-saturate-default motion-safe:hover:scale-[1.005]"
      style={{ willChange: "transform" }}
    >
      {/* Subtle interactive highlight */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-accent/0 via-accent/0 to-accent/5 opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 pointer-events-none"
        aria-hidden="true"
      />

      <div className="flex flex-col md:flex-row relative z-10">
        {/* Game Information Section - Padding 6 (24px) */}
        <div className="flex-1 p-6 relative">
          {!isConcluded && (
            <div className="absolute top-6 right-6 z-10">
              <StatusBadge status={status} time={time} />
            </div>
          )}

          {/* Gap 6 (24px) between rows */}
          <div className="flex flex-col justify-center h-full gap-6 pt-8 md:pt-0" role="grid">
            {/* Away Team Row */}
            <div className="flex items-center justify-between" role="row">
              <div className="flex items-center gap-4" role="gridcell">
                <TeamLogo teamAbbr={awayTeam} teamName={awayTeamName} league={league} />
                <div className="flex flex-col">
                  {/* Typography: title-3 (20px) for team name */}
                  <span
                    className={cn(
                      "text-title-3 font-bold tracking-tight transition-colors duration-300",
                      // Dimming the loser in Final state
                      winner === "home" ? "text-content-secondary opacity-70" : "text-content-primary",
                    )}
                  >
                    {awayTeam}
                  </span>
                  {/* Typography: caption-1 (12px) for record */}
                  {awayRecord && (
                    <span className="text-caption-1 font-semibold text-content-secondary tracking-wide">
                      {awayRecord}
                    </span>
                  )}
                </div>
              </div>
              {showScores && (
                // Typography: large-title (36px) for score, SF Mono (font-mono), tabular-nums
                <span
                  className={cn(
                    "text-large-title font-mono font-bold tabular-nums transition-colors duration-300",
                    winner === "home" ? "text-content-secondary opacity-50" : "text-content-primary",
                  )}
                  role="gridcell"
                >
                  {scores.away}
                </span>
              )}
            </div>

            {/* Divider */}
            <div className="w-full h-px bg-glass-border" aria-hidden="true" />

            {/* Home Team Row */}
            <div className="flex items-center justify-between" role="row">
              <div className="flex items-center gap-4" role="gridcell">
                <TeamLogo teamAbbr={homeTeam} teamName={homeTeamName} league={league} />
                <div className="flex flex-col">
                  <span
                    className={cn(
                      "text-title-3 font-bold tracking-tight transition-colors duration-300",
                      winner === "away" ? "text-content-secondary opacity-70" : "text-content-primary",
                    )}
                  >
                    {homeTeam}
                  </span>
                  {homeRecord && (
                    <span className="text-caption-1 font-semibold text-content-secondary tracking-wide">
                      {homeRecord}
                    </span>
                  )}
                </div>
              </div>
              {showScores && (
                <span
                  className={cn(
                    "text-large-title font-mono font-bold tabular-nums transition-colors duration-300",
                    winner === "away" ? "text-content-secondary opacity-50" : "text-content-primary",
                  )}
                  role="gridcell"
                >
                  {scores.home}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons (Hidden until hover - Calm Technology) */}
          {/* Motion: Fade in and slight vertical translation (duration-400, ease-decelerate) */}
          {!isConcluded && (
            <div className="absolute bottom-6 right-6 flex gap-2 opacity-0 motion-safe:translate-y-3 group-hover/card:opacity-100 group-hover/card:motion-safe:translate-y-0 transition-all duration-400 ease-decelerate focus-within:opacity-100 focus-within:translate-y-0">
              {/* ESSENCE Button Style: Glass Variant for secondary action */}
              {onAnalyze && (
                <button
                  onClick={handleAnalyzeClick}
                  // Applying Glass button styles
                  className="bg-glass-surface backdrop-blur-lg border border-glass-border hover:shadow-md text-content-primary px-5 py-2.5 rounded-xl flex items-center gap-2.5 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:hover:scale-105 active:scale-95 transition-all duration-150 ease-standard"
                >
                  <TrendingUp size={16} strokeWidth={2.5} className="text-accent" />
                  {/* Typography: body-sm (14px) */}
                  <span className="text-body-sm font-bold">Analyze</span>
                </button>
              )}

              {/* ESSENCE Button Style: Primary Variant for main CTA */}
              <button
                onClick={handleGeneratePick}
                disabled={isGeneratingPick || boardLocked}
                // Primary Variant
                className="bg-accent text-content-inverse hover:bg-accent-hover px-5 py-2.5 rounded-xl flex items-center gap-2.5 shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:hover:scale-105 active:scale-95 transition-all duration-150 ease-standard disabled:opacity-50 disabled:pointer-events-none"
              >
                {isGeneratingPick ? (
                  <>
                    {/* Simple CSS spinner */}
                    <div className="w-4 h-4 border-2 border-content-inverse/30 border-t-content-inverse rounded-full animate-spin" />
                    <span className="text-body-sm font-bold">Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} strokeWidth={2.5} />
                    <span className="text-body-sm font-bold">Get Pick</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Odds Board Section */}
        {/* Subtle background variation (surface-secondary/30) to define the area within the glass card */}
        <div className="relative bg-surface-secondary/30 p-6 md:w-[380px] flex flex-col justify-center border-t md:border-t-0 md:border-l border-glass-border">
          {/* Locked Board Overlay */}
          {boardLocked && (
            <div className="absolute inset-0 bg-surface-primary/50 backdrop-blur-sm z-20 flex items-center justify-center flex-col gap-3 px-6">
              <Lock size={20} className="text-content-secondary" />
              {isConcluded ? (
                <div className="text-center space-y-2">
                  <p className="text-caption-1 font-bold text-accent uppercase tracking-wider">Final Score</p>
                  <p className="text-body font-semibold text-content-primary">
                    {awayTeam} {scores.away} - {homeTeam} {scores.home}
                  </p>
                  {winner && winner !== "tie" && processedOdds?.awayPL.line !== "-" && (
                    <p className="text-caption-2 text-content-secondary">
                      {winner === "away" ? awayTeam : homeTeam} covered{" "}
                      the {winner === "away" ? processedOdds.awayPL.line : processedOdds.homePL.line} spread
                    </p>
                  )}
                  {processedOdds && (
                    <div className="pt-2 border-t border-glass-border/30 mt-2 space-y-0.5">
                      <p className="text-caption-2 font-semibold text-content-tertiary uppercase tracking-wider">Closing Line</p>
                      <div className="flex gap-3 justify-center text-caption-2 text-content-secondary font-mono">
                        {processedOdds.awayPL.line !== "-" && (
                          <span>{spreadLabel}: {processedOdds.awayPL.line}/{processedOdds.homePL.line}</span>
                        )}
                        {processedOdds.total !== "-" && (
                          <span>O/U: {processedOdds.total}</span>
                        )}
                        {processedOdds.awayML && processedOdds.homeML && (
                          <span>ML: {processedOdds.awayML}/{processedOdds.homeML}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-body-sm font-semibold text-content-secondary">Market Data Unavailable</p>
              )}
            </div>
          )}

          <div role="grid">
            {/* Headers */}
            <div className="grid grid-cols-3 gap-3 mb-4 px-1" role="row">
              {/* Typography: caption-2 (11px), uppercase, wide tracking */}
              <span
                className="text-caption-2 font-extrabold text-content-tertiary uppercase tracking-widest text-center"
                role="columnheader"
              >
                {spreadLabel}
              </span>
              <span
                className="text-caption-2 font-extrabold text-content-tertiary uppercase tracking-widest text-center"
                role="columnheader"
              >
                Total
              </span>
              <span
                className="text-caption-2 font-extrabold text-content-tertiary uppercase tracking-widest text-center"
                role="columnheader"
              >
                Moneyline
              </span>
            </div>

            {/* Away Odds Row */}
            <div className="grid grid-cols-3 gap-3 mb-3" role="row">
              <OddsCell
                label={`${awayTeamName} Spread`}
                main={processedOdds?.awayPL.line || "-"}
                sub={processedOdds?.awayPL.juice}
                isDisabled={boardLocked}
                onClick={onBetClick ? () => handleBet("PL", "away") : undefined}
              />
              <OddsCell
                label={`Over ${processedOdds?.total || ""}`}
                main={processedOdds?.total !== "-" ? `O ${processedOdds?.total}` : "-"}
                sub={processedOdds?.overOdds}
                isDisabled={boardLocked}
                onClick={onBetClick ? () => handleBet("Total", "over") : undefined}
              />
              <OddsCell
                label={`${awayTeamName} Moneyline`}
                main={processedOdds?.awayML || "-"}
                isFavorite={hasOdds && processedOdds?.mlFavorite === "away"}
                isDisabled={boardLocked}
                onClick={onBetClick ? () => handleBet("ML", "away") : undefined}
              />
            </div>

            {/* Home Odds Row */}
            <div className="grid grid-cols-3 gap-3" role="row">
              <OddsCell
                label={`${homeTeamName} Spread`}
                main={processedOdds?.homePL.line || "-"}
                sub={processedOdds?.homePL.juice}
                isDisabled={boardLocked}
                onClick={onBetClick ? () => handleBet("PL", "home") : undefined}
              />
              <OddsCell
                label={`Under ${processedOdds?.total || ""}`}
                main={processedOdds?.total !== "-" ? `U ${processedOdds?.total}` : "-"}
                sub={processedOdds?.underOdds}
                isDisabled={boardLocked}
                onClick={onBetClick ? () => handleBet("Total", "under") : undefined}
              />
              <OddsCell
                label={`${homeTeamName} Moneyline`}
                main={processedOdds?.homeML || "-"}
                isFavorite={hasOdds && processedOdds?.mlFavorite === "home"}
                isDisabled={boardLocked}
                onClick={onBetClick ? () => handleBet("ML", "home") : undefined}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Pick Display Section (if applicable) - Shown below the main content */}
      {/* Note: PickDisplay component styling is assumed to be handled separately */}
      {!isConcluded && (pickData || isGeneratingPick) && (
        <div className="p-6 relative z-10 border-t border-glass-border">
          {isGeneratingPick ? (
            <PickDisplay pick={{} as any} isLoading />
          ) : pickData ? (
            <PickDisplay pick={pickData} onClick={() => setShowPickModal(true)} />
          ) : null}
        </div>
      )}

      {/* Pick Detail Modal (Portal) */}
      {pickData && (
        <PickDetailModal
          pick={pickData}
          isOpen={showPickModal}
          onClose={() => setShowPickModal(false)}
          gameInfo={{
            awayTeam: game.awayTeam,
            homeTeam: game.homeTeam,
            time: game.time,
          }}
        />
      )}
    </article>
  );
});
GameCard.displayName = "GameCard";

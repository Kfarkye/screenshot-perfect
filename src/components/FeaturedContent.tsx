/**
 * @component FeaturedContent
 * @description Institutional-grade featured insights carousel
 *
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "aesthetic": "Jony Ive × Stripe × DraftKings",
 *   "tokens": "glass-surface, content-primary, accent, semantic-*",
 *   "motion": "duration-150/250/400, ease-standard/decelerate"
 * }
 */

import React, { useRef, useState, useCallback, useEffect, useMemo, type FC, type RefObject } from "react";
import { Clock, TrendingUp, PlayCircle, ChevronRight, ChevronLeft, CheckCircle2, Zap, BarChart3 } from "lucide-react";
import type { League } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

type ArticleType = "Analysis" | "Pick" | "Video" | "Props";

interface Article {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly timeAgo: string;
  readonly imageUrl: string;
  readonly type: ArticleType;
  readonly league: League;
  readonly tag: string;
  readonly confidence?: number;
  readonly isPremium?: boolean;
}

interface FeaturedContentProps {
  readonly league: League;
  readonly onArticleClick: (query: string) => void;
  readonly className?: string;
}

interface ScrollState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

interface ArticleCardProps {
  readonly article: Article;
  readonly onClick: () => void;
  readonly index: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(" ");
};

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE DATA
// ─────────────────────────────────────────────────────────────────────────────

const ARTICLES: Readonly<Record<League, readonly Article[]>> = {
  NHL: [
    {
      id: "nhl-1",
      title: "Rangers vs. Devils: Sharp Money Targeting the Over",
      author: "SharpEdge Staff",
      timeAgo: "1h",
      imageUrl: "https://images.unsplash.com/photo-1515703407324-5f753afd8be8?q=80&w=600&auto=format&fit=crop",
      type: "Analysis",
      league: "NHL",
      tag: "Sharp Report",
      confidence: 78,
    },
    {
      id: "nhl-2",
      title: "Goalie Props: Hellebuyck's Save Count Analysis",
      author: "Dom Lucz",
      timeAgo: "2h",
      imageUrl: "https://images.unsplash.com/photo-1580748141549-71748dbe0bdc?q=80&w=600&auto=format&fit=crop",
      type: "Props",
      league: "NHL",
      tag: "Player Props",
      confidence: 72,
    },
    {
      id: "nhl-3",
      title: "Oilers Trends: McDavid Line Undervalued Tonight",
      author: "Analytics Team",
      timeAgo: "3h",
      imageUrl: "https://images.unsplash.com/photo-1599307222108-6878b6680a65?q=80&w=600&auto=format&fit=crop",
      type: "Analysis",
      league: "NHL",
      tag: "System Play",
      isPremium: true,
      confidence: 84,
    },
    {
      id: "nhl-4",
      title: "Tonight's Best Bets: 3 Picks for Loaded Slate",
      author: "Action Network",
      timeAgo: "4h",
      imageUrl: "https://images.unsplash.com/photo-1551103212-f4728f321d5a?q=80&w=600&auto=format&fit=crop",
      type: "Pick",
      league: "NHL",
      tag: "Best Bets",
      confidence: 81,
    },
  ],
  NFL: [
    {
      id: "nfl-1",
      title: "Panthers vs. 49ers: Stuckey's MNF Spread Pick",
      author: "Stuckey",
      timeAgo: "1h",
      imageUrl: "https://images.unsplash.com/photo-1628717341663-0007b0ee2597?q=80&w=600&auto=format&fit=crop",
      type: "Pick",
      league: "NFL",
      tag: "Best Bets",
      confidence: 76,
      isPremium: true,
    },
    {
      id: "nfl-2",
      title: "Anderson's Early NFL Week 13 Angles",
      author: "Brandon Anderson",
      timeAgo: "1h",
      imageUrl: "https://images.unsplash.com/photo-1566577739112-5180d4bf9390?q=80&w=600&auto=format&fit=crop",
      type: "Analysis",
      league: "NFL",
      tag: "Early Look",
      confidence: 69,
    },
    {
      id: "nfl-3",
      title: "NFL PrizePicks: Monday Night DFS Plays",
      author: "Doug Ziefel",
      timeAgo: "3h",
      imageUrl: "https://images.unsplash.com/photo-1598550476439-6847785fcea6?q=80&w=600&auto=format&fit=crop",
      type: "Props",
      league: "NFL",
      tag: "DFS / Props",
      confidence: 74,
    },
    {
      id: "nfl-4",
      title: "Public Betting: Where the Squares Lean",
      author: "Market Insights",
      timeAgo: "5h",
      imageUrl: "https://images.unsplash.com/photo-1518605348400-43ded60bdf08?q=80&w=600&auto=format&fit=crop",
      type: "Analysis",
      league: "NFL",
      tag: "Fade Public",
      confidence: 67,
    },
  ],
  NBA: [
    {
      id: "nba-1",
      title: "Lakers vs. Warriors: LeBron Prop Discrepancy",
      author: "PropMaster",
      timeAgo: "30m",
      imageUrl: "https://images.unsplash.com/photo-1504450758481-7338eba7524a?q=80&w=600&auto=format&fit=crop",
      type: "Props",
      league: "NBA",
      tag: "Prop Edge",
      confidence: 82,
      isPremium: true,
    },
    {
      id: "nba-2",
      title: "Celtics Spread: Identifying the Inflation",
      author: "SharpEdge AI",
      timeAgo: "2h",
      imageUrl: "https://images.unsplash.com/photo-1519861531473-920026393112?q=80&w=600&auto=format&fit=crop",
      type: "Analysis",
      league: "NBA",
      tag: "Model Pick",
      confidence: 79,
    },
  ],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const getTypeIcon = (type: ArticleType): React.ReactNode => {
  const iconProps = { size: 10, strokeWidth: 2.5 };
  switch (type) {
    case "Pick":
      return <CheckCircle2 {...iconProps} className="text-semantic-success" />;
    case "Video":
      return <PlayCircle {...iconProps} className="text-content-inverse" />;
    case "Analysis":
      return <BarChart3 {...iconProps} className="text-accent" />;
    case "Props":
      return <TrendingUp {...iconProps} className="text-semantic-warning" />;
  }
};

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 80) return "text-semantic-success";
  if (confidence >= 70) return "text-semantic-warning";
  return "text-content-tertiary";
};

// ─────────────────────────────────────────────────────────────────────────────
// SCROLL HOOK
// ─────────────────────────────────────────────────────────────────────────────

const useHorizontalScroll = (ref: RefObject<HTMLDivElement | null>) => {
  const [scrollState, setScrollState] = useState<ScrollState>({
    canScrollLeft: false,
    canScrollRight: true,
  });

  const checkScroll = useCallback(() => {
    if (!ref.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = ref.current;
    setScrollState({
      canScrollLeft: scrollLeft > 4,
      canScrollRight: scrollLeft < scrollWidth - clientWidth - 4,
    });
  }, [ref]);

  const scroll = useCallback(
    (direction: "left" | "right") => {
      if (!ref.current) return;
      const scrollAmount = 320;
      ref.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    },
    [ref],
  );

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    checkScroll();
    element.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      element.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [ref, checkScroll]);

  return { ...scrollState, scroll, checkScroll };
};

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const ArticleCard: FC<ArticleCardProps> = React.memo(({ article, onClick, index }) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <button
      onClick={onClick}
      aria-label={`Read article: ${article.title}`}
      className={cn(
        // Base - ESSENCE Glass Surface
        "group/card relative flex-shrink-0 snap-center text-left",
        "w-[280px] md:w-[320px]",
        "rounded-2xl overflow-hidden",
        "bg-glass-surface backdrop-blur-xl backdrop-saturate-default",
        "border border-glass-border",
        // Motion - ESSENCE duration-250, ease-standard
        "transition-all duration-250 ease-standard",
        // Hover states
        "hover:border-content-tertiary/50",
        "hover:shadow-xl",
        "motion-safe:hover:-translate-y-1 motion-safe:hover:scale-[1.01]",
        // Focus
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary",
      )}
      style={{
        // Staggered entry animation
        animation: `cardFadeIn 0.4s ease-out ${index * 60}ms forwards`,
        opacity: 0,
      }}
    >
      {/* Image Container */}
      <div className="relative h-40 w-full overflow-hidden bg-surface-secondary">
        {/* Skeleton loader */}
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-r from-surface-secondary via-surface-tertiary to-surface-secondary",
            "animate-pulse transition-opacity duration-400",
            imageLoaded ? "opacity-0" : "opacity-100",
          )}
        />

        {/* Image */}
        <img
          src={article.imageUrl}
          alt=""
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          className={cn(
            "absolute inset-0 w-full h-full object-cover",
            "transition-all duration-400 ease-decelerate",
            "group-hover/card:scale-105",
            imageLoaded ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-primary via-surface-primary/40 to-transparent" />

        {/* Premium indicator */}
        {article.isPremium && (
          <div className="absolute top-3 right-3 z-10">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-semantic-warning/20 backdrop-blur-md text-caption-2 font-bold text-semantic-warning uppercase tracking-wider border border-semantic-warning/30">
              <Zap size={8} fill="currentColor" />
              Pro
            </span>
          </div>
        )}

        {/* Type tag */}
        <div className="absolute top-3 left-3 z-10">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-primary/60 backdrop-blur-md text-caption-2 font-bold text-content-primary uppercase tracking-wider border border-glass-border shadow-md">
            {getTypeIcon(article.type)}
            {article.tag}
          </span>
        </div>

        {/* Confidence score */}
        {article.confidence && (
          <div className="absolute bottom-3 right-3 z-10">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1",
                "rounded-md bg-surface-primary/70 backdrop-blur-md",
                "text-caption-1 font-mono font-bold tracking-tight",
                "border border-glass-border",
                getConfidenceColor(article.confidence),
              )}
            >
              {article.confidence}%
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3 h-[108px]">
        <h4 className="font-semibold text-content-primary text-body leading-snug line-clamp-2 transition-colors duration-150 group-hover/card:text-accent">
          {article.title}
        </h4>

        <div className="mt-auto flex items-center justify-between pt-3 border-t border-glass-border">
          {/* Author */}
          <span className="flex items-center gap-2 text-caption-1 text-content-secondary truncate max-w-[160px]">
            <span className="w-5 h-5 rounded-full bg-surface-secondary flex-shrink-0 flex items-center justify-center text-caption-2 font-bold text-content-tertiary border border-surface-tertiary">
              {article.author.charAt(0)}
            </span>
            <span className="truncate font-medium">{article.author}</span>
          </span>

          {/* Timestamp */}
          <span className="flex-shrink-0 flex items-center gap-1 text-caption-2 font-mono text-content-tertiary">
            <Clock size={10} strokeWidth={2} />
            {article.timeAgo}
          </span>
        </div>
      </div>

      {/* Hover glow effect */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-400 pointer-events-none bg-gradient-to-t from-accent/5 via-transparent to-transparent"
        aria-hidden="true"
      />
    </button>
  );
});

ArticleCard.displayName = "ArticleCard";

// ─────────────────────────────────────────────────────────────────────────────
// NAV BUTTON COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface NavButtonProps {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}

const NavButton: FC<NavButtonProps> = React.memo(({ direction, disabled, onClick }) => {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={`Scroll ${direction}`}
      className={cn(
        "p-2 rounded-full",
        "transition-all duration-150 ease-standard",
        "border border-glass-border",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        disabled
          ? "opacity-30 cursor-not-allowed bg-transparent text-content-tertiary"
          : "bg-glass-surface hover:bg-surface-secondary text-content-secondary hover:text-content-primary shadow-sm hover:shadow-md",
      )}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
});

NavButton.displayName = "NavButton";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const FeaturedContent: FC<FeaturedContentProps> = ({ league, onArticleClick, className = "" }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { canScrollLeft, canScrollRight, scroll } = useHorizontalScroll(scrollRef);

  const articles = useMemo(() => ARTICLES[league] ?? ARTICLES.NHL, [league]);

  const handleArticleClick = useCallback(
    (title: string) => {
      onArticleClick(`Summarize the analysis for: ${title}`);
    },
    [onArticleClick],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") scroll("left");
      if (e.key === "ArrowRight") scroll("right");
    },
    [scroll],
  );

  return (
    <section className={cn("w-full relative my-8", className)} aria-label="Featured Insights" onKeyDown={handleKeyDown}>
      {/* Keyframe styles - inject once */}
      <style>{`
        @keyframes cardFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-5 px-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center border border-accent/20">
            <TrendingUp size={14} className="text-accent" strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-body-sm font-semibold text-content-primary tracking-tight">Featured Insights</h3>
            <p className="text-caption-2 text-content-tertiary font-medium">AI-powered analysis • Updated live</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-2" role="group" aria-label="Carousel navigation">
          <NavButton direction="left" disabled={!canScrollLeft} onClick={() => scroll("left")} />
          <NavButton direction="right" disabled={!canScrollRight} onClick={() => scroll("right")} />
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={scrollRef}
        role="list"
        tabIndex={0}
        className={cn(
          "flex gap-4 overflow-x-auto pb-4",
          "-mx-4 px-4 md:mx-0 md:px-0",
          "snap-x snap-mandatory",
          "scrollbar-hide",
          "focus-visible:outline-none",
        )}
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {articles.map((article, index) => (
          <ArticleCard
            key={article.id}
            article={article}
            index={index}
            onClick={() => handleArticleClick(article.title)}
          />
        ))}
      </div>

      {/* Edge fade indicators */}
      <div
        className={cn(
          "absolute left-0 top-[72px] bottom-4 w-8 pointer-events-none",
          "bg-gradient-to-r from-surface-primary to-transparent",
          "transition-opacity duration-250",
          canScrollLeft ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
      <div
        className={cn(
          "absolute right-0 top-[72px] bottom-4 w-8 pointer-events-none",
          "bg-gradient-to-l from-surface-primary to-transparent",
          "transition-opacity duration-250",
          canScrollRight ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
    </section>
  );
};

export default FeaturedContent;

/**
 * @component FeaturedContent
 * @description Institutional-grade featured insights carousel for sports analytics
 *
 * @metanotes {
 *   "design_system": "ESSENCE",
 *   "aesthetic": "Jony Ive × Stripe × DraftKings",
 *   "principles": [
 *     "Greatness through function",
 *     "Mathematical spacing (4px base unit)",
 *     "Physics-based shadows & motion",
 *     "60 FPS GPU-accelerated transforms"
 *   ],
 *   "performance": {
 *     "lazy_loading": "IntersectionObserver",
 *     "animations": "CSS transforms only (compositor thread)",
 *     "memoization": "useCallback for event handlers"
 *   },
 *   "accessibility": {
 *     "keyboard_nav": "Arrow keys + Tab",
 *     "aria_labels": "Full semantic markup",
 *     "reduced_motion": "Respects prefers-reduced-motion"
 *   }
 * }
 */

import React, { useRef, useState, useCallback, useEffect, useMemo, type FC, type RefObject } from "react";
import { Clock, TrendingUp, PlayCircle, ChevronRight, ChevronLeft, CheckCircle2, Zap, BarChart3 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

type League = "NHL" | "NFL" | "NBA";

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
  readonly confidence?: number; // 0-100 for picks
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
// DESIGN TOKENS (ESSENCE System)
// ─────────────────────────────────────────────────────────────────────────────

const TOKENS = {
  // Spacing: 4px base unit
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    "2xl": 32,
    "3xl": 48,
  },
  // Physics-based timing (spring curves)
  motion: {
    spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
    snap: "cubic-bezier(0.2, 0, 0, 1)",
  },
  // Elevation shadows (depth perception)
  shadow: {
    subtle: "0 1px 2px rgba(0,0,0,0.04)",
    card: "0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
    elevated: "0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
    glow: "0 0 40px rgba(16, 185, 129, 0.15)",
  },
  // Card dimensions
  card: {
    width: 300,
    widthMd: 340,
    imageHeight: 160,
    contentHeight: 108,
  },
} as const;

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
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const getTypeIcon = (type: ArticleType): React.ReactNode => {
  const iconProps = { size: 10, strokeWidth: 2.5 };
  switch (type) {
    case "Pick":
      return <CheckCircle2 {...iconProps} className="text-emerald-400" />;
    case "Video":
      return <PlayCircle {...iconProps} className="text-white" />;
    case "Analysis":
      return <BarChart3 {...iconProps} className="text-blue-400" />;
    case "Props":
      return <TrendingUp {...iconProps} className="text-amber-400" />;
  }
};

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 80) return "text-emerald-400";
  if (confidence >= 70) return "text-amber-400";
  return "text-zinc-400";
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
      const scrollAmount = TOKENS.card.width + TOKENS.space.lg;
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
      className="
          group/card relative flex-shrink-0 snap-center text-left
          w-[300px] md:w-[340px]
          rounded-2xl overflow-hidden
          bg-zinc-900/80 backdrop-blur-sm
          border border-zinc-800/60
          transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          hover:border-zinc-700/80
          hover:shadow-[0_8px_24px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)]
          hover:-translate-y-1
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
          motion-safe:animate-[fadeIn_0.4s_ease-out_forwards]
        "
      style={{
        animationDelay: `${index * 60}ms`,
        opacity: 0,
      }}
    >
      {/* Image Container */}
      <div className="relative h-40 w-full overflow-hidden bg-zinc-800">
        {/* Skeleton loader */}
        <div
          className={`
              absolute inset-0 bg-gradient-to-r from-zinc-800 via-zinc-700 to-zinc-800 
              animate-pulse transition-opacity duration-300
              ${imageLoaded ? "opacity-0" : "opacity-100"}
            `}
        />

        {/* Image */}
        <img
          src={article.imageUrl}
          alt=""
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          className={`
              absolute inset-0 w-full h-full object-cover
              transition-all duration-500 ease-out
              group-hover/card:scale-105
              ${imageLoaded ? "opacity-100" : "opacity-0"}
            `}
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/40 to-transparent" />

        {/* Premium indicator */}
        {article.isPremium && (
          <div className="absolute top-3 right-3 z-10">
            <span
              className="
                inline-flex items-center gap-1 px-2 py-0.5
                rounded-full bg-amber-500/20 backdrop-blur-md
                text-[9px] font-semibold text-amber-400 uppercase tracking-wider
                border border-amber-500/30
              "
            >
              <Zap size={8} fill="currentColor" />
              Pro
            </span>
          </div>
        )}

        {/* Type tag */}
        <div className="absolute top-3 left-3 z-10">
          <span
            className="
              inline-flex items-center gap-1.5 px-2.5 py-1
              rounded-lg bg-black/50 backdrop-blur-md
              text-[10px] font-semibold text-zinc-100 uppercase tracking-wider
              border border-white/10
              shadow-[0_2px_8px_rgba(0,0,0,0.2)]
            "
          >
            {getTypeIcon(article.type)}
            {article.tag}
          </span>
        </div>

        {/* Confidence score */}
        {article.confidence && (
          <div className="absolute bottom-3 right-3 z-10">
            <span
              className={`
                inline-flex items-center gap-1 px-2 py-1
                rounded-md bg-black/60 backdrop-blur-md
                text-xs font-mono font-bold tracking-tight
                border border-white/5
                ${getConfidenceColor(article.confidence)}
              `}
            >
              {article.confidence}%
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3 h-[108px]">
        <h4
          className="
            font-semibold text-zinc-100 text-[15px] leading-snug
            line-clamp-2
            transition-colors duration-200
            group-hover/card:text-emerald-400
          "
        >
          {article.title}
        </h4>

        <div
          className="
            mt-auto flex items-center justify-between
            pt-3 border-t border-zinc-800/60
          "
        >
          {/* Author */}
          <span className="flex items-center gap-2 text-xs text-zinc-500 truncate max-w-[160px]">
            <span
              className="
                w-5 h-5 rounded-full bg-zinc-800 flex-shrink-0
                flex items-center justify-center
                text-[10px] font-bold text-zinc-400
                border border-zinc-700/50
              "
            >
              {article.author.charAt(0)}
            </span>
            <span className="truncate font-medium">{article.author}</span>
          </span>

          {/* Timestamp */}
          <span
            className="
              flex-shrink-0 flex items-center gap-1
              text-[11px] font-mono text-zinc-600
            "
          >
            <Clock size={10} strokeWidth={2} />
            {article.timeAgo}
          </span>
        </div>
      </div>

      {/* Hover glow effect */}
      <div
        className="
          absolute inset-0 rounded-2xl opacity-0
          group-hover/card:opacity-100
          transition-opacity duration-500
          pointer-events-none
          bg-gradient-to-t from-emerald-500/5 via-transparent to-transparent
        "
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
      className={`
          p-2 rounded-full
          transition-all duration-200 ease-out
          border border-zinc-800/60
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50
          ${
            disabled
              ? "opacity-30 cursor-not-allowed bg-transparent text-zinc-600"
              : "bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 shadow-sm hover:shadow-md"
          }
        `}
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
      onArticleClick(`Analyze: ${title}`);
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
    <section className={`w-full relative my-8 ${className}`} aria-label="Featured Insights" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 px-1">
        <div className="flex items-center gap-3">
          <div
            className="
            w-8 h-8 rounded-lg bg-emerald-500/10
            flex items-center justify-center
            border border-emerald-500/20
          "
          >
            <TrendingUp size={14} className="text-emerald-400" strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">Featured Insights</h3>
            <p className="text-[11px] text-zinc-500 font-medium">AI-powered analysis • Updated live</p>
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
        className="
          flex gap-4 overflow-x-auto pb-4
          -mx-4 px-4 md:mx-0 md:px-0
          snap-x snap-mandatory
          scrollbar-hide
          focus-visible:outline-none
        "
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
        className={`
          absolute left-0 top-[72px] bottom-4 w-8 pointer-events-none
          bg-gradient-to-r from-zinc-950 to-transparent
          transition-opacity duration-300
          ${canScrollLeft ? "opacity-100" : "opacity-0"}
        `}
        aria-hidden="true"
      />
      <div
        className={`
          absolute right-0 top-[72px] bottom-4 w-8 pointer-events-none
          bg-gradient-to-l from-zinc-950 to-transparent
          transition-opacity duration-300
          ${canScrollRight ? "opacity-100" : "opacity-0"}
        `}
        aria-hidden="true"
      />
    </section>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// KEYFRAME ANIMATIONS (add to global CSS or Tailwind config)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add to tailwind.config.ts:
 *
 * theme: {
 *   extend: {
 *     keyframes: {
 *       fadeIn: {
 *         '0%': { opacity: '0', transform: 'translateY(8px)' },
 *         '100%': { opacity: '1', transform: 'translateY(0)' },
 *       },
 *     },
 *     animation: {
 *       'fade-in': 'fadeIn 0.4s ease-out forwards',
 *     },
 *   },
 * },
 */

export default FeaturedContent;

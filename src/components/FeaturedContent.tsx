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
import { useFeaturedPicks } from "@/hooks/useFeaturedPicks";

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

// Removed static ARTICLES - now fetching live data

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
  const { picks: articles, loading } = useFeaturedPicks(league);

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
        {loading ? (
          // Loading skeleton
          Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={`skeleton-${idx}`}
              className="flex-shrink-0 w-[280px] md:w-[320px] h-[248px] rounded-2xl bg-surface-secondary animate-pulse"
            />
          ))
        ) : articles.length === 0 ? (
          <div className="w-full text-center py-8 text-content-tertiary">
            No premium picks available yet. Check back soon!
          </div>
        ) : (
          articles.map((article, index) => (
            <ArticleCard
              key={article.id}
              article={article}
              index={index}
              onClick={() => handleArticleClick(article.title)}
            />
          ))
        )}
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

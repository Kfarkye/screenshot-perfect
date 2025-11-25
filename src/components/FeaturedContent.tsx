/**
 * @component FeaturedContent
 * @description Institutional-grade featured insights carousel
 *
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "aesthetic": "Jony Ive × Stripe × DraftKings",
 *   "tokens": "glass-surface, content-primary, accent, semantic-*",
 *   "motion": "duration-150/250/400, ease-standard/decelerate",
 *   "status": "Production Ready (v2.2 - Pristine)"
 * }
 */

import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type FC,
  type RefObject,
  type CSSProperties,
} from "react";
import {
  Clock,
  TrendingUp,
  PlayCircle,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Zap,
  BarChart3,
  ImageOff,
  AlertCircle,
} from "lucide-react";
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

interface NavButtonProps {
  readonly direction: "left" | "right";
  readonly disabled: boolean;
  readonly onClick: () => void;
}

interface EdgeFadeProps {
  readonly side: "left" | "right";
  readonly visible: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const SCROLL_THRESHOLD = 4;
const SCROLL_AMOUNT_PERCENTAGE = 0.8;
const ANIMATION_STAGGER_MS = 60;
const SKELETON_COUNT = 4;

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(" ");
};

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
    default:
      return <BarChart3 {...iconProps} className="text-accent" />;
  }
};

const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 80) return "text-semantic-success";
  if (confidence >= 70) return "text-semantic-warning";
  return "text-content-tertiary";
};

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const carouselStyles = `
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

  .card-enter-animation {
    opacity: 0;
    animation: cardFadeIn 0.4s ease-out forwards;
    animation-delay: var(--animation-delay, 0ms);
  }

  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// SCROLL HOOK
// ─────────────────────────────────────────────────────────────────────────────

const useHorizontalScroll = (ref: RefObject<HTMLDivElement | null>) => {
  const [scrollState, setScrollState] = useState<ScrollState>({
    canScrollLeft: false,
    canScrollRight: false,
  });

  const checkScroll = useCallback(() => {
    if (!ref.current) return;

    const { scrollLeft, scrollWidth, clientWidth } = ref.current;

    setScrollState({
      canScrollLeft: scrollLeft > SCROLL_THRESHOLD,
      canScrollRight: scrollWidth > clientWidth && scrollLeft < scrollWidth - clientWidth - SCROLL_THRESHOLD,
    });
  }, [ref]);

  const scroll = useCallback(
    (direction: "left" | "right") => {
      if (!ref.current) return;

      const scrollAmount = ref.current.clientWidth * SCROLL_AMOUNT_PERCENTAGE;

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

    const resizeObserver = new ResizeObserver(() => {
      checkScroll();
    });
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener("scroll", checkScroll);
      resizeObserver.disconnect();
    };
  }, [ref, checkScroll]);

  return { ...scrollState, scroll };
};

// ─────────────────────────────────────────────────────────────────────────────
// ARTICLE CARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const ArticleCard: FC<ArticleCardProps> = React.memo(({ article, onClick, index }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  const handleImageError = useCallback(() => {
    setImageLoaded(true);
    setImageError(true);
  }, []);

  const cardStyle = useMemo<CSSProperties>(
    () =>
      ({
        "--animation-delay": `${index * ANIMATION_STAGGER_MS}ms`,
      }) as CSSProperties,
    [index],
  );

  return (
    <button
      onClick={onClick}
      role="listitem"
      aria-label={`Read article: ${article.title}`}
      className={cn(
        "group/card relative flex-shrink-0 snap-start text-left",
        "w-[280px] md:w-[320px]",
        "rounded-2xl overflow-hidden",
        "bg-glass-surface backdrop-blur-xl backdrop-saturate-150",
        "border border-glass-border",
        "transition-all duration-250 ease-standard",
        "hover:border-content-tertiary/50",
        "hover:shadow-xl",
        "motion-safe:hover:-translate-y-1 motion-safe:hover:scale-[1.01]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary",
        "card-enter-animation",
      )}
      style={cardStyle}
    >
      {/* Image Container */}
      <div className="relative h-40 w-full overflow-hidden bg-surface-secondary">
        {/* Skeleton loader */}
        <div
          className={cn(
            "absolute inset-0",
            "bg-gradient-to-r from-surface-secondary via-surface-tertiary to-surface-secondary",
            "animate-pulse transition-opacity duration-400",
            imageLoaded ? "opacity-0" : "opacity-100",
          )}
          aria-hidden="true"
        />

        {/* Image or Fallback */}
        {imageError ? (
          <div
            className="absolute inset-0 flex items-center justify-center text-content-tertiary/30"
            aria-label="Image failed to load"
          >
            <ImageOff size={32} />
          </div>
        ) : (
          <img
            src={article.imageUrl}
            alt=""
            loading="lazy"
            width={320}
            height={160}
            onLoad={handleImageLoad}
            onError={handleImageError}
            className={cn(
              "absolute inset-0 w-full h-full object-cover",
              "transition-all duration-400 ease-decelerate",
              "group-hover/card:scale-105",
              imageLoaded ? "opacity-100" : "opacity-0",
            )}
          />
        )}

        {/* Gradient overlay */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-surface-primary via-surface-primary/40 to-transparent"
          aria-hidden="true"
        />

        {/* Premium indicator */}
        {article.isPremium && (
          <div className="absolute top-3 right-3 z-10">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full",
                "bg-semantic-warning/20 backdrop-blur-md",
                "text-caption-2 font-bold text-semantic-warning uppercase tracking-wider",
                "border border-semantic-warning/30",
              )}
            >
              <Zap size={8} fill="currentColor" />
              Pro
            </span>
          </div>
        )}

        {/* Type tag */}
        <div className="absolute top-3 left-3 z-10">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg",
              "bg-surface-primary/60 backdrop-blur-md",
              "text-caption-2 font-bold text-content-primary uppercase tracking-wider",
              "border border-glass-border shadow-md",
            )}
          >
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
      <div className="p-4 flex flex-col gap-3 min-h-[108px]">
        <h4
          className={cn(
            "font-semibold text-content-primary text-body leading-snug line-clamp-2",
            "transition-colors duration-150",
            "group-hover/card:text-accent",
          )}
        >
          {article.title}
        </h4>

        <div className="mt-auto flex items-center justify-between pt-3 border-t border-glass-border">
          {/* Author */}
          <span className="flex items-center gap-2 text-caption-1 text-content-secondary truncate max-w-[160px]">
            <span
              className={cn(
                "w-5 h-5 rounded-full flex-shrink-0",
                "flex items-center justify-center",
                "bg-surface-secondary border border-surface-tertiary",
                "text-caption-2 font-bold text-content-tertiary",
              )}
            >
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
        className={cn(
          "absolute inset-0 rounded-2xl pointer-events-none",
          "bg-gradient-to-t from-accent/5 via-transparent to-transparent",
          "opacity-0 group-hover/card:opacity-100",
          "transition-opacity duration-400",
        )}
        aria-hidden="true"
      />
    </button>
  );
});

ArticleCard.displayName = "ArticleCard";

// ─────────────────────────────────────────────────────────────────────────────
// NAV BUTTON COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

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
          : cn(
              "bg-glass-surface text-content-secondary",
              "hover:bg-surface-secondary hover:text-content-primary",
              "shadow-sm hover:shadow-md",
            ),
      )}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
});

NavButton.displayName = "NavButton";

// ─────────────────────────────────────────────────────────────────────────────
// LOADING SKELETON
// ─────────────────────────────────────────────────────────────────────────────

const LoadingSkeleton: FC = React.memo(() => (
  <>
    {Array.from({ length: SKELETON_COUNT }).map((_, idx) => (
      <div
        key={`skeleton-${idx}`}
        className={cn(
          "flex-shrink-0 snap-start",
          "w-[280px] md:w-[320px] h-[248px]",
          "rounded-2xl bg-surface-secondary animate-pulse",
        )}
        aria-hidden="true"
      />
    ))}
  </>
));

LoadingSkeleton.displayName = "LoadingSkeleton";

// ─────────────────────────────────────────────────────────────────────────────
// ERROR STATE
// ─────────────────────────────────────────────────────────────────────────────

const ErrorState: FC = React.memo(() => (
  <div
    className={cn(
      "w-full py-12 px-6 text-center rounded-2xl",
      "text-semantic-error bg-semantic-error/5 border border-semantic-error/20",
    )}
    role="alert"
  >
    <AlertCircle size={24} className="mx-auto mb-2" />
    <p className="text-body-sm font-medium">Error loading insights. Please try again later.</p>
  </div>
));

ErrorState.displayName = "ErrorState";

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────

const EmptyState: FC = React.memo(() => (
  <div className="w-full text-center py-8 text-content-tertiary">
    <BarChart3 size={24} className="mx-auto mb-2 opacity-50" />
    <p className="text-body-sm">No premium picks available yet. Check back soon!</p>
  </div>
));

EmptyState.displayName = "EmptyState";

// ─────────────────────────────────────────────────────────────────────────────
// EDGE FADE INDICATOR
// ─────────────────────────────────────────────────────────────────────────────

const EdgeFade: FC<EdgeFadeProps> = React.memo(({ side, visible }) => (
  <div
    className={cn(
      "absolute top-[72px] bottom-4 w-8 pointer-events-none",
      "transition-opacity duration-250",
      side === "left"
        ? "left-0 bg-gradient-to-r from-surface-primary to-transparent"
        : "right-0 bg-gradient-to-l from-surface-primary to-transparent",
      visible ? "opacity-100" : "opacity-0",
    )}
    aria-hidden="true"
  />
));

EdgeFade.displayName = "EdgeFade";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const FeaturedContent: FC<FeaturedContentProps> = ({ league, onArticleClick, className = "" }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { canScrollLeft, canScrollRight, scroll } = useHorizontalScroll(scrollRef);
  const { picks: articles, loading, error } = useFeaturedPicks(league);

  const handleArticleClick = useCallback(
    (title: string) => {
      onArticleClick(`Summarize the analysis for: ${title}`);
    },
    [onArticleClick],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.target !== scrollRef.current) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scroll("left");
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        scroll("right");
      }
    },
    [scroll],
  );

  const handleScrollLeft = useCallback(() => scroll("left"), [scroll]);
  const handleScrollRight = useCallback(() => scroll("right"), [scroll]);

  const renderContent = useMemo(() => {
    if (error) {
      return <ErrorState />;
    }

    if (loading) {
      return <LoadingSkeleton />;
    }

    if (articles.length === 0) {
      return <EmptyState />;
    }

    return articles.map((article, index) => (
      <ArticleCard key={article.id} article={article} index={index} onClick={() => handleArticleClick(article.title)} />
    ));
  }, [error, loading, articles, handleArticleClick]);

  return (
    <section className={cn("w-full relative my-8", className)} aria-label="Featured Insights">
      {/* Injected styles */}
      <style>{carouselStyles}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-5 px-1">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-8 h-8 rounded-lg",
              "bg-accent/10 border border-accent/20",
              "flex items-center justify-center",
            )}
          >
            <TrendingUp size={14} className="text-accent" strokeWidth={2.5} />
          </div>
          <div>
            <h3 className="text-body-sm font-semibold text-content-primary tracking-tight">Featured Insights</h3>
            <p className="text-caption-2 text-content-tertiary font-medium">AI-powered analysis • Updated live</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-2" role="group" aria-label="Carousel navigation">
          <NavButton direction="left" disabled={!canScrollLeft} onClick={handleScrollLeft} />
          <NavButton direction="right" disabled={!canScrollRight} onClick={handleScrollRight} />
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={scrollRef}
        role="list"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex gap-4 overflow-x-auto pb-4",
          "-mx-4 px-4 md:mx-0 md:px-0",
          "snap-x snap-mandatory",
          "scroll-ps-4 md:scroll-ps-0",
          "scrollbar-hide",
          "focus-visible:outline-none",
        )}
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {renderContent}
      </div>

      {/* Edge fade indicators */}
      <EdgeFade side="left" visible={canScrollLeft} />
      <EdgeFade side="right" visible={canScrollRight} />
    </section>
  );
};

export default FeaturedContent;

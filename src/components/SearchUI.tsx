/**
 * @component SearchUI
 * @description UI components for displaying search status, citations, and sources
 *
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "features": [
 *     "Search indicator with pulse animation",
 *     "Citation pills with hover cards",
 *     "Source list with links",
 *     "Inline citation markers"
 *   ]
 * }
 */

import React, { useState, type FC } from 'react';
import {
  Search,
  Globe,
  ExternalLink,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Link2,
  Clock,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface Citation {
  index: number;
  source: string;
  url: string;
  title: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH INDICATOR (Shows during search)
// ─────────────────────────────────────────────────────────────────────────────

interface SearchIndicatorProps {
  query?: string;
  status: 'searching' | 'complete' | 'error';
  className?: string;
}

export const SearchIndicator: FC<SearchIndicatorProps> = React.memo(
  ({ query, status, className }) => {
    const statusConfig = {
      searching: {
        icon: Loader2,
        text: 'Searching the web',
        iconClass: 'animate-spin text-accent',
        bgClass: 'bg-accent/10 border-accent/20',
      },
      complete: {
        icon: CheckCircle2,
        text: 'Search complete',
        iconClass: 'text-semantic-success',
        bgClass: 'bg-semantic-success/10 border-semantic-success/20',
      },
      error: {
        icon: AlertCircle,
        text: 'Search failed',
        iconClass: 'text-semantic-error',
        bgClass: 'bg-semantic-error/10 border-semantic-error/20',
      },
    };

    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-xl',
          'border backdrop-blur-sm',
          'transition-all duration-300 ease-standard',
          config.bgClass,
          className
        )}
      >
        <Icon size={14} className={config.iconClass} />
        <div className="flex flex-col">
          <span className="text-caption-1 font-medium text-content-primary">
            {config.text}
          </span>
          {query && (
            <span className="text-caption-2 text-content-tertiary truncate max-w-[200px]">
              "{query}"
            </span>
          )}
        </div>
      </div>
    );
  }
);

SearchIndicator.displayName = 'SearchIndicator';

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH BADGE (Compact indicator for message)
// ─────────────────────────────────────────────────────────────────────────────

interface SearchBadgeProps {
  query?: string;
  resultCount?: number;
  onClick?: () => void;
  className?: string;
}

export const SearchBadge: FC<SearchBadgeProps> = React.memo(
  ({ query, resultCount, onClick, className }) => {
    return (
      <button
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded-lg',
          'bg-accent/10 border border-accent/20',
          'text-caption-2 font-medium text-accent',
          'transition-all duration-150 ease-standard',
          'hover:bg-accent/20 hover:border-accent/30',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          className
        )}
      >
        <Globe size={12} />
        <span>Web search</span>
        {resultCount !== undefined && (
          <span className="px-1.5 py-0.5 rounded bg-accent/20 text-caption-2">
            {resultCount}
          </span>
        )}
      </button>
    );
  }
);

SearchBadge.displayName = 'SearchBadge';

// ─────────────────────────────────────────────────────────────────────────────
// CITATION PILL (Inline source reference)
// ─────────────────────────────────────────────────────────────────────────────

interface CitationPillProps {
  citation: Citation;
  size?: 'sm' | 'md';
  className?: string;
}

export const CitationPill: FC<CitationPillProps> = React.memo(
  ({ citation, size = 'sm', className }) => {
    const [showTooltip, setShowTooltip] = useState(false);

    return (
      <span className="relative inline-block">
        <a
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className={cn(
            'inline-flex items-center gap-1 rounded-md',
            'bg-surface-secondary/80 border border-glass-border',
            'text-accent hover:text-accent-hover',
            'transition-all duration-150 ease-standard',
            'hover:bg-surface-secondary hover:border-accent/30',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            size === 'sm' ? 'px-1.5 py-0.5 text-caption-2' : 'px-2 py-1 text-caption-1',
            className
          )}
        >
          <span className="font-mono font-bold">[{citation.index}]</span>
          <span className="font-medium truncate max-w-[100px]">{citation.source}</span>
          <ExternalLink size={size === 'sm' ? 10 : 12} className="opacity-60" />
        </a>

        {/* Tooltip */}
        {showTooltip && (
          <div
            className={cn(
              'absolute bottom-full left-0 mb-2 z-50',
              'w-64 p-3 rounded-xl',
              'bg-surface-primary border border-glass-border',
              'shadow-xl backdrop-blur-xl',
              'animate-in fade-in slide-in-from-bottom-2 duration-150'
            )}
          >
            <p className="text-caption-1 font-medium text-content-primary line-clamp-2 mb-1">
              {citation.title}
            </p>
            <p className="text-caption-2 text-accent truncate">{citation.url}</p>
          </div>
        )}
      </span>
    );
  }
);

CitationPill.displayName = 'CitationPill';

// ─────────────────────────────────────────────────────────────────────────────
// SOURCES LIST (Expandable list of all sources)
// ─────────────────────────────────────────────────────────────────────────────

interface SourcesListProps {
  results: SearchResult[];
  defaultExpanded?: boolean;
  className?: string;
}

export const SourcesList: FC<SourcesListProps> = React.memo(
  ({ results, defaultExpanded = false, className }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    if (results.length === 0) return null;

    return (
      <div
        className={cn(
          'rounded-xl border border-glass-border',
          'bg-glass-surface/50 backdrop-blur-sm',
          'overflow-hidden',
          className
        )}
      >
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'w-full flex items-center justify-between',
            'px-4 py-3',
            'text-caption-1 font-semibold text-content-secondary',
            'transition-colors duration-150',
            'hover:bg-surface-secondary/50'
          )}
        >
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-accent" />
            <span>Sources ({results.length})</span>
          </div>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-glass-border">
            <ul className="divide-y divide-glass-border/50">
              {results.map((result, i) => (
                <li key={i}>
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'flex items-start gap-3 px-4 py-3',
                      'transition-colors duration-150',
                      'hover:bg-surface-secondary/50',
                      'group'
                    )}
                  >
                    {/* Index badge */}
                    <span
                      className={cn(
                        'flex-shrink-0 w-6 h-6 rounded-md',
                        'bg-accent/10 border border-accent/20',
                        'flex items-center justify-center',
                        'text-caption-2 font-mono font-bold text-accent'
                      )}
                    >
                      {i + 1}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium text-content-primary line-clamp-1 group-hover:text-accent transition-colors">
                        {result.title}
                      </p>
                      <p className="text-caption-2 text-content-tertiary line-clamp-2 mt-0.5">
                        {result.snippet}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-caption-2 text-accent font-medium">
                          {result.source}
                        </span>
                        {result.publishedAt && (
                          <>
                            <span className="text-content-tertiary">•</span>
                            <span className="flex items-center gap-1 text-caption-2 text-content-tertiary">
                              <Clock size={10} />
                              {result.publishedAt}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* External link icon */}
                    <ExternalLink
                      size={14}
                      className="flex-shrink-0 text-content-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
);

SourcesList.displayName = 'SourcesList';

// ─────────────────────────────────────────────────────────────────────────────
// INLINE CITATIONS (Render response with clickable citation numbers)
// ─────────────────────────────────────────────────────────────────────────────

interface InlineCitationsProps {
  content: string;
  citations: Citation[];
  className?: string;
}

export const InlineCitations: FC<InlineCitationsProps> = React.memo(
  ({ content, citations, className }) => {
    // Replace [1], [2], etc. with clickable links
    const citationPattern = /\[(\d+)\]/g;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = citationPattern.exec(content)) !== null) {
      // Add text before citation
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>{content.slice(lastIndex, match.index)}</span>
        );
      }

      // Add citation link
      const citationIndex = parseInt(match[1], 10);
      const citation = citations.find((c) => c.index === citationIndex);

      if (citation) {
        parts.push(
          <CitationPill key={`cite-${match.index}`} citation={citation} size="sm" />
        );
      } else {
        parts.push(<span key={`cite-${match.index}`}>{match[0]}</span>);
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(<span key={`text-${lastIndex}`}>{content.slice(lastIndex)}</span>);
    }

    return <span className={className}>{parts}</span>;
  }
);

InlineCitations.displayName = 'InlineCitations';

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH LOADING SKELETON
// ─────────────────────────────────────────────────────────────────────────────

interface SearchSkeletonProps {
  className?: string;
}

export const SearchSkeleton: FC<SearchSkeletonProps> = React.memo(({ className }) => (
  <div className={cn('flex flex-col gap-3', className)}>
    {/* Search indicator */}
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 rounded-full bg-accent/20 animate-pulse" />
      <div className="h-3 w-32 bg-surface-secondary rounded animate-pulse" />
    </div>

    {/* Fake results loading */}
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center gap-2 p-2 rounded-lg bg-surface-secondary/50"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <div className="w-5 h-5 rounded bg-accent/10 animate-pulse" />
          <div className="flex-1 space-y-1">
            <div
              className="h-3 bg-surface-secondary rounded animate-pulse"
              style={{ width: `${70 + Math.random() * 20}%` }}
            />
            <div
              className="h-2 bg-surface-secondary/50 rounded animate-pulse"
              style={{ width: `${40 + Math.random() * 30}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  </div>
));

SearchSkeleton.displayName = 'SearchSkeleton';

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH MESSAGE WRAPPER (Wraps assistant message with search context)
// ─────────────────────────────────────────────────────────────────────────────

interface SearchMessageWrapperProps {
  children: React.ReactNode;
  searchPerformed?: boolean;
  searchQuery?: string;
  results?: SearchResult[];
  citations?: Citation[];
  showSources?: boolean;
  className?: string;
}

export const SearchMessageWrapper: FC<SearchMessageWrapperProps> = React.memo(
  ({
    children,
    searchPerformed,
    searchQuery,
    results = [],
    citations = [],
    showSources = true,
    className,
  }) => {
    if (!searchPerformed) {
      return <>{children}</>;
    }

    return (
      <div className={cn('flex flex-col gap-3', className)}>
        {/* Search badge */}
        <SearchBadge query={searchQuery} resultCount={results.length} />

        {/* Message content */}
        {children}

        {/* Sources list */}
        {showSources && results.length > 0 && (
          <SourcesList results={results} defaultExpanded={false} />
        )}
      </div>
    );
  }
);

SearchMessageWrapper.displayName = 'SearchMessageWrapper';

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
  SearchIndicator,
  SearchBadge,
  CitationPill,
  SourcesList,
  InlineCitations,
  SearchSkeleton,
  SearchMessageWrapper,
};

export default {
  SearchIndicator,
  SearchBadge,
  CitationPill,
  SourcesList,
  InlineCitations,
  SearchSkeleton,
  SearchMessageWrapper,
};

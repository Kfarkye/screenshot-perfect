import React, { useState, useCallback, useMemo, useRef, useLayoutEffect, CSSProperties, ReactNode } from 'react';
import { Sparkles, User, AlertTriangle, Copy, Check, Terminal, Activity, Cpu, ChevronRight, Database, Layers, TestTube, Zap, TrendingUp, BarChart3, Brain } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS — Production-Grade Type System
// ═══════════════════════════════════════════════════════════════════════════

type Role = 'user' | 'model' | 'system' | 'architect' | 'database' | 'interface' | 'test';

type MessageStatus = 'pending' | 'processing' | 'complete' | 'error' | 'cancelled';

interface MessageMetrics {
  latency?: number;
  tokensPerSecond?: number;
  modelVersion?: string;
  temperature?: number;
  confidence?: number;
  executionPath?: string[];
}

interface MessageArtifact {
  id: string;
  type: 'spec' | 'schema' | 'component' | 'test' | 'document';
  content: unknown;
  metadata?: Record<string, unknown>;
}

interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  status: MessageStatus;
  metadata?: MessageMetrics;
  artifacts?: MessageArtifact[];
  parentId?: string;
  threadId?: string;
  isStreaming?: boolean;
  error?: {
    code: string;
    message: string;
    recoverable?: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION & UTILITIES — Enterprise-Grade Infrastructure
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Performance Monitor — Real-time metrics collection with batching
 */
class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }
  
  track(metric: string, value: number, metadata?: Record<string, unknown>): void {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    this.metrics.get(metric)!.push(value);
    
    // Batch send metrics every 5 seconds
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flush();
        this.batchTimer = null;
      }, 5000);
    }
    
    // Dev mode immediate logging for critical metrics
    if (process.env.NODE_ENV === 'development' && value > 100) {
      console.debug(`[PERF:${metric}] ${value.toFixed(2)}ms`, metadata);
    }
  }
  
  flush(): void {
    this.metrics.forEach((values, metric) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      
      // Send to monitoring service
      if (process.env.NODE_ENV === 'production') {
        // Integration point for DataDog, New Relic, etc.
        console.log(JSON.stringify({ metric, avg, max, min, count: values.length }));
      }
    });
    this.metrics.clear();
  }
  
  measure<T>(label: string, fn: () => T): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.track(label, duration);
      return result;
    } catch (error) {
      this.track(`${label}:error`, performance.now() - start);
      throw error;
    }
  }
}

const perfMonitor = PerformanceMonitor.getInstance();

/**
 * Error Boundary Hook — Graceful error recovery with telemetry
 */
const useErrorBoundary = () => {
  const [error, setError] = useState<Error | null>(null);
  
  const resetError = useCallback(() => setError(null), []);
  
  const captureError = useCallback((error: unknown, context: string) => {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    setError(errorObj);
    
    // Telemetry
    if (process.env.NODE_ENV === 'production') {
      // Sentry, LogRocket integration point
      console.error(JSON.stringify({
        level: 'error',
        timestamp: new Date().toISOString(),
        context,
        error: {
          message: errorObj.message,
          stack: errorObj.stack,
          name: errorObj.name
        }
      }));
    }
  }, []);
  
  return { error, resetError, captureError };
};

/**
 * Utility: Class name combiner with null safety
 */
const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

/**
 * Utility: Debounced callback for performance optimization
 */
const useDebounce = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T => {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const callbackRef = useRef(callback);
  
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });
  
  return useCallback(
    ((...args) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// TEXT PROCESSING ENGINE — Advanced Markdown & Formatting
// ═══════════════════════════════════════════════════════════════════════════

interface ProcessedSegment {
  type: 'text' | 'bold' | 'italic' | 'code' | 'link' | 'record' | 'metric' | 'lane';
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Advanced text processor with support for Lane Router specific patterns
 */
class TextProcessor {
  private static patterns = {
    bold: /\*\*(.+?)\*\*/g,
    italic: /\*(?!\*)(.+?)\*/g,
    code: /`([^`]+)`/g,
    link: /\[([^\]]+)\]\(([^)]+)\)/g,
    record: /\((\d{1,3})-(\d{1,3})-(\d{1,3})\)/g,
    metric: /\{(\w+):([^}]+)\}/g, // {latency:45ms}, {accuracy:97.3%}
    lane: /\[(SPEC|DATABASE|INTERFACE|TEST|ARCHITECT)\]/g // Lane indicators
  };
  
  static process(text: string): ProcessedSegment[] {
    const segments: ProcessedSegment[] = [];
    let lastIndex = 0;
    
    // Create a combined pattern for efficient single-pass processing
    const combinedPattern = new RegExp(
      Object.values(this.patterns)
        .map(p => p.source)
        .join('|'),
      'g'
    );
    
    let match;
    while ((match = combinedPattern.exec(text)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        segments.push({
          type: 'text',
          content: text.slice(lastIndex, match.index)
        });
      }
      
      // Identify match type and create segment
      const fullMatch = match[0];
      
      if (fullMatch.startsWith('**') && fullMatch.endsWith('**')) {
        segments.push({
          type: 'bold',
          content: fullMatch.slice(2, -2)
        });
      } else if (fullMatch.startsWith('*') && fullMatch.endsWith('*')) {
        segments.push({
          type: 'italic',
          content: fullMatch.slice(1, -1)
        });
      } else if (fullMatch.startsWith('`') && fullMatch.endsWith('`')) {
        segments.push({
          type: 'code',
          content: fullMatch.slice(1, -1)
        });
      } else if (fullMatch.startsWith('[') && fullMatch.includes('](')) {
        const linkMatch = fullMatch.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          segments.push({
            type: 'link',
            content: linkMatch[1],
            metadata: { href: linkMatch[2] }
          });
        }
      } else if (fullMatch.match(/\(\d{1,3}-\d{1,3}-\d{1,3}\)/)) {
        segments.push({
          type: 'record',
          content: fullMatch.slice(1, -1)
        });
      } else if (fullMatch.startsWith('{') && fullMatch.endsWith('}')) {
        const metricMatch = fullMatch.match(/\{(\w+):([^}]+)\}/);
        if (metricMatch) {
          segments.push({
            type: 'metric',
            content: metricMatch[2],
            metadata: { label: metricMatch[1] }
          });
        }
      } else if (fullMatch.match(/\[(SPEC|DATABASE|INTERFACE|TEST|ARCHITECT)\]/)) {
        segments.push({
          type: 'lane',
          content: fullMatch.slice(1, -1)
        });
      }
      
      lastIndex = match.index + fullMatch.length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex)
      });
    }
    
    return segments;
  }
}

/**
 * Inline Renderer — Converts processed segments to React elements
 */
const renderInline = (
  segments: ProcessedSegment[],
  context: { isModel: boolean; isError: boolean; role: Role }
): ReactNode[] => {
  const { isModel, isError, role } = context;
  
  // Dynamic theming based on context
  const getSegmentStyle = (type: ProcessedSegment['type']) => {
    const baseStyles = {
      text: isError ? 'text-destructive-foreground/95' : 'text-foreground',
      bold: 'font-semibold text-foreground',
      italic: 'italic text-muted-foreground',
      code: cn(
        'px-2 py-0.5 rounded-md text-[0.9em] font-mono border mx-0.5 align-baseline',
        isError
          ? 'bg-background/20 border-border/30 text-destructive-foreground'
          : 'bg-muted text-foreground border-border'
      ),
      link: cn(
        'underline decoration-1 underline-offset-4 hover:decoration-2 transition-all font-medium',
        isError ? 'text-destructive-foreground' : 'text-accent hover:text-accent/80'
      ),
      record: 'inline-block text-[0.9em] font-medium mx-1 text-muted-foreground',
      metric: cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.85em] font-medium',
        'bg-muted border border-border text-foreground'
      ),
      lane: cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold tracking-wide uppercase',
        'bg-gradient-to-r',
        role === 'architect' && 'from-primary/20 to-primary/20 text-primary border border-primary/30',
        role === 'database' && 'from-accent/20 to-accent/20 text-accent border border-accent/30',
        role === 'interface' && 'from-success/20 to-success/20 text-success border border-success/30',
        role === 'test' && 'from-warning/20 to-warning/20 text-warning border border-warning/30'
      )
    };
    
    return baseStyles[type] || baseStyles.text;
  };
  
  return segments.map((segment, idx) => {
    const style = getSegmentStyle(segment.type);
    
    switch (segment.type) {
      case 'bold':
        return (
          <strong key={idx} className={style}>
            {segment.content}
          </strong>
        );
        
      case 'italic':
        return (
          <em key={idx} className={style}>
            {segment.content}
          </em>
        );
        
      case 'code':
        return (
          <code key={idx} className={style}>
            {segment.content}
          </code>
        );
        
      case 'link':
        return (
          <a
            key={idx}
            href={segment.metadata?.href as string}
            className={style}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
              perfMonitor.track('link_click', 0, { href: segment.metadata?.href });
            }}
          >
            {segment.content}
          </a>
        );
        
      case 'record':
        return (
          <span
            key={idx}
            className={style}
            aria-label={`Record: ${segment.content}`}
          >
            ({segment.content})
          </span>
        );
        
      case 'metric':
        return (
          <span key={idx} className={style}>
            <span className="opacity-60">{segment.metadata?.label as React.ReactNode}:</span>
            <span className="font-numeric">{segment.content}</span>
          </span>
        );
        
      case 'lane':
        const LaneIcon = {
          ARCHITECT: Brain,
          DATABASE: Database,
          INTERFACE: Layers,
          TEST: TestTube,
          SPEC: Zap
        }[segment.content] || Zap;
        
        return (
          <span key={idx} className={style}>
            <LaneIcon size={12} />
            {segment.content}
          </span>
        );
        
      default:
        return (
          <span key={idx} className={style}>
            {segment.content}
          </span>
        );
    }
  });
};

// ═══════════════════════════════════════════════════════════════════════════
// CODE BLOCK COMPONENT — Production-Grade Code Display
// ═══════════════════════════════════════════════════════════════════════════

interface CodeBlockProps {
  language: string;
  code: string;
  metadata?: {
    filename?: string;
    lineNumbers?: boolean;
    highlightLines?: number[];
  };
}

const CodeBlock = React.memo(({ language, code, metadata }: CodeBlockProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);
  
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      perfMonitor.track('code_copy', code.length);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }, [code]);
  
  const lines = useMemo(() => code.split('\n'), [code]);
  const showLineNumbers = metadata?.lineNumbers ?? lines.length > 5;
  
  return (
    <div className="my-6 rounded-2xl overflow-hidden border border-border bg-card shadow-2xl backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-card-foreground/5 border-b border-border backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-destructive/90 shadow-sm" />
            <div className="w-3 h-3 rounded-full bg-warning/90 shadow-sm" />
            <div className="w-3 h-3 rounded-full bg-success/90 shadow-sm" />
          </div>
          <div className="flex items-center gap-2.5">
            <Terminal size={15} className="text-muted-foreground" />
            <span className="text-xs font-mono text-foreground font-medium">{language}</span>
            {metadata?.filename && (
              <>
                <ChevronRight size={13} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">{metadata.filename}</span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={handleCopy}
          className="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent hover:border-border"
        >
          {isCopied ? (
            <span className="flex items-center gap-1.5 text-success">
              <Check size={14} />
              Copied
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Copy size={14} />
              Copy
            </span>
          )}
        </button>
      </div>
      
      {/* Code Content */}
      <div className="relative">
        <pre
          ref={codeRef}
          className="p-5 overflow-x-auto font-mono text-[13px] leading-[1.7] bg-card"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#444 transparent'
          }}
        >
          <code className="text-foreground">
            {showLineNumbers ? (
              <div className="flex">
                <div className="select-none pr-5 text-gray-400 dark:text-gray-600 text-right min-w-[3em]">
                  {lines.map((_, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'leading-[1.7]',
                        metadata?.highlightLines?.includes(idx + 1) && 'text-yellow-600 dark:text-yellow-400 font-semibold'
                      )}
                    >
                      {idx + 1}
                    </div>
                  ))}
                </div>
                <div className="flex-1">
                  {lines.map((line, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'leading-[1.7]',
                        metadata?.highlightLines?.includes(idx + 1) &&
                        'bg-yellow-50 dark:bg-yellow-400/10 -mx-5 px-5 border-l-2 border-yellow-500'
                      )}
                    >
                      {line || ' '}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              code
            )}
          </code>
        </pre>
      </div>
    </div>
  );
});
CodeBlock.displayName = 'CodeBlock';

// ═══════════════════════════════════════════════════════════════════════════
// TABLE COMPONENT — DraftKings-Level Data Density
// ═══════════════════════════════════════════════════════════════════════════

interface TableData {
  headers: string[];
  rows: string[][];
  metadata?: {
    sortable?: boolean;
    highlightColumn?: number;
    totalsRow?: boolean;
  };
}

const DataTable = React.memo(({ headers, rows, metadata }: TableData) => {
  const [sortConfig, setSortConfig] = useState<{
    key: number;
    direction: 'asc' | 'desc';
  } | null>(null);
  
  const sortedRows = useMemo(() => {
    if (!sortConfig || !metadata?.sortable) return rows;
    
    return [...rows].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      
      // Numeric detection
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      }
      
      // String comparison
      return sortConfig.direction === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
  }, [rows, sortConfig, metadata?.sortable]);
  
  const handleSort = (columnIndex: number) => {
    if (!metadata?.sortable) return;
    
    setSortConfig(prev => ({
      key: columnIndex,
      direction:
        prev?.key === columnIndex && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  return (
    <div className="my-5 overflow-hidden rounded-xl border border-surface-border/70 shadow-lg bg-surface/30 backdrop-blur-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-highlight/50 border-b border-surface-border">
            <tr>
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  onClick={() => handleSort(idx)}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary',
                    metadata?.sortable && 'cursor-pointer hover:bg-surface-highlight/70 transition-colors',
                    metadata?.highlightColumn === idx && 'bg-accent/10'
                  )}
                >
                  <div className="flex items-center gap-1">
                    {header}
                    {metadata?.sortable && sortConfig?.key === idx && (
                      <span className="text-accent">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border/30">
            {sortedRows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className={cn(
                  'hover:bg-surface-highlight/30 transition-colors',
                  metadata?.totalsRow && rIdx === rows.length - 1 &&
                  'font-semibold bg-surface-highlight/20 border-t-2 border-surface-border'
                )}
              >
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className={cn(
                      'px-4 py-2.5 font-numeric',
                      metadata?.highlightColumn === cIdx && 'bg-accent/5 font-medium'
                    )}
                  >
                    <span className={cn(
                      // Color code numeric values
                      !isNaN(parseFloat(cell)) && parseFloat(cell) < 0 && 'text-danger',
                      !isNaN(parseFloat(cell)) && parseFloat(cell) > 100 && 'text-success'
                    )}>
                      {cell}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
DataTable.displayName = 'DataTable';

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTED TEXT COMPONENT — Complete Markdown Renderer
// ═══════════════════════════════════════════════════════════════════════════

interface FormattedTextProps {
  text: string;
  role: Role;
  isError: boolean;
  isStreaming?: boolean;
}

const FormattedText = React.memo(({ text, role, isError, isStreaming }: FormattedTextProps) => {
  const isModel = ['model', 'architect', 'database', 'interface', 'test'].includes(role);
  
  const content = useMemo(() => {
    return perfMonitor.measure('FormattedTextRender', () => {
      if (!text || text.trim().length === 0) {
        return (
          <div className="flex items-center gap-2 text-text-secondary italic text-sm">
            {isStreaming && <Activity size={14} className="animate-pulse" />}
            {isError ? 'An error occurred.' : 'Processing...'}
          </div>
        );
      }
      
      const blocks = text.split(/(```[\s\S]*?```)/g);
      
      return blocks.map((block, blockIdx) => {
        // Handle code blocks
        if (block.startsWith('```') && block.endsWith('```')) {
          const lines = block.split('\n');
          const language = lines[0].replace(/```/, '').trim() || 'plaintext';
          const code = lines.slice(1, -1).join('\n');
          
          return (
            <CodeBlock
              key={`code-${blockIdx}`}
              language={language}
              code={code}
            />
          );
        }
        
        // Process other content
        const sections = block.split(/\n\n+/);
        
        return sections.map((section, sectionIdx) => {
          const trimmed = section.trim();
          if (!trimmed) return null;
          
          const key = `${blockIdx}-${sectionIdx}`;
          
          // Tables
          if (trimmed.includes('|') && trimmed.includes('---')) {
            const rows = trimmed.split('\n').filter(r => r.trim());
            if (rows.length >= 3 && rows[1].includes('---')) {
              const headers = rows[0].split('|').map(h => h.trim()).filter(Boolean);
              const dataRows = rows.slice(2).map(r => 
                r.split('|').map(c => c.trim()).filter(Boolean)
              );
              
              return (
                <DataTable
                  key={key}
                  headers={headers}
                  rows={dataRows}
                  metadata={{ sortable: true }}
                />
              );
            }
          }
          
          // Lists
          const lines = trimmed.split('\n');
          const isUnorderedList = lines.every(l => l.trim().startsWith('- ') || l.trim().startsWith('* '));
          const isOrderedList = lines.every(l => l.trim().match(/^\d+\.\s/));
          
          if (isUnorderedList || isOrderedList) {
            const ListComponent = isOrderedList ? 'ol' : 'ul';
            const items = lines.map(l => 
              l.trim().replace(isOrderedList ? /^\d+\.\s*/ : /^[-*]\s*/, '')
            );
            
            return (
              <ListComponent
                key={key}
                className={cn(
                  isOrderedList ? 'list-decimal' : 'list-disc',
                  'pl-8 space-y-3 my-5 text-[15px] leading-[1.8] marker:text-gray-400 dark:marker:text-gray-600'
                )}
              >
                {items.map((item, i) => (
                  <li key={i} className="pl-2">
                    {renderInline(TextProcessor.process(item), { isModel, isError, role })}
                  </li>
                ))}
              </ListComponent>
            );
          }
          
          // Headers
          const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
          if (headerMatch) {
            const level = headerMatch[1].length;
            const content = headerMatch[2];
            const HeadingTag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements;
            
            const sizeClass = {
              1: 'text-3xl mt-8 mb-4 font-extrabold',
              2: 'text-2xl mt-7 mb-3.5 font-bold',
              3: 'text-xl mt-6 mb-3 font-bold',
              4: 'text-lg mt-5 mb-2.5 font-semibold',
              5: 'text-base mt-4 mb-2 font-semibold',
              6: 'text-sm mt-3 mb-1.5 font-semibold'
            }[level] || 'text-base';
            
            return (
              <HeadingTag
                key={key}
                className={cn(sizeClass, 'tracking-tight leading-tight text-gray-900 dark:text-white')}
              >
                {renderInline(TextProcessor.process(content), { isModel, isError, role })}
              </HeadingTag>
            );
          }
          
          // Blockquotes
          if (trimmed.startsWith('> ')) {
            const quote = trimmed.replace(/^>\s*/gm, '').trim();
            return (
              <blockquote
                key={key}
                className="border-l-4 border-accent pl-5 py-2 italic my-5 text-gray-600 dark:text-gray-400 bg-gray-50/50 dark:bg-white/5 rounded-r-lg"
              >
                {renderInline(TextProcessor.process(quote), { isModel, isError, role })}
              </blockquote>
            );
          }
          
          // Lane Router specific callouts
          if (/^(VERDICT:|EVIDENCE:|CONFIDENCE:|GAPS:|The Edge:)/i.test(trimmed)) {
            return (
              <div
                key={key}
                className="mt-5 mb-4 rounded-xl glass-panel border border-accent/30 px-5 py-4 shadow-lg backdrop-blur-xl"
              >
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
                  <div className="text-base leading-relaxed">
                    {renderInline(TextProcessor.process(trimmed), { isModel, isError, role })}
                  </div>
                </div>
              </div>
            );
          }
          
          // Default paragraph
          return (
            <p key={key} className="text-[15px] my-4 leading-[1.9] text-gray-800 dark:text-gray-200">
              {renderInline(TextProcessor.process(trimmed), { isModel, isError, role })}
            </p>
          );
        });
      });
    });
  }, [text, role, isError, isStreaming]);
  
  return <div className="formatted-content space-y-1 max-w-none antialiased">{content}</div>;
});
FormattedText.displayName = 'FormattedText';

// ═══════════════════════════════════════════════════════════════════════════
// AVATAR COMPONENT — Premium Visual Identity
// ═══════════════════════════════════════════════════════════════════════════

interface AvatarProps {
  role: Role;
  status: MessageStatus;
}

const Avatar = React.memo(({ role, status }: AvatarProps) => {
  const config = useMemo(() => {
    const roleConfigs = {
      user: {
        Icon: User,
        gradient: 'from-accent to-accent-hover',
        shadow: 'shadow-accent/30',
        label: 'User',
        emoji: null
      },
      model: {
        Icon: status === 'processing' ? Cpu : null,
        gradient: 'from-purple-500 to-indigo-600',
        shadow: 'shadow-purple-500/30',
        label: 'AI Model',
        emoji: '🤖'
      },
      architect: {
        Icon: Brain,
        gradient: 'from-purple-600 to-purple-700',
        shadow: 'shadow-purple-600/30',
        label: 'Architect Lane',
        emoji: null
      },
      database: {
        Icon: Database,
        gradient: 'from-blue-600 to-blue-700',
        shadow: 'shadow-blue-600/30',
        label: 'Database Lane',
        emoji: null
      },
      interface: {
        Icon: Layers,
        gradient: 'from-green-600 to-green-700',
        shadow: 'shadow-green-600/30',
        label: 'Interface Lane',
        emoji: null
      },
      test: {
        Icon: TestTube,
        gradient: 'from-orange-600 to-orange-700',
        shadow: 'shadow-orange-600/30',
        label: 'Test Lane',
        emoji: null
      },
      system: {
        Icon: AlertTriangle,
        gradient: 'from-danger to-red-700',
        shadow: 'shadow-danger/30',
        label: 'System',
        emoji: null
      }
    };
    
    return roleConfigs[role] || roleConfigs.model;
  }, [role, status]);
  
  return (
    <div className="relative">
      <div
        className={cn(
          'w-11 h-11 rounded-xl flex items-center justify-center',
          'bg-gradient-to-br',
          config.gradient,
          'shadow-lg',
          config.shadow,
          'border border-white/10 dark:border-white/10',
          'transition-all duration-300',
          'hover:scale-105 hover:shadow-xl',
          status === 'processing' && 'animate-pulse'
        )}
        role="img"
        aria-label={config.label}
      >
        {config.emoji ? (
          <span className="text-2xl">{config.emoji}</span>
        ) : (
          <config.Icon
            size={21}
            strokeWidth={2}
            className="text-white"
          />
        )}
      </div>
      
      {status === 'processing' && (
        <div className="absolute -bottom-1 -right-1">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
        </div>
      )}
    </div>
  );
});
Avatar.displayName = 'Avatar';

// ═══════════════════════════════════════════════════════════════════════════
// METADATA COMPONENT — Performance Metrics Display
// ═══════════════════════════════════════════════════════════════════════════

interface MetadataProps {
  timestamp: number;
  metrics?: MessageMetrics;
  status: MessageStatus;
}

const MessageMetadata = React.memo(({ timestamp, metrics, status }: MetadataProps) => {
  const timeString = useMemo(() => {
    try {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid time';
    }
  }, [timestamp]);
  
  return (
    <div className="flex items-center gap-3 text-xs text-text-tertiary mt-2">
      <time dateTime={new Date(timestamp).toISOString()}>
        {timeString}
      </time>
      
      {metrics?.latency && (
        <>
          <span className="opacity-50">•</span>
          <span className="font-numeric">
            {metrics.latency.toFixed(0)}ms
          </span>
        </>
      )}
      
      {metrics?.tokensPerSecond && (
        <>
          <span className="opacity-50">•</span>
          <span className="font-numeric">
            {metrics.tokensPerSecond.toFixed(0)} tok/s
          </span>
        </>
      )}
      
      {metrics?.confidence && (
        <>
          <span className="opacity-50">•</span>
          <span className={cn(
            'font-numeric',
            metrics.confidence > 0.9 && 'text-success',
            metrics.confidence < 0.7 && 'text-warning'
          )}>
            {(metrics.confidence * 100).toFixed(0)}% conf
          </span>
        </>
      )}
      
      {metrics?.modelVersion && (
        <>
          <span className="opacity-50">•</span>
          <span className="font-mono text-[10px] opacity-60">
            {metrics.modelVersion}
          </span>
        </>
      )}
      
      {status === 'processing' && (
        <>
          <span className="opacity-50">•</span>
          <span className="flex items-center gap-1">
            <Activity size={10} className="animate-pulse" />
            Processing
          </span>
        </>
      )}
    </div>
  );
});
MessageMetadata.displayName = 'MessageMetadata';

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CHAT MESSAGE COMPONENT — Orchestration Layer
// ═══════════════════════════════════════════════════════════════════════════

interface ChatMessageProps {
  message: Message;
  index?: number;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onFeedback?: (messageId: string, rating: 'positive' | 'negative') => void;
}

export const ChatMessage = React.memo(({ 
  message, 
  index = 0,
  onRetry,
  onEdit,
  onFeedback
}: ChatMessageProps) => {
  const {
    role,
    content,
    timestamp,
    status,
    metadata,
    error,
    isStreaming,
    artifacts,
    id
  } = message;
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const messageRef = useRef<HTMLElement>(null);
  
  const isModel = ['model', 'architect', 'database', 'interface', 'test'].includes(role);
  const isError = status === 'error' || !!error;
  
  // Intersection Observer for lazy loading
  useLayoutEffect(() => {
    if (!messageRef.current) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          perfMonitor.track('message_visible', index);
        }
      },
      { threshold: 0.5 }
    );
    
    observer.observe(messageRef.current);
    return () => observer.disconnect();
  }, [index]);
  
  // Message bubble styles
  const bubbleStyle = useMemo(() => {
    const baseStyle = 'rounded-xl transition-all duration-300';
    
    if (isError) {
      return cn(baseStyle, 'bg-danger/90 text-white border border-danger shadow-xl');
    }
    
    if (isModel) {
      const laneStyles = {
        architect: 'border-purple-500/30 bg-purple-500/5',
        database: 'border-blue-500/30 bg-blue-500/5',
        interface: 'border-green-500/30 bg-green-500/5',
        test: 'border-orange-500/30 bg-orange-500/5',
        model: 'border-surface-border'
      };
      
      return cn(
        baseStyle,
        'glass-panel shadow-lg hover:shadow-xl',
        laneStyles[role] || laneStyles.model
      );
    }
    
    return cn(
      baseStyle,
      'bg-gradient-to-br from-accent to-accent-hover',
      'text-accent-foreground shadow-lg hover:shadow-xl'
    );
  }, [role, isError, isModel]);
  
  return (
    <article
      ref={messageRef}
      className={cn(
        'flex w-full mb-6 group',
        'motion-safe:animate-enter',
        isModel ? 'justify-start' : 'justify-end'
      )}
      style={{
        animationDelay: `${Math.min(index * 30, 300)}ms`,
        animationFillMode: 'both'
      } as CSSProperties}
      data-message-id={id}
      data-role={role}
      data-status={status}
    >
      <div
        className={cn(
          'flex max-w-[85%] gap-3',
          isModel ? 'flex-row' : 'flex-row-reverse'
        )}
      >
        {/* Avatar */}
        <div className="flex-shrink-0 mt-1">
          <Avatar role={role} status={status} />
        </div>
        
        {/* Content Container */}
        <div className="flex flex-col min-w-0 flex-1">
          {/* Main Bubble */}
          <div className={cn('p-6 shadow-sm', bubbleStyle)}>
            {error && (
              <div className="mb-4 p-4 bg-black/20 rounded-xl border border-danger/50 backdrop-blur-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-sm mb-1">{error.code}</div>
                    <div className="text-sm opacity-90 leading-relaxed">{error.message}</div>
                  </div>
                </div>
                {error.recoverable && onRetry && (
                  <button
                    onClick={() => onRetry(id)}
                    className="mt-3 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors font-medium"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
            
            <FormattedText
              text={content}
              role={role}
              isError={isError}
              isStreaming={isStreaming}
            />
            
            {/* Artifacts */}
            {artifacts && artifacts.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <button
                  onClick={() => setShowArtifacts(!showArtifacts)}
                  className="flex items-center gap-2 text-sm font-medium opacity-80 hover:opacity-100 transition-opacity"
                >
                  <ChevronRight
                    size={14}
                    className={cn(
                      'transition-transform',
                      showArtifacts && 'rotate-90'
                    )}
                  />
                  {artifacts.length} Artifact{artifacts.length > 1 ? 's' : ''}
                </button>
                
                {showArtifacts && (
                  <div className="mt-3 space-y-2">
                    {artifacts.map(artifact => (
                      <div
                        key={artifact.id}
                        className="p-3 bg-black/10 rounded-lg border border-white/10"
                      >
                        <div className="text-xs font-mono opacity-60">
                          {artifact.type}
                        </div>
                        <div className="mt-1 text-sm">
                          {JSON.stringify(artifact.content, null, 2).slice(0, 200)}...
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Metadata and Actions */}
          <div className={cn(
            'flex items-center mt-2 px-1',
            isModel ? 'justify-between' : 'justify-end'
          )}>
            <MessageMetadata
              timestamp={timestamp}
              metrics={metadata}
              status={status}
            />
            
            {/* Action Buttons */}
            {isModel && !isError && content.length > 0 && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <CopyButton content={content} context="message" />
                
                {onFeedback && (
                  <>
                    <button
                      onClick={() => onFeedback(id, 'positive')}
                      className="p-1.5 rounded hover:bg-surface-highlight transition-colors"
                      aria-label="Good response"
                    >
                      👍
                    </button>
                    <button
                      onClick={() => onFeedback(id, 'negative')}
                      className="p-1.5 rounded hover:bg-surface-highlight transition-colors"
                      aria-label="Poor response"
                    >
                      👎
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
});

ChatMessage.displayName = 'ChatMessage';

// ═══════════════════════════════════════════════════════════════════════════
// COPY BUTTON COMPONENT — Micro-interaction Excellence
// ═══════════════════════════════════════════════════════════════════════════

interface CopyButtonProps {
  content: string;
  context?: 'message' | 'code';
  size?: 'sm' | 'md';
}

const CopyButton: React.FC<CopyButtonProps> = ({ 
  content, 
  context = 'message',
  size = 'sm'
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      
      perfMonitor.track('copy_action', content.length, { context });
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content, context]);
  
  useLayoutEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
  
  const iconSize = size === 'sm' ? 14 : 16;
  
  return (
    <button
      onClick={handleCopy}
      className={cn(
        'relative p-1.5 rounded-lg transition-all duration-200',
        'hover:bg-surface-highlight hover:scale-105',
        'active:scale-95',
        'focus:outline-none focus:ring-2 focus:ring-accent/50'
      )}
      title={isCopied ? 'Copied!' : 'Copy to clipboard'}
      aria-label={isCopied ? 'Copied to clipboard' : 'Copy to clipboard'}
    >
      <div className="relative w-4 h-4 flex items-center justify-center">
        <Check
          size={iconSize}
          className={cn(
            'absolute transition-all duration-300',
            'text-success',
            isCopied
              ? 'opacity-100 scale-100 rotate-0'
              : 'opacity-0 scale-50 rotate-180'
          )}
        />
        <Copy
          size={iconSize}
          className={cn(
            'absolute transition-all duration-300',
            'text-text-tertiary hover:text-text-primary',
            isCopied
              ? 'opacity-0 scale-50 -rotate-180'
              : 'opacity-100 scale-100 rotate-0'
          )}
        />
      </div>
    </button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export type { Message, MessageStatus, Role, MessageMetrics, MessageArtifact };
export { PerformanceMonitor };

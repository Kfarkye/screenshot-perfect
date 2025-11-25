/**
 * @component ChatMessage
 * @description Production-grade chat message component with streaming support
 *
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "features": [
 *     "Streaming state visualization",
 *     "Copy to clipboard",
 *     "Syntax-highlighted code blocks",
 *     "Accessible markup",
 *     "Memoized rendering"
 *   ],
 *   "performance": {
 *     "memoization": "React.memo with custom comparator",
 *     "lazy_markdown": "Only parse when content changes"
 *   }
 * }
 */

import React, { useState, useCallback, useMemo, type FC } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, Copy, Check, AlertCircle, Loader2, Sparkles, Terminal } from "lucide-react";
import type { Message } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ChatMessageProps {
  readonly message: Message;
  readonly isStreaming?: boolean;
  readonly onRetry?: (messageId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(" ");
};

const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// COPY BUTTON COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface CopyButtonProps {
  content: string;
  className?: string;
}

const CopyButton: FC<CopyButtonProps> = React.memo(({ content, className }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [content]);

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? "Copied!" : "Copy to clipboard"}
      className={cn(
        "p-1.5 rounded-md transition-all duration-150 ease-standard",
        "text-content-tertiary hover:text-content-primary",
        "hover:bg-surface-secondary/80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        copied && "text-semantic-success",
        className,
      )}
    >
      {copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} strokeWidth={2} />}
    </button>
  );
});

CopyButton.displayName = "CopyButton";

// ─────────────────────────────────────────────────────────────────────────────
// CODE BLOCK COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const CodeBlock: FC<CodeBlockProps> = ({ inline, className, children }) => {
  const codeContent = String(children).replace(/\n$/, "");
  const language = className?.replace("language-", "") || "text";

  // Inline code
  if (inline) {
    return (
      <code className="px-1.5 py-0.5 rounded-md bg-surface-secondary/80 text-accent font-mono text-[13px] border border-glass-border">
        {children}
      </code>
    );
  }

  // Code block
  return (
    <div className="group/code relative my-4 rounded-xl overflow-hidden border border-glass-border bg-surface-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary/50 border-b border-glass-border">
        <div className="flex items-center gap-2">
          <Terminal size={12} className="text-content-tertiary" />
          <span className="text-caption-2 font-mono text-content-tertiary uppercase tracking-wider">{language}</span>
        </div>
        <CopyButton
          content={codeContent}
          className="opacity-0 group-hover/code:opacity-100 transition-opacity duration-150"
        />
      </div>

      {/* Code content */}
      <pre className="p-4 overflow-x-auto">
        <code className="text-body-sm font-mono text-content-primary leading-relaxed">{codeContent}</code>
      </pre>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const markdownComponents: Components = {
  // Code blocks
  code: ({ inline, className, children, ...props }: any) => (
    <CodeBlock inline={inline} className={className}>
      {children}
    </CodeBlock>
  ),

  // Headings
  h1: ({ children }) => (
    <h1 className="text-title-2 font-bold text-content-primary mt-6 mb-3 tracking-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-title-3 font-bold text-content-primary mt-5 mb-2 tracking-tight">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="text-body font-bold text-content-primary mt-4 mb-2">{children}</h3>,
  h4: ({ children }) => (
    <h4 className="text-body-sm font-semibold text-content-secondary mt-3 mb-1 uppercase tracking-wider">{children}</h4>
  ),

  // Paragraphs
  p: ({ children }) => <p className="text-body text-content-primary leading-relaxed mb-3 last:mb-0">{children}</p>,

  // Lists
  ul: ({ children }) => <ul className="list-none space-y-2 my-3 pl-0">{children}</ul>,
  ol: ({ children }) => (
    <ol className="list-decimal list-inside space-y-2 my-3 pl-0 marker:text-accent marker:font-semibold">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-body text-content-primary leading-relaxed flex items-start gap-2">
      <span className="text-accent mt-2 flex-shrink-0">•</span>
      <span>{children}</span>
    </li>
  ),

  // Links
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent transition-colors duration-150"
    >
      {children}
    </a>
  ),

  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/50 pl-4 my-4 italic text-content-secondary">{children}</blockquote>
  ),

  // Tables
  table: ({ children }) => (
    <div className="overflow-x-auto my-4 rounded-lg border border-glass-border">
      <table className="w-full text-body-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-secondary/50 border-b border-glass-border">{children}</thead>,
  th: ({ children }) => (
    <th className="px-4 py-2 text-left text-caption-1 font-semibold text-content-secondary uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-4 py-3 text-content-primary border-t border-glass-border/50">{children}</td>,

  // Horizontal rule
  hr: () => <hr className="my-6 border-t border-glass-border" />,

  // Strong / emphasis
  strong: ({ children }) => <strong className="font-semibold text-content-primary">{children}</strong>,
  em: ({ children }) => <em className="italic text-content-secondary">{children}</em>,
};

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface AvatarProps {
  isUser: boolean;
  isError: boolean;
  isStreaming: boolean;
}

const Avatar: FC<AvatarProps> = React.memo(({ isUser, isError, isStreaming }) => {
  return (
    <div
      className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        "transition-all duration-250 ease-standard",
        isUser
          ? "bg-accent text-content-inverse shadow-sm"
          : isError
            ? "bg-semantic-error/10 text-semantic-error border border-semantic-error/20"
            : "bg-accent/10 text-accent border border-accent/20",
      )}
    >
      {isUser ? (
        <User size={14} strokeWidth={2.5} />
      ) : isStreaming ? (
        <Sparkles size={14} strokeWidth={2} className="animate-pulse" />
      ) : isError ? (
        <AlertCircle size={14} strokeWidth={2} />
      ) : (
        <Bot size={14} strokeWidth={2} />
      )}
    </div>
  );
});

Avatar.displayName = "Avatar";

// ─────────────────────────────────────────────────────────────────────────────
// STREAMING INDICATOR
// ─────────────────────────────────────────────────────────────────────────────

const StreamingIndicator: FC = () => (
  <div className="flex items-center gap-2 mt-2">
    <Loader2 size={12} className="animate-spin text-accent" />
    <span className="text-caption-2 text-content-tertiary">Generating...</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: Message["status"];
  timestamp: number;
}

const StatusBadge: FC<StatusBadgeProps> = React.memo(({ status, timestamp }) => {
  return (
    <div className="flex items-center gap-2 mt-2 px-1">
      {/* Status indicator */}
      {status === "processing" && (
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
          </span>
          <span className="text-caption-2 text-accent font-medium">Processing</span>
        </div>
      )}

      {status === "error" && <span className="text-caption-2 text-semantic-error font-medium">Failed</span>}

      {/* Timestamp */}
      <span className="text-caption-2 text-content-tertiary opacity-60">{formatTimestamp(timestamp)}</span>
    </div>
  );
});

StatusBadge.displayName = "StatusBadge";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ChatMessage: FC<ChatMessageProps> = React.memo(
  ({ message, isStreaming = false, onRetry }) => {
    const isUser = message.role === "user";
    const isError = message.status === "error";
    const isPending = message.status === "pending" || message.status === "processing";
    const showStreamingIndicator = isStreaming && !isUser && isPending;

    // Memoize markdown rendering for assistant messages
    const renderedContent = useMemo(() => {
      if (isUser) {
        return <p className="text-body leading-relaxed whitespace-pre-wrap">{message.content}</p>;
      }

      if (!message.content && isPending) {
        return <StreamingIndicator />;
      }

      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {message.content}
        </ReactMarkdown>
      );
    }, [isUser, message.content, isPending]);

    return (
      <article
        className={cn(
          "group/message flex w-full mb-6",
          isUser ? "justify-end" : "justify-start",
          // Entry animation
          "motion-safe:animate-[slideUpFade_0.3s_ease-out]",
        )}
        role="article"
        aria-label={`${isUser ? "Your" : "Assistant"} message`}
      >
        <div
          className={cn(
            "flex max-w-[90%] md:max-w-[80%] lg:max-w-[70%] gap-3",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          {/* Avatar */}
          <Avatar isUser={isUser} isError={isError} isStreaming={showStreamingIndicator} />

          {/* Message Content */}
          <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
            {/* Bubble */}
            <div
              className={cn(
                "relative px-4 py-3 rounded-2xl backdrop-blur-sm border",
                "transition-all duration-200 ease-standard",
                // User message styling
                isUser && ["bg-accent text-content-inverse border-accent/50", "rounded-tr-md"],
                // Assistant message styling
                !isUser &&
                  !isError && ["bg-glass-surface border-glass-border", "text-content-primary", "rounded-tl-md"],
                // Error styling
                isError && ["bg-semantic-error/5 border-semantic-error/20", "text-content-primary", "rounded-tl-md"],
                // Streaming effect
                showStreamingIndicator && "border-accent/30",
              )}
            >
              {/* Content */}
              {renderedContent}

              {/* Streaming cursor */}
              {showStreamingIndicator && message.content && (
                <span className="inline-block w-0.5 h-4 bg-accent animate-pulse ml-0.5 -mb-0.5" />
              )}

              {/* Copy button (assistant messages only) */}
              {!isUser && message.content && !isPending && (
                <div className="absolute -right-2 top-2 opacity-0 group-hover/message:opacity-100 transition-opacity duration-150">
                  <CopyButton content={message.content} />
                </div>
              )}
            </div>

            {/* Error action */}
            {isError && onRetry && (
              <button
                onClick={() => onRetry(message.id)}
                className="mt-2 text-caption-1 text-semantic-error hover:text-semantic-error/80 underline underline-offset-2 transition-colors duration-150"
              >
                Retry message
              </button>
            )}

            {/* Status */}
            <StatusBadge status={message.status} timestamp={message.timestamp} />
          </div>
        </div>

        {/* Keyframe animation */}
        <style>{`
        @keyframes slideUpFade {
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
      </article>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for memoization
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.message.status === nextProps.message.status &&
      prevProps.isStreaming === nextProps.isStreaming
    );
  },
);

ChatMessage.displayName = "ChatMessage";

export default ChatMessage;

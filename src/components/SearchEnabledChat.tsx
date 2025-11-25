/**
 * @component SearchEnabledChat
 * @description Production-ready chat component with integrated web search
 *
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "features": [
 *     "Auto-detect search intent",
 *     "Streaming responses",
 *     "Citation display",
 *     "Optimistic UI",
 *     "Error recovery"
 *   ]
 * }
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type FC,
  type KeyboardEvent,
  type FormEvent,
} from 'react';
import {
  Send,
  Loader2,
  Globe,
  Sparkles,
  AlertCircle,
  RotateCcw,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import { sendChatMessage, type ChatMessage, type StreamCallbacks } from './SearchAugmentedChat';
import {
  SearchIndicator,
  SearchBadge,
  SourcesList,
  SearchSkeleton,
  type SearchResult,
  type Citation,
} from './SearchUI';
import { detectSearchIntent } from './useWebSearch';

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface SearchEnabledChatProps {
  initialMessages?: ChatMessage[];
  gameContext?: string; // Optional game/odds context to inject
  onMessageSent?: (message: ChatMessage) => void;
  onMessageReceived?: (message: ChatMessage) => void;
  model?: 'claude' | 'gpt' | 'gemini';
  searchProvider?: 'tavily' | 'serper' | 'brave';
  placeholder?: string;
  className?: string;
}

interface StreamingState {
  isStreaming: boolean;
  currentContent: string;
  searchStatus: 'idle' | 'searching' | 'complete' | 'error';
  searchQuery?: string;
  searchResults?: SearchResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingContent?: string;
  searchResults?: SearchResult[];
}

const MessageBubble: FC<MessageBubbleProps> = React.memo(
  ({ message, isStreaming, streamingContent, searchResults }) => {
    const isUser = message.role === 'user';
    const content = isStreaming ? streamingContent : message.content;
    const hasSearch = message.metadata?.searchPerformed || (searchResults && searchResults.length > 0);

    return (
      <div
        className={cn(
          'flex w-full',
          isUser ? 'justify-end' : 'justify-start'
        )}
      >
        <div
          className={cn(
            'max-w-[85%] md:max-w-[75%]',
            'rounded-2xl px-4 py-3',
            'transition-all duration-200',
            isUser
              ? 'bg-accent text-white rounded-br-md'
              : 'bg-glass-surface border border-glass-border rounded-bl-md'
          )}
        >
          {/* Search badge for assistant messages */}
          {!isUser && hasSearch && (
            <div className="mb-2">
              <SearchBadge
                query={message.metadata?.searchQuery}
                resultCount={searchResults?.length || message.metadata?.citations?.length}
              />
            </div>
          )}

          {/* Message content */}
          <div
            className={cn(
              'text-body-sm leading-relaxed whitespace-pre-wrap',
              isUser ? 'text-white' : 'text-content-primary'
            )}
          >
            {content}
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-accent animate-pulse rounded-sm" />
            )}
          </div>

          {/* Sources list for search results */}
          {!isUser && searchResults && searchResults.length > 0 && !isStreaming && (
            <div className="mt-3 pt-3 border-t border-glass-border/50">
              <SourcesList results={searchResults} defaultExpanded={false} />
            </div>
          )}

          {/* Timestamp */}
          <div
            className={cn(
              'mt-2 text-caption-2',
              isUser ? 'text-white/60' : 'text-content-tertiary'
            )}
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>
    );
  }
);

MessageBubble.displayName = 'MessageBubble';

// ─────────────────────────────────────────────────────────────────────────────
// TYPING INDICATOR
// ─────────────────────────────────────────────────────────────────────────────

interface TypingIndicatorProps {
  searchStatus: 'idle' | 'searching' | 'complete' | 'error';
  searchQuery?: string;
}

const TypingIndicator: FC<TypingIndicatorProps> = React.memo(({ searchStatus, searchQuery }) => (
  <div className="flex justify-start">
    <div
      className={cn(
        'max-w-[85%] md:max-w-[75%]',
        'rounded-2xl rounded-bl-md px-4 py-3',
        'bg-glass-surface border border-glass-border'
      )}
    >
      {searchStatus === 'searching' ? (
        <SearchIndicator query={searchQuery} status="searching" />
      ) : searchStatus === 'complete' ? (
        <div className="flex flex-col gap-2">
          <SearchIndicator query={searchQuery} status="complete" />
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-accent animate-pulse" />
            <span className="text-caption-1 text-content-secondary">Generating response...</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[0, 150, 300].map((delay) => (
              <div
                key={delay}
                className="w-2 h-2 rounded-full bg-accent animate-bounce"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
          <span className="text-caption-1 text-content-secondary">SharpEdge AI is thinking...</span>
        </div>
      )}
    </div>
  </div>
));

TypingIndicator.displayName = 'TypingIndicator';

// ─────────────────────────────────────────────────────────────────────────────
// INPUT AREA
// ─────────────────────────────────────────────────────────────────────────────

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  willSearch: boolean;
  placeholder?: string;
}

const ChatInput: FC<ChatInputProps> = React.memo(
  ({ value, onChange, onSubmit, isLoading, willSearch, placeholder }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
      }
    }, [value]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isLoading && value.trim()) {
          onSubmit();
        }
      }
    };

    return (
      <div className="relative">
        {/* Search intent indicator */}
        {willSearch && value.trim() && (
          <div
            className={cn(
              'absolute -top-8 left-0 right-0',
              'flex items-center gap-1.5 px-3 py-1.5',
              'text-caption-2 text-accent',
              'animate-in fade-in slide-in-from-bottom-2 duration-150'
            )}
          >
            <Globe size={12} />
            <span>Will search the web for current info</span>
          </div>
        )}

        <div
          className={cn(
            'flex items-end gap-2',
            'bg-glass-surface border border-glass-border',
            'rounded-2xl p-2',
            'transition-all duration-200',
            'focus-within:border-accent/50 focus-within:shadow-lg focus-within:shadow-accent/5'
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || 'Ask about a matchup, spread analysis, or trend...'}
            disabled={isLoading}
            rows={1}
            className={cn(
              'flex-1 px-3 py-2',
              'bg-transparent border-0 outline-none resize-none',
              'text-body-sm text-content-primary',
              'placeholder:text-content-tertiary',
              'disabled:opacity-50'
            )}
          />

          <button
            onClick={onSubmit}
            disabled={isLoading || !value.trim()}
            className={cn(
              'flex-shrink-0 p-2.5 rounded-xl',
              'transition-all duration-150 ease-standard',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              isLoading || !value.trim()
                ? 'bg-surface-secondary text-content-tertiary cursor-not-allowed'
                : 'bg-accent text-white hover:bg-accent-hover active:scale-95'
            )}
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>
    );
  }
);

ChatInput.displayName = 'ChatInput';

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const SearchEnabledChat: FC<SearchEnabledChatProps> = ({
  initialMessages = [],
  gameContext,
  onMessageSent,
  onMessageReceived,
  model = 'claude',
  searchProvider = 'tavily',
  placeholder,
  className,
}) => {
  // State
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [streamingState, setStreamingState] = useState<StreamingState>({
    isStreaming: false,
    currentContent: '',
    searchStatus: 'idle',
  });
  const [error, setError] = useState<string | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Computed
  const willSearch = useMemo(() => {
    if (!input.trim()) return false;
    const intent = detectSearchIntent(input);
    return intent.shouldSearch;
  }, [input]);

  const isLoading = streamingState.isStreaming;

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingState.currentContent, scrollToBottom]);

  // ─────────────────────────────────────────────────────────────────────────
  // SEND MESSAGE
  // ─────────────────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    // Optimistic update
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setError(null);
    onMessageSent?.(userMessage);

    // Start streaming state
    setStreamingState({
      isStreaming: true,
      currentContent: '',
      searchStatus: 'idle',
    });

    // Callbacks for streaming
    const callbacks: StreamCallbacks = {
      onSearchStart: (query) => {
        setStreamingState((prev) => ({
          ...prev,
          searchStatus: 'searching',
          searchQuery: query,
        }));
      },
      onSearchComplete: (results) => {
        setStreamingState((prev) => ({
          ...prev,
          searchStatus: 'complete',
          searchResults: results,
        }));
      },
      onToken: (token) => {
        setStreamingState((prev) => ({
          ...prev,
          currentContent: prev.currentContent + token,
        }));
      },
      onComplete: (message) => {
        // Add metadata about search results
        const finalMessage: ChatMessage = {
          ...message,
          metadata: {
            ...message.metadata,
            searchResults: streamingState.searchResults,
          },
        };

        setMessages((prev) => [...prev, finalMessage]);
        setStreamingState({
          isStreaming: false,
          currentContent: '',
          searchStatus: 'idle',
        });
        onMessageReceived?.(finalMessage);
      },
      onError: (err) => {
        setError(err.message);
        setStreamingState({
          isStreaming: false,
          currentContent: '',
          searchStatus: 'error',
        });
      },
    };

    try {
      await sendChatMessage(
        userMessage.content,
        messages,
        { model, searchProvider, stream: true },
        callbacks
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setStreamingState({
        isStreaming: false,
        currentContent: '',
        searchStatus: 'idle',
      });
    }
  }, [input, isLoading, messages, model, searchProvider, onMessageSent, onMessageReceived, streamingState.searchResults]);

  // ─────────────────────────────────────────────────────────────────────────
  // CLEAR CHAT
  // ─────────────────────────────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // RETRY LAST MESSAGE
  // ─────────────────────────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      // Remove last assistant message if it exists
      setMessages((prev) => {
        const lastAssistantIdx = prev.findLastIndex((m) => m.role === 'assistant');
        if (lastAssistantIdx > -1) {
          return prev.slice(0, lastAssistantIdx);
        }
        return prev;
      });
      setInput(lastUserMessage.content);
      setError(null);
    }
  }, [messages]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        'flex flex-col h-full',
        'bg-surface-primary',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between',
          'px-4 py-3 border-b border-glass-border',
          'bg-glass-surface/50 backdrop-blur-sm'
        )}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          <span className="text-body-sm font-semibold text-content-primary">
            SharpEdge AI
          </span>
          <span className="px-2 py-0.5 rounded-md bg-accent/10 text-caption-2 font-medium text-accent">
            Search Enabled
          </span>
        </div>

        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className={cn(
                'p-2 rounded-lg',
                'text-content-tertiary hover:text-content-primary',
                'hover:bg-surface-secondary',
                'transition-colors duration-150'
              )}
              aria-label="Clear chat"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div
              className={cn(
                'w-16 h-16 rounded-2xl mb-4',
                'bg-accent/10 border border-accent/20',
                'flex items-center justify-center'
              )}
            >
              <Globe size={28} className="text-accent" />
            </div>
            <h3 className="text-title-3 font-bold text-content-primary mb-2">
              Search-Enabled Analysis
            </h3>
            <p className="text-body-sm text-content-secondary max-w-sm">
              Ask about rosters, injuries, recent trades, or any current info.
              I'll automatically search the web when needed.
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                searchResults={(message.metadata as any)?.searchResults}
              />
            ))}

            {/* Streaming message */}
            {streamingState.isStreaming && (
              <>
                {streamingState.searchStatus !== 'idle' && (
                  <TypingIndicator
                    searchStatus={streamingState.searchStatus}
                    searchQuery={streamingState.searchQuery}
                  />
                )}
                {streamingState.currentContent && (
                  <MessageBubble
                    message={{
                      id: 'streaming',
                      role: 'assistant',
                      content: '',
                      timestamp: Date.now(),
                    }}
                    isStreaming
                    streamingContent={streamingState.currentContent}
                    searchResults={streamingState.searchResults}
                  />
                )}
              </>
            )}

            {/* Typing indicator when no content yet */}
            {streamingState.isStreaming &&
              !streamingState.currentContent &&
              streamingState.searchStatus === 'idle' && (
                <TypingIndicator searchStatus="idle" />
              )}
          </>
        )}

        {/* Error state */}
        {error && (
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl',
              'bg-semantic-error/10 border border-semantic-error/20'
            )}
          >
            <AlertCircle size={18} className="text-semantic-error flex-shrink-0" />
            <span className="text-body-sm text-semantic-error flex-1">{error}</span>
            <button
              onClick={handleRetry}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
                'bg-semantic-error/20 text-semantic-error',
                'text-caption-1 font-medium',
                'hover:bg-semantic-error/30',
                'transition-colors duration-150'
              )}
            >
              <RotateCcw size={14} />
              Retry
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-glass-border bg-glass-surface/30">
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          isLoading={isLoading}
          willSearch={willSearch}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
};

export default SearchEnabledChat;

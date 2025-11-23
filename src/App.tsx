
import React, { useState, useRef, useEffect, useCallback, lazy, Suspense, useMemo, ErrorInfo, Component } from 'react';

// Components (Assuming these are optimized, e.g., using React.memo)
import { Header } from './components/Header';
import { ChatMessage } from './components/ChatMessage';
import { InputArea, InputAreaHandle } from './components/InputArea';

// Types (Using 'import type' ensures types are erased at compile time for optimal builds)
import type { Message, SuggestionType, GameData, AppTheme, League } from './types';

// Services
import { sendMessageToAI } from './services/nhlAi';

// Icons (Lucide for lightweight, consistent iconography)
import { Calendar, ChevronRight, MessageSquare, Zap, TrendingUp, BarChart3, AlertTriangle, WifiOff } from 'lucide-react';

// --- Configuration & Constants (Vercel/Linear Rigor) ---

const MAX_API_RETRIES = 3;
const RETRY_DELAY_BASE_MS = 500; // Base delay for exponential backoff
const SCROLL_THRESHOLD = 350; // Pixels from bottom to trigger auto-scroll

// High-quality suggestions reflecting Stripe-grade onboarding and DraftKings-style insights
const NHL_SUGGESTIONS = [
  { id: 's1', label: "Today's Slate", icon: Calendar, query: "Show me today's full NHL slate with opening lines and sharp money indicators.", desc: "Full board overview and market movement" },
  { id: 's2', label: "Optimize a No-Loss Bet", icon: Zap, query: "I have a $500 risk-free bet. How should I optimize its EV (+5% edge) on today's slate?", desc: "Maximize expected value from promotions" },
  { id: 's3', label: "Top Mismatch", icon: TrendingUp, query: "Analyze the game with the highest liquidity tonight. Where is the smart money going?", desc: "Deep dive analysis and steam tracking" },
];

const NFL_SUGGESTIONS = [
  { id: 'n1', label: "Week's Slate", icon: Calendar, query: "Break down the upcoming NFL slate. Who are the sharp contrarian plays?", desc: "Full week overview" },
  { id: 'n2', label: "Underdog Strategy", icon: Zap, query: "Which NFL underdogs have the best value on the moneyline this week?", desc: "High EV underdog hunting" },
  { id: 'n3', label: "Prime Time", icon: TrendingUp, query: "Analyze the next Prime Time game. What are the key injuries and matchup edges?", desc: "TNF/SNF/MNF Analysis" },
];

type TabId = 'chat' | 'schedule';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: TabConfig[] = [
  { id: 'chat', label: 'Analysis', icon: MessageSquare },
  { id: 'schedule', label: 'Board', icon: BarChart3 },
];

// --- Utilities & Observability ---

const observability = {
  logError: (error: unknown, context: string, metadata: Record<string, any> = {}) => {
    console.error(JSON.stringify({ level: 'error', timestamp: new Date().toISOString(), context, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined, metadata }));
  },
  logInfo: (message: string, context: string, metadata: Record<string, any> = {}) => {
    if (process.env.NODE_ENV !== 'production') {
        console.info(JSON.stringify({ level: 'info', timestamp: new Date().toISOString(), context, message, metadata }));
    }
  },
  trackEvent: (event: string, properties: Record<string, unknown> = {}) => {
  },
  trackMetric: (name: string, value: number, tags: Record<string, string> = {}) => {
  }
};

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

// --- Lazy Loaded Components & Fallbacks (Performance) ---

const ScheduleView = lazy(() =>
  import('./components/ScheduleView')
    .then(module => ({ default: module.ScheduleView }))
    .catch(error => {
      observability.logError(error, 'LazyLoadScheduleView', { chunkLoadError: true });
      return { default: () => (
        <div className="flex flex-col items-center justify-center h-full text-center p-8" role="alert">
            <AlertTriangle className="text-red-500 w-12 h-12 mb-4" />
            <h3 className="text-xl font-semibold text-textPrimary">Failed to load the board.</h3>
            <p className="text-textSecondary mt-2">We couldn't load the live data. Please check your connection and refresh.</p>
            <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
                Reload
            </button>
        </div>
      )};
    })
);

const ScheduleLoadingSkeleton = () => (
    <div className="p-6 animate-pulse" role="status" aria-label="Loading live market data">
        <div className="h-8 bg-surfaceHighlight/50 rounded-lg w-1/3 mb-6"></div>
        <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
                <div key={i} className="h-24 bg-surfaceHighlight/50 rounded-xl"></div>
            ))}
        </div>
    </div>
);

// --- Hooks ---

const useTheme = (defaultTheme: AppTheme = 'dark') => {
  const [theme, setTheme] = useState<AppTheme>(defaultTheme);

  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem('appTheme');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

      let initialTheme: AppTheme = defaultTheme;

      if (storedTheme === 'light' || storedTheme === 'dark') {
        initialTheme = storedTheme;
      } else if (prefersDark) {
        initialTheme = 'dark';
      }

      setTheme(initialTheme);
      document.documentElement.className = initialTheme;
      document.documentElement.style.setProperty('color-scheme', initialTheme);
    } catch (error) {
      observability.logError(error, 'useThemeInit');
      document.documentElement.className = defaultTheme;
      document.documentElement.style.setProperty('color-scheme', defaultTheme);
    }
  }, [defaultTheme]);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.className = newTheme;
    document.documentElement.style.setProperty('color-scheme', newTheme);
    try {
      localStorage.setItem('appTheme', newTheme);
    } catch (error) {
      observability.logError(error, 'useThemeToggle');
    }
    observability.trackEvent('theme_toggled', { theme: newTheme });
  }, [theme]);

  return { theme, toggleTheme };
};

const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); observability.logInfo('Network status changed', 'useNetworkStatus', { status: 'online' }); };
    const handleOffline = () => { setIsOnline(false); observability.logInfo('Network status changed', 'useNetworkStatus', { status: 'offline' }); };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};

const useReducedMotion = () => {
    const [reducedMotion, setReducedMotion] = useState(false);
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (!mediaQuery) return;
        setReducedMotion(mediaQuery.matches);
        const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
        mediaQuery.addEventListener('change', listener);
        return () => mediaQuery.removeEventListener('change', listener);
    }, []);
    return reducedMotion;
};

// --- Presentation Components ---

const LoadingIndicator = React.memo(() => (
  <div className="flex justify-start w-full px-2 motion-safe:animate-fadeIn" role="status" aria-live="polite" aria-label="Analyzing Market Data">
    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-surface/70 border border-border/10 backdrop-blur-sm shadow-sm">
      <div className="relative w-2 h-2 motion-reduce:hidden">
         <div className="absolute inset-0 w-full h-full rounded-full bg-accent opacity-30 animate-ping-slow"></div>
         <div className="absolute inset-0 w-full h-full rounded-full bg-accent"></div>
      </div>
      <span className="text-xs text-textSecondary font-mono uppercase tracking-widest font-medium">
        Analyzing Market Data
      </span>
    </div>
  </div>
));
LoadingIndicator.displayName = 'LoadingIndicator';

interface OnboardingProps {
  onSuggestionClick: (query: string) => void;
  league: League;
}

const OnboardingView = React.memo(({ onSuggestionClick, league }: OnboardingProps) => {
  const suggestions = league === 'NHL' ? NHL_SUGGESTIONS : NFL_SUGGESTIONS;
  
  return (
    <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-6 text-center motion-safe:animate-slide-up-fade">
      <div className="max-w-lg w-full space-y-12">
        <div className="space-y-4">
          <h1 className="text-5xl font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-textPrimary via-textSecondary/90 to-textPrimary">
            Sharp<span className="text-accent">Edge</span>
          </h1>
          <p className="text-textSecondary text-lg font-light max-w-md mx-auto leading-relaxed">
            Institutional-grade {league} betting analysis. Powered by low-latency market data and advanced AI modeling.
          </p>
        </div>
        
        <div className="grid gap-4 w-full" role="list">
          {suggestions.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                  observability.trackEvent('suggestion_clicked', { suggestionId: s.id });
                  onSuggestionClick(s.query);
              }}
              className="group flex items-center justify-between p-5 rounded-xl text-left w-full transition-all duration-300 ease-out 
                        bg-surface/30 border border-border/10 backdrop-blur-md shadow-sm
                        hover:bg-surface/50 hover:border-accent/30 hover:shadow-md motion-safe:hover:scale-[1.01]
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={`Start analysis: ${s.label}`}
              role="listitem"
            >
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded-lg bg-surfaceHighlight/70 flex items-center justify-center text-textPrimary shadow-inner 
                                group-hover:bg-accent group-hover:text-white transition-colors duration-300">
                  <s.icon size={22} strokeWidth={2} aria-hidden="true" />
                </div>
                <div>
                  <span className="block text-base font-semibold text-textPrimary">{s.label}</span>
                  <span className="block text-sm text-textSecondary group-hover:text-textPrimary/90 transition-colors mt-1 leading-tight">{s.desc}</span>
                </div>
              </div>
              <ChevronRight size={18} className="text-textTertiary group-hover:text-accent transition-all duration-300 transform motion-safe:group-hover:translate-x-1 ease-out" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
OnboardingView.displayName = 'OnboardingView';

// --- Main Application Component ---

const App: React.FC = () => {
  // State Management
  const { theme, toggleTheme } = useTheme('dark');
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [activeLeague, setActiveLeague] = useState<League>('NHL');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const isOnline = useNetworkStatus();
  const reducedMotion = useReducedMotion();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ chat: null, schedule: null });
  const inputAreaRef = useRef<InputAreaHandle>(null);
  const activeRequestRef = useRef<string | null>(null);

  const hasStarted = useMemo(() => messages.length > 0, [messages]);

  useEffect(() => {
    observability.logInfo('Application mounted.', 'App');
    if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
            import('./components/ScheduleView').catch(err => observability.logError(err, 'PrefetchScheduleView'));
        });
    }
  }, []);

  // When league changes, reset messages to avoid context confusion (Optional, but cleaner)
  const handleLeagueChange = (league: League) => {
    setActiveLeague(league);
    setMessages([]); // Clear chat for new sport context
    setActiveTab('schedule'); // Switch to board to show new games
  };

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container || activeTab !== 'chat') return;
    const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + SCROLL_THRESHOLD;

    if (isNearBottom || messages.length <= 2) {
        const behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth';
        requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
        });
    }
  }, [messages, isLoading, reducedMotion, activeTab]);

  const handleTabChange = useCallback((tabId: TabId) => {
    if (tabId !== activeTab) {
        setActiveTab(tabId);
        if (tabId === 'chat' && hasStarted) {
            inputAreaRef.current?.focusInput();
        }
    }
  }, [activeTab, hasStarted]);

  const handleTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const currentIndex = TABS.findIndex(tab => tab.id === activeTab);
      let nextIndex;
      if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % TABS.length;
      } else {
        nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
      }
      const nextTabId = TABS[nextIndex].id;
      setActiveTab(nextTabId);
      tabRefs.current[nextTabId]?.focus();
    }
  }, [activeTab]);

  const handleSend = useCallback(async (content: string, retryCount = 0) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) return;
    if (!isOnline) return;
    if (isLoading && retryCount === 0) return;

    const requestId = retryCount === 0 ? crypto.randomUUID() : activeRequestRef.current!;
    activeRequestRef.current = requestId;

    if (activeTab !== 'chat') setActiveTab('chat');

    if (retryCount === 0) {
        const userMsg: Message = {
          id: crypto.randomUUID(),
          role: 'user',
          content: trimmedContent,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setIsLoading(true);
    }

    const startTime = performance.now();

    try {
      // Pass activeLeague to the service
      const responseText = await sendMessageToAI(trimmedContent, activeLeague);
      
      if (activeRequestRef.current !== requestId) return;

      const latency = performance.now() - startTime;
      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: 'model',
        content: responseText,
        timestamp: Date.now(),
        metadata: { latency }
      };
      setMessages((prev) => [...prev, aiMsg]);

    } catch (error) {
      if (activeRequestRef.current !== requestId) return;
      const latency = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTransientError = (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('503'));

      if (retryCount < MAX_API_RETRIES && isTransientError) {
        const delay = RETRY_DELAY_BASE_MS * Math.pow(2, retryCount);
        setTimeout(() => handleSend(trimmedContent, retryCount + 1), delay);
        return; 
      }

      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'model',
        content: "I'm experiencing high volatility in the market feeds right now. Analysis is temporarily unavailable.",
        timestamp: Date.now(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      if (activeRequestRef.current === requestId) {
        setIsLoading(false);
        activeRequestRef.current = null;
        inputAreaRef.current?.focusInput();
      }
    }
  }, [isLoading, isOnline, activeTab, activeLeague]);

  const handleAnalyzeGame = useCallback((game: GameData) => {
    const prompt = `Analyze the ${game.awayTeam} @ ${game.homeTeam} game. Provide institutional-grade analysis focusing on market inefficiencies, sharp money movement, and high EV betting angles.`;
    handleSend(prompt);
  }, [handleSend]);

  return (
    <AppErrorBoundary>
        <div 
            className="flex flex-col h-screen supports-[height:100dvh]:h-[100dvh] font-sans text-textPrimary antialiased overflow-hidden selection:bg-accent/50 selection:text-white transition-colors duration-500 bg-background bg-noise"
            aria-label="SharpEdge Sports Betting Analysis Platform"
        >
        {!isOnline && (
            <div className="bg-yellow-600 text-white text-center py-1 text-xs z-50 shadow-md flex items-center justify-center gap-2" role="alert" aria-live="assertive">
                <WifiOff size={14} />
                <span>Connection lost.</span>
            </div>
        )}

        <Header 
          theme={theme} 
          toggleTheme={toggleTheme} 
          activeLeague={activeLeague} 
          onLeagueChange={handleLeagueChange} 
        />

        <nav className="flex-shrink-0 px-4 pt-6 pb-2 z-40 sm:px-6" aria-label="Main Navigation">
            <div 
                role="tablist" 
                aria-label="Application Views"
                onKeyDown={handleTabKeyDown}
                className="flex p-1 bg-surfaceHighlight/50 border border-border/10 backdrop-blur-xl rounded-xl max-w-sm mx-auto shadow-glass-inset relative"
            >
                {TABS.map((tab) => (
                <button
                    key={tab.id}
                    ref={(el) => { tabRefs.current[tab.id] = el; }}
                    id={`tab-${tab.id}`}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`panel-${tab.id}`}
                    tabIndex={activeTab === tab.id ? 0 : -1}
                    onClick={() => handleTabChange(tab.id)}
                    className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ease-cubic-bezier relative z-10",
                    activeTab === tab.id
                        ? "text-textPrimary"
                        : "text-textSecondary hover:text-textPrimary focus-visible:text-textPrimary",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:z-20"
                    )}
                >
                    <tab.icon size={16} strokeWidth={2.5} aria-hidden="true" />
                    <span>{tab.label}</span>
                    {activeTab === tab.id && (
                        <div className="absolute inset-0 bg-surface shadow-subtle rounded-lg -z-10 motion-safe:animate-scale-in" aria-hidden="true" />
                    )}
                </button>
                ))}
            </div>
        </nav>

        <main className="flex-1 flex flex-col relative max-w-5xl mx-auto w-full overflow-hidden">
             <div
                id="panel-chat"
                role="tabpanel"
                aria-labelledby="tab-chat"
                className={cn("flex-1 flex flex-col overflow-hidden h-full", activeTab !== 'chat' && "hidden")}
                hidden={activeTab !== 'chat'}
            >
                <div 
                    ref={chatContainerRef}
                    className="flex-1 overflow-y-auto w-full scroll-smooth px-4 md:px-6 pb-4 scrollbar-custom overscroll-contain"
                    role="log"
                    aria-live="polite"
                    aria-atomic="false" 
                >
                {!hasStarted ? (
                    <OnboardingView onSuggestionClick={(query) => handleSend(query)} league={activeLeague} />
                ) : (
                    <div className="flex flex-col py-6 space-y-4">
                        {messages.map((msg) => (
                            <ChatMessage key={msg.id} message={msg} />
                        ))}
                        {isLoading && <LoadingIndicator />}
                        <div ref={messagesEndRef} className="h-px" aria-hidden="true" />
                    </div>
                )}
                </div>

                <div className="flex-shrink-0 z-20 pb-safe relative">
                    <div className="absolute bottom-full left-0 right-0 h-16 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none"></div>
                    <div className="px-4 md:px-6">
                        <InputArea ref={inputAreaRef} onSend={handleSend} isLoading={isLoading} isDisabled={!isOnline} />
                    </div>
                </div>
            </div>

            {activeTab === 'schedule' && (
                <div
                    id="panel-schedule"
                    role="tabpanel"
                    aria-labelledby="tab-schedule"
                    className="flex-1 overflow-y-auto w-full scroll-smooth scrollbar-custom motion-safe:animate-fadeIn h-full"
                >
                    <Suspense fallback={<ScheduleLoadingSkeleton />}>
                        <ScheduleView onAnalyze={handleAnalyzeGame} league={activeLeague} />
                    </Suspense>
                </div>
            )}
        </main>
        
        <style>{`
            .pb-safe { padding-bottom: max(24px, env(safe-area-inset-bottom)); }
            .ease-cubic-bezier { transition-timing-function: cubic-bezier(0.645, 0.045, 0.355, 1); }
            @keyframes slide-up-fade {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes scale-in {
                from { transform: scale(0.95); opacity: 0.5; }
                to { transform: scale(1); opacity: 1; }
            }
            @keyframes ping-slow {
            75%, 100% {
                transform: scale(2);
                opacity: 0;
            }
            }
            .animate-slide-up-fade { animation: slide-up-fade 0.6s ease-cubic-bezier forwards; }
            .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
            .animate-scale-in { animation: scale-in 0.2s ease-cubic-bezier forwards; }
            .animate-ping-slow { animation: ping-slow 3s cubic-bezier(0, 0, 0.2, 1) infinite; }

            @media (prefers-reduced-motion: reduce) {
                html { scroll-behavior: auto !important; }
                *, ::before, ::after {
                    animation-duration: 0.01ms !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: 0.01ms !important;
                    scroll-behavior: auto !important;
                }
            }
            .scrollbar-custom {
                scrollbar-width: thin;
                scrollbar-color: rgba(120, 120, 120, 0.2) transparent;
            }
            .scrollbar-custom::-webkit-scrollbar { width: 8px; height: 8px; }
            .scrollbar-custom::-webkit-scrollbar-track { background: transparent; }
            .scrollbar-custom::-webkit-scrollbar-thumb { background-color: rgba(120, 120, 120, 0.2); border-radius: 4px; }
            .scrollbar-custom:hover::-webkit-scrollbar-thumb { background-color: rgba(120, 120, 120, 0.4); }
            .dark .scrollbar-custom { scrollbar-color: rgba(200, 200, 200, 0.15) transparent; }
            .dark .scrollbar-custom::-webkit-scrollbar-thumb { background-color: rgba(200, 200, 200, 0.15); }
            .dark .scrollbar-custom:hover::-webkit-scrollbar-thumb { background-color: rgba(200, 200, 200, 0.3); }
        `}</style>
        </div>
    </AppErrorBoundary>
  );
};

class AppErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(_: Error) { return { hasError: true }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) { observability.logError(error, 'AppErrorBoundary', { componentStack: errorInfo.componentStack }); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-background text-textPrimary p-8 antialiased bg-noise" role="alert">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-6" />
          <h1 className="text-3xl font-bold mb-4">A Critical Error Occurred</h1>
          <p className="text-textSecondary mb-6 text-center">We apologize for the inconvenience.</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:bg-accent/90 transition-colors">Refresh Application</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default App;

import React, { useState, useRef, useEffect, useCallback, lazy, Suspense, Component, ErrorInfo } from "react";

// Components
import { Header } from "./components/Header";
import { ChatMessage } from "./components/ChatMessage";
import { InputArea, InputAreaHandle } from "./components/InputArea";
import { FeaturedContent } from "./components/FeaturedContent";
import { useAuth } from "./hooks/useAuth";
// Optimized Static Import for reliability
import { supabase } from "@/integrations/supabase/client";

// Types
// Ensure 'types.ts' defines MessageStatus: 'pending' | 'streaming' | 'complete' | 'error'
import type { Message, GameData, AppTheme, League } from "./types";

// Services
// Using the service path provided in the context
import { sendMessageToAI } from "./services/nhlAi";

// Icons
import {
  Calendar,
  ChevronRight,
  MessageSquare,
  Zap,
  TrendingUp,
  BarChart3,
  AlertTriangle,
  WifiOff,
  Cpu,
  Loader2,
} from "lucide-react";

// --- Configuration & Constants ---

// Increased threshold for better scroll detection during streaming
const SCROLL_THRESHOLD = 450;

// Institutional-grade suggestions (Static Data)
const LEAGUE_CONFIG = {
  NHL: {
    suggestions: [
      {
        id: "s1",
        label: "Today's Slate & Signals",
        icon: Calendar,
        query: "Show me today's full NHL slate with consensus lines and sharp money indicators.",
        desc: "Market overview & steam detection",
      },
      {
        id: "s2",
        label: "EV Optimizer",
        icon: Zap,
        query: "I have a risk-free bet. Optimize EV (+5% edge) on today's NHL slate.",
        desc: "Maximize promotional value (Arb/Hedge)",
      },
      {
        id: "s3",
        label: "Liquidity Analysis",
        icon: TrendingUp,
        query: "Analyze the NHL game with the highest liquidity. Where is the smart money positioned?",
        desc: "Volume analysis & sharp action",
      },
    ],
  },
  NFL: {
    suggestions: [
      {
        id: "n1",
        label: "Weekly Market Report",
        icon: Calendar,
        query: "Break down the upcoming NFL slate. Identify key line moves and contrarian spots.",
        desc: "Macro market view & CLV analysis",
      },
      {
        id: "n2",
        label: "Underdog Value (DVOA)",
        icon: Zap,
        query: "Which NFL underdogs have the best moneyline EV based on DVOA mismatch this week?",
        desc: "High leverage spots & statistical edges",
      },
      {
        id: "n3",
        label: "Prime Time Deep Dive",
        icon: TrendingUp,
        query: "Analyze the next Prime Time NFL game. Focus on EPA/Play, injuries, and coaching trends.",
        desc: "TNF/SNF/MNF comprehensive analysis",
      },
    ],
  },
  NBA: {
    suggestions: [
      {
        id: "b1",
        label: "Tonight's Board & Injuries",
        icon: Calendar,
        query: "Show me tonight's NBA slate with real-time injury reports and corresponding line moves.",
        desc: "Pace, injury impact & market reaction",
      },
      {
        id: "b2",
        label: "Totals Edge (Pace/Rating)",
        icon: TrendingUp,
        query: "Which NBA games have the best over/under value based on pace metrics and efficiency ratings?",
        desc: "Algorithmic totals analysis",
      },
      {
        id: "b3",
        label: "Usage Rate Volatility",
        icon: Zap,
        query:
          "Analyze NBA games where star players are questionable. How does their status impact usage rates and props?",
        desc: "Prop discovery & volatility analysis",
      },
    ],
  },
};

type TabId = "featured" | "chat" | "schedule";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "featured", label: "Featured", icon: TrendingUp },
  { id: "chat", label: "Analysis", icon: MessageSquare },
  { id: "schedule", label: "Board", icon: BarChart3 },
];

// --- Utilities ---

const observability = {
  logError: (error: unknown, context: string, metadata: Record<string, any> = {}) => {
    console.error(
      JSON.stringify({
        level: "error",
        timestamp: new Date().toISOString(),
        context,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        metadata,
      }),
    );
  },
  logInfo: (message: string, context: string, metadata: Record<string, any> = {}) => {
    if (process.env.NODE_ENV !== "production")
      console.info(JSON.stringify({ level: "info", context, message, metadata }));
  },
};

const cn = (...classes: (string | boolean | undefined | null)[]): string => classes.filter(Boolean).join(" ");

// --- Polyfills & Browser APIs ---

const safeRequestIdleCallback = (cb: () => void) => {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as any).requestIdleCallback(cb);
  } else {
    setTimeout(cb, 1);
  }
};

// --- Lazy Components ---

const ScheduleView = lazy(() =>
  import("./components/ScheduleView")
    .then((module) => ({ default: module.ScheduleView }))
    .catch((error) => {
      observability.logError(error, "LazyLoadScheduleView");
      return {
        default: () => (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-background">
            <AlertTriangle className="text-destructive w-16 h-16 mb-6" strokeWidth={1.5} />
            <h3 className="text-2xl font-semibold tracking-tight text-foreground">Data Feed Interrupted</h3>
            <p className="text-muted-foreground mt-2">
              Unable to load the market board. Please verify your connection.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-5 py-2 bg-primary text-primary-foreground rounded-lg shadow-md hover:bg-primary/90 transition-colors"
            >
              Retry Connection
            </button>
          </div>
        ),
      };
    }),
);

// --- Hooks ---

const useTheme = (defaultTheme: AppTheme = "dark") => {
  const [theme, setTheme] = useState<AppTheme>(defaultTheme);

  useEffect(() => {
    const stored = localStorage.getItem("appTheme") as AppTheme;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = stored || (prefersDark ? "dark" : "light");

    setTheme(initial);
    document.documentElement.className = initial;
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);

    document.documentElement.classList.remove(theme);
    document.documentElement.classList.add(newTheme);
    localStorage.setItem("appTheme", newTheme);
  }, [theme]);

  return { theme, toggleTheme };
};

// ENHANCEMENT: Persist Active Tab across sessions
const usePersistedTab = (defaultTab: TabId = "featured") => {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    if (typeof window === "undefined") return defaultTab;
    const stored = localStorage.getItem("appActiveTab") as TabId;
    return stored && ["featured", "chat", "schedule"].includes(stored) ? stored : defaultTab;
  });

  const setTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    localStorage.setItem("appActiveTab", tab);
  }, []);

  return { activeTab, setTab };
};

const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const setStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", setStatus);
    window.addEventListener("offline", setStatus);
    return () => {
      window.removeEventListener("online", setStatus);
      window.removeEventListener("offline", setStatus);
    };
  }, []);
  return isOnline;
};

// --- Sub-Components ---

// Enhanced OnboardingView for a cleaner, "Internal Tool" aesthetic
const OnboardingView = React.memo(
  ({ onSuggestionClick, league }: { onSuggestionClick: (q: string) => void; league: League }) => {
    const suggestions = LEAGUE_CONFIG[league]?.suggestions || LEAGUE_CONFIG.NHL.suggestions;

    return (
      <div className="h-full flex flex-col items-center justify-center p-4 md:p-8 text-center animate-slide-up-fade">
        <div className="max-w-2xl w-full space-y-16">
          {/* Header Section */}
          <div className="space-y-5">
            <div className="inline-flex items-center justify-center p-4 rounded-3xl bg-gradient-to-br from-gray-100/80 to-gray-200/80 dark:from-white/5 dark:to-white/10 mb-4 shadow-inner backdrop-blur-sm">
              {/* Changed icon to emphasize computational power */}
              <Cpu className="w-10 h-10 text-gray-900 dark:text-white" strokeWidth={1.5} />
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tighter text-foreground">
              Sharp<span className="text-accent">Edge</span> v2.1
            </h1>
            <p className="text-muted-foreground text-xl font-light leading-relaxed max-w-lg mx-auto">
              Institutional-grade {league} market analysis.
            </p>
            <p className="text-xs font-mono uppercase tracking-wider opacity-60">
              Powered by Morning Cron Pre-computation & Gemini Deep Think
            </p>
          </div>

          {/* Suggestions Grid */}
          <div className="grid md:grid-cols-2 gap-4 w-full max-w-3xl mx-auto">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => onSuggestionClick(s.query)}
                className="group flex flex-col items-start p-5 rounded-2xl text-left transition-all duration-300
                         bg-white/70 dark:bg-gray-800/50 border border-gray-200/70 dark:border-white/10 backdrop-blur-lg
                         hover:shadow-xl hover:border-accent/50 dark:hover:border-accent/50 transform hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-4 mb-3">
                  <div
                    className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/10 flex items-center justify-center text-foreground
                              group-hover:bg-accent group-hover:text-white transition-colors duration-300"
                  >
                    <s.icon size={20} strokeWidth={2} />
                  </div>
                  <span className="text-base font-bold text-foreground">{s.label}</span>
                </div>
                <span className="text-sm text-muted-foreground leading-snug group-hover:text-foreground/90 transition-colors">
                  {s.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  },
);
OnboardingView.displayName = "OnboardingView";

// Refined BufferingIndicator (Used when waiting for the stream to start)
const BufferingIndicator = () => (
  <div className="flex justify-start w-full px-2 py-4 animate-fadeIn">
    <div className="flex items-center gap-3 px-4 py-3 rounded-full bg-muted/70 border border-border/60 backdrop-blur-md shadow-sm">
      <div className="w-3 h-3">
        {/* Using SVG spinner for better control and aesthetic */}
        <svg
          className="animate-spin h-full w-full text-accent"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
      <span className="text-sm font-medium text-muted-foreground">Connecting to Analysis Engine...</span>
    </div>
  </div>
);

// Hydration Loading Indicator
const HydrationLoader = () => (
  <div className="h-full flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-6 h-6 animate-spin mr-3" />
    <span className="text-sm">Loading Analysis History...</span>
  </div>
);

// --- Main Application Component ---

const App: React.FC = () => {
  // State
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { activeTab, setTab: setActiveTab } = usePersistedTab("featured");
  const [activeLeague, setActiveLeague] = useState<League>("NHL");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false); // Tracks active streaming
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true); // Tracks initial data load

  // Refs & Env
  const isOnline = useNetworkStatus();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<InputAreaHandle>(null);

  // --- Side Effects ---

  // 1. Prefetch Schedule View (Performance)
  useEffect(() => {
    safeRequestIdleCallback(() => {
      import("./components/ScheduleView").catch((err) => observability.logError(err, "PrefetchSchedule"));
    });
  }, []);

  // 2. Load Conversation History (Hydration/Persistence)
  useEffect(() => {
    // Use an isActive flag to prevent race conditions when switching leagues rapidly
    let isActive = true;

    const loadHistory = async () => {
      if (!user) {
        setIsHydrating(false);
        return;
      }

      setIsHydrating(true);
      // Clear previous state immediately for responsiveness
      setMessages([]);
      setConversationId(null);

      try {
        // Find most recent active conversation for this league
        const { data: convs, error: convError } = await supabase
          .from("ai_conversations")
          .select("id")
          .eq("user_id", user.id)
          .eq("title", `${activeLeague} Analysis`)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (convError) throw convError;
        if (!isActive) return; // Check if context is still valid

        if (convs && convs.length > 0) {
          const cId = convs[0].id;
          setConversationId(cId);

          // Load messages
          const { data: msgs, error: msgError } = await supabase
            .from("ai_messages")
            .select("id, role, content, created_at")
            .eq("conversation_id", cId)
            .order("created_at", { ascending: true });

          if (msgError) throw msgError;
          if (!isActive) return; // Final check before state update

          if (msgs) {
            const formattedMsgs: Message[] = msgs.map((m) => ({
              id: String(m.id),
              // Map backend roles ('user', 'assistant') to frontend roles ('user', 'model')
              role: (m.role === "user" ? "user" : "model") as "user" | "model",
              content: m.content,
              timestamp: new Date(m.created_at).getTime(),
              status: "complete",
            }));
            setMessages(formattedMsgs);
          }
        }
      } catch (err) {
        observability.logError(err, "HistoryHydration");
      } finally {
        if (isActive) {
          setIsHydrating(false);
        }
      }
    };

    loadHistory();

    return () => {
      isActive = false;
    };
  }, [user, activeLeague]);

  // 3. Advanced Scroll Handling (UX + Streaming)
  useEffect(() => {
    const container = chatContainerRef.current;
    // Do not scroll during initial hydration or if refs aren't ready
    if (activeTab !== "chat" || !messagesEndRef.current || !container || isHydrating) return;

    // Check if the user is near the bottom before scrolling
    const isNearBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + SCROLL_THRESHOLD;

    // Identify if the user initiated the last action (helps on initial load scroll)
    const relevantMessages = messages.filter((m) => m.content.length > 0 || m.role === "user");
    const lastMessageIsUser =
      relevantMessages.length > 0 && relevantMessages[relevantMessages.length - 1].role === "user";

    // Scroll if near bottom, OR if the user just sent a message, OR if actively streaming (to keep up with new content)
    if (isNearBottom || lastMessageIsUser || isStreaming) {
      // Use requestAnimationFrame for smoother synchronization with React's rendering cycle
      requestAnimationFrame(() => {
        // Use 'auto' behavior during streaming for instant updates, 'smooth' otherwise
        const behavior = isStreaming ? "auto" : "smooth";
        messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
      });
    }
  }, [messages, activeTab, isHydrating, isStreaming]);

  // --- Handlers ---

  const handleLeagueChange = (league: League) => {
    if (league === activeLeague) return;
    // Prevent league change during active analysis
    if (isLoading) return;

    // Reset state for the new league context (useEffect handles the actual data fetching)
    setActiveLeague(league);
    setIsHydrating(true); // Trigger hydration state
  };

  // ENHANCEMENT: HandleSend with Real-Time Streaming and Stale Closure Prevention
  const handleSend = useCallback(
    async (content: string) => {
      // Check user authentication status explicitly
      if (!content.trim() || isLoading || !isOnline || isHydrating || !user) return;

      setActiveTab("chat");
      setIsLoading(true); // Lock input

      // 1. Define Messages for Optimistic Update
      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: content,
        timestamp: Date.now(),
        status: "complete",
      };

      const streamingAiMsgId = crypto.randomUUID();
      const streamingAiMsg: Message = {
        id: streamingAiMsgId,
        role: "model",
        content: "", // Start empty
        timestamp: Date.now(),
        status: "processing",
      };

      // CRITICAL: Use functional updates to capture the correct history snapshot and update the state simultaneously
      let historySnapshot: Message[] = [];
      setMessages((prev) => {
        historySnapshot = [...prev]; // Capture history *before* the interaction
        return [...prev, userMsg, streamingAiMsg]; // Add user message and AI placeholder
      });

      let fullResponseText = "";
      let streamInitialized = false;
      let currentConvId = conversationId; // Capture current conversationId

      try {
        // 3. Ensure/Create Conversation (Persistence)
        if (!currentConvId) {
          const { data: newConv, error: convError } = await supabase
            .from("ai_conversations")
            .insert({
              user_id: user.id,
              title: `${activeLeague} Analysis`,
              session_id: `sess_${crypto.randomUUID()}`,
            })
            .select("id")
            .single();

          if (convError || !newConv) {
            observability.logError(convError, "CreateConversation");
            throw new Error("Failed to establish conversation session.");
          }

          currentConvId = newConv.id;
          setConversationId(currentConvId); // Update state for next time
        }

        // 4. Persist User Message (Async background task)
        if (currentConvId) {
          supabase
            .from("ai_messages")
            .insert({
              conversation_id: currentConvId,
              role: "user",
              content: content,
            })
            .then(({ error }) => {
              if (error) observability.logError(error, "PersistUserMessage");
            });
        }

        // --- STREAMING EXECUTION ---

        // Callback to handle incoming chunks
        const handleChunk = (chunk: string) => {
          if (!streamInitialized) {
            setIsStreaming(true); // Activate streaming state once data flows
            streamInitialized = true;
          }
          fullResponseText += chunk;
          // Efficiently update only the content of the specific streaming message
          setMessages((prev) =>
            prev.map((msg) => (msg.id === streamingAiMsgId ? { ...msg, content: fullResponseText } : msg)),
          );
        };

        // Execute the AI call
        await sendMessageToAI(content, historySnapshot, activeLeague, handleChunk);

        // --- STREAM COMPLETION ---
        setIsStreaming(false);

        // Update final status to complete
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingAiMsgId ? { ...msg, status: "complete", timestamp: Date.now() } : msg,
          ),
        );

        // Persist Final AI Message
        if (currentConvId && fullResponseText) {
          supabase
            .from("ai_messages")
            .insert({
              conversation_id: currentConvId,
              role: "assistant", // Use 'assistant' for backend compatibility
              content: fullResponseText,
              model: "gemini-1.5-pro-optimized",
            })
            .then(({ error }) => {
              if (error) observability.logError(error, "PersistAIMessage");
            });
        }
      } catch (error) {
        observability.logError(error, "MessagePipelineStreamError");
        setIsStreaming(false);

        // Handle errors: Update the placeholder message to show an error state
        setMessages((prev) => {
          return prev.map((msg) => {
            if (msg.id === streamingAiMsgId) {
              return {
                ...msg,
                // Show error message, preserving partial content if stream failed midway
                content:
                  msg.content +
                  `\n\n[System Error: ${error instanceof Error ? error.message : "The stream was interrupted."} Please try again.]`,
                status: "error",
                isError: true,
                timestamp: Date.now(),
              };
            }
            return msg;
          });
        });
      } finally {
        setIsLoading(false); // Unlock input
        // Ensure focus returns to input after processing (UX)
        requestAnimationFrame(() => inputAreaRef.current?.focusInput());
      }
      // Dependencies optimized: Removed 'messages' as we use functional updates and snapshots
    },
    [isLoading, isOnline, conversationId, user, activeLeague, isHydrating, setActiveTab],
  );

  const handleAnalyzeGame = useCallback(
    (game: GameData) => {
      // Construct a precise prompt for game analysis
      const prompt = `Provide a sharp analysis for ${game.awayTeam} @ ${game.homeTeam}. Focus on advanced metrics (DVOA/EPA/xG), market movement, and identify the best spread/total/prop positions.`;
      handleSend(prompt);
    },
    [handleSend],
  );

  // --- Render ---

  // Global layout definitions
  const MAX_WIDTH_CLASS = "max-w-6xl";

  // Determine if the buffering indicator should be shown (Loading, but stream hasn't started yet)
  const showBufferingIndicator = isLoading && !isStreaming;

  return (
    <AppErrorBoundary>
      <div className="flex flex-col h-[100dvh] bg-background text-foreground font-sans antialiased selection:bg-accent/40 overflow-hidden relative">
        {/* Connection Status Bar (Resilience) */}
        {!isOnline && (
          <div className="bg-amber-700/95 backdrop-blur-sm text-white text-center py-1.5 text-sm font-medium z-50 flex items-center justify-center gap-3 absolute top-0 w-full shadow-md">
            <WifiOff size={16} />
            <span>Offline Mode: Analysis unavailable. Using cached market data.</span>
          </div>
        )}

        <Header
          theme={theme}
          toggleTheme={toggleTheme}
          activeLeague={activeLeague}
          onLeagueChange={handleLeagueChange}
          onSignOut={signOut}
        />

        {/* View Switcher (Tabs) - Refined visual feedback */}
        <nav className="flex-shrink-0 px-4 pt-5 pb-3 z-40">
          <div
            className={`flex p-1 bg-muted/60 backdrop-blur-xl rounded-xl mx-auto shadow-sm border border-border/50 relative ${MAX_WIDTH_CLASS}`}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  // Disable tab switching during loading/hydration
                  disabled={isLoading || isHydrating}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2.5 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 relative z-10 focus:outline-none focus-visible:ring-2 focus:ring-accent/50 disabled:opacity-50",
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={isActive}
                >
                  <tab.icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  <span>{tab.label}</span>
                  {/* Active State Indicator */}
                  {isActive && (
                    <div className="absolute inset-0 bg-background shadow-md rounded-lg -z-10 animate-scale-in border border-border/70" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Main Content Area */}
        <main className={`flex-1 flex flex-col relative mx-auto w-full overflow-hidden ${MAX_WIDTH_CLASS}`}>
          {/* Featured View */}
          <div
            className={cn(
              "flex-1 flex flex-col overflow-hidden h-full transition-opacity duration-300 absolute inset-0",
              activeTab === "featured" ? "opacity-100 z-10 visible" : "opacity-0 z-0 invisible",
            )}
          >
            <div className="flex-1 overflow-y-auto w-full px-4 md:px-6 py-6">
              <FeaturedContent 
                league={activeLeague}
                onArticleClick={(query) => {
                  setActiveTab("chat");
                  handleSend(query);
                }}
              />
            </div>
          </div>

          {/* Chat View */}
          {/* Using absolute positioning and visibility ensures refs remain mounted when switching tabs */}
          <div
            className={cn(
              "flex-1 flex flex-col overflow-hidden h-full transition-opacity duration-300 absolute inset-0",
              activeTab === "chat" ? "opacity-100 z-10 visible" : "opacity-0 z-0 invisible",
            )}
          >
            {/* Messages Container */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto w-full scroll-smooth px-4 md:px-6 pb-4 scrollbar-hide"
            >
              {/* Conditional Rendering based on hydration and message count */}
              {isHydrating ? (
                <HydrationLoader />
              ) : messages.length === 0 ? (
                <OnboardingView onSuggestionClick={handleSend} league={activeLeague} />
              ) : (
                <div className="flex flex-col py-6 space-y-8">
                  {messages.map((msg) => (
                    <ChatMessage key={msg.id} message={msg} />
                  ))}
                  {/* Show indicator only if buffering before stream starts */}
                  {showBufferingIndicator && <BufferingIndicator />}
                  <div ref={messagesEndRef} className="h-px w-full" />
                </div>
              )}
            </div>

            {/* Input Area - Seamless connection to chat */}
            <div className="flex-shrink-0 z-20 pb-[env(safe-area-inset-bottom,24px)] px-4 md:px-6 relative">
              {/* Gradient overlay for smooth transition from chat to input */}
              <div className="absolute bottom-full left-0 right-0 h-32 bg-gradient-to-t from-background via-background/95 to-transparent pointer-events-none" />
              <InputArea
                ref={inputAreaRef}
                onSend={handleSend}
                isLoading={isLoading}
                isDisabled={!isOnline || isHydrating}
              />
            </div>
          </div>

          {/* Schedule View */}
          <div
            className={cn(
              "flex-1 overflow-y-auto w-full h-full absolute inset-0",
              activeTab === "schedule" ? "block z-10" : "hidden z-0",
            )}
          >
            <Suspense
              fallback={
                <div className="p-8">
                  <BufferingIndicator />
                </div>
              }
            >
              {/* Only render ScheduleView when not hydrating to ensure data consistency */}
              {!isHydrating && <ScheduleView onAnalyze={handleAnalyzeGame} league={activeLeague} />}
            </Suspense>
          </div>
        </main>
      </div>

      {/* Global Styles & Animations (Refined) */}
      <style>{`
        /* Hide scrollbar for a cleaner look */
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

        /* Refined Animations using cubic-bezier for natural motion */
        @keyframes scale-in { 
            from { transform: scale(0.96); opacity: 0; } 
            to { transform: scale(1); opacity: 1; } 
        }
        .animate-scale-in { animation: scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
        @keyframes slideUpFade { 
            from { transform: translateY(25px); opacity: 0; } 
            to { transform: translateY(0); opacity: 1; } 
        }
        .animate-slide-up-fade { animation: slideUpFade 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
      `}</style>
    </AppErrorBoundary>
  );
};

// Error Boundary for Production Resilience (Robust implementation)
class AppErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    observability.logError(error, "AppCrash", { componentStack: errorInfo.componentStack });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground p-8 text-center">
          <AlertTriangle className="w-16 h-16 text-destructive mb-6" strokeWidth={1.5} />
          <h1 className="text-3xl font-bold tracking-tight mb-3">System Failure</h1>
          <p className="text-muted-foreground mb-6">An unexpected error occurred. The telemetry has been reported.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 bg-primary text-primary-foreground rounded-lg shadow-md hover:bg-primary/90 transition-colors"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default App;

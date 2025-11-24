This update enhances the AI chat functionality within the `PickDetailModal` by significantly improving context injection and ensuring a better user experience through real-time streaming responses.

**Key Enhancements:**

1.  **Robust Context Injection:** A new `generateSystemPrompt` function creates a detailed, structured prompt for the AI. This ensures the AI is tightly focused on the specific game, the current score (if applicable), and the original AI analysis, preventing it from losing context.
2.  **Streaming Responses (SSE):** The `handleSendMessage` logic has been upgraded to handle Server-Sent Events (SSE) in real-time.
      * It now uses `response.body.getReader()` to process the AI response as it arrives, streaming the text word-by-word into the chat UI.
      * This provides a much faster and more engaging user experience compared to waiting for the complete response.
3.  **Improved Chat UI:**
      * The `ChatMessage` interface now includes an `id` and `error` state to manage streaming updates and error displays efficiently.
      * The loading indicator is now integrated directly into the assistant's message bubble during the streaming process.
4.  **Error Handling:** Enhanced error detection during the streaming process, with appropriate feedback provided to the user if the AI service fails.

<!-- end list -->

```tsx
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { GameData, MarketData, PickData } from "../types";
// PickDisplay and PickDetailModal are defined later in the file for cohesive updates
// import { PickDisplay } from "./PickDisplay";
// import { PickDetailModal } from "./PickDetailModal";
import { useToast } from "../hooks/use-toast";
// Assuming these UI components are available in the project based on the original code context
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { ScrollArea } from "./ui/scroll-area";

// Observability (Logic unchanged)
const observability = {
  trackEvent: (event: string, properties: Record<string, unknown> = {}) => {},
  logError: (error: unknown, context: string, metadata: Record<string, any> = {}) => {
    console.error(
      JSON.stringify({
        level: "error",
        timestamp: new Date().toISOString(),
        context,
        error: error instanceof Error ? error.message : String(error),
        metadata,
      }),
    );
  },
};

// Utility
const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(" ");
};

// Constants aligned with ESSENCE spacing (40px = spacing-10)
const LOGO_SIZE = 40;

// Helpers (Logic unchanged)
const getEspnLogoUrl = (abbr: string, league: "NHL" | "NFL" | "NBA" = "NHL"): string => {
  const code = abbr.toLowerCase();
  const sportPath = league === "NHL" ? "nhl" : league === "NFL" ? "nfl" : "nba";
  const size = LOGO_SIZE * 2; // Retina optimization
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${sportPath}/500/${code}.png&h=${size}&w=${size}&lossy=1`;
};

const parseLine = (plString: string | undefined): { line: string; juice: string } => {
  if (!plString || plString === "-" || plString === "N/A") {
    return { line: "-", juice: "" };
  }
  const match = plString.match(/([+-]?\d*\.?\d+|PK)\s*\(?([+-]?\d+)?\)?/i);
  if (match && match[1]) {
    return { line: match[1], juice: match[2] || "" };
  }
  return { line: plString.trim(), juice: "" };
};

// ============================================================================
// TEAM LOGO COMPONENT
// ============================================================================

interface TeamLogoProps {
  teamAbbr: string;
  teamName: string;
  league: "NHL" | "NFL" | "NBA";
}

const TeamLogo = React.memo(({ teamAbbr, teamName, league }: TeamLogoProps) => {
  const [loadState, setLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const src = useMemo(() => getEspnLogoUrl(teamAbbr, league), [teamAbbr, league]);

  const handleError = useCallback(() => {
    if (loadState !== "error") {
      setLoadState("error");
    }
  }, [loadState]);

  const handleLoad = useCallback(() => {
    setLoadState("loaded");
  }, []);

  // ESSENCE Fallback: Machined aluminum look (surface-secondary) and precise typography.
  if (loadState === "error") {
    return (
      <div
        className="w-10 h-10 rounded-lg bg-surface-secondary flex items-center justify-center border border-surface-tertiary shadow-inner"
        title={`${teamName} logo failed to load`}
      >
        {/* Typography: caption-1 (12px), content-tertiary */}
        <span className="text-caption-1 font-bold text-content-tertiary tracking-wider">
          {teamAbbr.substring(0, 3)}
        </span>
      </div>
    );
  }

  return (
    <div className="w-10 h-10 flex items-center justify-center relative">
      {/* ESSENCE Loading State: Subtle pulse on surface-secondary */}
      {loadState === "loading" && (
        <div className="absolute inset-0 rounded-lg bg-surface-secondary/50 animate-pulse" aria-hidden="true" />
      )}
      <img
        src={src}
        alt={`${teamName} logo`}
        // ESSENCE Motion: duration-400, ease-decelerate for loading in.
        className={cn(
          "w-full h-full object-contain transition-all duration-400 ease-decelerate",
          // Subtle scale effect on card hover
          loadState === "loaded"
            ? "opacity-100 scale-100 group-hover/card:scale-110 drop-shadow-md"
            : "opacity-0 scale-90",
        )}
        onError={handleError}
        onLoad={handleLoad}
        loading="lazy"
        decoding="async"
        width={LOGO_SIZE}
        height={LOGO_SIZE}
      />
    </div>
  );
});
TeamLogo.displayName = "TeamLogo";

// ============================================================================
// ODDS CELL COMPONENT
// ============================================================================

interface OddsCellProps {
    label: string;
    main: string;
    sub?: string;
    isFavorite?: boolean;
    isDisabled?: boolean;
    movement?: "up" | "down" | "none";
    onClick?: () => void;
}

const OddsCell = React.memo(
    ({ label, main, sub, isFavorite = false, isDisabled = false, movement = "none", onClick }: OddsCellProps) => {
        const isInteractive = !!onClick && !isDisabled && main !== "-";

        const ariaLabel = useMemo(() => {
            if (isDisabled || main === "-") return `${label} currently unavailable`;
            return `${label}: ${main} ${sub ? `at ${sub} odds` : ""}.${isFavorite ? " Favorite." : ""}`;
        }, [label, main, sub, isFavorite, isDisabled]);

        const mainColor = useMemo(() => {
            if (isDisabled) return "text-content-tertiary/70";
            if (movement === "up") return "text-semantic-success";
            if (movement === "down") return "text-semantic-error";
            return isFavorite ? "text-accent" : "text-content-primary";
        }, [isFavorite, isDisabled, movement]);

        return (
            <button
                onClick={isInteractive ? onClick : undefined}
                disabled={!isInteractive}
                aria-label={ariaLabel}
                className={cn(
                    "group/odds relative flex flex-col items-center justify-center py-3.5 px-2 rounded-xl border transition-all duration-150 ease-standard select-none focus-visible:outline-none overflow-hidden",
                    !isInteractive
                        ? "bg-transparent border-transparent opacity-40 cursor-default"
                        : cn(
                            "cursor-pointer motion-safe:hover:scale-105 active:scale-95",
                            isFavorite
                                ? "bg-accent/10 border-accent/30 hover:bg-accent/20 hover:border-accent/50 shadow-md hover:shadow-lg"
                                : "bg-surface-secondary/50 border-surface-tertiary hover:border-content-tertiary/50 hover:bg-surface-secondary hover:shadow-sm",
                        ),
                    isInteractive && "focus-visible:ring-2 focus-visible:ring-accent focus-visible:z-10",
                )}
            >
                {movement !== "none" && isInteractive && (
                    <div
                        className={cn(
                            "absolute left-1.5 top-1.5 z-10 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
                            movement === "up"
                                ? "bg-semantic-success/15 text-semantic-success"
                                : "bg-semantic-error/15 text-semantic-error",
                        )}
                        aria-hidden="true"
                    >
                        {movement === "up" ? "UP" : "DOWN"}
                    </div>
                )}
                {isInteractive && (
                    <div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 dark:via-white/5 to-transparent opacity-0 group-hover/odds:opacity-100 group-hover/odds:translate-x-full transition-all duration-700 -translate-x-full"
                        aria-hidden="true"
                    />
                )}
                <span
                    className={cn(
                        "font-mono text-body font-bold tabular-nums tracking-tight z-10 transition-colors duration-150",
                        mainColor,
                    )}
                >
                    {main}
                </span>
                {sub && (
                    <span
                        className={cn(
                            "text-caption-2 font-mono mt-1 tabular-nums z-10 transition-colors duration-150",
                            isFavorite && isInteractive
                                ? "text-accent/70 group-hover/odds:text-accent"
                                : "text-content-secondary group-hover/odds:text-content-primary",
                        )}
                    >
                        {sub}
                    </span>
                )}
            </button>
        );
    },
);
OddsCell.displayName = "OddsCell";

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

interface StatusBadgeProps {
  status: GameData["status"];
  time: string;
}

const StatusBadge = React.memo(({ status, time }: StatusBadgeProps) => {
  switch (status) {
    case "Live":
      // ESSENCE Live Indicator: Pulsing pill with text.
      return (
        <div
          className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-semantic-error/15 border border-semantic-error/30 shadow-sm backdrop-blur-sm"
          role="status"
          aria-label="Game is live"
        >
          <span className="inline-flex h-2 w-2 rounded-full bg-semantic-error animate-pulse" />
          {/* Typography: caption-1 (12px) */}
          <span className="text-caption-1 font-bold text-semantic-error tracking-wider uppercase">Live</span>
        </div>
      );
    case "Final":
      // Typography: caption-1 (12px), content-secondary
      return (
        <span className="text-caption-1 font-semibold text-content-secondary uppercase tracking-widest">Final</span>
      );
    case "Postponed":
    case "Canceled":
      // ESSENCE Warning Indicator: Semantic Warning (Amber).
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-semantic-warning/20 border border-semantic-warning/40 backdrop-blur-sm">
          {/* Typography: caption-2 (11px) */}
          <span className="text-caption-2 font-bold text-semantic-warning tracking-wider uppercase">
            {status === "Postponed" ? "PPD" : status}
          </span>
        </div>
      );
    default:
      // Default Time Display: content-secondary, SF Mono for time.
      return (
        <div className="flex items-center gap-2 text-content-secondary hover:text-content-primary transition-colors duration-150 ease-standard">
          {/* Typography: body-sm (14px) */}
          <span className="text-body-sm font-medium font-mono tracking-tight">{time} ET</span>
        </div>
      );
  }
});
StatusBadge.displayName = "StatusBadge";

// ============================================================================
// PICK DETAIL MODAL COMPONENT - ESSENCE v3.1 (Enhanced Context & Streaming)
// ============================================================================

interface PickDetailModalProps {
  pick: PickData;
  game: GameData;
  isOpen: boolean;
  onClose: () => void;
}

// Update ChatMessage to include ID and error state for streaming updates
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  id: string;
  error?: boolean;
}

// Helper Calculations (Logic unchanged)
const calculateEV = (confidence: number, odds: number): number => {
  const probability = confidence / 100;
  // Calculation logic remains the same, ensuring accuracy
  return (probability * (odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1) - 1) * 100;
};

const calculateFairLine = (confidence: number): number => {
  const probability = confidence / 100;
  if (probability > 0.5) {
    return -Math.round((probability / (1 - probability)) * 100);
  } else {
    return Math.round(((1 - probability) / probability) * 100);
  }
};

// ENHANCED CONTEXT INJECTION: Structured System Prompt Generation
const generateSystemPrompt = (game: GameData, pick: PickData, ev: number, fairLine: number) => {
  // Include score if the game is live or final
  const scoreInfo = (game.status === "Live" || game.status === "Final") && game.awayScore != null && game.homeScore != null
    ? `Score: ${game.awayTeam} ${game.awayScore} - ${game.homeTeam} ${game.homeScore}`
    : `Start Time: ${game.time} ET`;

  // Truncate reasoning slightly for prompt efficiency if very long, but keep most of it
  const truncatedReasoning = pick.reasoning_text.length > 1000 ? pick.reasoning_text.substring(0, 1000) + '...' : pick.reasoning_text;

  return `You are "InsightBot," an expert-level sports betting analyst. Your role is to provide deep analysis regarding a specific matchup and the corresponding AI-generated pick.

**CRITICAL INSTRUCTION: You must ONLY discuss the game detailed below. If asked about other topics, politely decline and redirect to this game.**

**Context: The Matchup**
Teams: ${game.awayTeam} (Away) @ ${game.homeTeam} (Home)
League: ${game.league}
Status: ${game.status}
${scoreInfo}

**Context: The AI Recommendation**
Pick: ${pick.pick_side}
Odds at Generation: ${pick.odds_at_generation}
Confidence Score: ${pick.confidence_score}%
Expected Value (EV): ${ev.toFixed(1)}%
Model Fair Line: ${fairLine}
Core Reasoning Summary:
"""
${truncatedReasoning}
"""

**Your Task:**
Respond to the user's query regarding this specific context.
1. **Maintain Context:** ALWAYS assume the user is talking about ${game.awayTeam} vs ${game.homeTeam}.
2. **Provide Insight:** Offer analysis beyond the Core Reasoning. Discuss potential risks, alternative angles, or key player matchups.
3. **Be Professional and Analytical:** Maintain an objective, data-driven tone.
`;
};


export const PickDetailModal: React.FC<PickDetailModalProps> = ({ pick, game, isOpen, onClose }) => {
  const [showAIChat, setShowAIChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isAILoading, setIsAILoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Use ESSENCE semantic colors
  const isHigh = pick.confidence_score >= 70;
  const isMedium = pick.confidence_score >= 50 && pick.confidence_score < 70;

  // Memoize calculations
  const ev = useMemo(() => calculateEV(pick.confidence_score, pick.odds_at_generation), [pick]);
  const fairLine = useMemo(() => calculateFairLine(pick.confidence_score), [pick]);

  // Memoize the system prompt for optimized context injection
  const systemPrompt = useMemo(() => generateSystemPrompt(game, pick, ev, fairLine), [game, pick, ev, fairLine]);


  // Auto-scroll chat
  useEffect(() => {
    // Use a slight delay for streaming updates to ensure the DOM has updated height
    const timer = setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
    return () => clearTimeout(timer);
  }, [chatMessages]);

  // Optimized message sending handler with Streaming (SSE) support
  const handleSendMessage = async () => {
    const contentToSend = inputMessage.trim();
    if (!contentToSend || isAILoading) return;

    // 1. Optimistic UI Update for User Message
    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = { role: "user", content: contentToSend, id: userMsgId };

    // Capture history BEFORE adding the new messages (for the API call)
    const history = [...chatMessages];

    setChatMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setIsAILoading(true);

    // 2. Create Placeholder for Assistant (Streaming) Message
    const assistantMessageId = `assistant-${Date.now()}`;
    setChatMessages((prev) => [...prev, { role: "assistant", content: "", id: assistantMessageId }]);


    // AI interaction logic
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      
      // 3. Build the message payload using the enhanced system prompt
      const systemMessage = {
        role: "system" as const,
        content: systemPrompt,
      };
      
      // Ensure full context is sent (System + History + New User Message)
      const messages = [
        systemMessage,
        ...history.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: "user" as const, content: contentToSend }
      ];

      // 4. Invoke Function with Streaming Intent
      // We request 'text/event-stream' to encourage Supabase client to return the raw Response object for streaming.
      const { data: response, error } = await supabase.functions.invoke("ai-chat-router", {
        body: { messages },
        // Important: Requesting the stream format helps ensure we get the raw Response object
        headers: { 'Accept': 'text/event-stream' }
      });

      if (error) {
        throw error;
      }

      // 5. Handle the Stream (SSE Parsing)
      // We expect the response to be a Response object with a readable stream body.
      if (response && response instanceof Response && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        // State machine for parsing SSE based on the expected format (event: text, data: ...)
        let isTextEvent = false;

        // Function to update the specific message in the state reactively
        const updateStream = (chunk: string) => {
            setChatMessages(prev => prev.map(msg =>
                msg.id === assistantMessageId ? { ...msg, content: msg.content + chunk } : msg
            ));
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Decode the chunk and add to buffer
            buffer += decoder.decode(value, { stream: true });
            let eolIndex;

            // Process buffer line by line
            while ((eolIndex = buffer.indexOf('\n')) >= 0) {
                const line = buffer.substring(0, eolIndex).trim();
                buffer = buffer.substring(eolIndex + 1);

                // This logic mirrors the manual parsing suggested in the original code, adapting it for streaming
                if (line.startsWith('event:')) {
                    const eventType = line.substring(6).trim();
                    isTextEvent = (eventType === 'text');
                } else if (line.startsWith('data:') && isTextEvent) {
                    // If it's a data line within a 'text' event, update the UI
                    const data = line.substring(5).trim();
                    if (data) {
                        updateStream(data);
                    }
                } else if (line === '') {
                    // Empty line resets the event state (end of block)
                    isTextEvent = false;
                }
            }
        }
      } else {
        // Fallback for non-streaming or unexpected responses
        console.warn("Received non-streaming or unexpected response format from AI router.", response);
        let responseText = "Sorry, I couldn't process the analysis right now."; // Default fallback message

        // Attempt extraction if format is known but not a stream (e.g., direct JSON response)
        if (typeof response === 'string') {
            responseText = response;
        } else if (response && typeof response === 'object' && !(response instanceof Response)) {
             // @ts-ignore - Check common keys if it's a JSON object
             responseText = response.response || response.content || response.text || responseText;
        }

        // Update the placeholder message with the final content
        setChatMessages(prev => prev.map(msg =>
            msg.id === assistantMessageId ? { ...msg, content: responseText } : msg
        ));
      }

    } catch (error) {
      // 6. Error Handling
      console.error("AI chat error:", error);
      observability.logError(error, "PickDetailModal.handleSendMessage.catchBlock");

      // Update the placeholder message with an error state and message
      setChatMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
            ? { ...msg, content: "Sorry, I encountered an error communicating with the AI service.", error: true }
            : msg
      ));
    } finally {
      setIsAILoading(false);
    }
  };

  return (
    // ESSENCE v3.1: Premium Glass Materiality (backdrop-blur-2xl, shadow-2xl)
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] bg-glass-surface backdrop-blur-2xl backdrop-saturate-default border border-glass-border shadow-2xl p-0 overflow-hidden rounded-2xl">
        <div className="flex flex-col h-full max-h-[85vh]">
          {/* Header - Increased padding (px-8, pt-8) for a spacious, premium feel */}
          <DialogHeader className="px-8 pt-8 pb-5 border-b border-glass-border">
            <DialogTitle className="text-title-2 font-bold tracking-tight text-content-primary flex items-center justify-between">
              <div>
                {/* Typography: title-2 (24px) */}
                <div className="text-title-2">
                  {game.awayTeam} @ {game.homeTeam}
                </div>
                <div className="text-body-sm font-medium text-content-secondary mt-1">
                  {game.league} • {game.time} ET
                </div>
              </div>

              {/* AI Chat Toggle Button - ESSENCE Glass/Accent Toggle for premium interaction */}
              <Button
                variant="ghost"
                onClick={() => setShowAIChat(!showAIChat)}
                className={cn(
                  "gap-2.5 text-body-sm font-bold px-5 py-2.5 rounded-xl transition-all duration-150 ease-standard",
                  // Standard state (Subtle Glass)
                  !showAIChat &&
                    "bg-glass-surface/50 border border-glass-border text-content-primary hover:bg-glass-surface hover:border-content-tertiary/50 shadow-sm",
                  // Active state (Solid Accent)
                  showAIChat &&
                    "bg-accent text-content-inverse hover:bg-accent-hover shadow-md border border-transparent",
                )}
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px] font-bold">
                  {showAIChat ? "×" : "AI"}
                </span>
                {showAIChat ? "Close Chat" : "AI Insights"}
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex">
            {/* Main Content - Increased padding (p-8) */}
            <ScrollArea
              className={cn("flex-1 p-8 transition-all duration-300 ease-standard", showAIChat ? "lg:w-2/3" : "w-full")}
            >
              {/* Pick Summary - Premium Redesign (Subtle background separation) */}
              <div className="p-6 mb-8 bg-surface-secondary/20 rounded-xl border border-glass-border">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-caption-1 text-content-secondary mb-2 uppercase tracking-widest font-semibold">
                      System Recommendation
                    </div>
                    <div className="text-large-title font-extrabold tracking-tight text-content-primary mb-1">
                      {pick.pick_side}
                    </div>
                    <div className="text-title-3 text-content-tertiary font-mono font-semibold">
                      {pick.odds_at_generation > 0 ? "+" : ""}
                      {pick.odds_at_generation}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-caption-1 text-content-secondary mb-2 uppercase tracking-widest font-semibold">
                      Confidence
                    </div>
                    <div
                      className={cn(
                        "text-large-title font-extrabold tracking-tight",
                        isHigh
                          ? "text-semantic-success drop-shadow-sm"
                          : isMedium
                            ? "text-semantic-warning drop-shadow-sm"
                            : "text-content-secondary",
                      )}
                    >
                      {pick.confidence_score}%
                    </div>
                    <div className="text-title-3 text-transparent font-mono font-semibold">
                      &nbsp;
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="p-6 rounded-xl bg-glass-surface/50 border border-glass-border shadow-sm backdrop-blur-sm">
                  <span className="block text-caption-1 text-content-secondary uppercase tracking-wider font-semibold mb-2">
                    Expected Value (EV)
                  </span>
                  <div
                    className={cn(
                      "text-title-1 font-bold font-mono tabular-nums",
                      ev > 0 ? "text-semantic-success" : "text-content-primary",
                    )}
                  >
                    {ev >= 0 ? "+" : ""}
                    {ev.toFixed(1)}%
                  </div>
                </div>

                <div className="p-6 rounded-xl bg-glass-surface/50 border border-glass-border shadow-sm backdrop-blur-sm">
                  <span className="block text-caption-1 text-content-secondary uppercase tracking-wider font-semibold mb-2">
                    Model Fair Line
                  </span>
                  <div className="text-title-1 font-bold font-mono text-content-primary tabular-nums">
                    {fairLine > 0 ? "+" : ""}
                    {fairLine}
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <h3 className="text-title-3 font-bold text-content-primary mb-4">Staking Strategy</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-5 rounded-xl border border-accent/50 bg-accent/10 shadow-md">
                    <span className="text-body font-bold text-content-primary">Conservative (1-2% Bankroll)</span>
                    <span className="text-caption-1 px-3 py-1 rounded-full bg-accent text-content-inverse font-bold uppercase tracking-wider">
                      Optimal
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-5 rounded-xl border border-glass-border bg-glass-surface/50 opacity-70">
                    <span className="text-body font-medium text-content-secondary">Moderate (2-3% Bankroll)</span>
                    <span className="text-caption-1 text-content-tertiary">Increased Risk</span>
                  </div>
                  <div className="flex justify-between items-center p-5 rounded-xl border border-glass-border bg-glass-surface/50 opacity-50">
                    <span className="text-body font-medium text-content-secondary">Aggressive (3-5% Bankroll)</span>
                    <span className="text-caption-1 text-content-tertiary">High Risk</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-title-3 font-bold text-content-primary mb-4">Detailed Analysis</h3>
                <div className="text-body text-content-primary leading-relaxed whitespace-pre-wrap prose dark:prose-invert max-w-none">
                  {pick.reasoning_text}
                </div>
              </div>

              <div className="flex items-center gap-2 text-caption-2 text-content-tertiary pt-8 mt-8 border-t border-glass-border">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-content-tertiary" />
                <span>Generated {new Date(pick.created_at).toLocaleString()}</span>
              </div>
            </ScrollArea>

            {/* AI Chat Panel - Refined styling */}
            {showAIChat && (
              <div className="w-full lg:w-1/3 border-l border-glass-border flex flex-col bg-surface-secondary/20">
                <div className="p-5 border-b border-glass-border">
                  <h3 className="font-semibold text-body-sm text-content-primary flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-[11px] font-semibold text-accent">
                      AI
                    </span>
                    Ask AI Insights
                  </h3>
                  <p className="text-caption-1 text-content-secondary mt-1">
                    Explore alternate angles or get deeper context.
                  </p>
                </div>

                <ScrollArea className="flex-1 p-5">
                  <div className="space-y-4">
                    {chatMessages.length === 0 && (
                      <div className="text-center text-body-sm text-content-secondary py-8">
                        Start a conversation about this pick.
                      </div>
                    )}

                    {/* Updated rendering logic for streaming messages */}
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={msg.id} // Use the unique ID
                        className={cn(
                          "p-4 rounded-xl text-body-sm leading-relaxed whitespace-pre-wrap", // Added whitespace-pre-wrap for streaming formatting
                          msg.role === "user"
                            ? "bg-accent text-content-inverse ml-8 shadow-md"
                            : // Assistant messages styling
                              cn(
                                "bg-glass-surface text-content-primary mr-8 border shadow-sm",
                                // Highlight errors if they occur
                                msg.error ? "border-semantic-error/50 text-semantic-error bg-semantic-error/5" : "border-glass-border"
                              )
                        )}
                      >
                        {/* Handle streaming state: Show loading indicator if content is empty, it's the latest message, and AI is loading */}
                        {msg.role === 'assistant' && !msg.content && isAILoading && idx === chatMessages.length - 1 ? (
                            // Loading indicator (moved inside the message bubble)
                        <div className="flex items-center gap-2 text-content-secondary">
                          <span className="relative inline-flex h-1.5 w-8 overflow-hidden rounded-full bg-surface-secondary/60">
                            <span className="absolute inset-y-0 w-1/2 bg-accent/40 animate-[shimmer_1.2s_infinite]" />
                          </span>
                          <span>Analyzing...</span>
                        </div>
                        ) : (
                          msg.content
                        )}
                      </div>
                    ))}

                    <div ref={chatEndRef} />
                  </div>
                </ScrollArea>

                <div className="p-5 border-t border-glass-border">
                  <div className="flex gap-3">
                    <Textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Ask a question..."
                      // Styling the Textarea to fit the glass theme
                      className="resize-none min-h-[60px] text-body-sm bg-glass-surface/70 border-glass-border focus-visible:ring-accent"
                      disabled={isAILoading}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim() || isAILoading}
                      className="shrink-0 bg-accent hover:bg-accent-hover text-content-inverse rounded-xl px-4 text-body-sm font-semibold disabled:opacity-60"
                    >
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// GAME CARD COMPONENT - ESSENCE v3.1 Unified Interaction (Iconless)
// ============================================================================

interface GameCardProps {
  game: GameData;
  selectedBook: string;
  onAnalyze?: (game: GameData) => void;
  onBetClick?: (gameId: string, betType: string, team: "away" | "home" | "over" | "under", odds: MarketData) => void;
}

export const GameCard = React.memo(({ game, selectedBook, onAnalyze, onBetClick }: GameCardProps) => {
  const { id, status, awayTeam, homeTeam, awayRecord, homeRecord, time, odds: allOdds, league } = game;
  const [showPickModal, setShowPickModal] = useState(false);
  const { toast } = useToast();
  const awayTeamName = awayTeam;
  const homeTeamName = homeTeam;

  const pickData = game.pick;

  // State calculations (Logic unchanged)
  const isLive = status === "Live";
  const isFinal = status === "Final";
  const isConcluded = isFinal || status === "Canceled" || status === "Postponed";

  const scores = useMemo(
    () => ({
      away: parseInt(game.awayScore || "0", 10) || 0,
      home: parseInt(game.homeScore || "0", 10) || 0,
    }),
    [game.awayScore, game.homeScore],
  );

  const showScores = isLive || isFinal;

  const winner = useMemo(() => {
    if (!isFinal) return null;
    if (scores.away > scores.home) return "away";
    if (scores.home > scores.away) return "home";
    return "tie";
  }, [isFinal, scores]);

  const odds = useMemo(() => {
    return allOdds[selectedBook] || allOdds.generic || null;
  }, [allOdds, selectedBook]);

  const processedOdds = useMemo(() => {
    if (!odds) return null;
    const awayPL = parseLine(odds.awayPL);
    const homePL = parseLine(odds.homePL);
    const total = odds.total && odds.total !== "N/A" && odds.total !== "-" ? odds.total.trim() : "-";
    const awayML = parseInt(odds.awayML, 10) || 0;
    const homeML = parseInt(odds.homeML, 10) || 0;
    let mlFavorite: "away" | "home" | null = null;

    if (awayML !== 0 && homeML !== 0 && awayML !== homeML) {
      if (awayML < homeML) mlFavorite = "away";
      else if (homeML < awayML) mlFavorite = "home";
    }

    return { ...odds, awayPL, homePL, total, mlFavorite, movement: {} as any };
  }, [odds]);

  const hasOdds = processedOdds !== null;
  const boardLocked = isConcluded || !hasOdds;

  const spreadLabel = league === "NHL" ? "Puck Line" : "Spread";

  // Handlers (Logic unchanged)
  const handleAnalyzeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onAnalyze) onAnalyze(game);
    },
    [onAnalyze, game],
  );

  const handleBet = useCallback(
    (type: string, team: "away" | "home" | "over" | "under") => {
      if (onBetClick && odds && !boardLocked) onBetClick(id, type, team, odds);
    },
    [onBetClick, id, odds, boardLocked],
  );

  const handleOpenBreakdown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (boardLocked) {
        toast({
          title: "Markets Closed",
          description: "No analysis available for concluded games.",
          variant: "destructive",
        });
        return;
      }
      setShowPickModal(true);
    },
    [boardLocked, toast],
  );

  return (
    <article
      className="relative overflow-hidden mb-4 rounded-2xl border border-glass-border group/card transition-all duration-250 ease-standard hover:shadow-xl shadow-lg backdrop-blur-xl bg-glass-surface backdrop-saturate-default motion-safe:hover:scale-[1.005]"
      style={{ willChange: "transform" }}
    >
      <div
        className="absolute inset-0 bg-gradient-to-br from-accent/0 via-accent/0 to-accent/5 opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 pointer-events-none"
        aria-hidden="true"
      />

      <div className="flex flex-col md:flex-row relative z-10">
        {/* Game Information Section */}
            {/* ... (GameCard implementation continues unchanged) ... */}
        <div className="flex-1 p-6 relative">
          {!isConcluded && (
            <div className="absolute top-6 right-6 z-10">
              <StatusBadge status={status} time={time} />
            </div>
          )}

          <div className="flex flex-col justify-center h-full gap-6 pt-8 md:pt-0" role="grid">
            {/* Away Team Row */}
            <div className="flex items-center justify-between" role="row">
              <div className="flex items-center gap-4" role="gridcell">
                <TeamLogo teamAbbr={awayTeam} teamName={awayTeamName} league={league} />
                <div className="flex flex-col">
                  <span
                    className={cn(
                      "text-title-3 font-bold tracking-tight transition-colors duration-300",
                      winner === "home" ? "text-content-secondary opacity-70" : "text-content-primary",
                    )}
                  >
                    {awayTeam}
                  </span>
                  {awayRecord && (
                    <span className="text-caption-1 font-semibold text-content-secondary tracking-wide">
                      {awayRecord}
                    </span>
                  )}
                </div>
              </div>
              {showScores && (
                <span
                  className={cn(
                    "text-large-title font-mono font-bold tabular-nums transition-colors duration-300",
                    winner === "home" ? "text-content-secondary opacity-50" : "text-content-primary",
                  )}
                  role="gridcell"
                >
                  {scores.away}
                </span>
              )}
            </div>

            <div className="w-full h-px bg-glass-border" aria-hidden="true" />

            {/* Home Team Row */}
            <div className="flex items-center justify-between" role="row">
              <div className="flex items-center gap-4" role="gridcell">
                <TeamLogo teamAbbr={homeTeam} teamName={homeTeamName} league={league} />
                <div className="flex flex-col">
                  <span
                    className={cn(
                      "text-title-3 font-bold tracking-tight transition-colors duration-300",
                      winner === "away" ? "text-content-secondary opacity-70" : "text-content-primary",
                    )}
                  >
                    {homeTeam}
                  </span>
                  {homeRecord && (
                    <span className="text-caption-1 font-semibold text-content-secondary tracking-wide">
                      {homeRecord}
                    </span>
                  )}
                </div>
              </div>
              {showScores && (
                <span
                  className={cn(
                    "text-large-title font-mono font-bold tabular-nums transition-colors duration-300",
                    winner === "away" ? "text-content-secondary opacity-50" : "text-content-primary",
                  )}
                  role="gridcell"
                >
                  {scores.home}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons (Hidden until hover) */}
          {!isConcluded && (
            // Increased gap to 3 for better spacing
            <div className="absolute bottom-6 right-6 flex gap-3 opacity-0 motion-safe:translate-y-3 group-hover/card:opacity-100 group-hover/card:motion-safe:translate-y-0 transition-all duration-400 ease-decelerate focus-within:opacity-100 focus-within:translate-y-0">
              {/* Analyze Button */}
              {onAnalyze && (
                <button
                  onClick={handleAnalyzeClick}
                  className="bg-glass-surface backdrop-blur-lg border border-glass-border hover:shadow-md text-content-primary px-5 py-3 rounded-xl flex items-center gap-2.5 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:hover:scale-105 active:scale-95 transition-all duration-150 ease-standard"
                >
                  <span className="text-caption-1 font-semibold uppercase tracking-widest text-content-secondary">
                    Edge Scan
                  </span>
                  <span className="text-body-sm font-bold">Analyze</span>
                </button>
              )}

              {/* Unified Edge & Breakdown Button (Premium Aesthetic) */}
              {pickData && (
                <button
                  onClick={handleOpenBreakdown}
                  disabled={boardLocked}
                  className="group/edgebutton bg-accent hover:bg-accent-hover text-content-inverse px-5 py-3 rounded-xl shadow-lg hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary motion-safe:hover:scale-105 active:scale-95 transition-all duration-150 ease-standard disabled:opacity-50 disabled:pointer-events-none flex items-center gap-4 backdrop-saturate-150"
                >
                  {/* Edge visualization */}
                  <div className="flex flex-col items-start">
                    <span className="text-caption-2 uppercase tracking-wider font-semibold text-content-inverse/70">
                      Edge
                    </span>
                    <span className="text-body font-bold font-mono">{pickData.confidence_score}%</span>
                  </div>

                  <div className="h-6 w-px bg-content-inverse/30" aria-hidden="true" />

                  {/* The Pick */}
                  <div className="flex flex-col items-start">
                    <span className="text-caption-2 uppercase tracking-wider font-semibold text-content-inverse/70">
                      Pick
                    </span>
                    <span className="text-body font-bold">{pickData.pick_side}</span>
                  </div>

                  {/* Subtle Indicator for interaction */}
                  <span className="ml-2 text-caption-2 font-semibold tracking-wider text-content-inverse/70 group-hover/edgebutton:text-content-inverse transition-transform duration-200 ease-standard group-hover/edgebutton:translate-x-1">
                    VIEW
                  </span>
                </button>
              )}

              {/* No Edge Available (Only shown if no analysis button either, adjusted logic slightly) */}
              {!pickData && !boardLocked && !onAnalyze && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-glass-surface/30 border border-border/30">
                  <span className="text-body-sm text-content-secondary">No edge identified</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Odds Board Section */}
        <div className="relative bg-surface-secondary/30 p-6 md:w-[380px] flex flex-col justify-center border-t md:border-t-0 md:border-l border-glass-border">
          {/* Locked Board Overlay */}
          {boardLocked && (
            <div className="absolute inset-0 bg-surface-primary/50 backdrop-blur-sm z-20 flex items-center justify-center flex-col gap-3 px-6">
              <div className="px-3 py-1 rounded-full border border-content-secondary/40 text-caption-2 font-semibold uppercase tracking-widest text-content-secondary">
                Markets Locked
              </div>
              {isConcluded ? (
                <div className="text-center space-y-2">
                  <p className="text-caption-1 font-bold text-accent uppercase tracking-wider">Final Score</p>
                  <p className="text-body font-semibold text-content-primary">
                    {awayTeam} {scores.away} - {homeTeam} {scores.home}
                  </p>
                  {winner && winner !== "tie" && processedOdds?.awayPL.line !== "-" && (
                    <p className="text-caption-2 text-content-secondary">
                      {winner === "away" ? awayTeam : homeTeam} covered the{" "}
                      {winner === "away" ? processedOdds.awayPL.line : processedOdds.homePL.line} spread
                    </p>
                  )}
                  {processedOdds && (
                    <div className="pt-2 border-t border-glass-border/30 mt-2 space-y-0.5">
                      <p className="text-caption-2 font-semibold text-content-tertiary uppercase tracking-wider">
                        Closing Line
                      </p>
                      <div className="flex gap-3 justify-center text-caption-2 text-content-secondary font-mono">
                        {processedOdds.awayPL.line !== "-" && (
                          <span>
                            {spreadLabel}: {processedOdds.awayPL.line}/{processedOdds.homePL.line}
                          </span>
                        )}
                        {processedOdds.total !== "-" && <span>O/U: {processedOdds.total}</span>}
                        {processedOdds.awayML && processedOdds.homeML && (
                          <span>
                            ML: {processedOdds.awayML}/{processedOdds.homeML}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-body-sm font-semibold text-content-secondary">Market Data Unavailable</p>
              )}
            </div>
          )}

          <div role="grid">
            {/* Headers */}
            <div className="grid grid-cols-3 gap-3 mb-4 px-1" role="row">
              <span
                className="text-caption-2 font-extrabold text-content-tertiary uppercase tracking-widest text-center"
                role="columnheader"
              >
                {spreadLabel}
              </span>
              <span
                className="text-caption-2 font-extrabold text-content-tertiary uppercase tracking-widest text-center"
                role="columnheader"
              >
                Total
              </span>
              <span
                className="text-caption-2 font-extrabold text-content-tertiary uppercase tracking-widest text-center"
                role="columnheader"
              >
                Moneyline
              </span>
            </div>

            {/* Away Odds Row */}
            <div className="grid grid-cols-3 gap-3 mb-3" role="row">
              <OddsCell
                label={`${awayTeamName} Spread`}
                main={processedOdds?.awayPL.line || "-"}
                sub={processedOdds?.awayPL.juice}
                isDisabled={boardLocked}
                onClick={onBetClick ? () => handleBet("PL", "away") : undefined}
              />
              <OddsCell
                label={`Over ${processedOdds?.total || ""}`}
                main={processedOdds?.total !== "-" ? `O ${processedOdds?.total}` : "-"}
                sub={processedOdds?.overOdds}
                isDisabled={boardLocked}
                onClick={onBetClick ? () => handleBet("Total", "over") : undefined}
              />
              <OddsCell
                label={`${awayTeamName} Moneyline`}
                main={processedOdds?.awayML || "-"}
                isFavorite={hasOdds && processedOdds?.mlFavorite === "away"}
                isDisabled={boardLocked}
                onClick={onBetClick ? () => handleBet("ML", "away") : undefined}
              />
            </div>

            {/* Home Odds Row */}
            <div className="grid grid-cols-3 gap-3" role="row">
              <OddsCell
                label={`${homeTeamName} Spread`}
                main={processedOdds?.homePL.line || "-"}
                sub={processedOdds?.homePL.juice}
                isDisabled={boardLocked}
                onClick={onBetClick ? () => handleBet("PL", "home") : undefined}
              />
              <OddsCell
                label={`Under ${processedOdds?.total || ""}`}
                main={processedOdds?.total !== "-" ? `U ${processedOdds?.total}` : "-"}
                sub={processedOdds?.underOdds}
                isDisabled={boardLocked}
                onClick={onBetClick ? () => handleBet("Total", "under") : undefined}
              />
              <OddsCell
                label={`${homeTeamName} Moneyline`}
                main={processedOdds?.homeML || "-"}
                isFavorite={hasOdds && processedOdds?.mlFavorite === "home"}
                isDisabled={boardLocked}
                onClick={onBetClick ? () => handleBet("ML", "home") : undefined}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Pick Detail Modal (Portal) */}
      {pickData && (
        <PickDetailModal pick={pickData} game={game} isOpen={showPickModal} onClose={() => setShowPickModal(false)} />
      )}
    </article>
  );
});
GameCard.displayName = "GameCard";

// ============================================================================
// PICK DISPLAY COMPONENT - ESSENCE v3.1 Alignment (Iconless)
// ============================================================================

interface PickDisplayProps {
  pick: PickData;
  isLoading?: boolean;
  onClick?: () => void;
}

export const PickDisplay: React.FC<PickDisplayProps> = ({ pick, isLoading = false, onClick }) => {
  if (isLoading) {
    return (
      // ESSENCE Loading State Alignment
      <div className="p-4 rounded-xl bg-glass-surface/50 border border-glass-border animate-pulse">
        <div className="flex items-center justify-between mb-2">
          <div className="h-5 w-24 rounded bg-surface-secondary/50"></div>
          <div className="h-4 w-12 rounded-full bg-surface-secondary/50"></div>
        </div>
        <div className="h-3 w-32 rounded bg-surface-secondary/30"></div>
      </div>
    );
  }

  // ESSENCE Semantic Colors
  const isHigh = pick.confidence_score >= 70;
  const isMedium = pick.confidence_score >= 50 && pick.confidence_score < 70;

  return (
    // ESSENCE Interactive Glass styling
    <button
      onClick={onClick}
      className="w-full p-4 rounded-xl bg-glass-surface/70 border border-glass-border hover:border-content-tertiary/50 hover:bg-glass-surface transition-all duration-200 ease-standard text-left group shadow-sm hover:shadow-md backdrop-blur-md"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          {/* Typography: Title 3 (20px) */}
          <span className="text-title-3 font-bold tracking-tight text-content-primary">{pick.pick_side}</span>
          {/* Typography: Body-sm (14px) Mono */}
          <span className="text-body-sm text-content-secondary font-mono font-medium">
            {pick.odds_at_generation > 0 ? "+" : ""}
            {pick.odds_at_generation}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "px-3 py-1 rounded-full border text-caption-1 font-bold tracking-wide",
              // Updated semantic color usage
              isHigh
                ? "bg-semantic-success/15 border-semantic-success/40 text-semantic-success"
                : isMedium
                  ? "bg-semantic-warning/20 border-semantic-warning/50 text-semantic-warning"
                  : "bg-surface-secondary/50 border-surface-tertiary text-content-secondary",
            )}
          >
            {pick.confidence_score}%
          </div>
          {/* Refined interaction cue */}
          <span className="text-caption-1 font-semibold tracking-wider text-content-tertiary group-hover:text-content-primary transition-all duration-200 ease-standard group-hover:translate-x-0.5">
            VIEW
          </span>
        </div>
      </div>

      {/* Typography: Caption 1 (12px) */}
      <div className="text-caption-1 text-content-secondary group-hover:text-content-primary transition-colors duration-200 ease-standard">
        View detailed analysis
      </div>
    </button>
  );
};
```
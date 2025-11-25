import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Message, League, GameData } from "../types";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { sendMessageToAI } from "../services/nhlAi";

interface ChatContextType {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  activeLeague: League;
  setActiveLeague: (league: League) => void;
  sendMessage: (content: string) => Promise<void>;
  analyzeGame: (game: GameData) => void;
  clearMessages: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeLeague, setActiveLeague] = useState<League>("NHL");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  // Load History
  useEffect(() => {
    let isActive = true;

    const loadHistory = async () => {
      if (!user) {
        setIsHydrating(false);
        return;
      }

      setIsHydrating(true);
      setMessages([]);
      setConversationId(null);

      try {
        const { data: convs, error: convError } = await supabase
          .from("ai_conversations")
          .select("id")
          .eq("user_id", user.id)
          .eq("title", `${activeLeague} Analysis`)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (convError) throw convError;
        if (!isActive) return;

        if (convs && convs.length > 0) {
          const cId = convs[0].id;
          setConversationId(cId);

          const { data: msgs, error: msgError } = await supabase
            .from("ai_messages")
            .select("id, role, content, created_at")
            .eq("conversation_id", cId)
            .order("created_at", { ascending: true });

          if (msgError) throw msgError;
          if (!isActive) return;

          if (msgs) {
            const formattedMsgs: Message[] = msgs.map((m) => ({
              id: String(m.id),
              role: (m.role === "user" ? "user" : "model") as "user" | "model",
              content: m.content,
              timestamp: new Date(m.created_at).getTime(),
              status: "complete",
            }));
            setMessages(formattedMsgs);
          }
        }
      } catch (err) {
        console.error("HistoryHydration Error", err);
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

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading || isHydrating || !user) return;

      setIsLoading(true);

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
        content: "",
        timestamp: Date.now(),
        status: "processing",
      };

      let historySnapshot: Message[] = [];
      setMessages((prev) => {
        historySnapshot = [...prev];
        return [...prev, userMsg, streamingAiMsg];
      });

      let fullResponseText = "";
      let streamInitialized = false;
      let currentConvId = conversationId;

      try {
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

          if (convError || !newConv) throw new Error("Failed to establish conversation session.");
          currentConvId = newConv.id;
          setConversationId(currentConvId);
        }

        if (currentConvId) {
          supabase
            .from("ai_messages")
            .insert({
              conversation_id: currentConvId,
              role: "user",
              content: content,
            })
            .then(({ error }) => {
              if (error) console.error("PersistUserMessage Error", error);
            });
        }

        const handleChunk = (chunk: string) => {
          if (!streamInitialized) {
            setIsStreaming(true);
            streamInitialized = true;
          }
          fullResponseText += chunk;
          setMessages((prev) =>
            prev.map((msg) => (msg.id === streamingAiMsgId ? { ...msg, content: fullResponseText } : msg)),
          );
        };

        await sendMessageToAI(content, historySnapshot, activeLeague, handleChunk);

        setIsStreaming(false);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingAiMsgId ? { ...msg, status: "complete", timestamp: Date.now() } : msg,
          ),
        );

        if (currentConvId && fullResponseText) {
          supabase
            .from("ai_messages")
            .insert({
              conversation_id: currentConvId,
              role: "assistant",
              content: fullResponseText,
              model: "gemini-3-pro-preview",
            })
            .then(({ error }) => {
              if (error) console.error("PersistAIMessage Error", error);
            });
        }
      } catch (error) {
        console.error("MessagePipelineStreamError", error);
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === streamingAiMsgId) {
              return {
                ...msg,
                content:
                  msg.content +
                  `\n\n[System Error: ${error instanceof Error ? error.message : "The stream was interrupted."}]`,
                status: "error",
                isError: true,
                timestamp: Date.now(),
              };
            }
            return msg;
          }),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, conversationId, user, activeLeague, isHydrating],
  );

  const analyzeGame = useCallback(
    (game: GameData) => {
      const prompt = `Provide a sharp analysis for ${game.awayTeam} @ ${game.homeTeam}. Focus on advanced metrics (DVOA/EPA/xG), market movement, and identify the best spread/total/prop positions.`;
      sendMessage(prompt);
    },
    [sendMessage],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return (
    <ChatContext.Provider
      value={{
        messages,
        isLoading,
        isStreaming,
        activeLeague,
        setActiveLeague,
        sendMessage,
        analyzeGame,
        clearMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

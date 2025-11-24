import React, { useState, useRef, useEffect } from 'react';
import { PickData, GameData } from '../types';
import { Clock, TrendingUp, DollarSign, MessageSquare, Send, X, BarChart3, Target } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

interface PickDetailModalProps {
  pick: PickData;
  game: GameData;
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

// Calculate EV% from confidence score and odds
const calculateEV = (confidence: number, odds: number): number => {
  const probability = confidence / 100;
  const impliedOdds = odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
  return ((probability * (odds > 0 ? odds / 100 + 1 : 100 / Math.abs(odds) + 1)) - 1) * 100;
};

// Calculate fair line from confidence
const calculateFairLine = (confidence: number): number => {
  const probability = confidence / 100;
  if (probability > 0.5) {
    return -Math.round((probability / (1 - probability)) * 100);
  } else {
    return Math.round(((1 - probability) / probability) * 100);
  }
};

export const PickDetailModal: React.FC<PickDetailModalProps> = ({ 
  pick, 
  game,
  isOpen, 
  onClose,
}) => {
  const [showAIChat, setShowAIChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isHigh = pick.confidence_score >= 70;
  const isMedium = pick.confidence_score >= 50 && pick.confidence_score < 70;
  
  const ev = calculateEV(pick.confidence_score, pick.odds_at_generation);
  const fairLine = calculateFairLine(pick.confidence_score);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isAILoading) return;

    const userMsg: ChatMessage = { role: 'user', content: inputMessage };
    setChatMessages(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsAILoading(true);

    try {
      // Build messages array with system context and conversation history
      const messagesArray = [
        {
          role: 'system',
          content: `You are analyzing a ${game.league} betting pick for ${game.awayTeam} @ ${game.homeTeam}. 
Pick: ${pick.pick_side} at ${pick.odds_at_generation > 0 ? '+' : ''}${pick.odds_at_generation}
Confidence: ${pick.confidence_score}%
Reasoning: ${pick.reasoning_text}

Answer questions about this pick concisely and helpfully.`
        },
        ...chatMessages.map(msg => ({ 
          role: msg.role, 
          content: msg.content 
        })),
        { role: 'user', content: inputMessage }
      ];

      console.log('Sending request with payload:', JSON.stringify({ messages: messagesArray }, null, 2));

      const { data, error } = await supabase.functions.invoke('ai-chat-router', {
        body: JSON.parse(JSON.stringify({ messages: messagesArray }))
      });

      console.log('Response from ai-chat-router:', { data, error });

      if (error) {
        console.error('Function invocation error:', error);
        throw error;
      }

      console.log('AI Router full response type:', typeof data, data);
      
      let responseText = '';
      
      if (!data) {
        throw new Error('No response data received');
      }
      
      // Parse SSE stream if it's a Response object
      if (data instanceof Response) {
        const text = await data.text();
        console.log('Raw SSE response:', text);
        
        // Parse SSE format: extract text from "event: text" lines
        const lines = text.split('\n');
        const textChunks: string[] = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('event: text')) {
            // Next line should be the data
            const nextLine = lines[i + 1]?.trim();
            if (nextLine?.startsWith('data: ')) {
              textChunks.push(nextLine.substring(6)); // Remove "data: " prefix
            }
          }
        }
        
        responseText = textChunks.join('');
      } else if (typeof data === 'string') {
        responseText = data;
      } else if (data && typeof data === 'object') {
        responseText = data.response || data.content || data.text || JSON.stringify(data);
      }

      const assistantMsg: ChatMessage = { 
        role: 'assistant', 
        content: responseText || 'Sorry, I encountered an error.'
      };
      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error('AI chat error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${errorMsg}`
      }]);
    } finally {
      setIsAILoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] bg-card border-border backdrop-blur-xl p-0 overflow-hidden">
        <div className="flex flex-col h-full max-h-[85vh]">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground flex items-center justify-between">
              <div>
                <div className="text-2xl">{game.awayTeam} @ {game.homeTeam}</div>
                <div className="text-sm font-normal text-muted-foreground mt-1">
                  {game.league} • {game.time}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAIChat(!showAIChat)}
                className={cn(
                  "gap-2",
                  showAIChat && "bg-accent/10 text-accent"
                )}
              >
                <MessageSquare size={16} />
                {showAIChat ? 'Hide Analysis' : 'AI Analysis'}
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex">
            {/* Main Content */}
            <ScrollArea className={cn(
              "flex-1 p-6",
              showAIChat && "lg:w-2/3"
            )}>
              {/* Pick Summary */}
              <div className="flex items-center justify-between pb-6 mb-6 border-b border-border">
                <div>
                  <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">
                    Recommended Pick
                  </div>
                  <div className="text-4xl font-bold tracking-tight text-foreground mb-1">
                    {pick.pick_side}
                  </div>
                  <div className="text-lg text-muted-foreground font-mono">
                    {pick.odds_at_generation > 0 ? '+' : ''}{pick.odds_at_generation}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">
                    Edge
                  </div>
                  <div className={cn(
                    "text-4xl font-bold tracking-tight",
                    isHigh ? "text-green-500" :
                    isMedium ? "text-yellow-500" :
                    "text-muted-foreground"
                  )}>
                    {pick.confidence_score}%
                  </div>
                </div>
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-muted/30 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 size={16} className="text-accent" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      Expected Value
                    </span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-foreground">
                    {ev >= 0 ? '+' : ''}{ev.toFixed(1)}%
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-muted/30 border border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <Target size={16} className="text-accent" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                      Fair Line
                    </span>
                  </div>
                  <div className="text-2xl font-bold font-mono text-foreground">
                    {fairLine > 0 ? '+' : ''}{fairLine}
                  </div>
                </div>
              </div>

              {/* Staking Recommendations */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign size={16} className="text-accent" />
                  <span className="text-sm font-semibold text-foreground uppercase tracking-wider">
                    Staking Bands
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                    <span className="text-sm font-medium text-foreground">Conservative (1-2% bankroll)</span>
                    <span className="text-xs text-green-500 font-semibold">RECOMMENDED</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/20 border border-border">
                    <span className="text-sm font-medium text-muted-foreground">Moderate (2-3% bankroll)</span>
                    <span className="text-xs text-muted-foreground">If confident</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/20 border border-border">
                    <span className="text-sm font-medium text-muted-foreground">Aggressive (3-5% bankroll)</span>
                    <span className="text-xs text-muted-foreground">High risk</span>
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div>
                <div className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-semibold">
                  Analysis
                </div>
                <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {pick.reasoning_text}
                </div>
              </div>

              {/* Timestamp */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-6 mt-6 border-t border-border">
                <Clock size={12} strokeWidth={2} />
                <span>Generated {new Date(pick.created_at).toLocaleString()}</span>
              </div>
            </ScrollArea>

            {/* AI Chat Panel */}
            {showAIChat && (
              <div className="w-full lg:w-1/3 border-l border-border flex flex-col bg-muted/20">
                <div className="p-4 border-b border-border">
                  <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <MessageSquare size={16} className="text-accent" />
                    Ask About This Pick
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Get deeper insights or explore alternate angles
                  </p>
                </div>

                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {chatMessages.length === 0 && (
                      <div className="text-center text-sm text-muted-foreground py-8">
                        Start a conversation about this pick
                      </div>
                    )}
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "p-3 rounded-lg text-sm",
                          msg.role === 'user'
                            ? "bg-accent text-white ml-8"
                            : "bg-muted text-foreground mr-8"
                        )}
                      >
                        {msg.content}
                      </div>
                    ))}
                    {isAILoading && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted text-muted-foreground">
                        <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                        <div className="w-2 h-2 rounded-full bg-accent animate-pulse [animation-delay:0.2s]" />
                        <div className="w-2 h-2 rounded-full bg-accent animate-pulse [animation-delay:0.4s]" />
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </ScrollArea>

                <div className="p-4 border-t border-border">
                  <div className="flex gap-2">
                    <Textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Ask about this pick..."
                      className="resize-none min-h-[60px] text-sm"
                      disabled={isAILoading}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!inputMessage.trim() || isAILoading}
                      size="icon"
                      className="shrink-0"
                    >
                      <Send size={16} />
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
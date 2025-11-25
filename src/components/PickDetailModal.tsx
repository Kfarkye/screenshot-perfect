import React, { useState, useMemo, useCallback, useEffect, useRef, type FC } from 'react';
import { PickData, GameData } from '../types';
import { Clock, DollarSign, Send, BarChart3, Target, Brain, Loader2, AlertTriangle, RefreshCw, LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { useStreamingAIChat, type Message } from '@/hooks/useStreamingAIChat';
import { calculateEV, calculateFairLine } from '@/utils/bettingMath';
import { cn } from '@/lib/utils';

interface PickDetailModalProps {
  pick: PickData;
  game: GameData;
  isOpen: boolean;
  onClose: () => void;
}

interface MetricCardProps {
  icon: LucideIcon;
  title: string;
  value: string;
  valueClassName?: string;
}

const MetricCard = React.memo<MetricCardProps>(({ icon: Icon, title, value, valueClassName }) => (
  <div className="p-4 rounded-xl bg-muted/40 border border-border shadow-sm transition-colors hover:bg-muted/60">
    <div className="flex items-center gap-2 mb-2">
      <Icon size={18} className="text-accent" />
      <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
        {title}
      </span>
    </div>
    <div className={cn("text-3xl font-bold font-mono", valueClassName)}>
      {value}
    </div>
  </div>
));
MetricCard.displayName = 'MetricCard';

const StakingBands = React.memo(() => (
  <div className="mb-6">
    <div className="flex items-center gap-2 mb-3">
      <DollarSign size={18} className="text-accent" />
      <span className="text-sm font-semibold text-foreground uppercase tracking-wider">
        Staking Strategy
      </span>
    </div>
    <div className="space-y-2">
      <div className="flex justify-between items-center p-3 rounded-lg bg-green-500/10 border border-green-500/40 shadow-sm">
        <span className="text-sm font-medium text-foreground">Conservative (1-2% bankroll)</span>
        <span className="text-xs text-green-500 font-semibold">RECOMMENDED</span>
      </div>
      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/40 border border-border opacity-70">
        <span className="text-sm font-medium text-muted-foreground">Moderate (2-3% bankroll)</span>
        <span className="text-xs text-muted-foreground">Higher Confidence</span>
      </div>
      <div className="flex justify-between items-center p-3 rounded-lg bg-muted/40 border border-border opacity-50">
        <span className="text-sm font-medium text-muted-foreground">Aggressive (3-5% bankroll)</span>
        <span className="text-xs text-muted-foreground">High Risk</span>
      </div>
    </div>
  </div>
));
StakingBands.displayName = 'StakingBands';

const ChatBubble: React.FC<{ message: Message | { content: string, role: 'stream' } }> = React.memo(({ message }) => (
  <div
    className={cn(
      "p-3 rounded-xl text-sm whitespace-pre-wrap transition-all duration-150",
      message.role === 'user' && "bg-primary text-primary-foreground ml-8 self-end shadow-md",
      (message.role === 'assistant' || message.role === 'stream') && "bg-muted text-foreground mr-8 self-start shadow-sm border border-border"
    )}
  >
    {message.content}
    {message.role === 'stream' && <span className="inline-block w-1.5 h-4 bg-accent ml-1 align-text-bottom animate-pulse"/>}
  </div>
));
ChatBubble.displayName = 'ChatBubble';

interface AIChatPanelProps {
  game: GameData;
  pick: PickData;
}

const AIChatPanel: React.FC<AIChatPanelProps> = ({ game, pick }) => {
  const { messages, isLoading, isStreaming, sendMessage, clear } = useStreamingAIChat();
  const [inputMessage, setInputMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(() => {
    if (inputMessage.trim() && !isLoading) {
      sendMessage(inputMessage);
      setInputMessage('');
    }
  }, [inputMessage, sendMessage, isLoading]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="w-full lg:w-1/3 border-l border-border flex flex-col bg-card/95 shadow-inner h-full">
      <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-center shrink-0">
        <h3 className="font-semibold text-md text-foreground flex items-center gap-2">
          <Brain size={18} className="text-accent" />
          AI Analyst Chat
        </h3>
        <Button variant="ghost" size="icon" onClick={clear} disabled={isLoading} title="Reset Chat" className="h-8 w-8">
          <RefreshCw size={14}/>
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12 px-4">
              <Brain size={32} className="mx-auto mb-4 text-accent/50" />
              <p>Ask me anything about the {game.awayTeam} vs {game.homeTeam} analysis.</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}

          {isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-muted text-foreground mr-8 self-start">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
            </div>
          )}

          {isLoading && messages.length === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-muted text-muted-foreground mr-8 self-start">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              <span className="text-sm">Analyzing...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border bg-muted/30 shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up question..."
            className="resize-none text-sm bg-card focus-visible:ring-accent transition-shadow flex-1"
            rows={1}
            disabled={isLoading}
            aria-label="Chat input"
          />
          <Button
            onClick={handleSubmit}
            disabled={!inputMessage.trim() || isLoading}
            size="icon"
            className="shrink-0 bg-accent hover:bg-accent/90 transition-colors"
            aria-label="Send message"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export const PickDetailModal: React.FC<PickDetailModalProps> = ({
  pick,
  game,
  isOpen,
  onClose,
}) => {
  const [showAIChat, setShowAIChat] = useState(false);

  const { ev, fairLine, confidenceStyle } = useMemo(() => {
    const ev = calculateEV(pick.confidence_score, pick.odds_at_generation);
    const fairLine = calculateFairLine(pick.confidence_score);
    
    let confidenceStyle = "text-muted-foreground";
    if (pick.confidence_score >= 70) {
      confidenceStyle = "text-green-500 drop-shadow-sm";
    } else if (pick.confidence_score >= 50) {
      confidenceStyle = "text-yellow-500";
    }

    return { ev, fairLine, confidenceStyle };
  }, [pick.confidence_score, pick.odds_at_generation]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setShowAIChat(false);
      onClose();
    }
  };

  const formattedEV = `${ev >= 0 ? '+' : ''}${ev.toFixed(2)}%`;
  const evColor = ev > 0 ? 'text-green-500' : ev < 0 ? 'text-red-500' : 'text-foreground';
  const formattedFairLine = isFinite(fairLine) ? `${fairLine > 0 ? '+' : ''}${fairLine}` : 'N/A';

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl w-[95%] h-[90vh] max-h-[90vh] bg-card border-border backdrop-blur-sm shadow-2xl p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border bg-card sticky top-0 z-10 shrink-0">
          <DialogTitle className="text-foreground flex items-center justify-between">
            <div>
              <div className="text-2xl font-bold tracking-tight">{game.awayTeam} @ {game.homeTeam}</div>
              <div className="text-sm font-normal text-muted-foreground mt-1">
                {game.league} • {game.time}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAIChat(!showAIChat)}
              className={cn(
                "gap-2 transition-colors duration-200",
                showAIChat ? "bg-accent/15 text-accent border-accent/50 hover:bg-accent/20" : "hover:bg-muted"
              )}
              aria-pressed={showAIChat}
            >
              <Brain size={16} />
              {showAIChat ? 'Hide Analyst' : 'Ask AI Analyst'}
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex transition-all duration-300 ease-in-out">
          <div className={cn(
            "transition-all duration-300 ease-in-out overflow-hidden",
            showAIChat ? "w-full lg:w-2/3" : "w-full"
          )}>
            <ScrollArea className="h-full">
              <div className='p-6'>
                <div className="flex flex-wrap items-center justify-between pb-6 mb-6 border-b border-border gap-4">
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
                      Model Confidence
                    </div>
                    <div className={cn("text-5xl font-bold tracking-tight", confidenceStyle)}>
                      {pick.confidence_score}%
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <MetricCard
                    icon={BarChart3}
                    title="Expected Value (EV%)"
                    value={formattedEV}
                    valueClassName={evColor}
                  />
                  <MetricCard
                    icon={Target}
                    title="Fair Line (Model Price)"
                    value={formattedFairLine}
                    valueClassName='text-foreground'
                  />
                </div>

                <StakingBands />

                <div className="mb-6">
                  <div className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
                    Core Analysis Rationale
                  </div>
                  <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap p-4 bg-muted/30 rounded-lg border border-border">
                    {pick.reasoning_text || "No detailed analysis provided."}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-4 mt-4 border-t border-border">
                  <Clock size={12} strokeWidth={2} />
                  <span>Pick Generated: {new Date(pick.created_at).toLocaleString()}. Odds may shift.</span>
                </div>
              </div>
            </ScrollArea>
          </div>

          {showAIChat && (
            <AIChatPanel key={`${game.id}-${pick.created_at}`} game={game} pick={pick} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

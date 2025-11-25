import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User } from 'lucide-react';
import type { Message } from '../types';

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up-fade`}>
      <div className={`flex max-w-[90%] md:max-w-[80%] gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

        {/* Avatar */}
        <div className={`
          flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm
          ${isUser
            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
            : isError
              ? 'bg-red-500/10 text-red-500 border border-red-500/20'
              : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}
        `}>
          {isUser ? <User size={16} /> : <Bot size={16} />}
        </div>

        {/* Message Bubble */}
        <div className={`
          flex flex-col
          ${isUser ? 'items-end' : 'items-start'}
        `}>
          <div className={`
            px-5 py-3.5 rounded-2xl shadow-sm backdrop-blur-sm border
            ${isUser
              ? 'bg-blue-600 text-white border-blue-500/50 rounded-tr-sm'
              : isError
                ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30 text-red-800 dark:text-red-200 rounded-tl-sm'
                : 'bg-white/80 dark:bg-gray-900/60 border-gray-200/50 dark:border-white/10 text-foreground rounded-tl-sm'}
          `}>
            {isUser ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none
                prose-headings:font-bold prose-headings:tracking-tight
                prose-h3:text-sm prose-h3:uppercase prose-h3:tracking-wider prose-h3:text-muted-foreground prose-h3:mb-2
                prose-h4:text-base prose-h4:text-foreground prose-h4:mb-1
                prose-p:leading-relaxed prose-p:text-foreground/90
                prose-strong:font-semibold prose-strong:text-foreground
                prose-ul:pl-4 prose-li:marker:text-emerald-500
                prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
              ">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* Timestamp / Status */}
          <span className="text-[10px] text-muted-foreground mt-1.5 px-1 opacity-60">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};

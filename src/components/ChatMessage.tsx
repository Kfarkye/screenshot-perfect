import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../types';

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full mb-4`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-accent text-white'
            : 'bg-muted text-foreground border border-border'
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="text-sm prose prose-sm dark:prose-invert max-w-none
            prose-headings:font-bold prose-headings:text-foreground
            prose-h2:text-base prose-h2:mt-3 prose-h2:mb-2 prose-h2:border-b prose-h2:border-border prose-h2:pb-1
            prose-h3:text-sm prose-h3:mt-2 prose-h3:mb-1
            prose-p:my-1 prose-p:leading-relaxed
            prose-ul:my-1 prose-ul:list-disc prose-ul:pl-4
            prose-li:my-0.5
            prose-strong:text-foreground prose-strong:font-semibold
            prose-table:w-full prose-table:my-2 prose-table:text-xs
            prose-thead:border-b-2 prose-thead:border-border
            prose-th:px-2 prose-th:py-1.5 prose-th:text-left prose-th:font-semibold prose-th:bg-muted/50
            prose-td:px-2 prose-td:py-1.5 prose-td:border-t prose-td:border-border
            prose-tr:border-b prose-tr:border-border
            [&_table]:border [&_table]:border-border [&_table]:rounded-md [&_table]:overflow-hidden
            prose-code:text-accent prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

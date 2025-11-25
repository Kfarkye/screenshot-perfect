import React, { useState, useRef, useLayoutEffect, useImperativeHandle, forwardRef, useCallback, memo, useEffect } from 'react';
import { ArrowUp, AlertCircle, Sparkles } from 'lucide-react';

const MAX_TEXTAREA_HEIGHT = 120;
const MIN_TEXTAREA_HEIGHT = 52;
const DEFAULT_PLACEHOLDER = "Ask about a matchup, spread analysis, or trend...";
const DISCONNECTED_PLACEHOLDER = "Connection lost. Please wait...";

interface InputAreaProps {
  onSend: (message: string) => Promise<void> | void;
  isLoading: boolean;
  isDisabled?: boolean;
  errorMessage?: string | null;
  instanceId?: string;
}

export interface InputAreaHandle {
  focusInput: () => void;
  clearInput: () => void;
}

const LoadingSpinner = memo(() => (
  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
));
LoadingSpinner.displayName = 'LoadingSpinner';

const SendButton = memo(({ canSubmit, isLoading }: { canSubmit: boolean; isLoading: boolean }) => {
  return (
    <button
      type="submit"
      disabled={!canSubmit}
      className={`
        flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
        ${canSubmit
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-500 hover:scale-105 active:scale-95'
          : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'}
      `}
      aria-label={isLoading ? "Sending..." : "Send Message"}
    >
      {isLoading ? <LoadingSpinner /> : <ArrowUp size={20} strokeWidth={2.5} />}
    </button>
  );
});
SendButton.displayName = 'SendButton';

export const InputArea = memo(forwardRef<InputAreaHandle, InputAreaProps>(({
  onSend,
  isLoading,
  isDisabled = false,
  errorMessage = null,
  instanceId = 'chat-input-area'
}, ref) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const overallDisabledState = isLoading || isDisabled || isSubmitting;
  const canSubmit = input.trim().length > 0 && !overallDisabledState;

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  useLayoutEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const resetInputAndHeight = useCallback(() => {
    setInput('');
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
        adjustHeight();
      }
    });
  }, [adjustHeight]);

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      if (textareaRef.current && !overallDisabledState) {
        textareaRef.current.focus();
      }
    },
    clearInput: resetInputAndHeight
  }), [overallDisabledState, resetInputAndHeight]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const message = input.trim();

    if (!message || overallDisabledState) return;

    setIsSubmitting(true);
    try {
      await onSend(message);
      resetInputAndHeight();
    } catch (error) {
      console.error(`Submission failed:`, error);
      textareaRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  }, [input, overallDisabledState, onSend, resetInputAndHeight]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const placeholderText = isDisabled ? DISCONNECTED_PLACEHOLDER : DEFAULT_PLACEHOLDER;

  return (
    <div className="w-full max-w-3xl mx-auto pb-6">
      <form
        onSubmit={handleSubmit}
        className={`
          relative flex items-end gap-2 p-2 rounded-[26px] border transition-all duration-300
          ${isFocused
            ? 'bg-background/80 border-blue-500/30 ring-4 ring-blue-500/10 shadow-xl shadow-blue-500/5'
            : 'bg-muted/40 border-white/10 hover:border-white/20 hover:bg-muted/60 shadow-lg'}
          backdrop-blur-xl
        `}
      >
        <div className="pl-4 pb-3 text-muted-foreground">
          <Sparkles size={18} className={isFocused ? "text-blue-500" : "opacity-50"} />
        </div>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          disabled={overallDisabledState}
          rows={1}
          className="w-full bg-transparent text-foreground placeholder-muted-foreground/60 text-[15px] px-2 py-3 focus:outline-none resize-none overflow-y-auto font-medium leading-relaxed disabled:cursor-not-allowed"
          style={{
            minHeight: `${MIN_TEXTAREA_HEIGHT}px`,
            maxHeight: `${MAX_TEXTAREA_HEIGHT}px`
          }}
        />

        <SendButton canSubmit={canSubmit} isLoading={isLoading || isSubmitting} />
      </form>

      {errorMessage && (
        <div className="flex items-center gap-2 mt-2 ml-4 text-sm text-red-500 animate-fadeIn">
          <AlertCircle size={14} />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}));

InputArea.displayName = 'InputArea';
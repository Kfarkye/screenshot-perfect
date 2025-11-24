import React, { useState, useRef, useLayoutEffect, useImperativeHandle, forwardRef, useCallback, memo, useEffect } from 'react';
import { ArrowUp, AlertCircle } from 'lucide-react';

// --- Configuration Constants (Vercel/Linear Rigor) ---

const MAX_TEXTAREA_HEIGHT = 120; // Pixels (Approx 5-6 lines)
const MIN_TEXTAREA_HEIGHT = 52;  // Pixels (Initial single-line height)
const DEFAULT_PLACEHOLDER = "Ask about a matchup, spread analysis, or trend...";
const DISCONNECTED_PLACEHOLDER = "Connection lost. Please wait...";
// Apple's standard dynamic animation curve for fluid, responsive interfaces (Jony Ive level polish)
const APPLE_DYNAMIC_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

// --- Interfaces ---

// Enhanced props for resilience, observability, and advanced UX
interface InputAreaProps {
  // Allow async onSend for robust submission handling (Stripe-grade UX)
  onSend: (message: string) => Promise<void> | void;
  // Indicates if the system is actively processing the previous message
  isLoading: boolean;
  // Indicates if the input should be disabled (e.g., connection loss)
  isDisabled?: boolean;
  // Displays specific error feedback below the input
  errorMessage?: string | null;
  // Unique ID for observability and ARIA linking
  instanceId?: string;
}

export interface InputAreaHandle {
  focusInput: () => void;
  clearInput: () => void;
}

// --- Utility Hooks ---

/**
 * Hook to detect user preference for reduced motion (A11y).
 * SSR safe and reactive to system changes.
 */
const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Ensure this runs only in the browser environment
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Set initial state
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    // Listen for changes in user preferences
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return prefersReducedMotion;
};


// --- Utility Components (Memoized for performance) ---

const LoadingSpinner = memo(() => (
  <div
    // High-quality, accessible loading spinner. Uses `border-current` to inherit the button's text color.
    className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin motion-reduce:animate-pulse"
    role="status"
    aria-label="Processing"
  >
     <span className="sr-only">Loading...</span>
  </div>
));
LoadingSpinner.displayName = 'LoadingSpinner';

const SendIcon = memo(() => (
  // Jony Ive detail: Slight optical adjustment (`relative top-px`) ensures perfect visual centering
  <ArrowUp size={20} strokeWidth={2.5} aria-hidden="true" focusable="false" className="relative top-px" />
));
SendIcon.displayName = 'SendIcon';

interface SendButtonProps {
    canSubmit: boolean;
    isLoading: boolean;
    prefersReducedMotion: boolean;
}

const SendButton = memo(({ canSubmit, isLoading, prefersReducedMotion }: SendButtonProps) => {
    // Conditionally apply transitions based on user preference (A11y)
    const transitionClasses = prefersReducedMotion
        ? 'transition-none'
        // Duration 500ms with the dynamic curve provides a fluid yet snappy feel
        : `transition-all duration-500 ${APPLE_DYNAMIC_EASING}`;

    // Apple-level interaction: Responsive button with smooth GPU-accelerated animation
    const buttonClasses = `
        flex-shrink-0 w-11 h-11 mb-1 rounded-full flex items-center justify-center transform-gpu
        ${transitionClasses}
        ${canSubmit
          // Active state: vibrant color with premium glow
          ? 'bg-accent text-white dark:text-black shadow-glow-sm hover:shadow-xl'
          // Inactive state: muted with refined styling
          : 'bg-surfaceHighlight/50 text-textTertiary opacity-40 cursor-not-allowed'}
        ${canSubmit && !prefersReducedMotion
            // Premium tactile feedback
            ? 'hover:scale-[1.15] active:scale-95 hover:rotate-12 active:rotate-0'
            : ''}
    `;

    return (
        <button
          type="submit"
          disabled={!canSubmit}
          className={buttonClasses}
          // A11y: Clear label and busy state announcement
          aria-label={isLoading ? "Sending..." : "Send Message"}
          aria-busy={isLoading}
          data-testid="send-button" // Observability/Testing hook
          // Performance hint: Inform the browser about properties likely to change
          style={{ willChange: 'transform, background-color, opacity' }}
        >
          {isLoading ? <LoadingSpinner /> : <SendIcon />}
        </button>
    );
});
SendButton.displayName = 'SendButton';


// --- Main Component ---

/**
 * A highly optimized, accessible, and visually polished input area component.
 */
export const InputArea = memo(forwardRef<InputAreaHandle, InputAreaProps>(({
  onSend,
  isLoading,
  isDisabled = false,
  errorMessage = null,
  instanceId = 'chat-input-area'
}, ref) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  // Resilience: Separate internal submission state to handle async `onSend` gracefully and provide immediate feedback.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Consolidated state management
  const overallDisabledState = isLoading || isDisabled || isSubmitting;
  const canSubmit = input.trim().length > 0 && !overallDisabledState;

  // --- Height Adjustment Logic ---

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to 'auto' to correctly calculate the intrinsic scrollHeight when shrinking
      textarea.style.height = 'auto';
      // Calculate new height, capped by MAX_TEXTAREA_HEIGHT
      const newHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);
      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  // Performance: useLayoutEffect runs synchronously before paint, preventing flicker during resize.
  useLayoutEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  // --- Imperative Handle (External API) ---

  const resetInputAndHeight = useCallback(() => {
    setInput('');
    // Ensure height reset happens smoothly using requestAnimationFrame
    requestAnimationFrame(() => {
        if (textareaRef.current) {
            // Reset to minimum height and then adjust in case content (like padding) affects the calculation
            textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
            adjustHeight();
        }
    });
  }, [adjustHeight]);

  useImperativeHandle(ref, () => ({
    focusInput: () => {
      // Robustness: Ensure the input isn't disabled before attempting to focus
      if (textareaRef.current && !overallDisabledState) {
        textareaRef.current.focus();
      }
    },
    clearInput: resetInputAndHeight
    // Dependency array ensures the handle respects the current disabled state
  }), [overallDisabledState, resetInputAndHeight]);

  // --- Event Handlers ---

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const message = input.trim();

    // Guard clause
    if (!message || overallDisabledState) {
      return;
    }

    setIsSubmitting(true);
    // Observability hook: Submission start
    // console.log(`[Metrics:${instanceId}] Submission started.`);

    try {
      // Await onSend, crucial for handling async flows.
      await onSend(message);
      // Reset only on success
      resetInputAndHeight();
    } catch (error) {
      // Observability hook: Submission failure
      console.error(`[Error:${instanceId}] Submission failed:`, error);
      // Resilience: Parent component handles the error visualization (via errorMessage prop).
      // Stripe-grade UX: Keep focus on input for easy retry.
      textareaRef.current?.focus();
    } finally {
      // Ensure submission state is cleared regardless of success or failure
      setIsSubmitting(false);
    }
  }, [input, overallDisabledState, onSend, resetInputAndHeight, instanceId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter, allow new lines with Shift+Enter.
    // Crucial A11y/I18n: Check `isComposing` to prevent premature submission when using IME (e.g., CJK languages).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);

  // --- Render Logic & Styling ---

  const placeholderText = isDisabled ? DISCONNECTED_PLACEHOLDER : DEFAULT_PLACEHOLDER;
  const inputId = `${instanceId}-input`;
  const errorId = `${instanceId}-error`;

  // Visual Polish: Determine border/ring color based on priority (Error > Focus > Default)
  let stateColorClasses = '';
  if (errorMessage) {
    // Error state takes precedence
    stateColorClasses = 'border-error/70 ring-2 ring-error/20 shadow-lg';
  } else if (isFocused) {
    // Jony Ive-level subtlety: softer ring, clear border, enhanced shadow on focus
    stateColorClasses = 'border-accent/60 ring-2 ring-accent/20 shadow-lg';
  } else {
    // Minimalist default state with subtle hover interaction
    stateColorClasses = 'border-border/20 hover:border-accent/40';
  }

  const transitionClasses = prefersReducedMotion ? 'transition-none' : 'transition-all duration-300 ease-in-out';

  const containerClasses = `
    relative flex items-end gap-3 p-2.5 rounded-[32px] bg-gray-100/80 dark:bg-black/60 border shadow-glass backdrop-blur-2xl
    ${transitionClasses}
    ${stateColorClasses}
    ${isDisabled
      // Clear indication of disabled state
      ? 'opacity-60 grayscale-[40%] pointer-events-none'
      : 'motion-safe:hover:shadow-xl motion-safe:hover:scale-[1.01]'}
  `;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-6">
      <form
        onSubmit={handleSubmit}
        className={containerClasses}
        // A11y: Form role and status indication
        role="form"
        aria-label="Chat Input Form"
        aria-disabled={isDisabled}
      >
        {/* A11y: Explicit label for the textarea, crucial for screen readers even if hidden visually */}
        <label htmlFor={inputId} className="sr-only">
            {placeholderText}
        </label>
        <textarea
          id={inputId}
          ref={textareaRef}
          value={input}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholderText}
          disabled={overallDisabledState}
          rows={1}
          // Typography refinement: antialiased for crisp rendering (DraftKings-style clarity).
          // A11y Note: 'scrollbar-hide' is intentionally removed. Rely on native or globally styled scrollbars for better accessibility.
          className="w-full bg-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-[16px] px-4 py-3.5 focus:outline-none resize-none overflow-y-auto font-sans leading-relaxed disabled:cursor-not-allowed antialiased"
          style={{
            minHeight: `${MIN_TEXTAREA_HEIGHT}px`,
            maxHeight: `${MAX_TEXTAREA_HEIGHT}px`
          }}
          aria-multiline="true"
          // A11y: Link error message to the input field
          aria-describedby={errorMessage ? errorId : undefined}
          aria-invalid={!!errorMessage}
          autoComplete="off"
          spellCheck="true"
          data-testid="input-textarea" // Observability/Testing hook
        />

        <SendButton
            canSubmit={canSubmit}
            // Combine external loading state with internal submission state for immediate feedback
            isLoading={isLoading || isSubmitting}
            prefersReducedMotion={prefersReducedMotion}
        />
      </form>

      {/* Resilience: Error message display, announced politely to screen readers */}
      {errorMessage && (
        <div
            id={errorId}
            role="alert"
            aria-live="polite"
            // Assumes 'animate-fadeIn' is configured in tailwind.config.js for a subtle appearance
            className="flex items-center gap-2 mt-2 ml-4 text-sm text-error animate-fadeIn"
        >
            <AlertCircle size={16} aria-hidden="true" />
            <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}));

InputArea.displayName = 'InputArea';
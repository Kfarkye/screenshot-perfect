/**
 * @component InputArea
 * @description Production-grade chat input with auto-resize, attachments, and keyboard shortcuts
 *
 * @metanotes {
 *   "design_system": "ESSENCE v3.1",
 *   "features": [
 *     "Auto-resizing textarea",
 *     "Character limit with counter",
 *     "File attachment support",
 *     "Keyboard shortcut hints",
 *     "Voice input ready",
 *     "Mobile optimized"
 *   ],
 *   "accessibility": {
 *     "keyboard": "Enter to send, Shift+Enter for newline",
 *     "screen_reader": "Full ARIA support",
 *     "focus_management": "Imperative handle exposed"
 *   }
 * }
 */

import React, {
  useState,
  useRef,
  useLayoutEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
  memo,
  useMemo,
  type FC,
  type ChangeEvent,
  type KeyboardEvent,
  type FormEvent,
  type DragEvent,
} from "react";
import {
  ArrowUp,
  AlertCircle,
  Sparkles,
  Paperclip,
  X,
  Image as ImageIcon,
  FileText,
  Loader2,
  Mic,
  Command,
  CornerDownLeft,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Attachment {
  id: string;
  file: File;
  preview?: string;
  status: "pending" | "uploading" | "uploaded" | "error";
  progress?: number;
}

interface InputAreaProps {
  readonly onSend: (message: string, attachments?: Attachment[]) => Promise<void> | void;
  readonly isLoading: boolean;
  readonly isDisabled?: boolean;
  readonly errorMessage?: string | null;
  readonly onErrorDismiss?: () => void;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly showCharCount?: boolean;
  readonly enableAttachments?: boolean;
  readonly enableVoice?: boolean;
  readonly onAttach?: (files: File[]) => Promise<Attachment[]>;
  readonly acceptedFileTypes?: string[];
  readonly maxFileSize?: number; // bytes
  readonly maxFiles?: number;
  readonly className?: string;
}

export interface InputAreaHandle {
  focusInput: () => void;
  clearInput: () => void;
  setValue: (value: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TEXTAREA_HEIGHT = 160;
const MIN_TEXTAREA_HEIGHT = 24;
const DEFAULT_PLACEHOLDER = "Ask about a matchup, spread analysis, or trend...";
const DISCONNECTED_PLACEHOLDER = "Connection lost. Reconnecting...";
const DEFAULT_MAX_LENGTH = 4000;
const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(" ");
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// LOADING SPINNER
// ─────────────────────────────────────────────────────────────────────────────

const LoadingSpinner: FC<{ size?: number }> = memo(({ size = 20 }) => (
  <Loader2 size={size} className="animate-spin text-content-inverse" aria-hidden="true" />
));
LoadingSpinner.displayName = "LoadingSpinner";

// ─────────────────────────────────────────────────────────────────────────────
// SEND BUTTON
// ─────────────────────────────────────────────────────────────────────────────

interface SendButtonProps {
  canSubmit: boolean;
  isLoading: boolean;
}

const SendButton: FC<SendButtonProps> = memo(({ canSubmit, isLoading }) => {
  return (
    <button
      type="submit"
      disabled={!canSubmit}
      className={cn(
        "flex-shrink-0 w-10 h-10 rounded-full",
        "flex items-center justify-center",
        "transition-all duration-200 ease-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        canSubmit
          ? [
              "bg-accent text-content-inverse",
              "shadow-lg shadow-accent/25",
              "hover:bg-accent-hover hover:shadow-accent/35",
              "hover:scale-105 active:scale-95",
            ]
          : "bg-surface-secondary text-content-tertiary opacity-50 cursor-not-allowed",
      )}
      aria-label={isLoading ? "Sending message..." : "Send message"}
    >
      {isLoading ? <LoadingSpinner /> : <ArrowUp size={20} strokeWidth={2.5} />}
    </button>
  );
});
SendButton.displayName = "SendButton";

// ─────────────────────────────────────────────────────────────────────────────
// ATTACHMENT BUTTON
// ─────────────────────────────────────────────────────────────────────────────

interface AttachmentButtonProps {
  onClick: () => void;
  disabled: boolean;
  hasAttachments: boolean;
}

const AttachmentButton: FC<AttachmentButtonProps> = memo(({ onClick, disabled, hasAttachments }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex-shrink-0 w-9 h-9 rounded-full",
        "flex items-center justify-center",
        "transition-all duration-150 ease-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        disabled
          ? "text-content-tertiary opacity-50 cursor-not-allowed"
          : [
              "text-content-tertiary hover:text-content-primary",
              "hover:bg-surface-secondary/80",
              hasAttachments && "text-accent",
            ],
      )}
      aria-label="Attach files"
    >
      <Paperclip size={18} strokeWidth={2} />
    </button>
  );
});
AttachmentButton.displayName = "AttachmentButton";

// ─────────────────────────────────────────────────────────────────────────────
// VOICE BUTTON (Placeholder)
// ─────────────────────────────────────────────────────────────────────────────

interface VoiceButtonProps {
  onClick: () => void;
  disabled: boolean;
  isRecording: boolean;
}

const VoiceButton: FC<VoiceButtonProps> = memo(({ onClick, disabled, isRecording }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex-shrink-0 w-9 h-9 rounded-full",
        "flex items-center justify-center",
        "transition-all duration-150 ease-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        disabled
          ? "text-content-tertiary opacity-50 cursor-not-allowed"
          : [
              "text-content-tertiary hover:text-content-primary",
              "hover:bg-surface-secondary/80",
              isRecording && "text-semantic-error bg-semantic-error/10 animate-pulse",
            ],
      )}
      aria-label={isRecording ? "Stop recording" : "Start voice input"}
    >
      <Mic size={18} strokeWidth={2} />
    </button>
  );
});
VoiceButton.displayName = "VoiceButton";

// ─────────────────────────────────────────────────────────────────────────────
// ATTACHMENT PREVIEW
// ─────────────────────────────────────────────────────────────────────────────

interface AttachmentPreviewProps {
  attachment: Attachment;
  onRemove: (id: string) => void;
}

const AttachmentPreview: FC<AttachmentPreviewProps> = memo(({ attachment, onRemove }) => {
  const isImage = attachment.file.type.startsWith("image/");

  return (
    <div
      className={cn(
        "relative group flex items-center gap-2 px-3 py-2 rounded-xl",
        "bg-surface-secondary/50 border border-glass-border",
        "transition-all duration-150 ease-standard",
        attachment.status === "error" && "border-semantic-error/30 bg-semantic-error/5",
      )}
    >
      {/* Preview / Icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-lg overflow-hidden bg-surface-tertiary flex items-center justify-center">
        {isImage && attachment.preview ? (
          <img src={attachment.preview} alt="" className="w-full h-full object-cover" />
        ) : (
          <FileText size={16} className="text-content-tertiary" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-caption-1 font-medium text-content-primary truncate">{attachment.file.name}</p>
        <p className="text-caption-2 text-content-tertiary">{formatFileSize(attachment.file.size)}</p>
      </div>

      {/* Status / Remove */}
      {attachment.status === "uploading" ? (
        <Loader2 size={16} className="animate-spin text-accent" />
      ) : (
        <button
          type="button"
          onClick={() => onRemove(attachment.id)}
          className={cn(
            "flex-shrink-0 w-6 h-6 rounded-full",
            "flex items-center justify-center",
            "text-content-tertiary hover:text-content-primary",
            "hover:bg-surface-tertiary",
            "opacity-0 group-hover:opacity-100",
            "transition-all duration-150",
          )}
          aria-label={`Remove ${attachment.file.name}`}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
});
AttachmentPreview.displayName = "AttachmentPreview";

// ─────────────────────────────────────────────────────────────────────────────
// CHARACTER COUNTER
// ─────────────────────────────────────────────────────────────────────────────

interface CharCounterProps {
  current: number;
  max: number;
}

const CharCounter: FC<CharCounterProps> = memo(({ current, max }) => {
  const percentage = (current / max) * 100;
  const isWarning = percentage >= 80;
  const isError = percentage >= 95;

  return (
    <div
      className={cn(
        "text-caption-2 font-mono tabular-nums",
        "transition-colors duration-150",
        isError ? "text-semantic-error" : isWarning ? "text-semantic-warning" : "text-content-tertiary",
      )}
      aria-live="polite"
      aria-label={`${current} of ${max} characters used`}
    >
      {current.toLocaleString()}/{max.toLocaleString()}
    </div>
  );
});
CharCounter.displayName = "CharCounter";

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD HINT
// ─────────────────────────────────────────────────────────────────────────────

const KeyboardHint: FC = memo(() => {
  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

  return (
    <div className="hidden sm:flex items-center gap-1.5 text-caption-2 text-content-tertiary">
      <kbd className="px-1.5 py-0.5 rounded bg-surface-secondary/50 border border-glass-border font-mono text-[10px]">
        {isMac ? "⌘" : "Ctrl"}
      </kbd>
      <span>+</span>
      <kbd className="px-1.5 py-0.5 rounded bg-surface-secondary/50 border border-glass-border font-mono text-[10px]">
        ↵
      </kbd>
      <span className="ml-1">to send</span>
    </div>
  );
});
KeyboardHint.displayName = "KeyboardHint";

// ─────────────────────────────────────────────────────────────────────────────
// ERROR BANNER
// ─────────────────────────────────────────────────────────────────────────────

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

const ErrorBanner: FC<ErrorBannerProps> = memo(({ message, onDismiss }) => {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl",
        "bg-semantic-error/10 border border-semantic-error/20",
        "motion-safe:animate-[fadeIn_0.2s_ease-out]",
      )}
      role="alert"
    >
      <AlertCircle size={16} className="flex-shrink-0 text-semantic-error" />
      <span className="flex-1 text-body-sm text-semantic-error">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 p-1 rounded-full hover:bg-semantic-error/10 text-semantic-error transition-colors"
          aria-label="Dismiss error"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
});
ErrorBanner.displayName = "ErrorBanner";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN INPUT AREA COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const InputArea = memo(
  forwardRef<InputAreaHandle, InputAreaProps>(
    (
      {
        onSend,
        isLoading,
        isDisabled = false,
        errorMessage = null,
        onErrorDismiss,
        placeholder,
        maxLength = DEFAULT_MAX_LENGTH,
        showCharCount = true,
        enableAttachments = false,
        enableVoice = false,
        onAttach,
        acceptedFileTypes = DEFAULT_ACCEPTED_TYPES,
        maxFileSize = DEFAULT_MAX_FILE_SIZE,
        maxFiles = DEFAULT_MAX_FILES,
        className,
      },
      ref,
    ) => {
      // ─────────────────────────────────────────────────────────────────────────
      // STATE
      // ─────────────────────────────────────────────────────────────────────────

      const [input, setInput] = useState("");
      const [isFocused, setIsFocused] = useState(false);
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [isDragOver, setIsDragOver] = useState(false);
      const [attachments, setAttachments] = useState<Attachment[]>([]);
      const [isRecording, setIsRecording] = useState(false);

      const textareaRef = useRef<HTMLTextAreaElement>(null);
      const fileInputRef = useRef<HTMLInputElement>(null);

      // ─────────────────────────────────────────────────────────────────────────
      // DERIVED STATE
      // ─────────────────────────────────────────────────────────────────────────

      const overallDisabledState = isLoading || isDisabled || isSubmitting;
      const hasContent = input.trim().length > 0 || attachments.length > 0;
      const canSubmit = hasContent && !overallDisabledState && input.length <= maxLength;
      const isOverLimit = input.length > maxLength;

      const placeholderText = useMemo(() => {
        if (isDisabled) return DISCONNECTED_PLACEHOLDER;
        return placeholder || DEFAULT_PLACEHOLDER;
      }, [isDisabled, placeholder]);

      // ─────────────────────────────────────────────────────────────────────────
      // HEIGHT ADJUSTMENT
      // ─────────────────────────────────────────────────────────────────────────

      const adjustHeight = useCallback(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.style.height = "auto";
          const newHeight = Math.min(Math.max(textarea.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT);
          textarea.style.height = `${newHeight}px`;
        }
      }, []);

      useLayoutEffect(() => {
        adjustHeight();
      }, [input, adjustHeight]);

      // ─────────────────────────────────────────────────────────────────────────
      // IMPERATIVE HANDLE
      // ─────────────────────────────────────────────────────────────────────────

      const resetInput = useCallback(() => {
        setInput("");
        setAttachments([]);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
          }
        });
      }, []);

      useImperativeHandle(
        ref,
        () => ({
          focusInput: () => {
            if (textareaRef.current && !overallDisabledState) {
              textareaRef.current.focus();
            }
          },
          clearInput: resetInput,
          setValue: (value: string) => {
            setInput(value);
          },
        }),
        [overallDisabledState, resetInput],
      );

      // ─────────────────────────────────────────────────────────────────────────
      // SUBMISSION
      // ─────────────────────────────────────────────────────────────────────────

      const handleSubmit = useCallback(
        async (e?: FormEvent) => {
          e?.preventDefault();

          if (!canSubmit) return;

          setIsSubmitting(true);
          try {
            await onSend(input.trim(), attachments.length > 0 ? attachments : undefined);
            resetInput();
          } catch (error) {
            console.error("Submission failed:", error);
            textareaRef.current?.focus();
          } finally {
            setIsSubmitting(false);
          }
        },
        [canSubmit, input, attachments, onSend, resetInput],
      );

      // ─────────────────────────────────────────────────────────────────────────
      // KEYBOARD HANDLING
      // ─────────────────────────────────────────────────────────────────────────

      const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLTextAreaElement>) => {
          // Enter without modifiers = send
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSubmit();
          }

          // Cmd/Ctrl + Enter = also send (explicit)
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }

          // Escape = clear input
          if (e.key === "Escape" && input.length > 0) {
            e.preventDefault();
            resetInput();
            textareaRef.current?.blur();
          }
        },
        [handleSubmit, input.length, resetInput],
      );

      // ─────────────────────────────────────────────────────────────────────────
      // FILE HANDLING
      // ─────────────────────────────────────────────────────────────────────────

      const processFiles = useCallback(
        async (files: FileList | File[]) => {
          const fileArray = Array.from(files);
          const validFiles: File[] = [];

          for (const file of fileArray) {
            // Check file count
            if (attachments.length + validFiles.length >= maxFiles) {
              console.warn(`Maximum ${maxFiles} files allowed`);
              break;
            }

            // Check file type
            if (acceptedFileTypes.length > 0 && !acceptedFileTypes.includes(file.type)) {
              console.warn(`File type ${file.type} not accepted`);
              continue;
            }

            // Check file size
            if (file.size > maxFileSize) {
              console.warn(`File ${file.name} exceeds size limit`);
              continue;
            }

            validFiles.push(file);
          }

          if (validFiles.length === 0) return;

          // Create attachment objects
          const newAttachments: Attachment[] = validFiles.map((file) => ({
            id: generateId(),
            file,
            status: "pending",
            preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
          }));

          setAttachments((prev) => [...prev, ...newAttachments]);

          // If onAttach provided, handle upload
          if (onAttach) {
            try {
              const uploaded = await onAttach(validFiles);
              setAttachments((prev) =>
                prev.map((a) => {
                  const match = uploaded.find((u) => u.file.name === a.file.name);
                  return match ? { ...a, ...match, status: "uploaded" } : a;
                }),
              );
            } catch (error) {
              setAttachments((prev) =>
                prev.map((a) => (newAttachments.find((na) => na.id === a.id) ? { ...a, status: "error" } : a)),
              );
            }
          }
        },
        [attachments.length, maxFiles, acceptedFileTypes, maxFileSize, onAttach],
      );

      const handleFileSelect = useCallback(() => {
        fileInputRef.current?.click();
      }, []);

      const handleFileInputChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
          if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
            e.target.value = ""; // Reset for same file selection
          }
        },
        [processFiles],
      );

      const removeAttachment = useCallback((id: string) => {
        setAttachments((prev) => {
          const attachment = prev.find((a) => a.id === id);
          if (attachment?.preview) {
            URL.revokeObjectURL(attachment.preview);
          }
          return prev.filter((a) => a.id !== id);
        });
      }, []);

      // ─────────────────────────────────────────────────────────────────────────
      // DRAG & DROP
      // ─────────────────────────────────────────────────────────────────────────

      const handleDragOver = useCallback(
        (e: DragEvent) => {
          e.preventDefault();
          if (enableAttachments && !overallDisabledState) {
            setIsDragOver(true);
          }
        },
        [enableAttachments, overallDisabledState],
      );

      const handleDragLeave = useCallback((e: DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
      }, []);

      const handleDrop = useCallback(
        (e: DragEvent) => {
          e.preventDefault();
          setIsDragOver(false);

          if (!enableAttachments || overallDisabledState) return;

          const files = e.dataTransfer?.files;
          if (files && files.length > 0) {
            processFiles(files);
          }
        },
        [enableAttachments, overallDisabledState, processFiles],
      );

      // ─────────────────────────────────────────────────────────────────────────
      // VOICE (Placeholder)
      // ─────────────────────────────────────────────────────────────────────────

      const handleVoiceToggle = useCallback(() => {
        setIsRecording((prev) => !prev);
        // TODO: Implement actual voice recording
        console.log("Voice recording toggled");
      }, []);

      // ─────────────────────────────────────────────────────────────────────────
      // RENDER
      // ─────────────────────────────────────────────────────────────────────────

      return (
        <div className={cn("w-full max-w-3xl mx-auto", className)}>
          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-3">
              <ErrorBanner message={errorMessage} onDismiss={onErrorDismiss} />
            </div>
          )}

          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {attachments.map((attachment) => (
                <AttachmentPreview key={attachment.id} attachment={attachment} onRemove={removeAttachment} />
              ))}
            </div>
          )}

          {/* Main Input Form */}
          <form
            onSubmit={handleSubmit}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative flex items-end gap-2 p-2 rounded-2xl",
              "border backdrop-blur-xl",
              "transition-all duration-200 ease-standard",
              // Focus state
              isFocused
                ? ["bg-surface-primary/90 border-accent/30", "ring-4 ring-accent/10", "shadow-xl shadow-accent/5"]
                : [
                    "bg-glass-surface border-glass-border",
                    "hover:border-glass-border/80 hover:bg-glass-surface/80",
                    "shadow-lg",
                  ],
              // Drag over state
              isDragOver && ["border-accent border-dashed", "bg-accent/5"],
              // Error state
              isOverLimit && "border-semantic-error/50 ring-semantic-error/10",
            )}
          >
            {/* Leading Icon */}
            <div className="flex-shrink-0 pl-2 pb-2.5 self-end">
              <Sparkles
                size={18}
                className={cn(
                  "transition-colors duration-150",
                  isFocused ? "text-accent" : "text-content-tertiary opacity-50",
                )}
              />
            </div>

            {/* Textarea */}
            <div className="flex-1 min-w-0">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                placeholder={placeholderText}
                disabled={overallDisabledState}
                rows={1}
                aria-label="Message input"
                aria-invalid={isOverLimit}
                aria-describedby={isOverLimit ? "char-limit-error" : undefined}
                className={cn(
                  "w-full bg-transparent resize-none overflow-y-auto",
                  "text-body text-content-primary placeholder-content-tertiary/60",
                  "py-2.5 px-1",
                  "focus:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  "leading-relaxed",
                )}
                style={{
                  minHeight: `${MIN_TEXTAREA_HEIGHT}px`,
                  maxHeight: `${MAX_TEXTAREA_HEIGHT}px`,
                }}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 pb-1">
              {/* Attachment Button */}
              {enableAttachments && (
                <>
                  <AttachmentButton
                    onClick={handleFileSelect}
                    disabled={overallDisabledState || attachments.length >= maxFiles}
                    hasAttachments={attachments.length > 0}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={acceptedFileTypes.join(",")}
                    onChange={handleFileInputChange}
                    className="hidden"
                    aria-hidden="true"
                  />
                </>
              )}

              {/* Voice Button */}
              {enableVoice && (
                <VoiceButton onClick={handleVoiceToggle} disabled={overallDisabledState} isRecording={isRecording} />
              )}

              {/* Send Button */}
              <SendButton canSubmit={canSubmit} isLoading={isLoading || isSubmitting} />
            </div>
          </form>

          {/* Footer: Char Count + Keyboard Hint */}
          <div className="flex items-center justify-between mt-2 px-2">
            <KeyboardHint />

            <div className="flex items-center gap-3">
              {/* Char Counter */}
              {showCharCount && input.length > 0 && <CharCounter current={input.length} max={maxLength} />}

              {/* Over limit error */}
              {isOverLimit && (
                <span id="char-limit-error" className="text-caption-2 text-semantic-error" role="alert">
                  Message too long
                </span>
              )}
            </div>
          </div>

          {/* Animations */}
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      );
    },
  ),
);

InputArea.displayName = "InputArea";

export default InputArea;

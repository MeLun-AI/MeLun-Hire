import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { motion } from 'framer-motion';

interface AnswerInputProps {
  onAnswer: (text: string) => void;
  disabled?: boolean;
  initialValue?: string;
  /** Accepted for call-site compatibility; submit availability is driven by `disabled`. */
  isLoading?: boolean;
}

const SAVE_INTERVAL = 3000;

const AnswerInput = memo(function AnswerInput({
  onAnswer,
  disabled = false,
  initialValue = '',
}: AnswerInputProps) {
  const [text, setText] = useState(initialValue);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedRef = useRef(initialValue);

  // Auto-save draft
  useEffect(() => {
    if (text === lastSavedRef.current || text === initialValue) return;
    const id = setTimeout(() => {
      setSaveStatus('saving');
      lastSavedRef.current = text;
      try {
        sessionStorage.setItem('interview_draft', text);
      } catch { /* ignore */ }
      setTimeout(() => setSaveStatus('saved'), 300);
    }, SAVE_INTERVAL);
    return () => clearTimeout(id);
  }, [text, initialValue]);

  // Restore draft on mount
  useEffect(() => {
    if (!initialValue) {
      try {
        const draft = sessionStorage.getItem('interview_draft');
        if (draft) {
          setText(draft);
          lastSavedRef.current = draft;
        }
      } catch { /* ignore */ }
    }
  }, [initialValue]);

  // Auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [text]);

  const handleSubmit = useCallback(() => {
    if (text.trim()) {
      onAnswer(text.trim());
      setText('');
      setSaveStatus('idle');
      lastSavedRef.current = '';
      sessionStorage.removeItem('interview_draft');
    }
  }, [text, onAnswer]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Type your answer here... (Press Enter to submit, Shift+Enter for new line)"
          rows={3}
          className="w-full text-sm bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none transition-all resize-none disabled:opacity-40"
        />
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          {/* Character count */}
          <span className="text-[10px] text-gray-600 tabular-nums">
            {text.length}
          </span>
          {/* Save status */}
          {saveStatus === 'saving' && (
            <span className="text-[10px] text-yellow-400">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[10px] text-green-400"
            >
              Saved
            </motion.span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-600">
          {text.length > 0 ? `${text.length} characters` : ''}
        </span>
        <button
          onClick={handleSubmit}
          disabled={disabled || !text.trim()}
          className="text-xs bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2 px-5 rounded-xl transition-all btn-lift"
        >
          Submit Answer
        </button>
      </div>
    </div>
  );
});

export default AnswerInput;
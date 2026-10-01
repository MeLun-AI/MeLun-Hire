import { memo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  ChatWindow                                                         */
/*  Professional chat interface with auto-scroll.                      */
/* ------------------------------------------------------------------ */

export interface ChatMessage {
  id: string;
  role: 'ai' | 'user';
  text: string;
  timestamp: number;
  isFollowUp?: boolean;
}

interface ChatWindowProps {
  messages: ChatMessage[];
  typing?: boolean;
}

const ChatWindow = memo(function ChatWindow({ messages, typing = false }: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll to bottom on new messages */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, typing]);

  return (
    <div
      ref={scrollRef}
      className="space-y-3 max-h-[300px] md:max-h-[350px] overflow-y-auto pr-2 scrollbar-thin"
      aria-live="polite"
    >
      {messages.map((msg) => (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className={`flex ${msg.role === 'ai' ? 'justify-start' : 'justify-end'}`}
        >
          <div
            className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
              msg.role === 'ai'
                ? 'bg-primary/5 border border-primary/10 text-gray-300'
                : 'bg-primary/15 border border-primary/20 text-white'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-semibold ${msg.role === 'ai' ? 'text-primary-light' : 'text-gray-500'}`}>
                {msg.role === 'ai' ? 'AI Interviewer' : 'You'}
              </span>
              {msg.isFollowUp && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                  Follow-up
                </span>
              )}
            </div>
            <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
          </div>
        </motion.div>
      ))}

      {/* Typing indicator */}
      {typing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-start"
        >
          <div className="bg-primary/5 border border-primary/10 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary/40"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-1.5">AI is reviewing your response...</p>
          </div>
        </motion.div>
      )}
    </div>
  );
});

export default ChatWindow;
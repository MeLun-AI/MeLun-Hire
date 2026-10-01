import { memo } from 'react';
import { motion } from 'framer-motion';

interface QuestionCardProps {
  question: string;
  questionNumber: number;
  totalQuestions: number;
  roundName: string;
  loading?: boolean;
  /** Follow-up question variant — accepted for call-site compatibility; rendering stays identical. */
  isFollowUp?: boolean;
}

const QuestionCard = memo(function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  roundName,
  loading = false,
}: QuestionCardProps) {
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/5 border border-white/10 rounded-2xl p-6"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-20 bg-white/10 rounded animate-pulse" />
            <div className="h-3 w-12 bg-white/10 rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-full bg-white/10 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-white/10 rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-white/10 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-8 bg-primary/30 rounded animate-pulse" />
            <span className="text-xs text-gray-600">Generating next question...</span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key={questionNumber}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="bg-white/5 border border-white/10 rounded-2xl p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary-light font-semibold uppercase tracking-wider">
            {roundName}
          </span>
          <span className="text-[10px] text-gray-500 font-medium">
            Q{questionNumber}/{totalQuestions}
          </span>
        </div>
      </div>

      {/* Question */}
      <p className="text-base md:text-lg text-white font-medium leading-relaxed">
        {question}
      </p>
    </motion.div>
  );
});

export default QuestionCard;
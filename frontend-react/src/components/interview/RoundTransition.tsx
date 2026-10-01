import { motion } from 'framer-motion';

interface RoundTransitionProps {
  completedRoundName: string;
  nextRoundName: string;
  onStartNext: () => void;
}

export default function RoundTransition({
  completedRoundName,
  nextRoundName,
  onStartNext,
}: RoundTransitionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="bg-white/5 border border-white/10 rounded-2xl p-8 md:p-12 text-center max-w-lg mx-auto"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 15 }}
        className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-5"
      >
        <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>

      <h2 className="text-xl font-extrabold text-white mb-2">{completedRoundName} Complete</h2>
      <p className="text-sm text-gray-400 mb-2">Great job!</p>
      <p className="text-sm text-gray-500 mb-8">
        Next up: <span className="text-primary-light font-semibold">{nextRoundName}</span>
      </p>

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onStartNext}
        className="inline-flex items-center gap-2 text-sm bg-primary hover:bg-primary-hover text-white font-semibold py-3 px-8 rounded-xl transition-all btn-lift"
      >
        Start {nextRoundName}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </motion.button>
    </motion.div>
  );
}
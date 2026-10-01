import { motion } from 'framer-motion';

interface LoadingOverlayProps {
  title: string;
  steps: string[];
  currentStep?: number;
  percent?: number;
}

export default function LoadingOverlay({ title, steps, currentStep = 0, percent }: LoadingOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bg-white/5 border border-white/10 rounded-2xl p-8 md:p-12 text-center max-w-lg mx-auto"
    >
      {/* Animated spinner */}
      <div className="relative w-16 h-16 mx-auto mb-6">
        {percent !== undefined && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-gray-500 tabular-nums">
            {percent}%
          </div>
        )}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute inset-2 rounded-full border-2 border-transparent border-t-primary-light"
          animate={{ rotate: -360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-primary" />
        </div>
      </div>

      <h3 className="text-lg font-bold text-white mb-6">{title}</h3>

      <div className="space-y-3 text-left max-w-xs mx-auto">
        {steps.map((step, i) => (
          <div key={step} className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0">
              {i < currentStep ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-5 h-5 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center"
                >
                  <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </motion.div>
              ) : i === currentStep ? (
                <motion.div
                  className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                />
              ) : (
                <div className="w-5 h-5 rounded-full border border-white/10 bg-white/5" />
              )}
            </div>
            <span
              className={`text-sm ${
                i < currentStep ? 'text-green-400' : i === currentStep ? 'text-primary-light' : 'text-gray-600'
              }`}
            >
              {step}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
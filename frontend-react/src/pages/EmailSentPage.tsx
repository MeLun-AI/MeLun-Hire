import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import AuthCard from '../components/AuthCard';
import MeLunLogo from '../components/layout/MeLunLogo';

export default function EmailSentPage() {
  const { role } = useParams<{ role: string }>();
  const navigate = useNavigate();

  const loginRoute = role === 'hr' ? '/hr/login' : '/applicant/login';

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center relative overflow-hidden px-4">
      <div className="relative z-10 flex flex-col items-center text-center">
        {/* Brand */}
        <div className="mb-4">
          <button
            onClick={() => navigate('/')}
            className="transition-opacity hover:opacity-90"
            aria-label="MeLun Hire home"
          >
            <MeLunLogo size={32} variant="onDark" />
          </button>
        </div>

        <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">
          Check Your Email
        </h1>
        <p className="text-gray-500 text-sm mb-8 max-w-md">
          If an account exists with this email, we've sent a password reset link.
          Please check your inbox and spam folder.
        </p>

        <AuthCard>
          <div className="flex flex-col items-center text-center">
            {/* Large success icon */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1], delay: 0.1 }}
              className="mb-6"
            >
              <div className="w-20 h-20 rounded-full bg-coral-500/20 border border-coral-500/30 flex items-center justify-center mx-auto">
                <motion.svg
                  className="w-10 h-10 text-coral-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: 0.3 }}
                >
                  <motion.path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </motion.svg>
              </div>
            </motion.div>

            <p className="text-gray-400 text-sm mb-6">
              Didn't receive the email? Check your spam folder or try again.
            </p>

            <motion.button
              onClick={() => navigate(loginRoute)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className="w-full bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl py-2.5 transition-colors"
            >
              Back to Login
            </motion.button>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => navigate(loginRoute)}
                className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
              >
                &larr; Back to Login
              </button>
            </div>
          </div>
        </AuthCard>

        <motion.button
          onClick={() => navigate('/login')}
          className="mt-8 text-gray-500 text-sm hover:text-gray-300 transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
        >
          &larr; Back to Role Selection
        </motion.button>
      </div>
    </div>
  );
}
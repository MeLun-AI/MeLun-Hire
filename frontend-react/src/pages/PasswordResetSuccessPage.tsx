import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import AuthCard from '../components/AuthCard';
import MeLunLogo from '../components/layout/MeLunLogo';

export default function PasswordResetSuccessPage() {
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
          Password Updated Successfully
        </h1>
        <p className="text-gray-500 text-sm mb-8 max-w-md">
          Your password has been updated successfully. You can now sign in using your new password.
        </p>

        <AuthCard>
          <div className="flex flex-col items-center text-center">
            {/* Large success checkmark icon */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1], delay: 0.1 }}
              className="mb-6"
            >
              <div className="w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto">
                <motion.svg
                  className="w-10 h-10 text-green-400"
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
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </motion.svg>
              </div>
            </motion.div>

            <motion.button
              onClick={() => navigate(loginRoute)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className="w-full bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl py-2.5 transition-colors"
            >
              Back to Login
            </motion.button>
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
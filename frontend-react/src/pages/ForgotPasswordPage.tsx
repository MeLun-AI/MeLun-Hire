import { useState, FormEvent, ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import AuthCard from '../components/AuthCard';
import InputField from '../components/InputField';
import FormMessage from '../components/FormMessage';
import MeLunLogo from '../components/layout/MeLunLogo';
import { postJson, requestErrorMessage } from '../services/api';

export default function ForgotPasswordPage() {
  const { role } = useParams<{ role: string }>();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const validateEmail = (value: string): string => {
    if (!value.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Please enter a valid email address.';
    return '';
  };

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (emailError) setEmailError(validateEmail(value));
  };

  const handleBlur = () => {
    setEmailError(validateEmail(email));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const err = validateEmail(email);
    setEmailError(err);
    if (err) return;

    setLoading(true);
    try {
      await postJson('/api/auth/forgot-password', {
        email: email.trim().toLowerCase(),
        role: role || 'hr',
      });
      navigate(`/email-sent/${role}`);
    } catch (err: unknown) {
      const msg = requestErrorMessage(err, 'Something went wrong. Please try again.');
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

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
          Forgot Password?
        </h1>
        <p className="text-gray-500 text-sm mb-8 max-w-md">
          Enter your registered email address and we'll send you a secure password reset link.
        </p>

        <AuthCard>
          <form onSubmit={handleSubmit} className="text-left">
            <FormMessage type="error" message={submitError} />

            <InputField
              label="Email Address"
              type="email"
              placeholder={role === 'hr' ? 'hr@company.com' : 'you@example.com'}
              value={email}
              onChange={handleEmailChange}
              onBlur={handleBlur}
              error={emailError}
              required
            />

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={!loading ? { scale: 1.02 } : undefined}
              whileTap={!loading ? { scale: 0.98 } : undefined}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-2.5 mt-2 transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  />
                  Sending…
                </span>
              ) : (
                'Send Reset Link'
              )}
            </motion.button>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => navigate(loginRoute)}
                className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
              >
                &larr; Back to Login
              </button>
            </div>
          </form>
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
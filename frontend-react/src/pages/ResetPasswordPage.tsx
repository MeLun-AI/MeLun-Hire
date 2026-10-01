import { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import AuthCard from '../components/AuthCard';
import FormMessage from '../components/FormMessage';
import MeLunLogo from '../components/layout/MeLunLogo';
import { postJson, getJson, requestErrorMessage } from '../services/api';

export default function ResetPasswordPage() {
  const { role } = useParams<{ role: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') || '';

  const [tokenState, setTokenState] = useState<'loading' | 'valid' | 'invalid'>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);

  /* Verify token on mount */
  useEffect(() => {
    if (!token) {
      setTokenState('invalid');
      return;
    }
    getJson<{ valid: boolean; role?: string }>(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`)
      .then((data) => {
        if (data.valid && data.role === role) {
          setTokenState('valid');
        } else {
          setTokenState('invalid');
        }
      })
      .catch(() => {
        setTokenState('invalid');
      });
  }, [token, role]);

  const getPasswordErrors = (value: string): string[] => {
    const errors: string[] = [];
    if (!value) return [];
    if (value.length < 8) errors.push('At least 8 characters');
    if (!/[A-Z]/.test(value)) errors.push('One uppercase letter');
    if (!/[a-z]/.test(value)) errors.push('One lowercase letter');
    if (!/[0-9]/.test(value)) errors.push('One number');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) errors.push('One special character');
    return errors;
  };

  const validatePassword = (value: string): string => {
    if (!value.trim()) return 'Password is required.';
    const errs = getPasswordErrors(value);
    return errs.length > 0 ? errs[0] : '';
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    if (passwordError) setPasswordError(validatePassword(value));
    if (confirmPassword && value !== confirmPassword) {
      setConfirmError('Passwords do not match.');
    } else if (confirmPassword) {
      setConfirmError('');
    }
  };

  const handleConfirmChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setConfirmPassword(value);
    if (value !== password) {
      setConfirmError('Passwords do not match.');
    } else {
      setConfirmError('');
    }
  };

  const handlePasswordBlur = () => {
    setPasswordError(validatePassword(password));
  };

  const handleConfirmBlur = () => {
    if (!confirmPassword.trim()) {
      setConfirmError('Please confirm your password.');
    } else if (confirmPassword !== password) {
      setConfirmError('Passwords do not match.');
    } else {
      setConfirmError('');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const pwErr = validatePassword(password);
    setPasswordError(pwErr);

    let cfErr = '';
    if (!confirmPassword.trim()) {
      cfErr = 'Please confirm your password.';
    } else if (confirmPassword !== password) {
      cfErr = 'Passwords do not match.';
    }
    setConfirmError(cfErr);

    if (pwErr || cfErr) return;

    setLoading(true);
    try {
      await postJson('/api/auth/reset-password', {
        token,
        password,
      });
      setSuccess(true);
      setTimeout(() => {
        navigate(`/password-reset-success/${role}`);
      }, 1000);
    } catch (err: unknown) {
      const msg = requestErrorMessage(err, 'Something went wrong. Please try again.');
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  const passwordRules = getPasswordErrors(password);
  const loginRoute = role === 'hr' ? '/hr/login' : '/applicant/login';

  /* Loading state */
  if (tokenState === 'loading') {
    return (
      <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center relative overflow-hidden px-4">
        <div className="relative z-10 flex flex-col items-center text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8 border-2 border-white/30 border-t-coral-400 rounded-full mb-4"
          />
          <p className="text-gray-400 text-sm">Verifying your reset link…</p>
        </div>
      </div>
    );
  }

  /* Invalid/expired token state */
  if (tokenState === 'invalid') {
    return (
      <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center relative overflow-hidden px-4">
        <div className="relative z-10 flex flex-col items-center text-center">
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
            Reset Link Expired
          </h1>
          <p className="text-gray-500 text-sm mb-8 max-w-md">
            This password reset link is invalid or has expired. Please request a new one.
          </p>

          <AuthCard>
            <div className="flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="mb-6"
              >
                <div className="w-20 h-20 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center mx-auto">
                  <svg className="w-10 h-10 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </motion.div>

              <motion.button
                onClick={() => navigate(`/forgot-password/${role}`)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                className="w-full bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl py-2.5 transition-colors"
              >
                Request New Link
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
        </div>
      </div>
    );
  }

  /* Success after reset */
  if (success) {
    return (
      <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center relative overflow-hidden px-4">
        <div className="relative z-10 flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="mb-4"
          >
            <div className="w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto">
              <motion.svg
                className="w-10 h-10 text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
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
          <p className="text-green-400 text-sm font-medium">Password updated! Redirecting…</p>
        </div>
      </div>
    );
  }

  /* Valid token — show reset form */
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
          Reset Password
        </h1>
        <p className="text-gray-500 text-sm mb-8 max-w-md">
          Create a strong new password for your account.
        </p>

        <AuthCard>
          <form onSubmit={handleSubmit} className="text-left">
            <FormMessage type="error" message={submitError} />

            {/* New Password */}
            <div className="mb-4 text-left">
              <label htmlFor="new-password" className="block text-sm text-gray-300 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a strong password"
                  value={password}
                  onChange={handlePasswordChange}
                  onBlur={handlePasswordBlur}
                  required
                  aria-label="New Password"
                  className={`w-full bg-white/10 border ${passwordError ? 'border-red-500' : 'border-white/10'} rounded-xl px-4 py-2.5 pr-10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral-500/50 transition`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordError && <p className="text-red-400 text-xs mt-1">{passwordError}</p>}
            </div>

            {/* Password strength rules */}
            {password.length > 0 && passwordRules.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 -mt-2"
              >
                <ul className="space-y-0.5">
                  {[
                    { label: 'At least 8 characters', check: password.length >= 8 },
                    { label: 'One uppercase letter', check: /[A-Z]/.test(password) },
                    { label: 'One lowercase letter', check: /[a-z]/.test(password) },
                    { label: 'One number', check: /[0-9]/.test(password) },
                    { label: 'One special character', check: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
                  ].map((rule, i) => (
                    <li key={i} className={`text-xs flex items-center gap-1.5 ${rule.check ? 'text-green-400' : 'text-gray-500'}`}>
                      <span>{rule.check ? '✓' : '○'}</span>
                      {rule.label}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* Confirm Password */}
            <div className="mb-4 text-left">
              <label htmlFor="confirm-password" className="block text-sm text-gray-300 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={handleConfirmChange}
                  onBlur={handleConfirmBlur}
                  required
                  aria-label="Confirm Password"
                  className={`w-full bg-white/10 border ${confirmError ? 'border-red-500' : 'border-white/10'} rounded-xl px-4 py-2.5 pr-10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral-500/50 transition`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showConfirm ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {confirmError && <p className="text-red-400 text-xs mt-1">{confirmError}</p>}
            </div>

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
                  Updating…
                </span>
              ) : (
                'Update Password'
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
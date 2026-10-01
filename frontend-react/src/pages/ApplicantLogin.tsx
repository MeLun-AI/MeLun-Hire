import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import InputField from '../components/InputField';
import PasswordInput from '../components/PasswordInput';
import FormMessage from '../components/FormMessage';
import MeLunLogo from '../components/layout/MeLunLogo';
import { postJson, ApiError } from '../services/api';

export default function ApplicantLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Send exactly the backend schema: { email, password }. Trim the email so
      // stray whitespace can never cause a backend validation (422) failure.
      const payload = { email: email.trim(), password };
      const data = (await postJson('/applicant/login', payload)) as Record<string, unknown>;
      // The session token is delivered as an HttpOnly cookie; it is never
      // persisted in browser storage. Only the non-sensitive identity is kept.
      const session = { ...data };
      delete session.auth_token;
      sessionStorage.setItem('quno_applicant_session', JSON.stringify(session));
      navigate('/applicant/dashboard');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        // The backend responded — these are real API answers, NOT a
        // "cannot connect" situation. Never show the connection message here.
        if (err.status === 401) {
          setError('Invalid email or password.');
        } else if (err.status === 422) {
          setError(err.message || 'Please check your email and password and try again.');
        } else {
          setError(err.message || `Login failed. Please try again (${err.status}).`);
        }
      } else if (err instanceof TypeError) {
        // Network-level failure: backend unreachable or request blocked.
        setError('Could not connect to server. Make sure the backend is running.');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

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
          Applicant Login
        </h1>
        <p className="text-gray-500 text-sm mb-8 max-w-md">
          Sign in to apply for jobs and attend AI-powered interviews.
        </p>

        <AuthCard>
          <form onSubmit={handleSubmit} className="text-left">
            <FormMessage type="error" message={error} />

            <InputField
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <PasswordInput
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-2.5 mt-2 transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>

            <div className="flex justify-between mt-4 text-sm">
              <button
                type="button"
                onClick={() => navigate('/forgot-password/applicant')}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                Forgot Password?
              </button>
              <button
                type="button"
                onClick={() => navigate('/applicant/signup')}
                className="text-coral-400 hover:text-coral-300 transition-colors"
              >
                Create Account
              </button>
            </div>
          </form>
        </AuthCard>

        <button
          onClick={() => navigate('/login')}
          className="mt-8 text-gray-500 text-sm hover:text-gray-300 transition-colors"
        >
          &larr; Back to Role Selection
        </button>
      </div>
    </div>
  );
}
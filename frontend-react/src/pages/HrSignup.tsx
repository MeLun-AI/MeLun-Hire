import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import InputField from '../components/InputField';
import PasswordInput from '../components/PasswordInput';
import FormMessage from '../components/FormMessage';
import MeLunLogo from '../components/layout/MeLunLogo';
import { postJson } from '../services/api';

export default function HrSignup() {
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState('');
  const [hrName, setHrName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const validate = (): string | null => {
    if (!companyName.trim()) return 'Company Name is required.';
    if (!hrName.trim()) return 'HR Name is required.';
    if (!email.trim()) return 'Email is required.';
    if (!password) return 'Password is required.';
    if (!confirmPassword) return 'Confirm Password is required.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await postJson('/hr/signup', {
        company_name: companyName.trim(),
        hr_name: hrName.trim(),
        email: email.trim(),
        password,
      });
      setSuccess('Account created successfully! Redirecting to login…');
      setTimeout(() => navigate('/hr/login'), 2000);
    } catch (err: unknown) {
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setError('Could not connect to server. Make sure the backend is running.');
      } else {
        setError(err instanceof Error ? err.message : 'Signup failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col items-center justify-center relative overflow-hidden px-4 py-12">
      <div className="relative z-10 flex flex-col items-center text-center w-full">
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
          HR Manager Sign Up
        </h1>
        <p className="text-gray-500 text-sm mb-8 max-w-md">
          Create your company account to manage hiring.
        </p>

        <AuthCard>
          <form onSubmit={handleSubmit} className="text-left">
            <FormMessage type="error" message={error} />
            <FormMessage type="success" message={success} />

            <InputField
              label="Company Name"
              placeholder="Acme Corp"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
            <InputField
              label="HR Name"
              placeholder="Jane Smith"
              value={hrName}
              onChange={(e) => setHrName(e.target.value)}
              required
            />
            <InputField
              label="Email"
              type="email"
              placeholder="hr@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <PasswordInput
              label="Password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <PasswordInput
              label="Confirm Password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-2.5 mt-2 transition-colors"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>

            <p className="text-center mt-4 text-sm text-gray-500">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/hr/login')}
                className="text-coral-400 hover:text-coral-300 transition-colors"
              >
                Sign in
              </button>
            </p>
          </form>
        </AuthCard>

        <button
          onClick={() => navigate('/signup')}
          className="mt-8 text-gray-500 text-sm hover:text-gray-300 transition-colors"
        >
          &larr; Back to Role Selection
        </button>
      </div>
    </div>
  );
}
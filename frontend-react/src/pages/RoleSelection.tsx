import { useNavigate } from 'react-router-dom';
import RoleCard from '../components/RoleCard';
import MeLunLogo from '../components/layout/MeLunLogo';

interface RoleSelectionProps {
  mode?: 'login' | 'signup';
}

export default function RoleSelection({ mode = 'login' }: RoleSelectionProps) {
  const navigate = useNavigate();
  const isSignup = mode === 'signup';

  const cardConfig = isSignup
    ? [
        {
          title: 'Applicant',
          description: 'Create an applicant account to apply for jobs and attend AI interviews',
          buttonLabel: 'Applicant Signup',
          navigateTo: '/applicant/signup',
          accentColor: 'bg-coral-500',
        },
        {
          title: 'Employer / HR',
          description: 'Create an employer account to post roles and manage candidates',
          buttonLabel: 'Employer Signup',
          navigateTo: '/hr/signup',
          accentColor: 'bg-primary',
        },
      ]
    : [
        {
          title: 'Applicant',
          description: 'Apply for jobs and attend AI interviews',
          buttonLabel: 'Enter as Applicant',
          navigateTo: '/applicant/login',
          accentColor: 'bg-coral-500',
        },
        {
          title: 'HR Manager',
          description: 'Manage jobs and review candidates',
          buttonLabel: 'Enter as HR Manager',
          navigateTo: '/hr/login',
          accentColor: 'bg-primary',
        },
      ];

  return (
    <div className="min-h-screen bg-navy-950 flex flex-col relative overflow-hidden px-4">
      {/* Back to Home */}
      <div className="absolute top-6 left-4 sm:left-8 z-20">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Home
        </button>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center py-14">
        {/* Brand — MeLun lockup (dark background variant) */}
        <div className="mb-4 flex justify-center">
          <MeLunLogo size={32} variant="onDark" />
        </div>

        {/* Heading */}
        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2 text-center tracking-tight">
          {isSignup ? 'Create your account' : 'Choose Your Role'}
        </h1>
        <p className="text-gray-500 text-sm mb-12 text-center max-w-md">
          {isSignup
            ? 'Create your MeLun Hire account as an applicant or an employer.'
            : "Select how you'd like to get started with our AI-powered hiring platform."}
        </p>

        {/* Role Cards */}
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-2xl justify-center">
          {cardConfig.map((card) => (
            <RoleCard
              key={card.title}
              title={card.title}
              description={card.description}
              buttonLabel={card.buttonLabel}
              navigateTo={card.navigateTo}
              accentColor={card.accentColor}
            />
          ))}
        </div>

        {/* Secondary action */}
        {isSignup && (
          <p className="mt-10 text-sm text-gray-500">
            Already have an account?{' '}
            <button
              onClick={() => navigate('/login')}
              className="text-primary-light font-semibold hover:text-white transition-colors"
            >
              Log in
            </button>
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 pb-8 text-center text-gray-600 text-xs">
        &copy; {new Date().getFullYear()} MeLun. All rights reserved.
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';

interface RoleCardProps {
  title: string;
  description: string;
  buttonLabel: string;
  navigateTo: string;
  accentColor: string;
}

export default function RoleCard({
  title,
  description,
  buttonLabel,
  navigateTo,
  accentColor,
}: RoleCardProps) {
  const navigate = useNavigate();

  return (
    <div className="group relative flex flex-col items-center text-center bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 w-full max-w-sm transition-all duration-300 hover:bg-white/[0.07] hover:border-white/20 hover:shadow-xl hover:shadow-black/20">
      {/* Accent top bar */}
      <div
        className={`w-16 h-1.5 rounded-full mb-6 transition-all duration-300 group-hover:w-20 ${accentColor}`}
      />

      <h2 className="text-2xl font-bold text-white mb-3">{title}</h2>

      <p className="text-gray-400 text-sm leading-relaxed mb-8 min-h-[2.5rem]">
        {description}
      </p>

      <button
        onClick={() => navigate(navigateTo)}
        className="w-full py-3 px-6 rounded-xl bg-primary text-white font-semibold text-sm transition-all duration-200 hover:bg-primary-hover hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-2 focus:ring-offset-navy-900"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
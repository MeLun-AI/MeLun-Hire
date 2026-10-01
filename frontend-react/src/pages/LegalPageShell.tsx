import { useNavigate } from 'react-router-dom';
import SiteFooter from '../components/marketing/SiteFooter';
import MeLunLogo from '../components/layout/MeLunLogo';

/**
 * Shared premium layout for the standalone MeLun Hire legal pages
 * (Terms of Service and Privacy Policy).
 */
export default function LegalPageShell({
  title,
  eyebrow = 'MeLun Hire',
  description,
  lastUpdated,
  sections,
}: {
  title: string;
  eyebrow?: string;
  description: string;
  lastUpdated: string;
  sections: { title: string; body: string }[];
}) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-navy-950 text-white overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute inset-0 bg-[#07080d]" />
        <div
          className="absolute top-[-12%] right-[-8%] w-[820px] h-[820px] rounded-full pointer-events-none blur-[110px]"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.22) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-[-20%] left-[-8%] w-[680px] h-[680px] rounded-full pointer-events-none blur-[110px]"
          style={{ background: 'radial-gradient(circle, rgba(88,28,135,0.18) 0%, transparent 70%)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            WebkitMaskImage: 'radial-gradient(circle at center, black 10%, transparent 75%)',
            maskImage: 'radial-gradient(circle at center, black 10%, transparent 75%)',
          }}
        />
      </div>

      <nav className="relative z-10 border-b border-white/[0.06] bg-navy-950/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button onClick={() => navigate('/')} className="flex items-center group" aria-label="MeLun Hire home">
              <MeLunLogo size={36} variant="onDark" subtitle="AI-Powered Hiring" />
            </button>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-200 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-white/25 hover:-translate-y-0.5 transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back to MeLun Hire
            </button>
          </div>
        </div>
      </nav>

      <header className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-10 text-center">
        <span className="inline-flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.28em] text-primary-light font-semibold">
          {eyebrow}
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl md:text-[2.75rem] font-extrabold tracking-tight leading-[1.1] text-white">
          {title}
        </h1>
        <p className="mt-4 text-[15px] sm:text-base text-gray-400 leading-relaxed max-w-2xl mx-auto">{description}</p>
        <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-gray-500">
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          {lastUpdated}
        </p>
      </header>

      <div className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>

      <main className="relative z-10 flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md shadow-2xl shadow-black/40 divide-y divide-white/[0.06] overflow-hidden">
          {sections.map((sec, idx) => (
            <section key={sec.title} className="px-5 sm:px-8 py-7 sm:py-8">
              <div className="flex items-start gap-4">
                <span className="mt-1 flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-primary/10 border border-primary/25 text-primary-light text-xs font-bold">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">{sec.title}</h2>
                  <p className="mt-2.5 text-sm sm:text-[15px] leading-[1.85] text-gray-400">{sec.body}</p>
                </div>
              </div>
            </section>
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
import { useNavigate } from 'react-router-dom';
import MeLunLogo from '../layout/MeLunLogo';

/**
 * SiteFooter — the single shared footer for the whole MeLun Hire product.
 *
 *  full     (default) — public site: landing page, Terms, Privacy.
 *  compact            — authenticated HR / applicant areas: the same
 *                       brand, typography, link styling and copyright
 *                       rules condensed into one row.
 *
 * Section links ("Home", "Product", "How it works") smooth-scroll when the
 * target section exists on the current page (the landing page). From other
 * pages they navigate to "/" and request a scroll after landing mounts.
 */

const COMPACT_LINK = 'text-xs text-gray-400 hover:text-white transition-colors';

export default function SiteFooter({ variant = 'full' }: { variant?: 'full' | 'compact' } = {}) {
  const navigate = useNavigate();

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // Target lives on the landing page — land there, then scroll once mounted.
    sessionStorage.setItem('qf-landing-scroll', id);
    navigate('/');
  };

  /* Compact variant — authenticated HR / applicant areas.
   * Same brand, typography, link styling and copyright rules as the full
   * footer, condensed into a single responsive row. Mounted via
   * HrFooter so existing layouts keep working untouched. */
  if (variant === 'compact') {
    return (
      <footer className="border-t border-white/[0.06] bg-navy-900/40 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MeLunLogo size={24} variant="auto" wordmarkVisibility="always" />
              <span className="text-xs text-gray-600">v1.0.0</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
              <button onClick={() => scrollToSection('hero')} className={COMPACT_LINK}>Home</button>
              <button onClick={() => navigate('/terms')} className={COMPACT_LINK}>Terms</button>
              <button onClick={() => navigate('/privacy')} className={COMPACT_LINK}>Privacy</button>
              <a href="mailto:hello@melun.ai" className={COMPACT_LINK}>hello@melun.ai</a>
            </div>
            <p className="text-xs text-gray-600 whitespace-nowrap">
              &copy; {new Date().getFullYear()} MeLun. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    );
  }

  const links = [
    { label: 'Home', action: () => scrollToSection('hero') },
    { label: 'Product', action: () => scrollToSection('intro') },
    { label: 'How it works', action: () => scrollToSection('how-it-works') },
    { label: 'Log in', action: () => navigate('/login') },
  ];

  return (
    <footer className="border-t border-white/[0.06] bg-navy-900/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="mb-4">
              <MeLunLogo size={32} variant="onDark" subtitle="AI-Powered Hiring" wordmarkVisibility="always" />
            </div>
            <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
              AI-assisted hiring platform for modern teams. Hire smarter, build better.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-4">Links</h4>
            <div className="flex flex-col gap-2.5">
              {links.map((link) => (
                <button key={link.label} onClick={link.action} className="text-sm text-gray-400 hover:text-white transition-colors text-left w-fit">
                  {link.label}
                </button>
              ))}
            </div>
          </div>

          {/* Portals */}
          <div>
            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-4">Portals</h4>
            <div className="flex flex-col gap-2.5">
              <button onClick={() => navigate('/hr/login')} className="text-sm text-gray-400 hover:text-white transition-colors text-left w-fit">Employer portal</button>
              <button onClick={() => navigate('/applicant/login')} className="text-sm text-gray-400 hover:text-white transition-colors text-left w-fit">Applicant portal</button>
            </div>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-4">Legal</h4>
            <div className="flex flex-col gap-2.5">
              <button onClick={() => navigate('/terms')} className="text-sm text-gray-400 hover:text-white transition-colors text-left w-fit">Terms of Service</button>
              <button onClick={() => navigate('/privacy')} className="text-sm text-gray-400 hover:text-white transition-colors text-left w-fit">Privacy Policy</button>
              <a href="mailto:hello@melun.ai" className="text-sm text-gray-400 hover:text-white transition-colors text-left w-fit mt-2">hello@melun.ai</a>
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-600">&copy; {new Date().getFullYear()} MeLun. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-600">AI-assisted hiring</span>
            <div className="w-1 h-1 rounded-full bg-gray-700" />
            <span className="text-xs text-gray-600">Made for modern teams</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

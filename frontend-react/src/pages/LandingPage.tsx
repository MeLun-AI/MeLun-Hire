import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import SiteFooter from '../components/marketing/SiteFooter';
import MeLunLogo from '../components/layout/MeLunLogo';
import '../components/marketing/landing.css';
import {
  RoleAnalysisVisual,
  InterviewContextVisual,
  CandidateMatchVisual,
  CandidateEvaluationVisual,
  ApplicantJourneyVisual,
  DecisionComparisonVisual,
} from '../components/marketing/capabilityVisuals';

import productImg from '../assests/images/2.jpg';
import analyticsImg from '../assests/images/3.jpg';
import hrImg from '../assests/images/4.jpg';
import heroBg from '../assests/images/Final Hero.png';
import applicantImg from '../assests/images/5.jpg';
import workflowImg from '../assests/images/6.jpg';

/* ────────────────────────────────────────────────────────────────── */
/*  Shared reveal-on-scroll primitive (Framer Motion)                 */
/* ────────────────────────────────────────────────────────────────── */
function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Section heading (eyebrow + title + sub)                           */
/* ────────────────────────────────────────────────────────────────── */
function SectionHeading({
  eyebrow,
  title,
  sub,
  center = true,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  center?: boolean;
}) {
  return (
    <Reveal className={center ? 'text-center' : ''}>
      <div className={`max-w-3xl ${center ? 'mx-auto' : ''}`}>
        <span className="qf-eyebrow">{eyebrow}</span>
        <h2 className="mt-4 text-[clamp(1.75rem,5.4vw,3rem)] font-extrabold leading-[1.08] tracking-tight text-white">
          {title}
        </h2>
        {sub && <p className="mt-5 text-base sm:text-lg text-gray-400 leading-relaxed">{sub}</p>}
      </div>
    </Reveal>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Mock product browser window (reusable, replaceable mock)          */
/* ────────────────────────────────────────────────────────────────── */
function MockWindow({
  title,
  badge,
  children,
  className = '',
  url,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  className?: string;
  url?: string;
}) {
  return (
    <div className={`qf-window ${className}`}>
      <div className="qf-window-bar">
        <div className="qf-dots"><i /><i /><i /></div>
        <div className="qf-window-url">{url ?? `app.melunhire.com/${title.toLowerCase().replace(/\s+/g, '-')}`}</div>
        {badge && <span className="qf-window-badge">{badge}</span>}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Small metric bar used across mockups                              */
/* ────────────────────────────────────────────────────────────────── */
function MetricBar({
  label,
  pct,
  warm = false,
}: {
  label: string;
  pct: number;
  warm?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-xs font-bold text-white">{pct}%</span>
      </div>
      <div className={`qf-bar ${warm ? 'qf-warm' : ''}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Ambient background blob helper                                    */
/* ────────────────────────────────────────────────────────────────── */
function Glow({
  className = '',
  color = 'rgba(139,92,246,0.22)',
}: {
  className?: string;
  color?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`absolute rounded-full pointer-events-none blur-[110px] ${className}`}
      style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
    />
  );
}

/* ---- Arrow icon ---- */
function ArrowIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

/* ---- Chevron icon (expand / collapse) ---- */
function ChevronIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  Top navigation — polished SaaS controls                           */
/* ────────────────────────────────────────────────────────────────── */
function TopNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const links = [
    { label: 'Product', id: 'intro' },
    { label: 'Evaluation', id: 'evaluation' },
    { label: 'Interviews', id: 'interview' },
    { label: 'For Employers', id: 'employers' },
    { label: 'For Applicants', id: 'applicants' },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-navy-950/80 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/20'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-[4.4rem]">
          {/* Logo — the shared MeLun lockup (the public site is always dark) */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center group"
            aria-label="MeLun Hire home"
          >
            <MeLunLogo size={36} variant="onDark" subtitle="AI-Powered Hiring" />
          </button>

          {/* Desktop links */}
          <div className="hidden lg:flex items-center gap-1">
            {links.map((l) => (
              <button
                key={l.id}
                onClick={() => scrollTo(l.id)}
                className="px-3.5 py-2 text-sm font-medium text-gray-100 hover:text-white rounded-lg hover:bg-white/5 transition-all [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]"
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* Right CTAs */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigate('/login')}
              className="hidden sm:inline-flex px-4 py-2 text-sm font-semibold text-white bg-white/10 border border-white/20 rounded-lg hover:bg-white/15 hover:border-white/30 transition-all [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]"
            >
              Log in
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="hidden min-[360px]:inline-flex items-center gap-1.5 px-3.5 sm:px-5 py-2.5 text-[13px] sm:text-sm font-semibold text-white bg-gradient-to-br from-primary to-primary-hover rounded-lg border border-primary-light/40 shadow-lg shadow-primary/25 hover:-translate-y-0.5 hover:shadow-primary/40 hover:brightness-105 transition-all"
            >
              Get Started
              <ArrowIcon className="w-3.5 h-3.5" />
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden relative w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
              aria-label="Toggle menu"
            >
              <div className="flex flex-col gap-1.5">
                <span className={`block w-5 h-0.5 bg-gray-300 rounded-full transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                <span className={`block w-5 h-0.5 bg-gray-300 rounded-full transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
                <span className={`block w-5 h-0.5 bg-gray-300 rounded-full transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`lg:hidden overflow-hidden transition-all duration-300 ${menuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="bg-navy-900/95 backdrop-blur-xl border-t border-white/5 px-4 py-4 flex flex-col gap-1">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => scrollTo(l.id)}
              className="text-sm font-medium text-gray-100 hover:text-white py-2.5 px-3 rounded-lg hover:bg-white/5 transition-all text-left"
            >
              {l.label}
            </button>
          ))}
          <hr className="border-white/5 my-2" />
          <button
            onClick={() => { setMenuOpen(false); navigate('/login'); }}
            className="text-sm font-medium text-gray-100 hover:text-white py-2.5 px-3 rounded-lg hover:bg-white/5 transition-all text-left"
          >
            Log in
          </button>
          <button
            onClick={() => { setMenuOpen(false); navigate('/signup'); }}
            className="mt-1 text-sm font-semibold bg-gradient-to-r from-primary to-primary-hover text-white px-5 py-3 rounded-xl transition-all duration-200 text-center"
          >
            Get Started
          </button>
        </div>
      </div>
    </nav>
  );
}


/* ────────────────────────────────────────────────────────────────── */
/*  HERO — cinematic, layered background + mock product visual        */
/* ────────────────────────────────────────────────────────────────── */
function HeroSection() {
  const navigate = useNavigate();
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section id="hero" className="relative min-h-screen flex items-center pt-24 pb-16 sm:pt-28 sm:pb-24 overflow-hidden">
      {/* Layered atmospheric background — decorative only.
          Clean full-bleed photograph: no overlays, masks, glows, grid,
          grain, particles or scrims over the photo. */}
      <div className="absolute inset-0 overflow-hidden bg-[#07080d]" aria-hidden="true">
        {/* 1. base wash (flat dark fallback behind the photo) */}
        <div className="absolute inset-0 qf-hero-base" />

        {/* 1b. full-bleed hero photograph, natural/sharp (no mask/fade/effects). */}
        <div className="qf-hero-photo" aria-hidden="true">
          <img
            src={heroBg}
            alt=""
            loading="eager"
            decoding="async"
            className="qf-hero-photo-img"
          />
        </div>

        {/* ── Floating UI tabs (anchored to hero visual, above bg) ── */}
        <div className="qf-hero-overlays" aria-hidden="true">
          {/* 1 — AI Matching · upper-center/left, above the people */}
          <div className="qf-float-card qf-fc-match">
            <div className="qf-fc-match-head">
              <span className="qf-fc-spark">✦</span>
              <span>
                <strong>AI Matching</strong>
                <small>Best fit for your role</small>
              </span>
            </div>
            <div className="qf-fc-row">
              <span className="qf-fc-ico">&lt;/&gt;</span>
              <span className="qf-fc-meter">
                <span className="qf-fc-label">Skills Match <b>98%</b></span>
                <span className="qf-fc-bar"><i style={{ width: '98%' }} /></span>
              </span>
            </div>
            <div className="qf-fc-row">
              <span className="qf-fc-ico">💼</span>
              <span className="qf-fc-meter">
                <span className="qf-fc-label">Experience Match <b>88%</b></span>
                <span className="qf-fc-bar"><i style={{ width: '88%' }} /></span>
              </span>
            </div>
            <div className="qf-fc-row">
              <span className="qf-fc-ico">♥</span>
              <span className="qf-fc-meter">
                <span className="qf-fc-label">Culture Fit <b>92%</b></span>
                <span className="qf-fc-bar"><i style={{ width: '92%' }} /></span>
              </span>
            </div>
          </div>

          {/* 2 — Priya Sharma · upper-right, above heads */}
          <div className="qf-float-card qf-fc-person qf-fc-priya">
            <div className="qf-fc-top">
              <span className="qf-fc-avatar">PS</span>
              <span className="qf-fc-id">
                <strong>Priya Sharma</strong>
                <small>Frontend Developer</small>
                <span className="qf-fc-matchpill">96% Match</span>
              </span>
            </div>
            <div className="qf-fc-tags">
              <span>React</span><span>TypeScript</span><span>UI/UX</span><span>+2 more</span>
            </div>
          </div>

          {/* 3 — AI Interview Ready · lower-left open workspace */}
          <div className="qf-float-card qf-fc-ready">
            <span className="qf-fc-check">✓</span>
            <span className="qf-fc-ready-tx">
              <strong>AI Interview Ready</strong>
              <small>Candidate screened</small>
            </span>
            <span className="qf-fc-wave">
              <i /><i /><i /><i /><i /><i /><i />
            </span>
          </div>

          {/* 4 — Rahul Verma · lower-right, beside/below right person */}
          <div className="qf-float-card qf-fc-person qf-fc-rahul">
            <div className="qf-fc-top">
              <span className="qf-fc-avatar qf-fc-avatar-b">RV</span>
              <span className="qf-fc-id">
                <strong>Rahul Verma</strong>
                <small>Backend Engineer</small>
                <span className="qf-fc-matchpill">92% Match</span>
              </span>
            </div>
            <div className="qf-fc-tags">
              <span>Node.js</span><span>PostgreSQL</span><span>AWS</span><span>+1 more</span>
            </div>
          </div>
        </div>

        {/* bottom fade into next section */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[#05060b]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          {/* LEFT — headline (shifted further left on large screens) */}
          <div className="text-center lg:text-left lg:-ml-10 xl:-ml-16">
            <Reveal>
              <div className="inline-flex max-w-full items-center gap-2.5 bg-white/5 border border-white/10 rounded-full pl-2 pr-4 py-1.5 mb-8">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/20 text-primary-light text-[11px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-light animate-pulse" />
                  AI
                </span>
                <span className="text-xs text-gray-300 font-medium">Hiring intelligence for modern teams</span>
              </div>
            </Reveal>

            <Reveal delay={0.05}>
              <h1 className="tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.55)]">
                <span className="block text-[clamp(2rem,8vw,4.6rem)] font-extrabold leading-[1.05] tracking-tight">
                  MeLun Hire.
                </span>
                <span className="mt-2 block text-[clamp(1.45rem,5.2vw,3.2rem)] font-semibold leading-[1.05] tracking-tight text-gray-200">
                  <span className="block">Where Smart</span>
                  <span className="block">Hiring <span className="qf-grad-text">Begins.</span></span>
                </span>
              </h1>
            </Reveal>

            <Reveal delay={0.12}>
              <p className="mt-6 text-base sm:text-lg font-medium text-gray-100 leading-relaxed max-w-lg mx-auto lg:mx-0 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
                MeLun Hire connects role requirements, candidate skills, experience,
                and AI-powered interviews to create a more complete picture of
                candidate–role fit.
              </p>
            </Reveal>

            <Reveal delay={0.2}>
              <div className="mt-9 flex flex-col sm:flex-row gap-3.5 justify-center lg:justify-start">
                <button
                  onClick={() => navigate('/signup')}
                  className="qf-btn-primary"
                >
                  Get Started
                  <ArrowIcon />
                </button>
                <button
                  onClick={() => scrollTo('intro')}
                  className="qf-btn-ghost"
                >
                  Learn More
                </button>
              </div>
            </Reveal>

            <Reveal delay={0.28}>
              <div className="mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs font-medium text-gray-100 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
                {['Role-aware evaluation', 'Structured AI interviews', 'Candidate reports'].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-primary-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {t}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>


          {/* RIGHT column removed — no floating UI over the photograph. */}
          <div className="hidden lg:block" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}


/* ────────────────────────────────────────────────────────────────── */
/*  Trust strip — product capabilities (NO fake logos/testimonials)  */
/* ────────────────────────────────────────────────────────────────── */
function TrustStrip() {
  const items = [
    { icon: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z', label: 'AI Candidate Evaluation' },
    { icon: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z', label: 'Role-Aware Matching' },
    { icon: 'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z', label: 'AI Interviews' },
  ];
  return (
    <section className="relative border-y border-white/[0.06] bg-navy-900/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Reveal>
          <p className="text-center text-xs text-gray-500 uppercase tracking-[0.3em] mb-7">
            Built for modern hiring teams
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {items.map((c) => (
              <span key={c.label} className="inline-flex items-center gap-2.5 text-gray-400">
                <span className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-primary-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
                  </svg>
                </span>
                <span className="text-sm font-medium">{c.label}</span>
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  INTRO — AI hiring built around the whole candidate               */
/* ────────────────────────────────────────────────────────────────── */
function IntroSection() {
  return (
    <section id="intro" className="relative py-16 sm:py-24 lg:py-28 overflow-hidden">
      <Glow className="top-[10%] right-[-8%] w-[600px] h-[600px]" color="rgba(139,92,246,0.16)" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          {/* LEFT — big typography */}
          <div>
            <Reveal>
              <span className="qf-eyebrow">The whole candidate</span>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5 text-[clamp(2rem,6vw,3.6rem)] leading-[1.06] font-extrabold tracking-tight text-white">
                AI hiring built around the{' '}
                <span className="qf-grad-text">whole candidate.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-6 text-gray-400 text-base sm:text-lg leading-relaxed max-w-lg">
                A candidate is more than a resume. MeLun Hire brings together the
                role, the candidate, and the interview to build a fuller
                picture of fit.
              </p>
            </Reveal>

            <Reveal delay={0.2}>
              <div className="mt-8 space-y-3.5">
                {[
                  { t: 'Role', d: 'The skills, experience, responsibilities, and capabilities the position requires.', dot: 'bg-primary-light' },
                  { t: 'Candidate', d: 'What the applicant brings — skills, experience, projects, and relevant capabilities.', dot: 'bg-violet-400' },
                  { t: 'Interview', d: 'AI-powered interviews that explore the candidate beyond the resume.', dot: 'bg-coral-400' },
                ].map((r, i) => (
                  <div key={r.t} className="flex items-start gap-3.5">
                    <span className={`mt-1.5 w-2 h-2 rounded-full ${r.dot} ${i === 2 ? 'animate-pulse' : ''}`} />
                    <div>
                      <p className="text-sm font-semibold text-white">{r.t}</p>
                      <p className="text-xs text-gray-500">{r.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>


          {/* RIGHT — product visual with floating connection cards */}
          <Reveal delay={0.1} className="flex items-center justify-center">
            <div className="relative mx-auto max-w-[520px]">
              <Glow className="inset-0 m-auto w-[460px] h-[460px]" color="rgba(124,58,237,0.2)" />

              {/* product / platform visual */}
              <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50">
                <img
                  src={productImg}
                  alt="MeLun Hire hiring platform in action"
                  className="w-full aspect-[3/2] object-cover object-center"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-navy-950/80 via-navy-950/20 to-navy-950/5" />
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}


/* ────────────────────────────────────────────────────────────────── */
/*  AI CANDIDATE EVALUATION — mock evaluation interface               */
/* ────────────────────────────────────────────────────────────────── */
function EvaluationSection() {
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <section id="evaluation" className="relative py-16 sm:py-24 lg:py-28 overflow-hidden">
      {/* dark charcoal + subtle blue/violet ambient */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950 via-[#090b16] to-navy-950" />
      <Glow className="top-[20%] left-[-8%] w-[560px] h-[560px]" color="rgba(99,102,241,0.16)" />
      <Glow className="bottom-[10%] right-[-10%] w-[520px] h-[520px]" color="rgba(139,92,246,0.14)" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          {/* LEFT — mock evaluation interface */}
          <Reveal className="flex items-center justify-center">
            <div className="relative mx-auto max-w-[540px]">
              <Glow className="inset-0 m-auto w-[460px] h-[400px]" color="rgba(99,102,241,0.16)" />

              {/* preview — image cover ⇄ full mock, expanding in place */}
              <AnimatePresence mode="wait" initial={false}>
                {!open ? (
                  <motion.div
                    key="evaluation-cover"
                    initial={{ opacity: 0, scale: 0.97, x: -8 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.97, x: 10 }}
                    transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <div className="group relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50">
                      <img
                        src={analyticsImg}
                        alt="AI hiring analytics and matching insights"
                        className="w-full aspect-[4/3] object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/10 to-transparent" />
                      <button
                        type="button"
                        onClick={() => setOpen(true)}
                        aria-expanded={open}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-navy-950/70 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md transition-colors duration-300 hover:border-primary-light/50 hover:text-gray-100"
                      >
                        <span>Explore AI Evaluation</span>
                        <ArrowIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="evaluation-mock"
                    initial={{ opacity: 0, scale: 0.97, x: 10 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.97, x: -10 }}
                    transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <MockWindow title="Candidate Evaluation" badge="Resume analysis">
                <p className="text-xs text-gray-400 mb-1">Candidate Evaluation</p>
                <p className="text-base font-bold text-white mb-4">Role: ML Engineer</p>

                <div className="space-y-4">
                  <MetricBar label="Experience" pct={90} />
                  <MetricBar label="Technical Skills" pct={87} />
                  <MetricBar label="Role Alignment" pct={91} warm />
                </div>

                {/* interactive expand — opens a product-style detail panel */}
                <button
                  onClick={() => setDetailOpen((v) => !v)}
                  aria-expanded={detailOpen}
                  className="mt-5 w-full flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 text-left transition-colors hover:border-primary/30"
                >
                  <span className="text-xs font-semibold text-gray-200">
                    {detailOpen ? 'Hide evaluation details' : 'View evaluation'}
                  </span>
                  <motion.div
                    animate={{ rotate: detailOpen ? 180 : 0 }}
                    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    className="text-gray-400"
                  >
                    <ChevronIcon className="w-4 h-4" />
                  </motion.div>
                </button>

                <AnimatePresence initial={false}>
                  {detailOpen && (
                    <motion.div
                      key="eval-detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                        <div>
                          <p className="text-[11px] text-gray-500 mb-2">Score breakdown</p>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">Problem solving</span>
                              <span className="font-semibold text-white">9.2 / 10</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">Technical depth</span>
                              <span className="font-semibold text-white">8.7 / 10</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">Communication</span>
                              <span className="font-semibold text-white">8.9 / 10</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">Overall fit</span>
                              <span className="font-semibold qf-grad-text">91%</span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5">
                          <p className="text-[11px] text-gray-500 mb-1.5">Feedback</p>
                          <p className="text-xs text-gray-300 leading-relaxed">
                            Strong Python and ML background with deployment experience.
                            Well-aligned with the role's requirements.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                      </MockWindow>

                      <div className="mt-4 text-center">
                        <button
                          type="button"
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-gray-200 transition-colors duration-300 hover:border-primary-light/50 hover:text-white"
                        >
                          Hide AI Evaluation
                        </button>
                      </div>
                    </motion.div>
                  )}
              </AnimatePresence>
            </div>
          </Reveal>

          {/* RIGHT — heading + explanation */}
          <div>
            <Reveal>
              <span className="qf-eyebrow">AI evaluation</span>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-4 text-[clamp(1.75rem,5.4vw,3rem)] font-extrabold tracking-tight leading-[1.1] text-white">
                Evaluate candidates on their{' '}
                <span className="qf-grad-text">real fit,</span> not just keywords.
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-6 text-gray-400 leading-relaxed max-w-lg">
                MeLun Hire evaluates skills and experience in the context of the role,
                identifies relevant capabilities, and highlights how a candidate\u2019s
                background aligns with the position\u2019s responsibilities.
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-8 grid sm:grid-cols-2 gap-3">
                {['Experience evaluated against the role', 'Relevant technical skills identified', 'Role alignment surfaced, not keyword hits', 'Strong evidence highlighted for recruiters'].map((t) => (
                  <div key={t} className="flex items-start gap-2.5 qf-glass rounded-xl px-3.5 py-3">
                    <svg className="w-4 h-4 text-primary-light shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="text-sm text-gray-300">{t}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}


/* ────────────────────────────────────────────────────────────────── */
/*  ABOUT MELUN HIRE — About text + existing matching visual           */
/* ────────────────────────────────────────────────────────────────── */
function AboutSection() {
  return (
    <section id="about" className="relative py-16 sm:py-24 lg:py-28 overflow-hidden">
      <Glow className="top-[15%] left-[30%] w-[700px] h-[600px]" color="rgba(124,58,237,0.16)" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          {/* LEFT — About text */}
          <div className="order-2 lg:order-1">
            <Reveal>
              <span className="qf-eyebrow">About MeLun Hire</span>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-4 text-[clamp(1.75rem,5.4vw,3rem)] font-extrabold tracking-tight leading-[1.1] text-white">
                Hiring should understand the{' '}
                <span className="qf-grad-text">whole candidate.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-6 text-gray-400 leading-relaxed max-w-lg">
                MeLun Hire is the AI-powered hiring platform by MeLun, built to
                connect the requirements of a role with the skills, experience,
                and capabilities of the people applying for it.
              </p>
              <p className="mt-4 text-gray-400 leading-relaxed max-w-lg">
                MeLun Hire brings evaluation and AI-powered interviews into the
                hiring process so companies can better understand candidate-role
                fit, while applicants get a better opportunity to demonstrate what
                they can actually do.
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-8 qf-glass rounded-2xl p-5">
                <p className="text-sm text-gray-300 leading-relaxed">
                  Evaluates and connects role, candidate, and interview — so fit
                  is understood, not guessed.
                </p>
              </div>
            </Reveal>
          </div>

          {/* RIGHT — mock matching visualization */}
          <Reveal delay={0.1}>
            <div className="relative order-1 lg:order-2 mx-auto max-w-[520px]">
              <Glow className="inset-0 m-auto w-[480px] h-[440px]" color="rgba(124,58,237,0.2)" />

              {/* connecting vertical flow line */}
              <div className="absolute left-1/2 -translate-x-1/2 top-[8%] bottom-[8%] w-px bg-gradient-to-b from-primary-light/50 via-primary/40 to-transparent" />

              <div className="qf-glass rounded-2xl p-4 text-center mb-6">
                <p className="text-xs font-bold text-white">JOB REQUIREMENTS</p>
                <div className="mt-1.5 space-y-0.5 text-[11px] text-gray-500">
                  <p>Required technical skills</p>
                  <p>Relevant experience</p>
                  <p>Domain knowledge</p>
                </div>
              </div>

              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-xl shadow-primary/40" style={{ animation: 'qfFloat 6s ease-in-out infinite' }}>
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                  </svg>
                </div>
              </div>

              <div className="qf-glass rounded-2xl p-4 text-center">
                <p className="text-xs font-bold text-white">CANDIDATE FIT</p>
                <p className="text-3xl font-extrabold qf-grad-text mt-1">94%</p>
                <p className="text-[11px] text-gray-500 mt-1">Where the candidate aligns — and what to explore</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}


/* ────────────────────────────────────────────────────────────────── */
/*  AI INTERVIEW — mock interview interface, centered                 */
/* ────────────────────────────────────────────────────────────────── */
function InterviewSection() {
  return (
    <section id="interview" className="relative py-16 sm:py-24 lg:py-28 overflow-hidden">
      {/* near-black with subtle warm/neutral glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950 via-[#0a0908] to-navy-950" />
      <Glow className="top-[-10%] left-1/2 -translate-x-1/2 w-[760px] h-[560px]" color="rgba(217,171,163,0.12)" />
      <Glow className="bottom-[-15%] right-[-8%] w-[560px] h-[560px]" color="rgba(139,92,246,0.10)" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="AI interview"
          title={<>AI-powered interviews built <span className="qf-grad-text-coral">around the role.</span></>}
          sub="The interview uses the role requirements and candidate context to explore relevant capabilities."
        />

        <Reveal delay={0.1}>
          <div className="relative mt-10 sm:mt-16 mx-auto max-w-3xl">
            <Glow className="inset-0 m-auto w-[680px] h-[380px]" color="rgba(139,92,246,0.14)" />

            <MockWindow title="MeLun AI Interview" badge="Preview">
              <div className="flex items-center justify-between mb-5">
                <span className="qf-pill">Question 04</span>
                <span className="text-xs text-gray-500">4 / 8 questions</span>
              </div>

              <p className="text-lg font-semibold text-white leading-snug">
                Describe a technical problem you solved and explain how you
                approached the solution.
              </p>

              <div className="mt-5 rounded-xl bg-white/[0.05] border border-white/10 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: 'qfPulse 2s ease-in-out infinite' }} />
                  <span className="text-[11px] text-gray-400">Applicant response</span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 w-full rounded-full bg-white/10" />
                  <div className="h-2 w-[86%] rounded-full bg-white/10" />
                  <div className="h-2 w-[60%] rounded-full bg-white/10" />
                </div>
              </div>

              {/* scan line accent */}
              <div className="relative mt-5 flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-primary/60 to-primary-light" style={{ backgroundImage: 'linear-gradient(90deg,#7c3aed,#a78bfa)', backgroundSize: '200% 100%', animation: 'qfShimmer 3s linear infinite' }} />
                </div>
                <span className="text-[11px] text-gray-500">Analyzing response...</span>
              </div>
            </MockWindow>
          </div>
        </Reveal>
      </div>
    </section>
  );
}


/* ────────────────────────────────────────────────────────────────── */
/*  HR EXPERIENCE — employer-focused mock dashboard                   */
/* ────────────────────────────────────────────────────────────────── */
function HrSection() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const stats = [
    { label: 'Applicants', value: '248' },
    { label: 'Open Roles', value: '17' },
    { label: 'Interview Ready', value: '34' },
    { label: 'Evaluated', value: '109' },
  ];
  const candidates = [
    { name: 'Priya Sharma', role: 'ML Engineer', match: '94', initials: 'PS', status: 'Interview Ready', insight: 'Strong ML + deployment experience' },
    { name: 'James Lee', role: 'Backend Engineer', match: '88', initials: 'JL', status: 'Screening', insight: 'Distributed systems background' },
    { name: 'Aisha Khan', role: 'Data Scientist', match: '86', initials: 'AK', status: 'Shortlisted', insight: 'Strong modeling & analytics' },
  ];
  return (
    <section id="employers" className="relative py-16 sm:py-24 lg:py-28 overflow-hidden">
      {/* dark slate + cool atmospheric gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950 via-[#0b0f18] to-navy-950" />
      <Glow className="top-[10%] right-[-8%] w-[620px] h-[560px]" color="rgba(56,116,203,0.15)" />
      <Glow className="bottom-[10%] left-[-8%] w-[520px] h-[520px]" color="rgba(99,102,241,0.12)" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          {/* LEFT — text */}
          <div>
            <Reveal>
              <span className="qf-eyebrow">For employers</span>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-4 text-[clamp(1.75rem,5.4vw,3rem)] font-extrabold tracking-tight leading-[1.1] text-white">
                Run hiring from one{' '}
                <span className="qf-grad-text">clear command center.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-6 text-gray-400 leading-relaxed max-w-lg">
                Define what your roles require, evaluate applicants against
                those requirements, and run AI interviews — so you spend less
                time manually filtering and more time reviewing stronger candidates.
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-8 flex flex-wrap gap-2">
                {['Applicant pipeline', 'AI screening', 'Interview management', 'Hiring insights'].map((t) => (
                  <span key={t} className="qf-pill qf-muted">{t}</span>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.28}>
              <button onClick={() => navigate('/hr/login')} className="qf-btn-ghost mt-9">
                Explore the HR experience
                <ArrowIcon />
              </button>
            </Reveal>
          </div>

          {/* RIGHT — mock HR dashboard */}
          <Reveal delay={0.1} className="flex items-center justify-center">
            <div className="relative mx-auto max-w-[540px]">
              <Glow className="inset-0 m-auto w-[480px] h-[420px]" color="rgba(56,116,203,0.18)" />

              {/* preview — employer image ⇄ full dashboard mock, expanding in place */}
              <AnimatePresence mode="wait" initial={false}>
                {!open ? (
                  <motion.div
                    key="hr-cover"
                    initial={{ opacity: 0, scale: 0.97, x: 8 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.97, x: -10 }}
                    transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <div className="group relative mx-auto max-w-[400px] overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50">
                      <img
                        src={hrImg}
                        alt="Recruiter workspace with MeLun Hire"
                        className="w-full aspect-[4/5] object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/10 to-transparent" />
                      <button
                        type="button"
                        onClick={() => setOpen(true)}
                        aria-expanded={open}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/15 bg-navy-950/70 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md transition-colors duration-300 hover:border-emerald-300/40 hover:text-gray-100"
                      >
                        <span>Explore Hiring Workspace</span>
                        <ArrowIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="hr-mock"
                    initial={{ opacity: 0, scale: 0.97, x: -10 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.97, x: 10 }}
                    transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <MockWindow title="HR Dashboard" badge="Preview">
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {stats.map((s) => (
                    <div key={s.label} className="rounded-xl bg-white/[0.04] border border-white/10 p-3.5">
                      <p className="text-[11px] text-gray-500">{s.label}</p>
                      <p className="mt-1 text-2xl font-extrabold text-white">{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-300">Candidate pipeline</p>
                  <span className="qf-pill">Live</span>
                </div>

                {/* interactive candidate rows */}
                <div className="space-y-2">
                  {candidates.map((c, i) => (
                    <div key={c.name} className="rounded-xl bg-white/[0.04] border border-white/10 overflow-hidden">
                      <button
                        onClick={() => setSelected(selected === i ? null : i)}
                        aria-expanded={selected === i}
                        className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center text-white text-[11px] font-bold">
                            {c.initials}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">{c.name}</p>
                            <p className="text-[11px] text-gray-500">{c.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold qf-grad-text">{c.match}%</span>
                          <motion.div
                            animate={{ rotate: selected === i ? 180 : 0 }}
                            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                            className="text-gray-400"
                          >
                            <ChevronIcon className="w-4 h-4" />
                          </motion.div>
                        </div>
                      </button>

                      <AnimatePresence initial={false}>
                        {selected === i && (
                          <motion.div
                            key={`${c.name}-detail`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                            className="overflow-hidden"
                          >
                            <div className="px-3.5 pb-3.5 pt-1 border-t border-white/10 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Hiring status</span>
                                <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  {c.status}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Resume insight</span>
                                <span className="text-gray-300 text-right max-w-[11rem]">{c.insight}</span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Role fit</span>
                                <span className="font-semibold text-white">{c.match}%</span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
                      </MockWindow>

                      <div className="mt-4 text-center">
                        <button
                          type="button"
                          onClick={() => setOpen(false)}
                          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-gray-200 transition-colors duration-300 hover:border-emerald-300/40 hover:text-white"
                        >
                          Hide Hiring Workspace
                        </button>
                      </div>
                    </motion.div>
                  )}
              </AnimatePresence>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}


/* ────────────────────────────────────────────────────────────────── */
/*  APPLICANT EXPERIENCE — mock job discovery                         */
/* ────────────────────────────────────────────────────────────────── */
function ApplicantSection() {
  const navigate = useNavigate();
  const jobs = [
    { title: 'Machine Learning Engineer', tag: 'Remote', match: '94%', desc: 'Strong alignment across ML skills, technical experience, and role requirements.' },
    { title: 'Software Engineer', tag: 'Hybrid', match: '87%', desc: 'Good match based on software development experience and relevant technical capabilities.' },
    { title: 'AI Research Intern', tag: 'On-site', match: '82%', desc: 'Relevant academic and project experience, with more to show through evaluation.' },
  ];
  return (
    <section id="applicants" className="relative py-16 sm:py-24 lg:py-28 overflow-hidden">
      {/* dark charcoal + subtle purple/indigo atmosphere */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950 via-[#0d0a17] to-navy-950" />
      <Glow className="top-[15%] left-[-8%] w-[620px] h-[560px]" color="rgba(139,92,246,0.14)" />
      <Glow className="bottom-[10%] right-[-8%] w-[520px] h-[520px]" color="rgba(124,58,237,0.12)" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          {/* LEFT — mock job discovery */}
          <Reveal className="flex items-center justify-center">
            <div className="relative mx-auto max-w-[540px]">
              <Glow className="inset-0 m-auto w-[480px] h-[420px]" color="rgba(139,92,246,0.16)" />
              <MockWindow title="Discover Roles" badge="Applicant view">
                {/* candidate visual banner */}
                <div className="relative overflow-hidden rounded-xl mb-4">
                  <img
                    src={applicantImg}
                    alt="Candidate discovering relevant roles on MeLun Hire"
                    className="w-full aspect-[5/2] object-cover object-center"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-navy-950/80 via-navy-950/15 to-transparent" />
                  <span className="absolute bottom-2.5 left-3 text-[11px] text-gray-200 font-medium">
                    Discover roles matched to you
                  </span>
                </div>
                <p className="text-xs font-semibold text-gray-300 mb-4">Recommended for you</p>
                <div className="space-y-3">
                  {jobs.map((j) => (
                    <div key={j.title} className="rounded-xl bg-white/[0.04] border border-white/10 p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{j.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{j.tag}</p>
                        <p className="text-[10px] text-gray-600 mt-1 leading-snug max-w-[15rem]">{j.desc}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-gray-500">Role Match</p>
                        <p className="text-sm font-extrabold qf-grad-text">{j.match}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </MockWindow>
            </div>
          </Reveal>

          {/* RIGHT — text */}
          <div>
            <Reveal>
              <span className="qf-eyebrow">For applicants</span>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-4 text-[clamp(1.75rem,5.4vw,3rem)] font-extrabold tracking-tight leading-[1.1] text-white">
                Discover roles that see your{' '}
                <span className="qf-grad-text">real potential.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-6 text-gray-400 leading-relaxed max-w-lg">
                MeLun Hire recommends roles based on your skills, experience, and
                alignment with the role — not simply the presence of matching
                keywords. Find opportunities where your capabilities are relevant.
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-8 space-y-3">
                {['Role-matched recommendations', 'Show skills beyond the resume', 'A clear application journey', 'Structured, fair interviews'].map((t) => (
                  <div key={t} className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-primary-light shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="text-sm text-gray-300">{t}</span>
                  </div>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.28}>
              <button onClick={() => navigate('/applicant/login')} className="qf-btn-ghost mt-9">
                Get started as an applicant
                <ArrowIcon />
              </button>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}


/* ────────────────────────────────────────────────────────────────── */
/*  HOW MELUN HIRE WORKS — connected 4-step timeline                   */
/* ────────────────────────────────────────────────────────────────── */
function HowItWorksSection() {
  const steps = [
    {
      n: '01',
      title: 'Create / Apply',
      body: 'Companies define the role and its requirements. Applicants discover and apply to relevant opportunities.',
    },
    {
      n: '02',
      title: 'AI Evaluation',
      body: 'MeLun Hire evaluates candidate information against the requirements of the role.',
    },
    {
      n: '03',
      title: 'AI Interview',
      body: 'Candidates complete a role-aware AI interview that explores relevant capabilities.',
    },
    {
      n: '04',
      title: 'Decision',
      body: 'Recruiters receive structured evaluation insights to help make a more informed hiring decision.',
    },
  ];

  return (
    <section id="how-it-works" className="relative py-16 sm:py-24 lg:py-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950 via-[#090b16] to-navy-950" />
      <Glow className="top-[20%] left-1/2 -translate-x-1/2 w-[720px] h-[500px]" color="rgba(124,58,237,0.14)" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="How MeLun Hire works"
          title={<>From role to decision, in <span className="qf-grad-text">four clear steps.</span></>}
          sub="A connected journey with AI support at every stage — no disjointed tools, no lost context."
        />

        <div className="relative mt-10 sm:mt-16">
          {/* glowing connector (desktop horizontal) */}
          <div className="hidden lg:block absolute top-[4.2rem] left-[10%] right-[10%] h-0.5 -translate-y-1/2">
            <div className="h-full bg-gradient-to-r from-transparent via-primary/50 to-transparent" style={{ boxShadow: '0 0 18px rgba(139,92,246,0.5)' }} />
          </div>
          {/* glowing connector (mobile vertical) */}
          <div className="lg:hidden absolute top-2 bottom-2 left-8 w-0.5 bg-gradient-to-b from-primary/0 via-primary/40 to-primary/0" style={{ boxShadow: '0 0 14px rgba(139,92,246,0.4)' }} />

          <div className="grid lg:grid-cols-4 gap-10 lg:gap-6">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.08}>
                <div className="relative flex lg:flex-col items-start lg:items-center text-left lg:text-center">
                  {/* node */}
                  <div className="relative z-10 shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 flex items-center justify-center shadow-xl shadow-black/30" style={{ animation: `qfFloat ${5 + i}s ease-in-out ${i}s infinite` }}>
                    <span className="text-xl font-extrabold qf-grad-text">{s.n}</span>
                  </div>
                  <div className="ml-5 lg:ml-0 lg:mt-6">
                    <h3 className="text-lg font-bold text-white">{s.title}</h3>
                    <p className="mt-2 text-sm text-gray-400 leading-relaxed max-w-xs">{s.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


/* ────────────────────────────────────────────────────────────────── */
/*  WHY MELUN HIRE — large typography-driven section                    */
/* ────────────────────────────────────────────────────────────────── */
function WhySection() {
  const items = [
    {
      big: 'Better',
      word: 'matching',
      body: 'Connects what a candidate has done to what the role actually requires.',
      layout: 'top',
    },
    {
      big: 'Structured',
      word: 'interviews',
      body: 'Role-matched questions help create a consistent and relevant interview experience.',
      layout: 'top',
    },
    {
      big: 'Clearer',
      word: 'decisions',
      body: 'Brings role, candidate, evaluation, and interview evidence together in one view.',
      layout: 'top',
    },
    {
      big: 'For',
      word: 'employers',
      body: 'Give hiring teams clearer candidate insight, role-aware evaluation, and structured interviews so they can spend more time reviewing the right candidates.',
      layout: 'bottom',
    },
    {
      big: 'For',
      word: 'applicants',
      body: 'Help candidates discover relevant opportunities and demonstrate their skills, experience, and capabilities beyond the resume.',
      layout: 'bottom',
    },
  ];

  return (
    <section id="why" className="relative py-16 sm:py-24 lg:py-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950 via-[#0a0813] to-navy-950" />

      {/* abstract AI network behind */}
      <div className="absolute inset-0 qf-grid-bg opacity-60" />

      <Glow
        className="top-[-10%] left-[10%] w-[620px] h-[620px]"
        color="rgba(124,58,237,0.18)"
      />

      <svg
        className="absolute right-[-6%] top-[18%] w-[520px] h-[520px] opacity-40 pointer-events-none"
        viewBox="0 0 520 520"
        fill="none"
      >
        <g stroke="#a78bfa" strokeWidth="1">
          {Array.from({ length: 6 }).map((_, i) => (
            <circle
              key={i}
              cx={80 + i * 72}
              cy={90 + ((i * 73) % 260)}
              r={i % 2 ? 6 : 3}
              fill="#a78bfa"
              fillOpacity="0.5"
            />
          ))}

          {Array.from({ length: 5 }).map((_, i) => (
            <line
              key={i}
              x1={60 + i * 90}
              y1={60}
              x2={220 + i * 40}
              y2={460}
              strokeOpacity="0.25"
            />
          ))}
        </g>
      </svg>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Why MeLun Hire"
          title={
            <>
              Hiring with more{' '}
              <span className="qf-grad-text">signal,</span> less noise.
            </>
          }
        />

        {/* candidate / workflow visual */}
        <Reveal delay={0.05}>
          <div className="relative mt-12 mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50">
            <img
              src={workflowImg}
              alt="Candidate workflow through the MeLun Hire hiring journey"
              className="w-full aspect-[3/2] object-cover object-center"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/20 to-navy-950/10" />
            <div className="absolute bottom-4 left-5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-light animate-pulse" />
              <span className="text-xs text-gray-200 font-medium">From application to decision</span>
            </div>
          </div>
        </Reveal>

        {/* 3 cards on top + 2 centered cards underneath */}
        <div className="mt-10 sm:mt-16">
          {/* TOP ROW — 3 cards */}
          <div className="grid md:grid-cols-3 gap-5">
            {items
              .filter((it) => it.layout === 'top')
              .map((it, i) => (
                <Reveal key={`${it.big}-${it.word}`} delay={i * 0.08}>
                  <div className="qf-glass rounded-2xl p-6 sm:p-7 h-full min-h-[190px] transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-2xl hover:shadow-black/40">
                    <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-[1.05]">
                      {it.big}{' '}
                      <span className="qf-grad-text block sm:inline">
                        {it.word}
                      </span>
                    </p>

                    <p className="mt-3 text-sm text-gray-400 leading-relaxed">
                      {it.body}
                    </p>
                  </div>
                </Reveal>
              ))}
          </div>

          {/* BOTTOM ROW — 2 centered cards */}
          <div className="mt-5 flex flex-col md:flex-row justify-center gap-5 md:px-[16%]">
            {items
              .filter((it) => it.layout === 'bottom')
              .map((it, i) => (
                <Reveal key={`${it.big}-${it.word}`} delay={0.24 + i * 0.08}>
                  <div className="qf-glass rounded-2xl p-6 sm:p-7 h-full min-h-[190px] w-full md:w-auto md:flex-1 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-2xl hover:shadow-black/40">
                    <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-[1.05]">
                      {it.big}{' '}
                      <span className="qf-grad-text block sm:inline">
                        {it.word}
                      </span>
                    </p>

                    <p className="mt-3 text-sm text-gray-400 leading-relaxed">
                      {it.body}
                    </p>
                  </div>
                </Reveal>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}


/* ────────────────────────────────────────────────────────────────── */
/*  SOCIAL PROOF — product capability tiles (NO fake testimonials)    */
/* ────────────────────────────────────────────────────────────────── */
function SocialProofSection() {
  const tiles = [
    {
      title: 'Understand the Role',
      body: 'Turn job requirements into meaningful evaluation criteria.',
      mock: <RoleAnalysisVisual />,
    },
    {
      title: 'Interview with Context',
      body: 'Explore relevant capabilities through AI-powered interviews.',
      mock: <InterviewContextVisual />,
    },
    {
      title: 'Surface Strong Fits',
      body: 'Help recruiters identify candidates worth deeper consideration.',
      mock: <CandidateMatchVisual />,
    },
    {
      title: 'Evaluate Candidates',
      body: 'Analyze skills and experience in the context of the position.',
      mock: <CandidateEvaluationVisual />,
    },
    {
      title: 'Empower Applicants',
      body: 'Give candidates opportunities to demonstrate relevant capabilities.',
      mock: <ApplicantJourneyVisual />,
    },
    {
      title: 'Make Better Decisions',
      body: 'Bring role, candidate, and interview evidence together.',
      mock: <DecisionComparisonVisual />,
    },
  ];

  return (
    <section className="relative py-16 sm:py-24 lg:py-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950 via-[#0a0c16] to-navy-950" />
      <Glow className="top-[10%] right-[0%] w-[560px] h-[560px]" color="rgba(99,102,241,0.12)" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Built for modern hiring teams"
          title={<>Capabilities that make hiring <span className="qf-grad-text">feel fair.</span></>}
          sub="MeLun Hire evaluates candidates against real role requirements and helps both companies and applicants make better-fit decisions."
        />

        <div className="mt-10 sm:mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {tiles.map((t, i) => (
            <Reveal key={t.title} delay={(i % 3) * 0.08}>
              <div className="qf-glass rounded-2xl p-6 h-full transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-2xl hover:shadow-black/40">
                <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4 mb-4 min-h-[4.5rem] flex items-center">
                  {t.mock}
                </div>
                <h3 className="text-base font-bold text-white">{t.title}</h3>
                <p className="mt-1.5 text-sm text-gray-400 leading-relaxed">{t.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}


/* ────────────────────────────────────────────────────────────────── */
/*  FINAL CTA — cinematic closing section                              */
/* ────────────────────────────────────────────────────────────────── */
function FinalCta() {
  const navigate = useNavigate();
  return (
    <section className="relative py-20 sm:py-28 lg:py-32 overflow-hidden">
      {/* deep black with strong soft central glow */}
      <div className="absolute inset-0 bg-[#05060a]">
        <Glow className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[840px] h-[600px]" color="rgba(124,58,237,0.28)" />
        <Glow className="top-[-20%] right-[0%] w-[520px] h-[520px]" color="rgba(88,28,135,0.2)" />
        <div className="absolute inset-0 qf-grid-bg opacity-50" />
        {/* floating mock UI accents */}
        <div className="qf-glass absolute left-[12%] top-[22%] hidden md:block rounded-xl px-4 py-3" style={{ animation: 'qfFloatB 7s ease-in-out infinite' }}>
          <p className="text-[11px] text-gray-400">AI Match</p>
          <p className="text-lg font-extrabold qf-grad-text">94%</p>
        </div>
        <div className="qf-glass absolute right-[10%] bottom-[24%] hidden md:block rounded-xl px-4 py-3" style={{ animation: 'qfFloat 6s ease-in-out 1s infinite' }}>
          <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Interview Ready
          </p>
        </div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Reveal>
          <span className="qf-eyebrow">Get started</span>
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="mt-6 text-[clamp(2rem,7vw,3.75rem)] font-extrabold tracking-tight leading-[1.05] text-white">
            Build a better way <span className="qf-grad-text">to hire.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="mt-6 text-gray-400 text-lg max-w-xl mx-auto">
            Connect role requirements, candidate capabilities, and AI-powered
            interviews in one hiring experience.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="mt-10 flex flex-col sm:flex-row gap-3.5 justify-center">
            <button onClick={() => navigate('/signup')} className="qf-btn-primary text-base px-8 py-4">
              Get Started
              <ArrowIcon />
            </button>
            <button onClick={() => navigate('/login')} className="qf-btn-ghost text-base px-8 py-4">
              Explore MeLun Hire
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}


/* ────────────────────────────────────────────────────────────────── */
/*  MAIN LANDING PAGE                                                  */
/* ────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  useEffect(() => {
    const pending = sessionStorage.getItem('qf-landing-scroll');
    if (!pending) return;
    sessionStorage.removeItem('qf-landing-scroll');
    // Wait for the route transition to settle, then scroll to the anchor.
    const t = window.setTimeout(() => {
      document.getElementById(pending)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-navy-950 text-white overflow-x-hidden">
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
        html { scroll-behavior: smooth; }
      `}</style>

      <TopNav />
      <main>
        <HeroSection />
        <TrustStrip />
        <HowItWorksSection />
        <AboutSection />
        <IntroSection />
        <EvaluationSection />
        <InterviewSection />
        <HrSection />
        <ApplicantSection />
        <WhySection />
        <SocialProofSection />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}


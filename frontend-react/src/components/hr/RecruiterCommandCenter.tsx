import { motion } from 'framer-motion';
import { staggerContainer, staggerItem } from '../../animations/config';
import { CalendarIcon, ClockIcon } from './HrIcons';

/* ------------------------------------------------------------------ */
/*  1. Welcome Hero                                                    */
/* ------------------------------------------------------------------ */

function HeroSection({ hrName }: { hrName: string }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' } as const;
  const date = new Date().toLocaleDateString('en-US', options);
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <motion.section
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="bg-gradient-to-br from-primary/10 via-navy-800/50 to-navy-900 border border-white/10 rounded-2xl p-6 md:p-8"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        <div className="flex-1">
          <motion.h1 variants={staggerItem} className="text-2xl md:text-3xl font-extrabold text-white">
            {greeting}, {hrName}
          </motion.h1>
          <motion.p variants={staggerItem} className="text-gray-400 mt-2 text-sm md:text-base">
            Welcome back. Here's what's happening with your hiring today.
          </motion.p>
          <motion.div variants={staggerItem} className="flex flex-wrap gap-4 mt-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><CalendarIcon className="w-3.5 h-3.5" /> {date}</span>
            <span className="flex items-center gap-1.5"><ClockIcon className="w-3.5 h-3.5" /> {time}</span>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function RecruiterCommandCenter({ hrName }: { hrName: string }) {
  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
      {/* Welcome panel */}
      <HeroSection hrName={hrName} />
    </motion.div>
  );
}

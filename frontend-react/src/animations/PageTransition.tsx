import { motion } from 'framer-motion';
import { pageTransitionVariants } from './config';

/**
 * PageTransition wraps routed page content inside AnimatePresence.
 *
 * It animates only the page content area — NOT the sidebar, top-bar,
 * or footer (those sit outside this wrapper in the layout).
 *
 * ─── Usage ────────────────────────────────────────────────────────────
 *   // In HrLayout:
 *   <PageTransition>
 *     {children}
 *   </PageTransition>
 *
 *   // In App.tsx:
 *   <AnimatePresence mode="wait">
 *     <Routes location={location} key={location.pathname}>
 *       <Route ... element={<PageTransition><Page /></PageTransition>} />
 *     </Routes>
 *   </AnimatePresence>
 * ─────────────────────────────────────────────────────────────────────
 */
export default function PageTransition({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={pageTransitionVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={className}
      // Prevent layout shift with a subtle min-height guarantee.
      style={{ willChange: 'opacity, transform' }}
    >
      {children}
    </motion.div>
  );
}
/**
 * Shared animation configuration for the entire application.
 *
 * Centralises durations, easings, and Framer Motion variants so every
 * component uses a consistent motion language inspired by Linear, Vercel,
 * and Notion.
 *
 * ─── Usage ────────────────────────────────────────────────────────────
 *   import { fadeInUp, easeOut } from '../animations/config';
 *
 *   <motion.div variants={fadeInUp} initial="hidden" animate="visible" />
 *   <motion.div animate={{ opacity: 0 }} transition={{ ...easeOut.slow }} />
 * ─────────────────────────────────────────────────────────────────────
 */

import { type Variants, type Transition } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Easing presets                                                     */
/* ------------------------------------------------------------------ */

const customEase = [0.4, 0, 0.2, 1] as const;

export const easeOut: Record<string, Transition> = {
  /** Snappy micro-interaction (side‑bar hover, button press) */
  fast: { duration: 0.15, ease: customEase },
  /** Standard UI transition (page enter, card hover) */
  normal: { duration: 0.25, ease: customEase },
  /** Slightly slower for emphasis (modal backdrop, toast) */
  slow: { duration: 0.35, ease: customEase },
};

export const easeInOut: Record<string, Transition> = {
  fast: { duration: 0.15, ease: customEase },
  normal: { duration: 0.25, ease: customEase },
};

/* ------------------------------------------------------------------ */
/*  Page transition variants  (used by AnimatePresence)                */
/* ------------------------------------------------------------------ */

/**
 * Exit: brief fade‑out (~130 ms).
 * Enter: fade‑in + slight upward slide (~250 ms).
 *
 * Keeps the exiting page visible just long enough to avoid a flash,
 * then smoothly brings in the next page.
 */
export const pageTransitionVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: customEase },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.13, ease: customEase },
  },
};

/* ------------------------------------------------------------------ */
/*  Reusable variant objects for common patterns                       */
/* ------------------------------------------------------------------ */

/** Simple fade + translateY(10px) entry (no exit). */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: customEase },
  },
};

/** Just opacity fade (for items that shouldn't slide). */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2, ease: customEase },
  },
};

/** Scale‑up entry (modal, dropdown). */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.2, ease: customEase },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: -4,
    transition: { duration: 0.12, ease: customEase },
  },
};

/* ------------------------------------------------------------------ */
/*  Stagger helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Stagger children rendering (e.g. list items, stats cards).
 * Usage: <motion.div variants={staggerContainer}>
 *          <motion.div variants={staggerItem} />
 *        </motion.div>
 */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: customEase },
  },
};
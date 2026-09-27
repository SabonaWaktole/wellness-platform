import type { Transition, Variants } from 'framer-motion';

/**
 * Shared framer-motion presets, tuned to the existing --transition-* timing
 * tokens in tokens.css, so JS-driven and CSS-driven motion feel consistent.
 */

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 32,
};

export const easeTransition: Transition = {
  duration: 0.25,
  ease: [0.4, 0, 0.2, 1],
};

/** Modal / dialog content: scale + fade in from a centered origin. */
export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: easeTransition },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};

/** Backdrop overlay behind modals/slide-overs. */
export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** Drawer/sidebar/slide-over panel sliding in from the right. */
export const drawerVariants: Variants = {
  hidden: { x: '100%' },
  visible: { x: 0, transition: springTransition },
  exit: { x: '100%', transition: easeTransition },
};

/** Mobile bottom sheet sliding up from the bottom edge. */
export const bottomSheetVariants: Variants = {
  hidden: { y: '100%' },
  visible: { y: 0, transition: springTransition },
  exit: { y: '100%', transition: easeTransition },
};

/** Page-level enter/exit transition for route content. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: easeTransition },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

/** Parent container for staggered list/grid item entrances. */
export const listContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

/** Individual item used together with listContainerVariants. */
export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: easeTransition },
};

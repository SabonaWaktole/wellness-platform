import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useTargetRect } from '../../lib/support/useTargetRect';
import styles from './SpotlightMask.module.css';

interface SpotlightMaskProps {
  /** The element to highlight; nothing renders without one. */
  element: Element | null;
  padding?: number;
}

/**
 * The visual half of the tour: the page dimmed everywhere except a hole around
 * the target, plus a ring on the hole. Four fixed panels rather than a
 * `clip-path`, so the wheel still scrolls the page underneath. It is purely
 * visual (decorative, no pointer events); blocking clicks is a separate concern.
 */
export const SpotlightMask = ({ element, padding }: SpotlightMaskProps) => {
  const rect = useTargetRect(element, padding);
  // Unknown (no matchMedia) counts as "do not animate".
  const animated = useMediaQuery('(prefers-reduced-motion: no-preference)', false);
  if (!rect) return null;

  const bottom = rect.top + rect.height;
  const right = rect.left + rect.width;
  const at = (top: number, left: number, width: number | string, height: number | string): CSSProperties => ({
    top,
    left,
    width,
    height,
  });

  return createPortal(
    <div className={styles.root} data-animated={animated} aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <div className={styles.panel} data-spotlight="top" style={at(0, 0, '100%', Math.max(0, rect.top))} />
      <div className={styles.panel} data-spotlight="bottom" style={at(bottom, 0, '100%', `calc(100% - ${bottom}px)`)} />
      <div className={styles.panel} data-spotlight="left" style={at(rect.top, 0, Math.max(0, rect.left), rect.height)} />
      <div className={styles.panel} data-spotlight="right" style={at(rect.top, right, `calc(100% - ${right}px)`, rect.height)} />
      <div className={styles.ring} data-spotlight="ring" style={at(rect.top, rect.left, rect.width, rect.height)} />
    </div>,
    document.body,
  );
};

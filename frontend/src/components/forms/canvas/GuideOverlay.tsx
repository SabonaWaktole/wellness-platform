import React from 'react';
import type { Guide } from './snapping';
import styles from './GuideOverlay.module.css';

/**
 * Renders the alignment guides `computeSnap` reports, in PAGE coordinates.
 *
 * A guide computed while dragging an ELEMENT is in that element's SECTION's
 * local coordinate space; the caller is responsible for offsetting it by the
 * section's page position before it reaches here, so this component only
 * ever draws in one coordinate system.
 */
export const GuideOverlay: React.FC<{ guides: Guide[] }> = ({ guides }) => {
  if (guides.length === 0) return null;
  return (
    <div className={styles.overlay} aria-hidden="true">
      {guides.map((g, i) => (
        <div
          key={`${g.axis}-${g.position}-${i}`}
          className={g.axis === 'x' ? styles.vertical : styles.horizontal}
          style={g.axis === 'x' ? { left: g.position } : { top: g.position }}
        />
      ))}
    </div>
  );
};

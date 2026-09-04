import React from 'react';
import styles from './Ribbon.module.css';

export interface RibbonGroupProps {
  /** The caption under the group — what makes the grouping legible. */
  label: string;
  children: React.ReactNode;
}

/**
 * One captioned cluster of related controls, divided from its neighbours.
 *
 * This is the whole reason a ribbon reads better than a toolbar row: the
 * caption and the rule beside it say "these belong together" without the user
 * having to infer it from spacing. Undo sits next to Redo because they are one
 * idea; Cut/Copy/Paste form another. The old flat toolbar had the same
 * controls and none of that structure.
 */
export const RibbonGroup: React.FC<RibbonGroupProps> = ({ label, children }) => (
  <div className={styles.group} role="group" aria-label={label}>
    <div className={styles.groupBody}>{children}</div>
    <span className={styles.groupLabel}>{label}</span>
  </div>
);

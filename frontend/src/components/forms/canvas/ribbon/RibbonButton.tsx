import React from 'react';
import styles from './Ribbon.module.css';

export interface RibbonButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /**
   * `large` stacks the icon over its label, for the one or two commands a
   * group is really about; `small` is icon-with-label on one line for the
   * rest. Word uses exactly this weighting to say which control is the
   * primary one in a group.
   */
  size?: 'large' | 'small';
  /** Longer explanation, shown on hover and read by assistive tech. */
  title?: string;
}

/**
 * A ribbon command.
 *
 * ALWAYS carries a visible text label, never an icon alone. The old toolbar
 * had seven icon-only buttons whose meaning was carried entirely by an
 * `aria-label` — invisible to the sighted user, who had to hover each one to
 * find out what it did.
 */
export const RibbonButton: React.FC<RibbonButtonProps> = ({
  icon,
  label,
  onClick,
  disabled,
  size = 'small',
  title,
}) => (
  <button
    type="button"
    className={`${styles.button} ${size === 'large' ? styles.buttonLarge : ''}`}
    onClick={onClick}
    disabled={disabled}
    title={title ?? label}
  >
    <span className={styles.buttonIcon} aria-hidden="true">
      {icon}
    </span>
    <span className={styles.buttonLabel}>{label}</span>
  </button>
);

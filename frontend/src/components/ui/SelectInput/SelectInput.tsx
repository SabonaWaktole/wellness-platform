import { forwardRef, useId } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { tourProps } from '../../../lib/support/tourProps';
import styles from './SelectInput.module.css';

export interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
  error?: string;
  iconLeft?: ReactNode;
  /** Support tour id for the field. Goes on the container, so the highlight covers the label and the select. */
  tourId?: string;
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(
  (
    { label, helperText, error, iconLeft, children, id, className = '', required, tourId, ...props },
    ref
  ) => {
    // useId is stable across renders, unlike a random id regenerated each time.
    const generatedId = useId();
    const inputId = id || generatedId;
    const messageId = `${inputId}-message`;
    const message = error || helperText;

    const inputClasses = [
      styles.input,
      error ? styles.inputError : '',
      iconLeft ? styles.hasIconLeft : '',
      styles.hasIconRight, // Always have right space for ChevronDown
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={`${styles.container} ${className}`} {...tourProps(tourId)}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
            {required && (
              <span className={styles.required} aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        <div className={styles.inputWrapper}>
          {iconLeft && (
            <div className={`${styles.iconWrapper} ${styles.iconLeft}`} aria-hidden="true">
              {iconLeft}
            </div>
          )}

          <select
            ref={ref}
            id={inputId}
            className={inputClasses}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={message ? messageId : undefined}
            {...props}
          >
            {children}
          </select>

          <div
            className={`${styles.iconWrapper} ${styles.iconRight} ${styles.pointerEventsNone}`}
            aria-hidden="true"
          >
            <ChevronDown size={16} />
          </div>
        </div>

        {message && (
          <p
            id={messageId}
            className={`${styles.helperText} ${error ? styles.helperTextError : ''}`}
            role={error ? 'alert' : undefined}
          >
            {message}
          </p>
        )}
      </div>
    );
  }
);

SelectInput.displayName = 'SelectInput';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { tourProps } from '../../../lib/support/tourProps';
import styles from './TextInput.module.css';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  onIconRightClick?: () => void;
  /** Accessible name for the right icon button. Required when it is interactive. */
  iconRightLabel?: string;
  /** Support tour id for the field. Goes on the container, so the highlight covers the label, the control and the message. */
  tourId?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      label,
      helperText,
      error,
      iconLeft,
      iconRight,
      onIconRightClick,
      iconRightLabel,
      className = '',
      id,
      required,
      tourId,
      ...props
    },
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
      iconRight ? styles.hasIconRight : '',
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

          <input
            ref={ref}
            id={inputId}
            className={inputClasses}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={message ? messageId : undefined}
            {...props}
          />

          {iconRight && (
            <div
              className={`${styles.iconWrapper} ${styles.iconRight}`}
              aria-hidden={onIconRightClick ? undefined : 'true'}
            >
              {onIconRightClick ? (
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={onIconRightClick}
                  aria-label={iconRightLabel}
                >
                  {iconRight}
                </button>
              ) : (
                iconRight
              )}
            </div>
          )}
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

TextInput.displayName = 'TextInput';

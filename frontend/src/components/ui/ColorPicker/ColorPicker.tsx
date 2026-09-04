import React, { useId } from 'react';
import { accentContrastWarning } from '../../forms/FormRenderer/color';
import { PRESET_SWATCHES } from './presets';
import styles from './ColorPicker.module.css';

/**
 * A small on-brand palette plus a free hex value.
 *
 * The swatches are the app's own accent tokens resolved to hex, so the common
 * case stays consistent with the rest of the UI; the native picker is there
 * because tenants asked to match their own branding exactly.
 */

export interface ColorPickerProps {
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  clearLabel?: string;
  /**
   * Shown when the chosen colour fails 3:1 against one of the two page grounds.
   * The tenant picks one colour for both themes and only ever sees the one they
   * are in, so without this a form looks fine to its author and washes out for
   * half its readers.
   */
  contrastWarning?: (theme: 'light' | 'dark', ratio: number) => string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  label,
  value,
  onChange,
  clearLabel = 'Clear',
  contrastWarning,
}) => {
  const id = useId();
  const warning = value ? accentContrastWarning(value) : null;

  return (
    <div className={styles.wrapper}>
      <span className={styles.label} id={`${id}-label`}>
        {label}
      </span>

      <div className={styles.swatches} role="group" aria-labelledby={`${id}-label`}>
        {PRESET_SWATCHES.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={`${styles.swatch} ${value === swatch ? styles.swatchSelected : ''}`}
            style={{ background: swatch }}
            aria-label={swatch}
            aria-pressed={value === swatch}
            onClick={() => onChange(swatch)}
          />
        ))}
      </div>

      <div className={styles.custom}>
        <input
          type="color"
          className={styles.nativeInput}
          value={value ?? '#1d4ed8'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
        <span className={styles.hexValue}>{value ?? '—'}</span>
        {value && (
          <button type="button" className={styles.clear} onClick={() => onChange(undefined)}>
            {clearLabel}
          </button>
        )}
      </div>

      {warning && contrastWarning && (
        <p className={styles.warning}>{contrastWarning(warning.theme, warning.ratio)}</p>
      )}
    </div>
  );
};

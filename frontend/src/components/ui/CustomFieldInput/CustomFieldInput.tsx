import React, { forwardRef, useId } from 'react';
import { TextInput } from '../TextInput/TextInput';
import { SelectInput } from '../SelectInput/SelectInput';
import { TextareaInput } from '../TextareaInput/TextareaInput';
import styles from './CustomFieldInput.module.css';
import { useTranslation } from 'react-i18next';

export interface CustomFieldInputProps {
  fieldType:
    | 'text'
    | 'multiline'
    | 'number'
    | 'dropdown'
    | 'date'
    | 'checkbox'
    | 'email'
    | 'user-select'
    /** One option, rendered as a radio group instead of a <select>. */
    | 'radio'
    /** Several options at once; the value is a string[]. */
    | 'multi-select';
  label: string;
  options?: string[];
  /** Only used by `fieldType: 'user-select'`. */
  userOptions?: { id: string; label: string }[];
  value: any;
  onChange: (value: any) => void;
  error?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  /** Guidance shown under the control. Suppressed while `error` is showing. */
  helperText?: string;
  /**
   * Columns for the radio/checkbox option grid. Paper intake forms lay long
   * option lists out in two or three columns; one column per option would make
   * the "Main Workplace Type" style questions run for a whole page.
   */
  optionColumns?: 1 | 2 | 3;
}

export const CustomFieldInput = forwardRef<HTMLElement, CustomFieldInputProps>(
  (
    {
      fieldType,
      label,
      options = [],
      userOptions = [],
      value,
      onChange,
      error,
      required,
      className = '',
      placeholder,
      helperText,
      optionColumns = 1,
    },
    ref
  ) => {
    const { t } = useTranslation('common');
    // Radio inputs only behave as one group if they share a `name`, and the
    // same field can appear on more than one rendered form at a time (the
    // builder preview beside the real thing), so the name has to be unique per
    // mounted instance rather than derived from the label.
    const groupName = useId();
    const optionGridStyle = { '--option-columns': optionColumns } as React.CSSProperties;
    const describedBy = !error && helperText ? `${groupName}-help` : undefined;
    const renderHelp = () =>
      !error && helperText ? (
        <p id={`${groupName}-help`} className={styles.helperText}>
          {helperText}
        </p>
      ) : null;
    switch (fieldType) {
      case 'text':
      case 'number':
      case 'date':
      case 'email':
        return (
          <TextInput
            ref={ref as React.Ref<HTMLInputElement>}
            type={fieldType === 'email' ? 'email' : fieldType}
            label={label}
            placeholder={placeholder}
            helperText={helperText}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            error={error}
            required={required}
            className={className}
          />
        );
      case 'multiline':
        return (
          <TextareaInput
            ref={ref as React.Ref<HTMLTextAreaElement>}
            label={label}
            placeholder={placeholder}
            helperText={helperText}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            error={error}
            required={required}
            className={className}
          />
        );
      case 'dropdown':
        return (
          <SelectInput
            ref={ref as React.Ref<HTMLSelectElement>}
            label={label}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            error={error}
            required={required}
            className={className}
          >
            <option value="" disabled>{t('input.selectAnOption')}</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </SelectInput>
        );
      case 'user-select':
        return (
          <SelectInput
            ref={ref as React.Ref<HTMLSelectElement>}
            label={label}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            error={error}
            required={required}
            className={className}
          >
            <option value="">{t('input.unassigned', { defaultValue: 'Unassigned' })}</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </SelectInput>
        );
      /*
       * The same stored value as `dropdown` — one option string — drawn as a
       * radio group instead. Which of the two a field uses is a property of the
       * FORM, not of the field: the tenant's data dictionary has one
       * SINGLE_SELECT type, and duplicating it as a second "radio" type would
       * split every such field in two and break the role/type coupling that
       * pins the STATUS role to SINGLE_SELECT.
       */
      case 'radio':
        return (
          <fieldset
            className={`${styles.multiSelectGroup} ${className}`}
            aria-describedby={describedBy}
          >
            <legend className={styles.multiSelectLegend}>
              {label}
              {required && <span aria-hidden="true"> *</span>}
            </legend>
            <div className={styles.optionGrid} style={optionGridStyle}>
              {options.map((opt) => (
                <label key={opt} className={styles.checkboxLabel}>
                  <input
                    type="radio"
                    name={groupName}
                    className={styles.checkboxInput}
                    checked={value === opt}
                    onChange={() => onChange(opt)}
                  />
                  <span className={styles.checkboxText}>{opt}</span>
                </label>
              ))}
              {options.length === 0 && (
                <p className={styles.helperTextError}>{t('input.noOptionsConfigured')}</p>
              )}
            </div>
            {error && <p className={styles.helperTextError}>{error}</p>}
            {renderHelp()}
          </fieldset>
        );
      /*
       * Rendered as a checkbox group rather than a native <select multiple>:
       * the native control needs ctrl/cmd-click to select more than one, hides
       * options behind a scroll box, and is close to unusable on touch. The
       * group also makes the current selection readable at a glance.
       */
      case 'multi-select': {
        const selected: string[] = Array.isArray(value) ? value : [];
        const toggle = (opt: string) =>
          onChange(
            selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]
          );
        return (
          <fieldset
            className={`${styles.multiSelectGroup} ${className}`}
            aria-describedby={describedBy}
          >
            <legend className={styles.multiSelectLegend}>
              {label}
              {required && <span aria-hidden="true"> *</span>}
            </legend>
            <div className={styles.optionGrid} style={optionGridStyle}>
              {options.map((opt) => (
                <label key={opt} className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    className={styles.checkboxInput}
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                  />
                  <span className={styles.checkboxText}>{opt}</span>
                </label>
              ))}
              {options.length === 0 && (
                <p className={styles.helperTextError}>{t('input.noOptionsConfigured')}</p>
              )}
            </div>
            {error && <p className={styles.helperTextError}>{error}</p>}
            {renderHelp()}
          </fieldset>
        );
      }
      case 'checkbox':
        return (
          <div className={`${styles.checkboxContainer} ${className}`}>
            <label className={styles.checkboxLabel}>
              <input
                ref={ref as React.Ref<HTMLInputElement>}
                type="checkbox"
                className={styles.checkboxInput}
                checked={!!value}
                onChange={(e) => onChange(e.target.checked)}
                required={required}
              />
              <span className={styles.checkboxText}>{label}</span>
            </label>
            {error && <p className={styles.helperTextError}>{error}</p>}
            {renderHelp()}
          </div>
        );
      default:
        return null;
    }
  }
);

CustomFieldInput.displayName = 'CustomFieldInput';

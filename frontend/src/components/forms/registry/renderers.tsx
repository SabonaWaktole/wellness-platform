import React from 'react';
import { Controller } from 'react-hook-form';
import { CustomFieldInput } from '../../ui/CustomFieldInput/CustomFieldInput';
import { resolveMediaUrl } from '../../../services/mediaService';
import { SignaturePad } from './SignaturePad';
import type { ComponentRenderProps } from './types';
import { formatValue } from './content';
import { RichTextReadOnly } from './RichTextReadOnly';
import { RichTextEditor } from './RichTextEditor';
import type { DividerContent, ImageContent, RichTextDoc } from '../../../types/form';
import styles from './components.module.css';

/**
 * The per-type render components the registry points at, kept in their own
 * module so componentRegistry.tsx exports only the registry itself. (Mixing
 * components and plain values in one file also breaks React Fast Refresh.)
 */


/**
 * The shared control renderer for every data-bearing type that a
 * CustomFieldInput variant can draw. Signature is the one exception and has
 * its own component.
 *
 * A component FACTORY, not a plain helper — the lint rule below cannot tell
 * the difference between "exports a non-component" and "exports a function
 * that returns a component", and this is the latter.
 */
// oxlint-disable-next-line only-export-components
export const inputRenderer =
  (variant: React.ComponentProps<typeof CustomFieldInput>['fieldType']) =>
  ({ element, mode, control, name, error, value, userOptions }: ComponentRenderProps) => {
    const field = element.field!;

    if (mode === 'print') {
      const shown =
        variant === 'user-select'
          ? userOptions.find((u) => u.id === value)?.label ?? value
          : value;
      return (
        <>
          <p className={styles.readOnlyLabel} style={{ color: element.styles?.labelColor, fontSize: element.styles?.fontSize }}>
            {field.label}
            {field.required && <span aria-hidden="true"> *</span>}
          </p>
          <p className={styles.readOnlyValue} style={{ color: element.styles?.textColor, fontSize: element.styles?.fontSize, textAlign: element.styles?.align }}>
            {formatValue(shown)}
          </p>
        </>
      );
    }

    if (!control) return null;

    return (
      <Controller
        name={name}
        control={control}
        render={({ field: rhf }) => (
          <CustomFieldInput
            fieldType={variant}
            label={field.label}
            options={(field.options ?? []).map((o) => o.label)}
            userOptions={userOptions}
            required={field.required}
            placeholder={field.placeholder}
            value={rhf.value}
            onChange={rhf.onChange}
            error={error}
          />
        )}
      />
    );
  };

// ---------------------------------------------------------------------------
// Presentation-only components
// ---------------------------------------------------------------------------

/**
 * A TEXT block, static or live.
 *
 * The two branches share this wrapper — same class, same styles, same box —
 * so entering and leaving editing does not move a single glyph. That is the
 * whole point: the owner is editing the document they can see, not a copy of
 * it parked in a side panel.
 *
 * `isEditing` is only ever true on the builder canvas. `fill` and `print`
 * never pass it, so the paper version still renders through
 * `RichTextReadOnly` exactly as before.
 */
export const TextRender: React.FC<ComponentRenderProps> = ({
  element,
  isEditing,
  onContentChange,
  onEditorReady,
}) => (
  <div
    className={styles.text}
    style={{
      color: element.styles?.textColor,
      fontSize: element.styles?.fontSize,
      textAlign: element.styles?.align,
    }}
  >
    {isEditing && onContentChange ? (
      <RichTextEditor
        content={(element.content as RichTextDoc | undefined) ?? EMPTY_DOC}
        onChange={onContentChange}
        onEditorReady={onEditorReady}
        autoFocus
      />
    ) : (
      <RichTextReadOnly content={element.content as RichTextDoc | undefined} />
    )}
  </div>
);

/** A TEXT element authored before any text was typed into it has no content. */
const EMPTY_DOC: RichTextDoc = { type: 'doc', content: [] };

export const ImageRender: React.FC<ComponentRenderProps> = ({ element }) => {
  const content = element.content as ImageContent | undefined;
  if (!content?.url) return null;
  return (
    <img
      className={styles.image}
      src={resolveMediaUrl(content.url)}
      alt={content.alt ?? ''}
    />
  );
};

export const DividerRender: React.FC<ComponentRenderProps> = ({ element }) => {
  const content = element.content as DividerContent | undefined;
  const vertical = content?.orientation === 'vertical';
  const thickness = content?.thickness ?? 2;
  return (
    <div
      className={styles.divider}
      style={{
        width: vertical ? thickness : '100%',
        height: vertical ? '100%' : thickness,
        background: element.styles?.borderColor ?? 'currentColor',
      }}
      aria-hidden="true"
    />
  );
};

export const SignatureRender: React.FC<ComponentRenderProps> = ({
  element,
  mode,
  control,
  name,
  value,
  onUploadAsset,
}) => {
  const field = element.field!;

  // `edit` is the BUILDER — the owner is designing, not signing — so the pad
  // is inert there just as every other control is (see CanvasElement).
  if (mode !== 'fill' || !control) {
    return (
      <SignaturePad
        label={field.label}
        required={field.required}
        readOnly
        value={value as string | undefined}
        width={element.width}
        height={element.height}
      />
    );
  }

  return (
    <Controller
      name={name}
      control={control}
      render={({ field: rhf }) => (
        <SignaturePad
          label={field.label}
          required={field.required}
          value={rhf.value}
          onChange={rhf.onChange}
          onUploadAsset={onUploadAsset}
          width={element.width}
          height={element.height}
        />
      )}
    />
  );
};


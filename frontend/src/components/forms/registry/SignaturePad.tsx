import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveMediaUrl } from '../../../services/mediaService';
import styles from './SignaturePad.module.css';

export interface SignaturePadProps {
  /** Stored value: a path under /uploads once saved. */
  value?: string;
  onChange?: (value: string | undefined) => void;
  /** Uploads a data URL through the platform's media pipeline. */
  onUploadAsset?: (dataUrl: string) => Promise<string>;
  label: string;
  required?: boolean;
  readOnly?: boolean;
  width: number;
  height: number;
}

/**
 * A signature capture area (spec §18).
 *
 * Drawn on a `<canvas>` with pointer events, then handed to the EXISTING
 * media pipeline (`POST /forms/:id/assets` -> MediaService -> WebP under
 * /uploads) rather than stored inline. That matters for more than tidiness:
 * a base64 PNG of a signature runs to tens of kilobytes, and the document has
 * a 1 MB ceiling that a handful of signatures would eat on their own. What is
 * stored in the submission is a short path, exactly like an image element.
 *
 * Renders as a ruled line with its caption in `print` and whenever read-only,
 * which is what a signature area looks like on paper — never as an empty
 * labelled box.
 */
export const SignaturePad: React.FC<SignaturePadProps> = ({
  value,
  onChange,
  onUploadAsset,
  label,
  required,
  readOnly,
  width,
  height,
}) => {
  const { t } = useTranslation('forms');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reserve room for the caption beneath the signing area.
  const captionHeight = 18;
  const padHeight = Math.max(24, height - captionHeight);

  const context = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    return ctx;
  }, []);

  // Keep the backing store in step with the element's box, or a resized
  // signature area draws at the wrong scale.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(padHeight));
  }, [width, padHeight]);

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Divide by the rendered/backing ratio so drawing stays aligned under
    // canvas zoom, which the builder applies as a CSS transform.
    const scaleX = e.currentTarget.width / (rect.width || 1);
    const scaleY = e.currentTarget.height / (rect.height || 1);
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    e.stopPropagation();
    const ctx = context();
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.stopPropagation();
    const ctx = context();
    if (!ctx) return;
    const { x, y } = pointFrom(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  };

  const handleUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.stopPropagation();
    drawing.current = false;
    if (!dirty.current || !onUploadAsset || !onChange) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsSaving(true);
    try {
      const url = await onUploadAsset(canvas.toDataURL('image/png'));
      onChange(url);
    } catch {
      // Left unsaved rather than silently reported as signed — the caller
      // surfaces the upload error, and a signature that did not store is
      // worse to fake than to leave blank.
    } finally {
      setIsSaving(false);
    }
  };

  const clear = () => {
    const ctx = context();
    const canvas = canvasRef.current;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    onChange?.(undefined);
  };

  // Read-only / print: a ruled line and its caption, as on paper.
  if (readOnly) {
    return (
      <div className={styles.block} style={{ height }}>
        {value ? (
          <img className={styles.signed} src={resolveMediaUrl(value)} alt={label} />
        ) : (
          <div className={styles.rule} />
        )}
        <span className={styles.caption}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.block} style={{ height }}>
      {value ? (
        <img className={styles.signed} src={resolveMediaUrl(value)} alt={label} />
      ) : (
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{ height: padHeight }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          aria-label={label}
          role="img"
        />
      )}
      <div className={styles.footer}>
        <span className={styles.caption}>
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </span>
        {(value || dirty.current) && (
          <button type="button" className={styles.clear} onClick={clear} disabled={isSaving}>
            {isSaving ? t('signature.saving') : t('signature.clear')}
          </button>
        )}
      </div>
    </div>
  );
};

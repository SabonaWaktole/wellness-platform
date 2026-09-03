import React, { useLayoutEffect, useRef, useState } from 'react';
import styles from './ScaledPage.module.css';

export interface ScaledPageProps {
  /** The fixed page width/height being scaled, in page pixels. */
  pageWidth: number;
  pageHeight: number;
  /** Never scales up past this — a tiny form on a huge monitor should not
   *  balloon to fill it; 1 keeps the owner's chosen size as the ceiling. */
  maxScale?: number;
  children: React.ReactNode;
}

/**
 * Wraps a fixed-size document (the canvas page `FormRenderer` draws) and
 * scales it down to fit its container's width — "fixed page, scale to fit":
 * the layout an owner designs never reflows, it only ever shrinks uniformly,
 * so what they built is what every viewer sees, phone or desktop.
 */
export const ScaledPage: React.FC<ScaledPageProps> = ({
  pageWidth,
  pageHeight,
  maxScale = 1,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || pageWidth <= 0) return;

    const measure = () => {
      const available = el.clientWidth;
      const next = available > 0 ? Math.min(maxScale, available / pageWidth) : 1;
      setScale(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pageWidth, maxScale]);

  return (
    <div ref={containerRef} className={styles.viewport} style={{ height: pageHeight * scale }}>
      <div
        className={styles.scaler}
        style={{ width: pageWidth, height: pageHeight, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
};

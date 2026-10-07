import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tokenFromScan } from './scanToken';
import styles from './Verify.module.css';

/** The browser's own detector, where it exists (Chrome on Android, desktop Chrome). Not in TypeScript's DOM library. */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorLike;
  }
}

export type ScanProblem = 'denied' | 'unavailable' | 'notCard' | null;

const FRAME_EVERY_MS = 200;
const FALLBACK_WIDTH = 640;

/**
 * Reads a card's QR code with the device camera, in the browser (FR-VER-01, D13). The built-in `BarcodeDetector`
 * where the browser has one; otherwise the small jsQR decoder, loaded only then, for iPhone Safari. The camera needs
 * HTTPS, which staging and production serve. The stream stops when a card is read, when the user stops, and when the
 * component goes away. Only the token leaves this component, and it is never logged.
 */
export const QrScanner = ({ onToken, onStop }: { onToken: (token: string) => void; onStop: () => void }) => {
  const { t } = useTranslation('members');
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<ScanProblem>(null);
  // The camera starts once; a re-render of the caller (a new onToken) must not restart it.
  const found = useRef(onToken);
  useEffect(() => {
    found.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;

    const release = () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setProblem('unavailable');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (error) {
        return setProblem(error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError') ? 'denied' : 'unavailable');
      }
      if (stopped) return release();
      const element = video.current;
      if (!element) return release();
      element.srcObject = stream;
      try {
        await element.play();
      } catch {
        return setProblem('unavailable');
      }

      const native = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      const canvas = document.createElement('canvas');
      const jsQr = native ? null : (await import('jsqr')).default;

      const read = async (): Promise<string | null> => {
        if (native) return (await native.detect(element))[0]?.rawValue ?? null;
        if (!jsQr || element.videoWidth === 0) return null;
        const scale = Math.min(1, FALLBACK_WIDTH / element.videoWidth);
        canvas.width = Math.round(element.videoWidth * scale);
        canvas.height = Math.round(element.videoHeight * scale);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;
        context.drawImage(element, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        return jsQr(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
      };

      const tick = async () => {
        if (stopped) return;
        try {
          const text = await read();
          if (text) {
            const token = tokenFromScan(text);
            if (token) {
              release();
              return found.current(token);
            }
            setProblem('notCard');
          }
        } catch {
          // A frame that cannot be read is skipped; the next one is tried.
        }
        if (!stopped) timer = window.setTimeout(() => void tick(), FRAME_EVERY_MS);
      };
      void tick();
    };

    void start();
    return release;
  }, []);

  return (
    <div className={styles.scanner}>
      {problem === 'denied' || problem === 'unavailable' ? (
        <p role="alert" className={styles.problem}>{t(problem === 'denied' ? 'verify.cameraDenied' : 'verify.cameraUnavailable')}</p>
      ) : (
        <>
          <video ref={video} className={styles.video} playsInline muted aria-label={t('verify.cameraLabel')} />
          <p role="status" className={styles.muted}>{problem === 'notCard' ? t('verify.notACard') : t('verify.scanning')}</p>
        </>
      )}
      <button type="button" className={styles.secondary} onClick={onStop}>{t('verify.stopScan')}</button>
    </div>
  );
};

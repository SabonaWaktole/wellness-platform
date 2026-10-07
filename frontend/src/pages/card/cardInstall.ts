import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../api/baseUrl';

export type InstallPlatform = 'ios' | 'android' | null;

/** The device the instructions are for; null on a desktop, where there is no home screen to add to. */
export const detectPlatform = (userAgent: string = navigator.userAgent): InstallPlatform => {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return null;
};

/** True once the card was opened from the home screen, so the instructions are no longer needed (FR-CRD-05). */
export const isStandalone = (): boolean => {
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
};

/**
 * The install tags live in the card page only (D14): the staff application is not installable and has no
 * manifest. iOS reads them when "Add to Home Screen" is used, so they are in the head while the card is shown.
 */
export function useInstallableHead(token: string | undefined, enabled: boolean) {
  useEffect(() => {
    if (!token || !enabled) return;
    const added: HTMLElement[] = [];
    const add = (tag: 'meta' | 'link', attributes: Record<string, string>) => {
      const element = document.createElement(tag);
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
      document.head.appendChild(element);
      added.push(element);
    };
    add('link', { rel: 'manifest', href: `${API_BASE_URL}/public/cards/${encodeURIComponent(token)}/manifest.webmanifest` });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'Wellness+' });
    add('meta', { name: 'theme-color', content: '#18988b' });
    return () => added.forEach((element) => element.remove());
  }, [token, enabled]);
}

/** Registers the card's worker at scope /m/. Called from the card entry only: a test fails if it appears elsewhere. */
export function useCardWorker(enabled: boolean, answerUrl?: string) {
  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/m/sw.js', { scope: '/m/' })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        // The first visit is not under the worker's control, so hand it this document and what it loaded.
        const assets = performance.getEntriesByType('resource').map((entry) => entry.name);
        registration.active?.postMessage({ type: 'store', urls: [window.location.href, ...(answerUrl ? [answerUrl] : []), ...assets] });
      })
      .catch(() => {
        /* The card still works online without a worker. */
      });
  }, [enabled, answerUrl]);
}

/** Whether the instructions are still needed: a phone, in a browser tab. */
export function useInstallHint(): InstallPlatform {
  const [platform, setPlatform] = useState<InstallPlatform>(null);
  useEffect(() => {
    setPlatform(isStandalone() ? null : detectPlatform());
  }, []);
  return platform;
}

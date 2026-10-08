import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cardI18n } from './cardI18n';
import { formatToday } from './cardFormat';
import styles from './PublicCardPage.module.css';

const prefersReducedMotion = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clock = (value: Date): string => value.toTimeString().slice(0, 8);

/**
 * Today's date and a small moving element, so a screenshot of the card can be told apart from the live one
 * (FR-CRD-07). With reduced motion the animation is replaced by a visible second counter, which also moves.
 */
export const LiveStamp = () => {
  const { t } = useTranslation('card', { i18n: cardI18n });
  const [now, setNow] = useState(() => new Date());
  const [counter] = useState(prefersReducedMotion);

  useEffect(() => {
    if (!counter) {
      const midnight = window.setInterval(() => setNow(new Date()), 60_000);
      return () => window.clearInterval(midnight);
    }
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, [counter]);

  return (
    <p className={styles.stamp} aria-label={t('liveLabel')}>
      <span>{t('today')} {formatToday(now)}</span>
      {counter ? (
        <span className={styles.stampClock} data-testid="live-counter">{clock(now)}</span>
      ) : (
        <span className={styles.stampPulse} data-testid="live-motion" aria-hidden="true" />
      )}
    </p>
  );
};

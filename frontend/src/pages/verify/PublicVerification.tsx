import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPublicVerification, type PublicVerificationResult } from '../../services/memberVerificationService';
import { cardI18n, isCardLanguage, type CardLanguage } from '../card/cardI18n';
import { formatCardDate, readableOn } from '../card/cardFormat';
import styles from './PublicVerifyPage.module.css';

const CHOICES: CardLanguage[] = ['sq', 'en'];

/**
 * What a partner clinic sees when it scans a card with an ordinary phone camera (M4 Slice 13, FR-VER-07, FR-VER-09):
 * Valid with the full name, member ID, tier and valid-until date, or one neutral "Not valid". The page shows what the
 * server sent and nothing else; every reason a card is not valid, and an unknown card, look the same. No login, no
 * calls but the one to the public verification endpoint, no analytics or third-party scripts (FR-CRD-08).
 */
export const PublicVerification = ({ token }: { token: string }) => {
  const { t } = useTranslation('card', { i18n: cardI18n });
  const [language, setLanguage] = useState<CardLanguage>('sq');
  const [result, setResult] = useState<PublicVerificationResult | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setResult(null);
      const next = await fetchPublicVerification(token, signal);
      if (!signal?.aborted) setResult(next);
    },
    [token]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    void cardI18n.changeLanguage(language);
    document.documentElement.lang = language;
    document.title = cardI18n.t('verify.pageTitle');
  }, [language]);

  const verification = result?.kind === 'result' ? result.result : null;

  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <header className={styles.top}>
          <span className={styles.brand}>{t('brand')}</span>
          <label className={styles.language}>
            <span className="sr-only">{t('language')}</span>
            <select value={language} onChange={(e) => isCardLanguage(e.target.value) && setLanguage(e.target.value)} aria-label={t('language')}>
              {CHOICES.map((code) => (
                <option key={code} value={code}>{t(`languages.${code}`)}</option>
              ))}
            </select>
          </label>
        </header>

        {result === null && <p role="status" className={styles.message}>{t('verify.loading')}</p>}

        {result?.kind === 'failed' && (
          <section className={styles.panel} role="alert">
            <p>{t('verify.failed')}</p>
            <button type="button" className={styles.retry} onClick={() => void load()}>{t('retry')}</button>
          </section>
        )}

        {verification && !verification.valid && (
          <section className={`${styles.verdict} ${styles.invalid}`} role="status">
            <h1 className={styles.verdictText}>{t('verify.notValid')}</h1>
          </section>
        )}

        {verification?.valid && (
          <article className={styles.card} aria-label={t('verify.pageTitle')}>
            <section className={`${styles.verdict} ${styles.valid}`} role="status">
              <h1 className={styles.verdictText}>{t('verify.valid')}</h1>
            </section>
            <div className={styles.band} style={{ backgroundColor: verification.tier.colour, color: readableOn(verification.tier.colour) }}>
              {(language === 'sq' ? verification.tier.labelSq : verification.tier.labelEn) || t(`tier.${verification.tier.tier}`)}
            </div>
            <h2 className={styles.name}>{verification.name}</h2>
            <dl className={styles.facts}>
              <div>
                <dt>{t('memberId')}</dt>
                <dd>{verification.memberNumber}</dd>
              </div>
              <div>
                <dt>{t('verify.validUntilLabel')}</dt>
                <dd>{verification.validUntil ? formatCardDate(verification.validUntil) : t('noExpiry')}</dd>
              </div>
            </dl>
          </article>
        )}
      </div>
    </main>
  );
};

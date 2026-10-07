import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchPublicCard, type PublicCard, type PublicCardResult } from '../../services/memberCardService';
import { cardI18n, isCardLanguage, type CardLanguage } from './cardI18n';
import { formatCardDate, readableOn } from './cardFormat';
import styles from './PublicCardPage.module.css';

/** 50.00 → 50, 12.50 → 12.5 */
const percent = (value: string): string => String(Number(value));

/** The page must never be indexed, even if a link is pasted somewhere public (FR-CRD-08). */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);
}

/**
 * The member's card (M4 Slice 11, FR-CRD-01..04, FR-CRD-12, NFR-USE-05).
 *
 * Outside the app shell, with no login, no tenant in the path and no calls but the one to the card endpoint: no
 * analytics and no third-party scripts (FR-CRD-08). Everything shown comes from the server for the moment the page
 * is opened; the page decides nothing. The QR is the server's SVG, shown as an image on a white square with a quiet
 * zone, so it stays scannable in dark mode (NFR-USE-05).
 */
export const PublicCardPage = () => {
  const { token } = useParams();
  const { t } = useTranslation('card', { i18n: cardI18n });
  const [result, setResult] = useState<PublicCardResult | null>(null);
  const [language, setLanguage] = useState<CardLanguage>('sq');
  useNoIndex();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setResult(null);
      const next = token ? await fetchPublicCard(token, signal) : ({ kind: 'not-found' } as const);
      if (signal?.aborted) return;
      setResult(next);
      if (next.kind === 'card' && isCardLanguage(next.card.language)) setLanguage(next.card.language);
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
    document.title = cardI18n.t('pageTitle');
  }, [language]);

  const card = result?.kind === 'card' ? result.card : null;
  // Albanian and English for everyone; Greek or Italian only for a member who has it (FR-CRD-04).
  const choices = useMemo<CardLanguage[]>(() => {
    const own = card && (card.language === 'el' || card.language === 'it') ? [card.language] : [];
    return ['sq', 'en', ...own];
  }, [card]);

  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <header className={styles.top}>
          <span className={styles.brand}>{t('brand')}</span>
          <label className={styles.language}>
            <span className="sr-only">{t('language')}</span>
            <select value={language} onChange={(e) => isCardLanguage(e.target.value) && setLanguage(e.target.value)} aria-label={t('language')}>
              {choices.map((code) => (
                <option key={code} value={code}>{t(`languages.${code}`)}</option>
              ))}
            </select>
          </label>
        </header>

        {result === null && <p role="status" className={styles.message}>{t('loading')}</p>}

        {result?.kind === 'not-found' && (
          <section className={styles.panel} role="alert">
            <h1 className={styles.heading}>{t('notFoundTitle')}</h1>
            <p>{t('notFound')}</p>
          </section>
        )}

        {result?.kind === 'replaced' && (
          <section className={styles.panel} role="alert">
            <h1 className={styles.heading}>{t('replacedTitle')}</h1>
            <p>{t('replaced')}</p>
          </section>
        )}

        {result?.kind === 'failed' && (
          <section className={styles.panel} role="alert">
            <p>{t('failed')}</p>
            <button type="button" className={styles.retry} onClick={() => void load()}>{t('retry')}</button>
          </section>
        )}

        {card && <CardFace card={card} language={language} />}

        <p className={styles.privacy}>{t('privacy')}</p>
      </div>
    </main>
  );
};

const CardFace = ({ card, language }: { card: PublicCard; language: CardLanguage }) => {
  const { t } = useTranslation('card', { i18n: cardI18n });
  const tierLabel = card.tier
    ? language === 'sq' && card.tier.labelSq
      ? card.tier.labelSq
      : language === 'en' && card.tier.labelEn
        ? card.tier.labelEn
        : t(`tier.${card.tier.tier}`)
    : null;
  const colour = card.tier?.colour ?? '#6b7280';
  const qr = card.qrSvg ? `data:image/svg+xml;utf8,${encodeURIComponent(card.qrSvg)}` : null;

  return (
    <article className={styles.card} aria-label={t('pageTitle')}>
      <div className={styles.band} style={{ backgroundColor: colour, color: readableOn(colour) }}>
        <span className={styles.bandBrand}>{t('brand')}</span>
        {tierLabel && <span className={styles.tier}>{tierLabel}</span>}
      </div>

      <div className={styles.body}>
        <h1 className={styles.name}>{card.name}</h1>
        <dl className={styles.facts}>
          <div>
            <dt>{t('memberId')}</dt>
            <dd>{card.memberNumber}</dd>
          </div>
        </dl>

        {card.valid ? (
          <>
            <p className={styles.validity}>{card.validUntil ? t('validUntil', { date: formatCardDate(card.validUntil) }) : t('noExpiry')}</p>
            {qr && (
              <div className={styles.qrBox}>
                <img src={qr} alt={t('qrAlt')} className={styles.qr} width={240} height={240} />
              </div>
            )}
            <p className={styles.qrHelp}>{t('qrHelp')}</p>

            <h2 className={styles.benefitsTitle}>{t('benefitsTitle')}</h2>
            {card.benefits.length === 0 ? (
              <p className={styles.muted}>{t('noBenefits')}</p>
            ) : (
              <ul className={styles.benefits}>
                {card.benefits.map((b) => (
                  <li key={b.nameEn}>
                    <span>{language === 'sq' ? b.nameSq : b.nameEn}</span>
                    <strong>{t('benefitPercent', { percent: percent(b.percent) })}</strong>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className={styles.notValid} role="alert">{t('notValid')}</p>
        )}
      </div>
    </article>
  );
};

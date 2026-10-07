import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { memberVerificationService, type IdentityChoice, type ReceptionVerification } from '../../../services/memberVerificationService';
import { formatCardDate } from '../../card/cardFormat';
import styles from './Verify.module.css';

const percent = (value: string): string => String(Number(value));

/**
 * The result Reception sees (FR-VER-02, FR-VER-03, FR-BEN-03): a large Valid or Not valid; name, member ID, tier,
 * valid until, status and date of birth for the identity check; the discounts of the tier; and the two buttons that
 * store what the identity check found. Every figure is the server's answer for this moment; nothing is decided here.
 */
export const ReceptionResult = ({ result, tenantSlug, onAnother }: { result: ReceptionVerification; tenantSlug: string; onAnother: () => void }) => {
  const { t, i18n } = useTranslation('members');
  const sq = i18n.language.startsWith('sq');
  const [choice, setChoice] = useState<IdentityChoice | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setChoice(null);
    setFailed(false);
  }, [result.verificationId]);

  const record = async (next: IdentityChoice) => {
    setSaving(true);
    setFailed(false);
    try {
      await memberVerificationService.recordIdentity(tenantSlug, result.verificationId, next);
      setChoice(next);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  if (!result.found) {
    return (
      <section className={styles.result} aria-live="polite">
        <div className={`${styles.verdict} ${styles.verdictNotFound}`} role="status">{t('verify.notFound')}</div>
        <button type="button" className={styles.primary} onClick={onAnother}>{t('verify.another')}</button>
      </section>
    );
  }

  const tierLabel = (sq ? result.tier.labelSq : result.tier.labelEn) || result.tier.tier;

  return (
    <section className={styles.result} aria-live="polite">
      <div className={`${styles.verdict} ${result.valid ? styles.verdictValid : styles.verdictInvalid}`} role="status">
        {result.valid ? t('verify.valid') : result.reason ? t('verify.notValidReason', { reason: t(`status.${result.reason}`) }) : t('verify.notValid')}
      </div>

      <h2 className={styles.memberName}>{result.name}</h2>
      <dl className={styles.facts}>
        <div><dt>{t('verify.memberId')}</dt><dd>{result.memberNumber}</dd></div>
        <div><dt>{t('verify.tier')}</dt><dd><span className={styles.tierDot} style={{ backgroundColor: result.tier.colour }} aria-hidden="true" />{tierLabel}</dd></div>
        <div><dt>{t('verify.validUntil')}</dt><dd>{result.validUntil ? formatCardDate(result.validUntil) : t('verify.noExpiry')}</dd></div>
        <div><dt>{t('verify.status')}</dt><dd>{t(`status.${result.status}`)}</dd></div>
        <div><dt>{t('verify.dateOfBirth')}</dt><dd>{result.dateOfBirth ? formatCardDate(result.dateOfBirth) : '—'}</dd></div>
      </dl>

      {result.valid && (
        <>
          <h3 className={styles.sectionTitle}>{t('verify.discounts')}</h3>
          {result.discounts.length === 0 ? (
            <p className={styles.muted}>{t('verify.noDiscounts')}</p>
          ) : (
            <ul className={styles.discounts}>
              {result.discounts.map((d) => (
                <li key={d.nameEn}>
                  <span>{sq ? d.nameSq : d.nameEn}</span>
                  <strong>{t('verify.percent', { percent: percent(d.percent) })}</strong>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <h3 className={styles.sectionTitle}>{t('verify.identityTitle')}</h3>
      <p className={styles.muted}>{t('verify.identityHelp')}</p>
      <div className={styles.buttons}>
        <button type="button" className={styles.confirm} disabled={saving} aria-pressed={choice === 'CONFIRMED'} onClick={() => void record('CONFIRMED')}>
          {t('verify.identityConfirmed')}
        </button>
        <button type="button" className={styles.mismatch} disabled={saving} aria-pressed={choice === 'MISMATCH'} onClick={() => void record('MISMATCH')}>
          {t('verify.identityMismatch')}
        </button>
      </div>
      {choice && <p role="status" className={styles.recorded}>{t(choice === 'CONFIRMED' ? 'verify.recordedConfirmed' : 'verify.recordedMismatch')}</p>}
      {failed && <p role="alert" className={styles.problem}>{t('verify.identityFailed')}</p>}

      <button type="button" className={styles.secondary} onClick={onAnother}>{t('verify.another')}</button>
    </section>
  );
};

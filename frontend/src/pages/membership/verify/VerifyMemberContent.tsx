import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { memberVerificationService, type ReceptionVerification, type VerificationCandidate } from '../../../services/memberVerificationService';
import { QrScanner } from './QrScanner';
import { ReceptionResult } from './ReceptionResult';
import styles from './Verify.module.css';

type Busy = 'idle' | 'checking' | 'searching';

/**
 * The Verify member screen (M4 Slice 13, FR-VER-01): Scan opens the camera, or Reception searches by member ID, name,
 * phone or email. Works on a phone, a tablet and a desktop with a webcam. A single search hit is checked at once; several
 * are listed by name and member ID so the right person is chosen. Needs only "Members: verify".
 */
export const VerifyMemberContent = () => {
  const { t } = useTranslation('members');
  const { tenantSlug = '' } = useParams();
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<VerificationCandidate[] | null>(null);
  const [result, setResult] = useState<ReceptionVerification | null>(null);
  const [busy, setBusy] = useState<Busy>('idle');
  const [failed, setFailed] = useState(false);

  const reset = useCallback(() => {
    setResult(null);
    setCandidates(null);
    setQuery('');
    setFailed(false);
  }, []);

  const check = useCallback(
    async (work: () => Promise<ReceptionVerification>) => {
      setBusy('checking');
      setFailed(false);
      try {
        setResult(await work());
        setCandidates(null);
      } catch {
        setFailed(true);
      } finally {
        setBusy('idle');
      }
    },
    []
  );

  const onToken = useCallback(
    (token: string) => {
      setScanning(false);
      void check(() => memberVerificationService.byToken(tenantSlug, token));
    },
    [check, tenantSlug]
  );

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setBusy('searching');
    setFailed(false);
    setResult(null);
    try {
      const hits = await memberVerificationService.search(tenantSlug, query.trim());
      if (hits.length === 1) {
        setBusy('idle');
        return void check(() => memberVerificationService.byMember(tenantSlug, hits[0].id));
      }
      setCandidates(hits);
    } catch {
      setFailed(true);
    } finally {
      setBusy((current) => (current === 'searching' ? 'idle' : current));
    }
  };

  return (
    <div className={styles.container}>
      <header>
        <h1 className={styles.title}>{t('verify.title')}</h1>
        <p className={styles.muted}>{t('verify.subtitle')}</p>
      </header>

      {result ? (
        <ReceptionResult result={result} tenantSlug={tenantSlug} onAnother={reset} />
      ) : (
        <>
          {scanning ? (
            <QrScanner onToken={onToken} onStop={() => setScanning(false)} />
          ) : (
            <button type="button" className={styles.scanButton} onClick={() => setScanning(true)}>{t('verify.scan')}</button>
          )}

          <form className={styles.search} onSubmit={(e) => void search(e)} role="search">
            <label htmlFor="verify-query">{t('verify.searchLabel')}</label>
            <div className={styles.searchRow}>
              <input id="verify-query" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
              <button type="submit" className={styles.primary} disabled={busy !== 'idle' || query.trim().length < 2}>{t('verify.search')}</button>
            </div>
          </form>

          {busy === 'checking' && <p role="status" className={styles.muted}>{t('verify.checking')}</p>}
          {failed && <p role="alert" className={styles.problem}>{t('verify.failed')}</p>}

          {candidates && (
            candidates.length === 0 ? (
              <p role="status" className={styles.muted}>{t('verify.noMatches')}</p>
            ) : (
              <>
                <h2 className={styles.sectionTitle}>{t('verify.choose')}</h2>
                <ul className={styles.candidates}>
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <button type="button" className={styles.candidate} onClick={() => void check(() => memberVerificationService.byMember(tenantSlug, c.id))}>
                        <span>{c.name}</span>
                        <span className={styles.muted}>{c.memberNumber}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )
          )}
        </>
      )}
    </div>
  );
};

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { memberVerificationService, type ReceptionVerification } from '../../services/memberVerificationService';
import { ReceptionResult } from '../membership/verify/ReceptionResult';
import styles from '../membership/verify/Verify.module.css';

/**
 * The same QR link opened by a signed-in user with "Members: verify" shows the Reception screen of FR-VER-02, not the
 * public page (FR-VER-08, D12). It is loaded on demand, so a partner clinic's phone never downloads it.
 */
export default function StaffTokenVerification({ token, tenantSlug }: { token: string; tenantSlug: string }) {
  const { t } = useTranslation('members');
  const navigate = useNavigate();
  const [result, setResult] = useState<ReceptionVerification | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setResult(null);
    setFailed(false);
    memberVerificationService
      .byToken(tenantSlug, token)
      .then((next) => current && setResult(next))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [tenantSlug, token]);

  return (
    <main className={styles.container}>
      <h1 className={styles.title}>{t('verify.title')}</h1>
      {!result && !failed && <p role="status" className={styles.muted}>{t('verify.checking')}</p>}
      {failed && <p role="alert" className={styles.problem}>{t('verify.failed')}</p>}
      {result && <ReceptionResult result={result} tenantSlug={tenantSlug} onAnother={() => navigate(`/${tenantSlug}/members/verify`)} />}
    </main>
  );
}

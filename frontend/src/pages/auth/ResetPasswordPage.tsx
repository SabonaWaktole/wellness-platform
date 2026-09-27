import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout/AuthLayout';
import { PasswordInput } from '../../components/ui/PasswordInput/PasswordInput';
import { Button } from '../../components/ui/Button/Button';
import { useResetPassword } from '../../hooks/useResetPassword';
import styles from './AuthForm.module.css';

export const ResetPasswordPage = () => {
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { resetPassword, isLoading, error, isSuccess } = useResetPassword();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (newPassword !== confirmPassword) {
      setLocalError(t('resetPassword.mismatch'));
      return;
    }

    try {
      await resetPassword(token, newPassword);
    } catch (err) {
      // Error handled by hook
    }
  };

  return (
    <AuthLayout title={t('resetPassword.title')} subtitle={t('resetPassword.subtitle')}>
      {isSuccess ? (
        <div className={styles.success}>
          <CheckCircle2 size={48} className={styles.successIcon} aria-hidden="true" />
          <p className={styles.successText}>{t('resetPassword.success')}</p>
          <Link to="/login" className={styles.link}>
            {t('goToLogin')}
          </Link>
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit}>
          {(error || localError) && (
            <div className={styles.errorBanner} role="alert">
              {error || localError}
            </div>
          )}
          <PasswordInput
            label={t('resetPassword.newPassword')}
            placeholder={t('passwordPlaceholder')}
            id="new-password"
            helperText={t('passwordHelper')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />

          <PasswordInput
            label={t('resetPassword.confirmPassword')}
            placeholder={t('passwordPlaceholder')}
            id="confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <div className={styles.actions}>
            <Button fullWidth variant="primary" type="submit" isLoading={isLoading}>
              {t('resetPassword.submit')}
            </Button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

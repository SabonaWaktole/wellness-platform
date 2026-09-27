import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CheckCircle2, ArrowLeft } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout/AuthLayout';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { Button } from '../../components/ui/Button/Button';
import { useForgotPassword } from '../../hooks/useForgotPassword';
import styles from './AuthForm.module.css';

export const ForgotPasswordPage = () => {
  const { t } = useTranslation('auth');
  const { requestReset, isLoading, error, isSuccess } = useForgotPassword();
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await requestReset(email);
    } catch (err) {
      // Error handled by hook
    }
  };

  const backToLogin = (
    <Link to="/login" className={styles.backLink}>
      <ArrowLeft size={18} aria-hidden="true" />
      {t('backToLogin')}
    </Link>
  );

  return (
    <AuthLayout title={t('forgotPassword.title')} subtitle={t('forgotPassword.subtitle')}>
      {isSuccess ? (
        <div className={styles.success}>
          <CheckCircle2 size={48} className={styles.successIcon} aria-hidden="true" />
          <p className={styles.successText}>{t('forgotPassword.sent')}</p>
          {backToLogin}
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit}>
          {error && (
            <div className={styles.errorBanner} role="alert">
              {error}
            </div>
          )}
          <TextInput
            label={t('forgotPassword.email')}
            placeholder={t('emailPlaceholder')}
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <div className={styles.actions}>
            <Button fullWidth variant="primary" type="submit" isLoading={isLoading}>
              {t('forgotPassword.submit')}
            </Button>
            {backToLogin}
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

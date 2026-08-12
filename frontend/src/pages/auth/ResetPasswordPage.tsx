import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {} from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout/AuthLayout';
import { PasswordInput } from '../../components/ui/PasswordInput/PasswordInput';
import { Button } from '../../components/ui/Button/Button';
import { useResetPassword } from '../../hooks/useResetPassword';

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
    <AuthLayout
      title={t('resetPassword.title')}
      subtitle={t('resetPassword.subtitle')}
      showBrand
    >
      {isSuccess ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', alignItems: 'center', textAlign: 'center' }}>
          <CheckCircle2 size={48} color="var(--color-success)" />
          <p style={{ fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-body-md)', color: 'var(--color-on-surface)' }}>
            {t('resetPassword.success')}
          </p>
          <Link
            to="/login"
            style={{ 
              fontFamily: 'var(--font-family-base)', 
              fontSize: 'var(--font-size-label-md)', 
              color: 'var(--color-primary)', 
              textDecoration: 'none'
            }}
          >
            {t('goToLogin')}
          </Link>
        </div>
      ) : (
        <form style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }} onSubmit={handleSubmit}>
          {(error || localError) && (
            <div style={{ color: 'var(--color-error)', fontSize: 'var(--font-size-label-sm)', background: 'var(--color-error-container)', padding: 'var(--spacing-sm)', borderRadius: 'var(--radius-default)' }}>
              {error || localError}
            </div>
          )}
          <PasswordInput 
            label={t('resetPassword.newPassword')} 
            placeholder="••••••••" 
            id="new-password"
            helperText={t('passwordHelper')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          
          <PasswordInput 
            label={t('resetPassword.confirmPassword')} 
            placeholder="••••••••" 
            id="confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          
          <div style={{ paddingTop: 'var(--spacing-sm)' }}>
            <Button fullWidth variant="primary" type="submit" isLoading={isLoading}>
              {t('resetPassword.submit')}
            </Button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

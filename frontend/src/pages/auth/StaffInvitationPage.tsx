import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {} from 'react';
import { useParams, Link } from 'react-router-dom';
import { Handshake, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout/AuthLayout';
import { PasswordInput } from '../../components/ui/PasswordInput/PasswordInput';
import { Button } from '../../components/ui/Button/Button';
import { useAcceptInvitation } from '../../hooks/useAcceptInvitation';

export const StaffInvitationPage = () => {
  const { t } = useTranslation('auth');
  const { token } = useParams();
  const { acceptInvitation, isLoading, error, isSuccess } = useAcceptInvitation();
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
      await acceptInvitation({
        token: token || '',
        newPassword,
      });
    } catch (err) {
      // Error handled by hook
    }
  };

  return (
    <AuthLayout
      title={t('staffInvitation.title')}
      subtitle={t('staffInvitation.subtitle')}
      icon={<Handshake size={24} aria-hidden="true" />}
    >
      {isSuccess ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', alignItems: 'center', textAlign: 'center' }}>
          <CheckCircle2 size={48} color="var(--color-success)" />
          <p style={{ fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-body-md)', color: 'var(--color-on-surface)' }}>
            Your account has been created successfully. You can now log in.
          </p>
          <Link 
            to="/"
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
            label={t('acceptInvitation.createPassword')}
            placeholder="••••••••"
            id="new-password"
            helperText={t('passwordHelper')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />

          <PasswordInput
            label={t('acceptInvitation.confirmPassword')}
            placeholder="••••••••"
            id="confirm-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <div style={{ paddingTop: 'var(--spacing-sm)' }}>
            <Button fullWidth variant="primary" type="submit" isLoading={isLoading}>
              {t('acceptInvitation.submit')}
            </Button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

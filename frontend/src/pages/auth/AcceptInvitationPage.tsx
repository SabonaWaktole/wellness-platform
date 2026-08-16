import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout/AuthLayout';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { Button } from '../../components/ui/Button/Button';
import { apiClient as api } from '../../api';

export const AcceptInvitationPage: React.FC = () => {
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [acceptedTenantSlug, setAcceptedTenantSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !email) {
      setError('Invalid invitation link. Missing token or email.');
    }
  }, [token, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await api.post('/auth/invitations/accept', {
        token,
        newPassword: password,
      });
      if (response.data.tenantSlug) {
        setAcceptedTenantSlug(response.data.tenantSlug);
      }
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to accept invitation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={t('acceptInvitation.title')}
      subtitle={email ? t('acceptInvitation.subtitleWithEmail', { email }) : t('acceptInvitation.subtitle')}
    >
      {success ? (
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ color: 'var(--color-primary)', marginBottom: '16px' }}>{t('acceptInvitation.accepted')}</h3>
          <p style={{ marginBottom: '24px' }}>Your account has been created successfully.</p>
          <Button variant="primary" onClick={() => navigate('/login')} fullWidth>
            {t('goToLogin')}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '12px', backgroundColor: 'var(--color-error-container)', color: 'var(--color-on-error-container)', borderRadius: 'var(--radius-default)', fontSize: 'var(--font-size-label-sm)' }}>
              {error}
            </div>
          )}

          <TextInput
            label={t('acceptInvitation.createPassword')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <TextInput
            label={t('acceptInvitation.confirmPassword')}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <Button
            type="submit"
            variant="primary"
            fullWidth
            isLoading={loading}
            disabled={!token || !email}
            style={{ marginTop: '8px' }}
          >
            {t('acceptInvitation.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
};

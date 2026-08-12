import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {} from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ArrowLeft } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout/AuthLayout';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { Button } from '../../components/ui/Button/Button';
import { useForgotPassword } from '../../hooks/useForgotPassword';

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

  return (
    <AuthLayout
      title={t('forgotPassword.title')}
      subtitle={t('forgotPassword.subtitle')}
      showBrand
    >
      {isSuccess ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', alignItems: 'center', textAlign: 'center' }}>
          <CheckCircle2 size={48} color="var(--color-success)" />
          <p style={{ fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-body-md)', color: 'var(--color-on-surface)' }}>
            {t('forgotPassword.sent')}
          </p>
          <Link
            to="/login"
            style={{ 
              fontFamily: 'var(--font-family-base)', 
              fontSize: 'var(--font-size-label-md)', 
              color: 'var(--color-primary)', 
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-xs)'
            }}
          >
            <ArrowLeft size={18} />
            Back to Login
          </Link>
        </div>
      ) : (
        <form style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }} onSubmit={handleSubmit}>
          {error && (
            <div style={{ color: 'var(--color-error)', fontSize: 'var(--font-size-label-sm)', background: 'var(--color-error-container)', padding: 'var(--spacing-sm)', borderRadius: 'var(--radius-default)' }}>
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
          
          <div style={{ paddingTop: 'var(--spacing-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <Button fullWidth variant="primary" type="submit" isLoading={isLoading}>
              {t('forgotPassword.submit')}
            </Button>
            
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Link 
                to="/login"
                style={{ 
                  fontFamily: 'var(--font-family-base)', 
                  fontSize: 'var(--font-size-label-md)', 
                  color: 'var(--color-on-surface-variant)', 
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-xs)'
                }}
              >
                <ArrowLeft size={18} />
                Back to Login
              </Link>
            </div>
          </div>
        </form>
      )}
    </AuthLayout>
  );
};

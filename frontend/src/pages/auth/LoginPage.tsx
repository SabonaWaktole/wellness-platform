import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {} from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AuthLayout } from '../../components/layout/AuthLayout/AuthLayout';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { PasswordInput } from '../../components/ui/PasswordInput/PasswordInput';
import { Button } from '../../components/ui/Button/Button';
import { useLogin } from '../../hooks/useLogin';
import styles from './LoginPage.module.css';

export const LoginPage = () => {
  const { t } = useTranslation('auth');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const { login, isLoading, error } = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const actualTenantSlug = await login(email, password, tenantSlug || null);
      if (actualTenantSlug) {
        navigate(`/${actualTenantSlug}/dashboard`);
      } else {
        navigate('/admin/dashboard');
      }
    } catch (err) {
      // Error is handled by the hook
    }
  };

  return (
    <AuthLayout
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      showBrand
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}
        <TextInput
          label={t('login.email')} 
          placeholder={t('emailPlaceholder')} 
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        
        <div className={styles.passwordGroup}>
          <PasswordInput
            label={t('login.password')}
            placeholder={t('passwordPlaceholder')}
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {/*
            The sign-up prompt is gone: accounts are created by a platform or
            workspace administrator, never self-serve, so pointing someone at a
            signup page would send them somewhere that no longer exists.
          */}
          <div className={styles.metaRow}>
            <Link to="/forgot-password" className={styles.link}>
              {t('login.forgotPassword')}
            </Link>
          </div>
        </div>

        <div className={styles.submitRow}>
          <Button fullWidth variant="primary" type="submit" isLoading={isLoading}>
            {t('login.submit')}
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
};

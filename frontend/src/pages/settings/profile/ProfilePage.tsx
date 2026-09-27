import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../../store/useAuthStore';
import { authService } from '../../../services/authService';
import { useLogout } from '../../../hooks/useLogout';
import { useNavigation } from '../../../hooks/useNavigation';
import { AppLayout } from '../../../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../../../components/layout/Sidebar/Sidebar';
import { SettingsLayout } from '../../../components/layout/SettingsLayout/SettingsLayout';
import { Card } from '../../../components/ui/Card/Card';
import { TextInput } from '../../../components/ui/TextInput/TextInput';
import { Button } from '../../../components/ui/Button/Button';
import { ImagePicker } from '../../../components/ui/ImagePicker';
import { resolveMediaUrl } from '../../../services/mediaService';
import { LanguagePicker } from '../../../components/settings/LanguagePicker';
import type { Language } from '../../../i18n/config';
import { ChevronRight } from 'lucide-react';
import styles from './ProfilePage.module.css';
import { getUserDisplayName } from '../../../utils/userUtils';

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { logout } = useLogout();
  const location = useLocation();

  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { user, updateUser } = useAuthStore();
  const navItems = useNavigation(user, location.pathname);
  
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  // '' means "follow the workspace default" and is sent as null. It is a real
  // choice, not an absent one, so it must round-trip distinctly from a language.
  const [language, setLanguage] = useState<Language | ''>((user?.userLanguage as Language) || '');
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const isBusinessOwner = user?.role === 'BUSINESS_OWNER';

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setPhone(user.phone || '');
      setEmail(user.email || '');
      setLanguage((user.userLanguage as Language) || '');
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavClick = (id: string) => {
    navigate(`/${tenantSlug || ''}/${id === 'dashboard' ? '' : id}`);
  };

  const userName = getUserDisplayName(user, 'Settings User');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      await authService.updateProfile({
        firstName: firstName || null,
        lastName: lastName || null,
        phone: phone || null,
        email: isBusinessOwner ? email : undefined, // Only send email if Business Owner
        language: language === '' ? null : language,
      });
      
      // Update local state
      if (user) {
        updateUser({
          firstName: firstName || null,
          lastName: lastName || null,
          phone: phone || null,
          email: isBusinessOwner ? email : user.email,
          userLanguage: language === '' ? null : language,
        });
      }
      
      setMessage(t('profile.updated'));
    } catch (err: any) {
      setError(err.response?.data?.error || t('profile.updateFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage('');
    setPasswordError('');

    if (newPassword !== confirmPassword) {
      setPasswordError(t('profile.passwordMismatch'));
      return;
    }

    setPasswordLoading(true);
    try {
      await authService.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(t('profile.passwordChanged'));
    } catch (err: any) {
      setPasswordError(err.response?.data?.error || t('profile.passwordChangeFailed'));
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <AppLayout
      userName={userName}
      onLogout={handleLogout}
      onSettingsClick={() => navigate(`/${tenantSlug}/settings/profile`)}
      userAvatarSrc={resolveMediaUrl(user?.avatarUrl)}
      sidebar={
        <Sidebar 
          navItems={navItems} 
          onLogoutClick={handleLogout}
          onNavItemClick={handleNavClick}
        />
      }
    >
      <SettingsLayout activeNavId="profile">
        <div className={styles.container}>
          <div className={styles.breadcrumbWrapper}>
            <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
              <ol className={styles.breadcrumbList}>
                <li><a href="#settings" onClick={(e) => { e.preventDefault(); navigate(`/${tenantSlug}/settings/profile`); }} className={styles.breadcrumbLink}>{t('breadcrumb')}</a></li>
                <li><ChevronRight size={14} /></li>
                <li aria-current="page" className={styles.breadcrumbCurrent}>{t('profile.title')}</li>
              </ol>
            </nav>
          </div>

          <h1 className={styles.title}>{t('profile.title')}</h1>

          {/*
            Media lives in its own card and saves immediately on upload — it
            deliberately does not participate in the form below, because an
            image the user has already cropped and confirmed should not be
            waiting behind a "Save Changes" click.
          */}
          <Card padding="lg" className={styles.mediaCard}>
            <div className={styles.mediaHeader}>
              <h2 className={styles.mediaTitle}>{t('profile.photos')}</h2>
              <p className={styles.mediaSubtitle}>{t('profile.photosSubtitle')}</p>
            </div>

            <ImagePicker
              kind="avatar"
              tenantSlug={tenantSlug || ''}
              value={user?.avatarUrl ?? null}
              onChange={(url) => user && updateUser({ avatarUrl: url })}
              label={t('profile.profilePhotoLabel')}
              hint={t('profile.profilePhotoHint')}
            />

            <ImagePicker
              kind="user-cover"
              tenantSlug={tenantSlug || ''}
              value={user?.coverImageUrl ?? null}
              onChange={(url) => user && updateUser({ coverImageUrl: url })}
              variant="banner"
              label={t('profile.coverPhotoLabel')}
              hint={t('profile.coverPhotoHint')}
            />
          </Card>

          <Card padding="lg">
            {message && (
              <div className={`${styles.banner} ${styles.successBanner}`}>
                {message}
              </div>
            )}
            {error && (
              <div className={`${styles.banner} ${styles.errorBanner}`}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.nameRow}>
                <TextInput
                  label={t('profile.firstName')}
                  value={firstName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)}
                  placeholder={t('profile.firstNamePlaceholder')}
                />
                <TextInput
                  label={t('profile.lastName')}
                  value={lastName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)}
                  placeholder={t('profile.lastNamePlaceholder')}
                />
              </div>

              <TextInput
                label={t('profile.email')}
                type="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                disabled={!isBusinessOwner}
              />
              {!isBusinessOwner && (
                <p className={styles.helperText}>
                  {t('profile.emailOwnerOnly')}
                </p>
              )}

              <TextInput
                label={t('profile.phone')}
                type="tel"
                value={phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
                placeholder={t('profile.phonePlaceholder')}
              />

              <div>
                <label className={styles.fieldLabel} htmlFor="languageSelect">
                  {t('profile.languageLabel')}
                </label>
                <LanguagePicker
                  id="languageSelect"
                  value={language}
                  onChange={setLanguage}
                  inheritOption={{ label: t('profile.languageInherit') }}
                />
                <p className={styles.helperText}>{t('profile.languageHint')}</p>
              </div>

              <div className={styles.formActions}>
                <Button type="submit" variant="primary" isLoading={loading}>
                  {tc('actions.saveChanges')}
                </Button>
              </div>
            </form>
          </Card>

          <Card padding="lg">
            <div className={styles.mediaHeader}>
              <h2 className={styles.mediaTitle}>{t('profile.changePasswordTitle')}</h2>
              <p className={styles.mediaSubtitle}>{t('profile.changePasswordSubtitle')}</p>
            </div>

            {passwordMessage && (
              <div className={`${styles.banner} ${styles.successBanner}`}>
                {passwordMessage}
              </div>
            )}
            {passwordError && (
              <div className={`${styles.banner} ${styles.errorBanner}`}>
                {passwordError}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className={styles.form}>
              <TextInput
                label={t('profile.currentPassword')}
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value)}
              />
              <TextInput
                label={t('profile.newPassword')}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
              />
              <TextInput
                label={t('profile.confirmPassword')}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
              />
              <p className={styles.helperText}>{t('profile.passwordRequirements')}</p>

              <div className={styles.formActions}>
                <Button type="submit" variant="primary" isLoading={passwordLoading}>
                  {t('profile.changePasswordTitle')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </SettingsLayout>
    </AppLayout>
  );
};

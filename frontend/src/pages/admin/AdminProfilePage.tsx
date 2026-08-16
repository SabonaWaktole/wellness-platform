import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { authService } from '../../services/authService';
import { Card } from '../../components/ui/Card/Card';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { Button } from '../../components/ui/Button/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useOwnPlatformAdminAccount } from '../../hooks/usePlatformUsers';
import styles from './AdminProfilePage.module.css';

/**
 * The platform administrator's own account settings — name, email and
 * password. Distinct from PlatformSettingsPage, which configures the
 * platform/workspaces rather than the signed-in admin's own identity.
 *
 * SUPER_ADMIN is allowed to change its own email here: UpdateUserProfileUseCase
 * otherwise restricts email changes to BUSINESS_OWNER, but a platform admin has
 * no Business Owner to defer to, so it is granted the same right over its own
 * account.
 */
export const AdminProfilePage: React.FC = () => {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { t: td } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { user, updateUser, logout: clearSession } = useAuthStore();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const {
    closeOwnAccount,
    refreshAdminCount,
    otherAdmins,
    isSubmitting: isClosing,
    error: closeError,
    clearError: clearCloseError,
  } = useOwnPlatformAdminAccount();
  const [isCloseOpen, setIsCloseOpen] = useState(false);
  const [closeConfirmEmail, setCloseConfirmEmail] = useState('');

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || '');
      setLastName(user.lastName || '');
      setEmail(user.email || '');
    }
  }, [user]);

  // Only to explain WHY the control is unavailable — the server re-checks and
  // is the one that actually decides.
  useEffect(() => {
    refreshAdminCount(user?.userId);
  }, [refreshAdminCount, user?.userId]);

  // `null` is "could not tell", which is not the same as zero: the control
  // stays available and lets the server give the real answer.
  const isLastAdmin = otherAdmins === 0;

  const handleCloseAccount = async () => {
    const ok = await closeOwnAccount(closeConfirmEmail);
    if (!ok) {
      // Thrown so ConfirmDialog stays open with the reason visible, instead of
      // closing as though the account had been removed.
      throw new Error('close-failed');
    }
    // The account is gone and the server has already cleared the cookie; drop
    // the local session too rather than leaving a signed-in shell behind.
    clearSession();
    navigate('/login', { replace: true });
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMessage('');
    setProfileError('');

    try {
      await authService.updateProfile({
        firstName: firstName || null,
        lastName: lastName || null,
        email,
      });

      if (user) {
        updateUser({ firstName: firstName || null, lastName: lastName || null, email });
      }

      setProfileMessage(t('profile.updated'));
    } catch (err: any) {
      setProfileError(err.response?.data?.error || t('profile.updateFailed'));
    } finally {
      setProfileLoading(false);
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
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('profile.title')}</h1>
      </header>

      <Card padding="lg" className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{t('profile.title')}</h2>
        </div>

        {profileMessage && (
          <div className={`${styles.banner} ${styles.successBanner}`}>{profileMessage}</div>
        )}
        {profileError && (
          <div className={`${styles.banner} ${styles.errorBanner}`}>{profileError}</div>
        )}

        <form onSubmit={handleProfileSubmit} className={styles.form}>
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
          />

          <div className={styles.formActions}>
            <Button type="submit" variant="primary" isLoading={profileLoading}>
              {tc('actions.saveChanges')}
            </Button>
          </div>
        </form>
      </Card>

      <Card padding="lg" className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{t('profile.changePasswordTitle')}</h2>
          <p className={styles.cardSubtitle}>{t('profile.changePasswordSubtitle')}</p>
        </div>

        {passwordMessage && (
          <div className={`${styles.banner} ${styles.successBanner}`}>{passwordMessage}</div>
        )}
        {passwordError && (
          <div className={`${styles.banner} ${styles.errorBanner}`}>{passwordError}</div>
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

      {/*
        Closing your own platform account.

        Self-only: there is no equivalent control for removing ANOTHER platform
        admin, and the endpoint behind this takes no id — see
        DeletePlatformAdminSelfUseCase. The button is disabled while this is the
        only admin left, with the reason stated rather than left to a failed
        request to explain.
      */}
      <Card padding="lg" className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{td('superAdmin.closeAccountTitle')}</h2>
          <p className={styles.cardSubtitle}>{td('superAdmin.closeAccountSubtitle')}</p>
        </div>

        {isLastAdmin && (
          <div className={`${styles.banner} ${styles.errorBanner}`}>
            {td('superAdmin.closeAccountLastAdmin')}
          </div>
        )}

        <div className={styles.formActions}>
          <Button
            variant="danger"
            disabled={isLastAdmin}
            onClick={() => {
              clearCloseError();
              setCloseConfirmEmail('');
              setIsCloseOpen(true);
            }}
          >
            {td('superAdmin.closeAccountAction')}
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={isCloseOpen}
        onClose={() => setIsCloseOpen(false)}
        onConfirm={handleCloseAccount}
        title={td('superAdmin.closeAccountTitle')}
        tone="danger"
        confirmLabel={isClosing ? tc('actions.saving') : td('superAdmin.closeAccountAction')}
        message={
          <>
            <p>{td('superAdmin.closeAccountWarning')}</p>
            <TextInput
              label={td('superAdmin.closeAccountConfirmLabel', { email: user?.email ?? '' })}
              value={closeConfirmEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCloseConfirmEmail(e.target.value)
              }
              autoComplete="off"
            />
            {closeError && (
              <p className={styles.errorBanner} role="alert">
                {closeError}
              </p>
            )}
          </>
        }
      />
    </div>
  );
};

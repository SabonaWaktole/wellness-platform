import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button/Button';
import { TextInput } from '../../components/ui/TextInput';
// Explicit path: PasswordInput has no index.ts, unlike its siblings here.
import { PasswordInput } from '../../components/ui/PasswordInput/PasswordInput';
import type { CreatePlatformAdminInput } from '../../services/dashboardService';
import styles from './CreateTenantModal.module.css';

interface CreatePlatformAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreatePlatformAdminInput) => Promise<boolean>;
  isSubmitting: boolean;
  serverError: string | null;
}

/**
 * Appointing another platform administrator.
 *
 * Deliberately a separate modal from `CreateUserModal` rather than a role
 * option inside it: that form's first field is the workspace to create the
 * account in, and a platform admin belongs to none. Folding the two together
 * would mean a workspace picker that has to disable itself for one of its own
 * options — the shapes genuinely differ, so the forms do.
 *
 * The validation below mirrors `tenantSchemas.createPlatformAdmin`, which is
 * the authority. This exists to catch mistakes before a round trip.
 */
export const CreatePlatformAdminModal: React.FC<CreatePlatformAdminModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  serverError,
}) => {
  const { t } = useTranslation('dashboard');
  const [values, setValues] = useState<CreatePlatformAdminInput>({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CreatePlatformAdminInput, string>>>({});

  // A modal reopened after a previous submission must not still hold the last
  // person's details — least of all their password.
  useEffect(() => {
    if (isOpen) {
      setValues({ email: '', password: '', firstName: '', lastName: '' });
      setErrors({});
    }
  }, [isOpen]);

  const set = (field: keyof CreatePlatformAdminInput) => (value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): boolean => {
    const found: Partial<Record<keyof CreatePlatformAdminInput, string>> = {};

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email))
      found.email = t('superAdmin.errEmailFormat');

    const pwd = values.password;
    if (pwd.length < 8 || !/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/[0-9]/.test(pwd))
      found.password = t('superAdmin.errPasswordRules');

    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    const created = await onSubmit({
      ...values,
      // Empty strings are "not provided", not a name of zero characters.
      firstName: values.firstName?.trim() || null,
      lastName: values.lastName?.trim() || null,
    });
    if (created) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('superAdmin.createAdminTitle')}>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <p className={styles.intro}>{t('superAdmin.createAdminIntro')}</p>

        <TextInput
          label={t('superAdmin.fieldFirstName')}
          value={values.firstName ?? ''}
          onChange={(e) => set('firstName')(e.target.value)}
        />

        <TextInput
          label={t('superAdmin.fieldLastName')}
          value={values.lastName ?? ''}
          onChange={(e) => set('lastName')(e.target.value)}
        />

        <TextInput
          label={t('superAdmin.fieldUserEmail')}
          type="email"
          value={values.email}
          onChange={(e) => set('email')(e.target.value)}
          error={errors.email}
          helperText={t('superAdmin.createAdminEmailHelp')}
          required
        />

        <PasswordInput
          label={t('superAdmin.fieldUserPassword')}
          value={values.password}
          onChange={(e) => set('password')(e.target.value)}
          error={errors.password}
          helperText={t('superAdmin.fieldUserPasswordHelp')}
          required
        />

        {serverError && (
          <p className={styles.serverError} role="alert">
            {serverError}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('superAdmin.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('superAdmin.creating') : t('superAdmin.createAdminSubmit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

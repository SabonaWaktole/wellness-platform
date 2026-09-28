import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/ui/Modal/Modal';
import { Button } from '../../../components/ui/Button/Button';
import { TextInput } from '../../../components/ui/TextInput/TextInput';
import type { RoleNames } from '../../../hooks/useRoleAdmin';
import { rolesErrorMessage } from './rolesErrorMessage';
import styles from './RolesSettingsContent.module.css';

interface RoleNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Shown above the fields, e.g. what a copy starts with. */
  hint?: string;
  submitLabel: string;
  initialNames: RoleNames;
  /** Rejects with the API error to keep the dialog open with its reason. */
  onSubmit: (names: RoleNames) => Promise<void>;
}

/** Both names of a role, for copying (FR-RBAC-04) and renaming. Roles are named in Albanian and English (FR-LNG-03). */
export const RoleNameModal: React.FC<RoleNameModalProps> = ({ isOpen, onClose, title, hint, submitLabel, initialNames, onSubmit }) => {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const [names, setNames] = useState<RoleNames>(initialNames);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNames(initialNames);
      setError(null);
    }
    // Reset only when the dialog opens, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ nameSq: names.nameSq.trim(), nameEn: names.nameEn.trim() });
      onClose();
    } catch (err) {
      setError(rolesErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className={styles.form}>
        {hint && <p className={styles.formHint}>{hint}</p>}
        <TextInput
          label={t('roles.copyModal.nameSq')}
          value={names.nameSq}
          onChange={(e) => setNames({ ...names, nameSq: e.target.value })}
          maxLength={60}
          required
        />
        <TextInput
          label={t('roles.copyModal.nameEn')}
          value={names.nameEn}
          onChange={(e) => setNames({ ...names, nameEn: e.target.value })}
          maxLength={60}
          required
        />
        {error && <p className={styles.errorText} role="alert">{error}</p>}
        <div className={styles.formActions}>
          <Button variant="outline" onClick={onClose} type="button">{tc('actions.cancel')}</Button>
          <Button variant="primary" type="submit" isLoading={saving}>{submitLabel}</Button>
        </div>
      </form>
    </Modal>
  );
};

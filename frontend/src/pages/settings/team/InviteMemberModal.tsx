import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/ui/Modal/Modal';
import { Button } from '../../../components/ui/Button/Button';
import { TextInput } from '../../../components/ui/TextInput/TextInput';
import { SelectInput } from '../../../components/ui/SelectInput/SelectInput';
import { useWarehouses } from '../../../hooks/useWarehouses';
import type { Role } from '../../../hooks/useTeam';
import { roleLabel } from '../../../utils/roleLabel';
import styles from './MemberModal.module.css';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The workspace's roles (FR-USR-02). */
  roles: Role[];
  onInvite: (email: string, roleId: string, warehouseId?: string) => Promise<void>;
}

/** New people most often join sales, so the picker starts there. */
const defaultRoleId = (roles: Role[]) => (roles.find((r) => r.key === 'SALES_USER') ?? roles[0])?.id ?? '';

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  onClose,
  roles,
  onInvite
}) => {
  const { t, i18n } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { warehouses, fetchWarehouses } = useWarehouses();

  useEffect(() => {
    if (isOpen) {
      fetchWarehouses();
    }
  }, [isOpen, fetchWarehouses]);

  useEffect(() => {
    if (isOpen && !roleId) setRoleId(defaultRoleId(roles));
  }, [isOpen, roles, roleId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !roleId) return;
    setLoading(true);
    try {
      await onInvite(email, roleId, warehouseId || undefined);
      onClose();
      setEmail('');
      setRoleId('');
      setWarehouseId('');
    } catch (err) {
      console.error(err);
      alert(t('team.invite.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('team.invite.title')}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <TextInput
          label={t('team.invite.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('team.invite.emailPlaceholder')}
          required
        />

        <SelectInput label={t('team.invite.role')} value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>{roleLabel(role, i18n.language)}</option>
          ))}
        </SelectInput>

        <SelectInput
          label={t('team.invite.warehouse')}
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          helperText={t('team.invite.warehouseHint')}
        >
          <option value="">{t('team.invite.noWarehouse')}</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </SelectInput>

        <div className={styles.actions}>
          <Button variant="outline" onClick={onClose} type="button">{tc('actions.cancel')}</Button>
          <Button variant="primary" type="submit" isLoading={loading}>{t('team.invite.submit')}</Button>
        </div>
      </form>
    </Modal>
  );
};

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/ui/Modal/Modal';
import { Button } from '../../../components/ui/Button/Button';
import { SelectInput } from '../../../components/ui/SelectInput/SelectInput';
import { useWarehouses } from '../../../hooks/useWarehouses';
import type { Role, StaffMember } from '../../../hooks/useTeam';
import { roleLabel } from '../../../utils/roleLabel';
import { teamErrorMessage } from './teamErrorMessage';
import styles from './MemberModal.module.css';

interface EditMemberModalProps {
  member: StaffMember | null;
  onClose: () => void;
  /** The workspace's roles (FR-USR-03). */
  roles: Role[];
  onUpdate: (userId: string, roleId: string, warehouseId?: string) => Promise<void>;
}

export const EditMemberModal: React.FC<EditMemberModalProps> = ({
  member,
  onClose,
  roles,
  onUpdate
}) => {
  const { t, i18n } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const [roleId, setRoleId] = useState('');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { warehouses, fetchWarehouses } = useWarehouses();

  useEffect(() => {
    if (member) {
      setRoleId(member.roleId ?? '');
      setWarehouseId(member.warehouseId || '');
      fetchWarehouses();
    }
  }, [member, fetchWarehouses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return;
    setLoading(true);
    try {
      await onUpdate(member.id, roleId, warehouseId || undefined);
      onClose();
    } catch (err) {
      console.error(err);
      alert(teamErrorMessage(err, t, t('team.edit.failed')));
    } finally {
      setLoading(false);
    }
  };

  if (!member) return null;

  return (
    <Modal isOpen={!!member} onClose={onClose} title={t('team.edit.title')}>
      <p className={styles.subtitle}>{t('team.edit.editing', { email: member.email })}</p>
      <form onSubmit={handleSubmit} className={styles.form}>
        <SelectInput label={t('team.edit.role')} value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>{roleLabel(role, i18n.language)}</option>
          ))}
        </SelectInput>
        <p className={styles.subtitle}>{t('team.edit.roleAppliesNextLoad')}</p>

        <SelectInput label={t('team.edit.warehouse')} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <option value="">{t('team.invite.noWarehouse')}</option>
          {warehouses.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </SelectInput>

        <div className={styles.actions}>
          <Button variant="outline" onClick={onClose} type="button">{tc('actions.cancel')}</Button>
          <Button variant="primary" type="submit" isLoading={loading}>{tc('actions.saveChanges')}</Button>
        </div>
      </form>
    </Modal>
  );
};

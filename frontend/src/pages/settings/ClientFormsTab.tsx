import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Star, Copy, Trash2, Inbox } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Badge } from '../../components/ui/Badge/Badge';
import { Modal } from '../../components/ui/Modal/Modal';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog/ConfirmDialog';
import {
  useClientForms,
  useCreateClientForm,
  useUpdateFormSettings,
  useDeleteClientForm,
  useDuplicateClientForm,
} from '../../hooks/useClientForm';
import type { ClientFormSummary } from '../../types/form';
import styles from './ClientFormsTab.module.css';

/**
 * The Forms tab: the list of the tenant's forms, from which the owner opens
 * the full-page canvas builder. One form is the client-intake form
 * (rendered at clients/new and clients/:id/edit); others exist for the
 * public link and print (later phases).
 */
export const ClientFormsTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const { tenantSlug } = useParams();

  const { forms, isLoading, error, fetchForms } = useClientForms();
  const { createForm, isCreating, error: createError } = useCreateClientForm();
  const { updateSettings } = useUpdateFormSettings();
  const { deleteForm, error: deleteError } = useDeleteClientForm();
  const { duplicateForm, error: duplicateError } = useDuplicateClientForm();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ClientFormSummary | null>(null);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  const openBuilder = (formId: string) => navigate(`/${tenantSlug}/settings/client-management/forms/${formId}`);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const created = await createForm(newName.trim());
      setIsCreateOpen(false);
      setNewName('');
      openBuilder(created.id);
    } catch {
      // surfaced via createError
    }
  };

  const handleSetDefault = async (form: ClientFormSummary) => {
    await updateSettings(form.id, { isDefault: true }, form.version).catch(() => {});
    fetchForms();
  };

  const handleDuplicate = async (form: ClientFormSummary) => {
    await duplicateForm(form.id, t('formBuilder.copyOf', { name: form.name })).catch(() => {});
    fetchForms();
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    await deleteForm(pendingDelete.id).catch(() => {});
    setPendingDelete(null);
    fetchForms();
  };

  return (
    <div>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('formBuilder.formsTabTitle')}</h2>
        <Button icon={<Plus size={16} />} onClick={() => setIsCreateOpen(true)}>
          {t('formBuilder.createForm')}
        </Button>
      </div>

      {isLoading && <p>{t('formBuilder.loading')}</p>}
      {error && <p role="alert">{error}</p>}
      {(deleteError || duplicateError) && <p role="alert">{deleteError || duplicateError}</p>}

      {!isLoading && forms.length > 0 && (
        <table className={styles.table}>
          <tbody>
            {forms.map((form) => (
              <tr key={form.id} className={styles.row}>
                <td>
                  <div className={styles.nameCell} onClick={() => openBuilder(form.id)}>
                    <span className={styles.formName}>{form.name}</span>
                    {form.isDefault && (
                      <Badge variant="primary">{t('formBuilder.clientIntake')}</Badge>
                    )}
                    <Badge variant="secondary">{form.status}</Badge>
                  </div>
                </td>
                <td>
                  <div className={styles.actions}>
                    {!form.isDefault && (
                      <Button
                        variant="outline"
                        icon={<Star size={14} />}
                        onClick={() => handleSetDefault(form)}
                      >
                        {t('formBuilder.makeIntake')}
                      </Button>
                    )}
                    {form.status === 'PUBLISHED' && (
                      <Button
                        variant="outline"
                        icon={<Inbox size={14} />}
                        onClick={() => navigate(`/${tenantSlug}/settings/client-management/forms/${form.id}/submissions`)}
                      >
                        {t('submissions.title', { ns: 'forms' })}
                      </Button>
                    )}
                    <Button variant="outline" icon={<Copy size={14} />} onClick={() => handleDuplicate(form)}>
                      {t('formBuilder.duplicate')}
                    </Button>
                    {!form.isDefault && (
                      <Button
                        variant="outline"
                        icon={<Trash2 size={14} />}
                        onClick={() => setPendingDelete(form)}
                      >
                        {t('formBuilder.delete')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title={t('formBuilder.createForm')}>
        <div className={styles.dialog}>
          <TextInput
            label={t('formBuilder.formName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          {createError && <p role="alert">{createError}</p>}
          <div className={styles.dialogActions}>
            <Button variant="outline" type="button" onClick={() => setIsCreateOpen(false)}>
              {t('formBuilder.cancel')}
            </Button>
            <Button variant="primary" type="button" disabled={!newName.trim() || isCreating} onClick={handleCreate}>
              {isCreating ? t('formBuilder.creating') : t('formBuilder.createForm')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={t('formBuilder.deleteFormTitle')}
        message={t('formBuilder.deleteFormMessage', { name: pendingDelete?.name })}
        confirmLabel={t('formBuilder.delete')}
        tone="danger"
        onConfirm={handleConfirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
};

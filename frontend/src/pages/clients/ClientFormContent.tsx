import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Save, Puzzle } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { CustomFieldInput, type CustomFieldInputProps } from '../../components/ui/CustomFieldInput/CustomFieldInput';
import { useCreateClient, useUpdateClient, useClientDetail, useClientSettings } from '../../hooks/useClients';
import { useTeam } from '../../hooks/useTeam';
import { getStaffDisplayName } from '../../utils/userUtils';
import type { CustomFieldType } from '../../types/client';
import styles from './ClientFormContent.module.css';

interface ClientFormValues {
  customFieldValues: Record<string, unknown>;
}

/**
 * Backend field type → the input variant that renders it.
 *
 * Explicit rather than derived, so adding a backend type is a deliberate choice
 * here too. Anything unrecognised falls back to a plain text box: a field the UI
 * does not know about should still be readable and editable, never blank.
 */
const FIELD_TYPE_TO_INPUT: Record<CustomFieldType, CustomFieldInputProps['fieldType']> = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  BOOLEAN: 'checkbox',
  // Restricted to letters, numbers and spaces by the backend; a plain text box
  // is still the right control, the value rule is enforced on submit.
  ALPHANUMERIC: 'text',
  LONG_TEXT: 'multiline',
  SINGLE_SELECT: 'dropdown',
  MULTI_SELECT: 'multi-select',
  EMAIL: 'email',
  USER_REFERENCE: 'user-select',
};

const inputVariantFor = (fieldType: string): CustomFieldInputProps['fieldType'] =>
  FIELD_TYPE_TO_INPUT[fieldType as CustomFieldType] ?? 'text';

export const ClientFormContent: React.FC = () => {
  const navigate = useNavigate();
  const { tenantSlug, clientId } = useParams();
  const isEdit = !!clientId;

  const { createClient, isLoading: isCreating, error: createError } = useCreateClient();
  const { updateClient, isLoading: isUpdating, error: updateError } = useUpdateClient();
  const { client, fetchClient } = useClientDetail(clientId || '');
  const { customFields, fetchSettings } = useClientSettings();
  // Only the staff list; pending invitations are Business-Owner-only.
  const { staff, fetchStaff } = useTeam();

  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});

  const {
    control,
    handleSubmit,
    reset,
    watch,
  } = useForm<ClientFormValues>({
    defaultValues: {
      customFieldValues: {},
    },
  });

  useEffect(() => {
    fetchSettings();
    fetchStaff();
    if (isEdit) {
      fetchClient();
    }
  }, [fetchSettings, fetchStaff, isEdit, fetchClient]);

  // Populate form when editing
  useEffect(() => {
    if (client && isEdit) {
      reset({
        // Values are passed through as stored, NOT String()-coerced. Coercing
        // turned a stored `false` into the string "false", which is truthy — so
        // a checkbox field that was off rendered as on, and saving it back
        // silently flipped the value to true.
        customFieldValues: { ...(client.customFieldValues || {}) },
      });
    }
  }, [client, isEdit, reset]);

  const sortedCustomFields = [...customFields].sort((a, b) => a.order - b.order);

  const { t } = useTranslation('clients');
  const { t: tc } = useTranslation('common');
  const error = createError || updateError;
  const isLoading = isCreating || isUpdating;

  const onSubmit = async (values: ClientFormValues) => {
    // Simple required-field check: every field flagged `required` must have a
    // non-blank value before we ever call the API.
    const nextErrors: Record<string, string> = {};
    for (const field of sortedCustomFields) {
      if (!field.required) continue;
      const value = values.customFieldValues?.[field.fieldName];
      const isBlank = value === undefined || value === null || value === '';
      if (isBlank) {
        nextErrors[field.fieldName] = t('form.fieldRequired', { defaultValue: 'This field is required' });
      }
    }
    setRequiredErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const data = { customFieldValues: values.customFieldValues };

    try {
      if (isEdit && clientId) {
        await updateClient(clientId, data);
        navigate(`/${tenantSlug}/clients/${clientId}`);
      } else {
        const newClient = await createClient(data);
        navigate(`/${tenantSlug}/clients/${newClient.id}`);
      }
    } catch {
      // error state is set by the hook
    }
  };

  return (
    <form className={styles.container} onSubmit={handleSubmit(onSubmit)}>
      {/* Page Header */}
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{isEdit ? t('form.editTitle') : t('form.createTitle')}</h1>
          <p className={styles.subtitle}>
            {isEdit ? t('form.editSubtitle') : t('form.createSubtitle')}
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" type="button" onClick={() => navigate(`/${tenantSlug}/clients`)}>
            {tc('actions.cancel')}
          </Button>
          <Button variant="primary" type="submit" icon={<Save size={18} />} disabled={isLoading}>
            {isLoading ? tc('state.saving') : t('form.saveClient')}
          </Button>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.formContainer}>
        {/* Fields (dynamic, tenant-defined — this includes the 5 system fields) */}
        <Card className={`${styles.sectionCard} ${styles.dynamicCard}`} padding="xl">
          <div className={styles.sectionHeader}>
            <div className={styles.iconWrapper}>
              <Puzzle size={20} />
            </div>
            <h2 className={styles.sectionTitle}>{t('form.customFieldsSection')}</h2>
          </div>
          <div className={styles.grid1}>
            {sortedCustomFields.map((field) => (
              <Controller
                key={field.id}
                name={`customFieldValues.${field.fieldName}`}
                control={control}
                render={({ field: controlled }) => {
                  if (field.fieldType === 'USER_REFERENCE') {
                    const selectedValue = watch(`customFieldValues.${field.fieldName}`);
                    /**
                     * Deactivated members are hidden — assigning new work to
                     * someone who can no longer sign in is never the intent —
                     * but a client already assigned to a deactivated member
                     * keeps them as a visible option. Without that exception,
                     * opening and saving such a client would silently
                     * reassign it, because the select would have no matching
                     * option for the stored value.
                     */
                    const assignableStaff = staff.filter(
                      (member) => member.isActive !== false || member.id === selectedValue
                    );
                    return (
                      <CustomFieldInput
                        fieldType="user-select"
                        label={field.fieldName}
                        userOptions={assignableStaff.map((member) => ({
                          id: member.id,
                          label: getStaffDisplayName(member),
                        }))}
                        value={controlled.value}
                        onChange={controlled.onChange}
                        required={field.required}
                        error={requiredErrors[field.fieldName]}
                      />
                    );
                  }
                  return (
                    <CustomFieldInput
                      fieldType={inputVariantFor(field.fieldType)}
                      label={field.fieldName}
                      options={field.options ?? []}
                      value={controlled.value}
                      onChange={controlled.onChange}
                      required={field.required}
                      error={requiredErrors[field.fieldName]}
                    />
                  );
                }}
              />
            ))}
          </div>
        </Card>

        {/* Internal Notes */}
        <Card className={styles.sectionCard} padding="xl">
          <div className={styles.sectionHeader}>
            <div className={styles.iconWrapper}>
              <FileText size={20} />
            </div>
            <h2 className={styles.sectionTitle}>{t('form.internalNotes')}</h2>
          </div>
          <div className={styles.fullWidth}>
            <TextareaInput
              label={t('form.notesLabel')}
              placeholder={t('form.notesComingSoon')}
              rows={4}
              disabled
              helperText="This field isn't wired up to the backend yet, so notes typed here won't be saved."
            />
          </div>
        </Card>
      </div>
    </form>
  );
};

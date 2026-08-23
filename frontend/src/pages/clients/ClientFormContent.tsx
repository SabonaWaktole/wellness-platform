import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { User, FileText, Save, Puzzle } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { CustomFieldInput, type CustomFieldInputProps } from '../../components/ui/CustomFieldInput/CustomFieldInput';
import { useCreateClient, useUpdateClient, useClientDetail, useClientSettings } from '../../hooks/useClients';
import { useTeam } from '../../hooks/useTeam';
import { getStaffDisplayName } from '../../utils/userUtils';
import { ClientStatus, type CustomFieldType } from '../../types/client';
import styles from './ClientFormContent.module.css';

interface ClientFormValues {
  name: string;
  email: string;
  phone: string;
  status: string;
  assignedUserId: string;
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
  SINGLE_SELECT: 'dropdown',
};

const inputVariantFor = (fieldType: string): CustomFieldInputProps['fieldType'] =>
  FIELD_TYPE_TO_INPUT[fieldType as CustomFieldType] ?? 'text';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ClientFormValues>({
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      status: ClientStatus.PROSPECT,
      assignedUserId: '',
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

  /**
   * Deactivated members are hidden — assigning new work to someone who can no
   * longer sign in is never the intent — but a client *already* assigned to a
   * deactivated member keeps them as a visible option. Without that exception,
   * opening and saving such a client would silently reassign it, because the
   * select would have no matching option for the stored value.
   */
  const assignedUserId = watch('assignedUserId');
  const assignableStaff = staff.filter(
    (member) => member.isActive !== false || member.id === assignedUserId
  );

  // Populate form when editing
  useEffect(() => {
    if (client && isEdit) {
      reset({
        name: client.name,
        email: client.contactInfo?.email || '',
        phone: client.contactInfo?.phone || '',
        status: client.status,
        // '' is the Unassigned option; the column is nullable.
        assignedUserId: client.assignedUserId ?? '',
        // Values are passed through as stored, NOT String()-coerced. Coercing
        // turned a stored `false` into the string "false", which is truthy — so
        // a checkbox field that was off rendered as on, and saving it back
        // silently flipped the value to true.
        customFieldValues: { ...(client.customFieldValues || {}) },
      });
    }
  }, [client, isEdit, reset]);

  const onSubmit = async (values: ClientFormValues) => {
    const data = {
      name: values.name,
      email: values.email || undefined,
      phone: values.phone || undefined,
      status: values.status as ClientStatus,
      // Empty string means Unassigned — send null so the column is cleared
      // rather than set to an invalid empty id.
      assignedUserId: values.assignedUserId || null,
      customFieldValues: values.customFieldValues,
    };

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

  const { t } = useTranslation('clients');
  const { t: tc } = useTranslation('common');
  const error = createError || updateError;
  const isLoading = isCreating || isUpdating;

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
        {/* Section 1: Basic Information */}
        <Card className={styles.sectionCard} padding="xl">
          <div className={styles.sectionHeader}>
            <div className={styles.iconWrapper}>
              <User size={20} />
            </div>
            <h2 className={styles.sectionTitle}>{t('form.basicInformation')}</h2>
          </div>
          <div className={styles.grid1}>
            <TextInput
              label={t('form.nameLabel')}
              placeholder={t('form.namePlaceholderClient')}
              error={errors.name?.message}
              {...register('name', { required: t('form.nameRequired') })}
            />
            <TextInput
              label={t('form.email')}
              type="email"
              placeholder={t('form.emailPlaceholderClient')}
              error={errors.email?.message}
              {...register('email', {
                pattern: { value: EMAIL_PATTERN, message: t('form.emailInvalid') },
              })}
            />
            <TextInput
              label={t('form.phone')}
              type="tel"
              placeholder={t('form.phonePlaceholderClient')}
              error={errors.phone?.message}
              {...register('phone')}
            />
            <SelectInput label={t('form.status')} {...register('status')}>
              <option value={ClientStatus.PROSPECT}>{t('status.prospect')}</option>
              <option value={ClientStatus.ACTIVE}>{t('status.active')}</option>
              <option value={ClientStatus.INACTIVE}>{t('status.inactive')}</option>
            </SelectInput>
            {/*
              Available to Staff as well as Business Owners: SRS §6.2 lists
              "Assign the client to a staff member" under Add Client, which it
              states is for "staff and business owners", and the permission
              matrix gives Staff Full (assigned/shared) client management. The
              /auth/staff endpoint is likewise authorized for both roles.
            */}
            <SelectInput label={t('form.assignedTo')} {...register('assignedUserId')}>
              <option value="">{t('form.unassigned')}</option>
              {assignableStaff.map((member) => (
                <option key={member.id} value={member.id}>
                  {getStaffDisplayName(member)}
                </option>
              ))}
            </SelectInput>
          </div>
        </Card>

        {/* Section 2: Custom Fields (Dynamic) */}
        {customFields.length > 0 && (
          <Card className={`${styles.sectionCard} ${styles.dynamicCard}`} padding="xl">
            <div className={styles.sectionHeader}>
              <div className={styles.iconWrapper}>
                <Puzzle size={20} />
              </div>
              <h2 className={styles.sectionTitle}>{t('form.customFieldsSection')}</h2>
            </div>
            <div className={styles.grid1}>
              {customFields.map((field) => (
                <Controller
                  key={field.id}
                  name={`customFieldValues.${field.fieldName}`}
                  control={control}
                  render={({ field: controlled }) => (
                    <CustomFieldInput
                      fieldType={inputVariantFor(field.fieldType)}
                      label={field.fieldName}
                      options={field.options ?? []}
                      value={controlled.value}
                      onChange={controlled.onChange}
                    />
                  )}
                />
              ))}
            </div>
          </Card>
        )}

        {/* Section 3: Internal Notes */}
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

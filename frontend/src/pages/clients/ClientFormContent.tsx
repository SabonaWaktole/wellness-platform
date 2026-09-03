import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Save } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { Controller } from 'react-hook-form';
import { FormRenderer } from '../../components/forms/FormRenderer';
import { isBlank } from '../../components/forms/FormRenderer/fieldControl';
import { useCreateClient, useUpdateClient, useClientDetail } from '../../hooks/useClients';
import { useClientForm } from '../../hooks/useClientForm';
import { useTeam } from '../../hooks/useTeam';
import { getStaffDisplayName } from '../../utils/userUtils';
import type { FormElement } from '../../types/form';
import styles from './ClientFormContent.module.css';

interface ClientFormValues {
  customFieldValues: Record<string, unknown>;
  /** Internal notes — a system field, not one of the tenant's custom fields. */
  notes: string;
}

export const ClientFormContent: React.FC = () => {
  const navigate = useNavigate();
  const { tenantSlug, clientId } = useParams();
  const isEdit = !!clientId;

  const { createClient, isLoading: isCreating, error: createError } = useCreateClient();
  const { updateClient, isLoading: isUpdating, error: updateError } = useUpdateClient();
  const { client, fetchClient } = useClientDetail(clientId || '');
  const { form, isLoading: isFormLoading, error: formError, fetchForm } = useClientForm();
  // Only the staff list; pending invitations are Business-Owner-only.
  const { staff, fetchStaff } = useTeam();

  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});

  const { control, handleSubmit, reset, getValues } = useForm<ClientFormValues>({
    defaultValues: { customFieldValues: {}, notes: '' },
  });

  useEffect(() => {
    fetchForm();
    fetchStaff();
    if (isEdit) {
      fetchClient();
    }
  }, [fetchForm, fetchStaff, isEdit, fetchClient]);

  const { t } = useTranslation('clients');
  const { t: tc } = useTranslation('common');
  const error = createError || updateError || formError;
  const isLoading = isCreating || isUpdating;

  /**
   * Deactivated members are hidden — assigning new work to someone who can no
   * longer sign in is never the intent — but a client already assigned to a
   * deactivated member keeps them as a visible option. Without that exception,
   * opening and saving such a client would silently reassign it, because the
   * select would have no matching option for the stored value.
   */
  const assignedUserIds = useMemo(() => {
    const values = (client?.customFieldValues ?? {}) as Record<string, unknown>;
    return new Set(Object.values(values).filter((v): v is string => typeof v === 'string'));
  }, [client]);

  const userOptions = useMemo(
    () =>
      staff
        .filter((member) => member.isActive !== false || assignedUserIds.has(member.id))
        .map((member) => ({ id: member.id, label: getStaffDisplayName(member) })),
    [staff, assignedUserIds]
  );

  /**
   * Only the fields this form actually renders can be validated or submitted —
   * and, on this page, only the BOUND ones.
   *
   * A v3 form owns its own fields, and an unbound field has no
   * CustomFieldDefinition and therefore nowhere to go on a Client record. Such
   * fields belong to FormSubmission.data (Phase 6), not here, so this page
   * deliberately ignores them rather than inventing a client column for them.
   */
  const renderedFields = useMemo(() => {
    if (!form) return [];
    const byId = new Map(form.definitions.map((d) => [d.id, d]));
    return form.layout.pages
      .flatMap((page) => page.sections)
      .flatMap((section) => section.elements)
      .flatMap((element: FormElement) => {
        const clientFieldId = element.field?.clientFieldId;
        if (!clientFieldId) return [];
        const definition = byId.get(clientFieldId);
        return definition ? [{ element, field: element.field!, definition }] : [];
      });
  }, [form]);

  // Populate form when editing
  useEffect(() => {
    if (!client || !isEdit) return;
    const stored = (client.customFieldValues || {}) as Record<string, unknown>;

    /*
     * Bridge the stored keys back into the document's keys.
     *
     * Client.customFieldValues is keyed by the DEFINITION's fieldName; the
     * renderer reads `field.key`. This is the same mapping `onSubmit`
     * performs in the other direction — without it, editing an existing
     * client would render every field blank and then save those blanks over
     * real data.
     *
     * Values are passed through as stored, NOT String()-coerced. Coercing
     * turned a stored `false` into the string "false", which is truthy — so a
     * checkbox field that was off rendered as on, and saving it back silently
     * flipped the value to true.
     */
    const byKey: Record<string, unknown> = {};
    for (const { field, definition } of renderedFields) {
      if (definition.fieldName in stored) byKey[field.key] = stored[definition.fieldName];
    }

    reset({ customFieldValues: byKey, notes: client.notes ?? '' });
  }, [client, isEdit, reset, renderedFields]);

  const onSubmit = async (values: ClientFormValues) => {
    // Required-field check across the fields this form renders. A required
    // field the form does not place is refused when the layout is saved, so it
    // cannot reach here.
    const nextErrors: Record<string, string> = {};
    for (const { field, definition } of renderedFields) {
      // The definition is authoritative for `required` — Client.create
      // enforces it, so a form-level relaxation would only fail later.
      if (!(definition.required || field.required)) continue;
      if (isBlank(values.customFieldValues?.[field.key])) {
        // Keyed by field.key, matching what the renderer collects under.
        nextErrors[field.key] = t('form.fieldRequired', {
          defaultValue: 'This field is required',
        });
      }
    }
    setRequiredErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    /*
     * MERGE, never replace.
     *
     * The renderer only produces values for the fields THIS form places. A
     * client created through a wide form and later edited through a narrower
     * one would otherwise come back with every unrendered field erased — the
     * form does not know those values exist, so a plain replace silently
     * deletes them. Starting from the stored record and layering the edited
     * fields on top is what keeps a narrow form a *view* rather than a filter.
     */
    /*
     * Translate the document's own keys into the client record's keys.
     *
     * The renderer collects under `field.key` (the form's stable data
     * identity), but Client.customFieldValues is keyed by the DEFINITION's
     * fieldName — see Client.create. Bridging the two here, explicitly, is
     * what lets a form rename or restructure its fields without touching the
     * client dictionary, and is the same mapping SubmitFormUseCase performs
     * server-side for bound fields.
     */
    const collected: Record<string, unknown> = {};
    for (const { field, definition } of renderedFields) {
      const value = values.customFieldValues?.[field.key];
      if (value !== undefined) collected[definition.fieldName] = value;
    }

    const merged = {
      ...(isEdit ? client?.customFieldValues ?? {} : {}),
      ...collected,
    };

    const data = {
      customFieldValues: merged,
      // Trimmed, and '' rather than undefined so clearing the box actually
      // clears the stored notes instead of leaving the old text in place.
      notes: values.notes?.trim() ?? '',
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

  return (
    /*
     * noValidate: validation is ours, not the browser's. Fields carry the
     * native `required` attribute for assistive tech, but leaving native
     * constraint validation on means the browser silently blocks submit and
     * shows its own tooltip — so a required field left blank produces a native
     * bubble on one field and our styled message on none of the others.
     */
    <form className={styles.container} noValidate onSubmit={handleSubmit(onSubmit)}>
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
          <Button
            variant="primary"
            type="submit"
            icon={<Save size={18} />}
            disabled={isLoading || isFormLoading}
          >
            {isLoading ? tc('state.saving') : t('form.saveClient')}
          </Button>
        </div>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.formContainer}>
        {/* The tenant's own form: sections, layout and controls all come from
            the builder, so this page has nothing field-specific left in it. */}
        {form && (
          <FormRenderer
            layout={form.layout}
            mode="fill"
            control={control}
            errors={requiredErrors}
            namePrefix="customFieldValues"
            userOptions={userOptions}
            values={getValues('customFieldValues')}
          />
        )}

        {/* Internal Notes */}
        <Card className={styles.sectionCard} padding="xl">
          <div className={styles.sectionHeader}>
            <div className={styles.iconWrapper}>
              <FileText size={20} />
            </div>
            <h2 className={styles.sectionTitle}>{t('form.internalNotes')}</h2>
          </div>
          <div className={styles.fullWidth}>
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <TextareaInput
                  label={t('form.notesLabel')}
                  placeholder={t('form.notesPlaceholder')}
                  rows={4}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  helperText={t('form.notesHelper')}
                />
              )}
            />
          </div>
        </Card>
      </div>
    </form>
  );
};

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { Building2, FileText, Save } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { Controller } from 'react-hook-form';
import { FormRenderer } from '../../components/forms/FormRenderer';
import { isBlank } from '../../components/forms/FormRenderer/fieldControl';
import { useCreateClient, useUpdateClient, useClientDetail } from '../../hooks/useClients';
import { useClientForm } from '../../hooks/useClientForm';
import { useTeam } from '../../hooks/useTeam';
import { useActiveLookups } from '../../hooks/useActiveLookups';
import { getStaffDisplayName } from '../../utils/userUtils';
import { lookupLabel } from '../../utils/lookupLabel';
import { RiskBadge } from '../../components/clients/RiskBadge';
import { clientErrorMessage, clientErrorField } from './clientErrorMessage';
import type { FormElement } from '../../types/form';
import type { CompanyProfileInput } from '../../types/client';
import styles from './ClientFormContent.module.css';

interface ClientFormValues {
  customFieldValues: Record<string, unknown>;
  /** Internal notes — a system field, not one of the tenant's custom fields. */
  notes: string;
  profile: {
    businessTypeId: string;
    employeeCount: string;
    areaId: string;
    cityId: string;
    streetAddress: string;
    taxId: string;
    website: string;
  };
}

const PROFILE_FIELDS = new Set(['businessTypeId', 'employeeCount', 'areaId', 'cityId', 'taxId', 'website']);

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
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { control, handleSubmit, reset, getValues, watch, setValue } = useForm<ClientFormValues>({
    defaultValues: {
      customFieldValues: {},
      notes: '',
      profile: { businessTypeId: '', employeeCount: '', areaId: '', cityId: '', streetAddress: '', taxId: '', website: '' },
    },
  });

  const businessTypes = useActiveLookups('business-types');
  const riskLevels = useActiveLookups('risk-levels');
  const areas = useActiveLookups('areas');
  const selectedAreaId = watch('profile.areaId');
  const selectedBusinessTypeId = watch('profile.businessTypeId');
  const cities = useActiveLookups('cities', selectedAreaId ? { areaId: selectedAreaId } : undefined);

  const derivedRisk = useMemo(() => {
    const businessType = businessTypes.find((bt) => bt.id === selectedBusinessTypeId);
    if (!businessType) return null;
    const riskLevel = riskLevels.find((rl) => rl.id === businessType.riskLevelId);
    return riskLevel ? { id: riskLevel.id, nameSq: riskLevel.nameSq, nameEn: riskLevel.nameEn, level: riskLevel.level } : null;
  }, [businessTypes, riskLevels, selectedBusinessTypeId]);

  // Changing the area invalidates any city chosen under the old one — never
  // let the form submit a city that no longer matches its area.
  const handleAreaChange = (areaId: string) => {
    setValue('profile.areaId', areaId);
    setValue('profile.cityId', '');
  };

  useEffect(() => {
    fetchForm();
    fetchStaff();
    if (isEdit) {
      fetchClient();
    }
  }, [fetchForm, fetchStaff, isEdit, fetchClient]);

  const { t, i18n } = useTranslation('clients');
  const { t: tc } = useTranslation('common');
  const error = submitError || createError || updateError || formError;
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

    const profile = client.profile;
    reset({
      customFieldValues: byKey,
      notes: client.notes ?? '',
      profile: {
        businessTypeId: profile?.businessTypeId ?? '',
        employeeCount: profile?.employeeCount != null ? String(profile.employeeCount) : '',
        areaId: profile?.areaId ?? '',
        cityId: profile?.cityId ?? '',
        streetAddress: profile?.streetAddress ?? '',
        taxId: profile?.taxId ?? '',
        website: profile?.website ?? '',
      },
    });
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

    const profile: CompanyProfileInput = {
      businessTypeId: values.profile.businessTypeId,
      employeeCount: Number(values.profile.employeeCount),
      areaId: values.profile.areaId,
      cityId: values.profile.cityId,
      streetAddress: values.profile.streetAddress?.trim() || null,
      taxId: values.profile.taxId?.trim() || null,
      website: values.profile.website?.trim() || null,
    };

    const data = {
      customFieldValues: merged,
      // Trimmed, and '' rather than undefined so clearing the box actually
      // clears the stored notes instead of leaving the old text in place.
      notes: values.notes?.trim() ?? '',
      profile,
    };

    setSubmitError(null);
    setProfileErrors({});

    try {
      if (isEdit && clientId) {
        const saved = await updateClient(clientId, data);
        navigate(`/${tenantSlug}/clients/${clientId}`, {
          state: saved.warnings?.includes('DUPLICATE_NAME') ? { duplicateNameWarning: true } : undefined,
        });
      } else {
        const newClient = await createClient(data);
        navigate(`/${tenantSlug}/clients/${newClient.id}`, {
          state: newClient.warnings?.includes('DUPLICATE_NAME') ? { duplicateNameWarning: true } : undefined,
        });
      }
    } catch (err: any) {
      const field = clientErrorField(err);
      if (field && PROFILE_FIELDS.has(field)) {
        setProfileErrors({ [field]: clientErrorMessage(err, t) });
      } else {
        setSubmitError(clientErrorMessage(err, t));
      }
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

        {/* Company profile (Slice 11: FR-CMP-01, 02, 03) */}
        <Card className={styles.sectionCard} padding="xl">
          <div className={styles.sectionHeader}>
            <div className={styles.iconWrapper}>
              <Building2 size={20} />
            </div>
            <h2 className={styles.sectionTitle}>{t('form.profile.title')}</h2>
          </div>
          <div className={styles.grid2}>
            <Controller
              name="profile.businessTypeId"
              control={control}
              render={({ field }) => (
                <SelectInput
                  label={t('form.profile.businessType')}
                  required
                  value={field.value}
                  error={profileErrors.businessTypeId}
                  onChange={(e) => field.onChange(e.target.value)}
                >
                  <option value="">{t('form.profile.choose')}</option>
                  {businessTypes.map((bt) => (
                    <option key={bt.id} value={bt.id}>
                      {lookupLabel(bt, i18n.language)}
                    </option>
                  ))}
                </SelectInput>
              )}
            />

            <div className={styles.riskRow}>
              <span>{t('form.profile.riskLevel')}</span>
              <RiskBadge risk={derivedRisk} />
            </div>

            <Controller
              name="profile.employeeCount"
              control={control}
              render={({ field }) => (
                <TextInput
                  label={t('form.profile.employeeCount')}
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={field.value}
                  error={profileErrors.employeeCount}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              )}
            />

            <Controller
              name="profile.areaId"
              control={control}
              render={({ field }) => (
                <SelectInput
                  label={t('form.profile.area')}
                  required
                  value={field.value}
                  error={profileErrors.areaId}
                  onChange={(e) => handleAreaChange(e.target.value)}
                >
                  <option value="">{t('form.profile.choose')}</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {lookupLabel(area, i18n.language)}
                    </option>
                  ))}
                </SelectInput>
              )}
            />

            <Controller
              name="profile.cityId"
              control={control}
              render={({ field }) => (
                <SelectInput
                  label={t('form.profile.city')}
                  required
                  disabled={!selectedAreaId}
                  value={field.value}
                  error={profileErrors.cityId}
                  onChange={(e) => field.onChange(e.target.value)}
                >
                  <option value="">{t('form.profile.choose')}</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {lookupLabel(city, i18n.language)}
                    </option>
                  ))}
                </SelectInput>
              )}
            />

            <Controller
              name="profile.streetAddress"
              control={control}
              render={({ field }) => (
                <TextInput
                  label={t('form.profile.streetAddress')}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              )}
            />

            <Controller
              name="profile.taxId"
              control={control}
              render={({ field }) => (
                <TextInput
                  label={t('form.profile.taxId')}
                  value={field.value}
                  error={profileErrors.taxId}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              )}
            />

            <Controller
              name="profile.website"
              control={control}
              render={({ field }) => (
                <TextInput
                  label={t('form.profile.website')}
                  placeholder="https://"
                  value={field.value}
                  error={profileErrors.website}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              )}
            />
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

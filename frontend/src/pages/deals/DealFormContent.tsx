import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Building2, Search } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { useDebounce } from '../../hooks/useDebounce';
import { useDealText } from '../../hooks/useDealText';
import { usePermission } from '../../hooks/usePermission';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useTeam } from '../../hooks/useTeam';
import { clientService } from '../../services/clientService';
import { dealService } from '../../services/dealService';
import { getStaffDisplayName } from '../../utils/userUtils';
import { DEAL_TYPES } from '../../types/deal';
import type { DealType } from '../../types/deal';
import { dealErrorField, dealErrorMessage } from './dealErrors';
import styles from './DealFormContent.module.css';

interface Company {
  id: string;
  name: string;
}

/**
 * Creating and editing a deal (FR-DEAL-01). A new deal is opened from a
 * company (`?clientId=`), or the user searches for one here. The title may be
 * left empty for the default "<company> – <type>". Choosing a salesperson
 * other than the company's is offered only with `companies.reassign`; the
 * server applies the same rule. After creating, a deal changes salesperson
 * through the deal page's own action (FR-DEAL-05), not this form.
 */
export const DealFormContent: React.FC = () => {
  const { t } = useTranslation('deals');
  const { tenantSlug, dealId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const statusLabel = useStatusLabel();
  const text = useDealText();
  const canReassign = usePermission('companies.reassign');
  const { staff, fetchStaff } = useTeam();
  const isEdit = !!dealId;

  const [company, setCompany] = useState<Company | null>(null);
  const [companyQuery, setCompanyQuery] = useState('');
  const [matches, setMatches] = useState<Company[]>([]);
  const [type, setType] = useState<DealType>('NEW_CONTRACT');
  const [title, setTitle] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const debouncedQuery = useDebounce(companyQuery, 300);

  // Edit: the deal's own values. Create: the company it was opened from.
  useEffect(() => {
    if (!tenantSlug) return;
    if (isEdit && dealId) {
      dealService
        .get(tenantSlug, dealId)
        .then((deal) => {
          setCompany({ id: deal.clientId, name: deal.companyName });
          setType(deal.type);
          setTitle(deal.title ?? '');
          setExpectedCloseDate(deal.expectedCloseDate ?? '');
          setNotes(deal.notes ?? '');
        })
        .catch((error) => setSubmitError(dealErrorMessage(error, t)));
      return;
    }
    const clientId = searchParams.get('clientId');
    if (clientId) {
      clientService
        .getClient(tenantSlug, clientId)
        .then((client) => setCompany({ id: client.id, name: client.name }))
        .catch(() => setCompany(null));
    }
  }, [tenantSlug, isEdit, dealId, searchParams, t]);

  useEffect(() => {
    if (canReassign && !isEdit) fetchStaff();
  }, [canReassign, isEdit, fetchStaff]);

  useEffect(() => {
    if (!tenantSlug || company || !debouncedQuery.trim()) {
      setMatches([]);
      return;
    }
    let current = true;
    clientService
      .searchClients(tenantSlug, { search: debouncedQuery.trim(), take: 8 })
      .then((result) => current && setMatches(result.items.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => current && setMatches([]));
    return () => {
      current = false;
    };
  }, [tenantSlug, company, debouncedQuery]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantSlug) return;
    setSubmitError(null);
    setFieldErrors({});
    if (!company) {
      setFieldErrors({ clientId: t('form.companyRequired') });
      return;
    }

    const fields = {
      type,
      title: title.trim() || null,
      expectedCloseDate: expectedCloseDate || null,
      notes: notes.trim() || null,
    };
    setIsSaving(true);
    try {
      const deal =
        isEdit && dealId
          ? await dealService.update(tenantSlug, dealId, fields)
          : await dealService.create(tenantSlug, {
              clientId: company.id,
              ...fields,
              // Only sent when chosen: the server defaults to the company's salesperson.
              ...(ownerUserId ? { ownerUserId } : {}),
            });
      navigate(`/${tenantSlug}/deals/${deal.id}`);
    } catch (error) {
      const field = dealErrorField(error);
      if (field) setFieldErrors({ [field]: dealErrorMessage(error, t) });
      else setSubmitError(dealErrorMessage(error, t));
    } finally {
      setIsSaving(false);
    }
  };

  const defaultTitle = company ? text.title({ title: null, companyName: company.name, type }) : null;

  return (
    <form className={styles.container} noValidate onSubmit={submit}>
      <div className={styles.header}>
        <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
        <h1 className={styles.title}>{isEdit ? t('form.editTitle') : t('form.createTitle')}</h1>
        {!isEdit && <p className={styles.subtitle}>{t('form.subtitle')}</p>}
      </div>

      <Card padding="xl" className={styles.card}>
        <div className={styles.field}>
          <span className={styles.label}>{t('form.company')}</span>
          {company ? (
            <div className={styles.company}>
              <Building2 size={18} aria-hidden="true" />
              <span className={styles.companyName}>{company.name}</span>
              {!isEdit && !searchParams.get('clientId') && (
                <Button variant="ghost" size="sm" type="button" onClick={() => setCompany(null)}>
                  {t('form.companyChange')}
                </Button>
              )}
            </div>
          ) : (
            <div className={styles.companySearch}>
              <TextInput
                aria-label={t('form.companySearch')}
                placeholder={t('form.companySearchPlaceholder')}
                iconLeft={<Search size={16} />}
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
                error={fieldErrors.clientId}
              />
              {debouncedQuery.trim() && (
                <ul className={styles.matches}>
                  {matches.length === 0 && <li className={styles.noMatch}>{t('form.noCompanies')}</li>}
                  {matches.map((match) => (
                    <li key={match.id}>
                      <button type="button" className={styles.match} onClick={() => setCompany(match)}>
                        {match.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {company && fieldErrors.clientId && <span className={styles.error}>{fieldErrors.clientId}</span>}
        </div>

        <div className={styles.row}>
          <SelectInput label={t('form.type')} value={type} onChange={(e) => setType(e.target.value as DealType)} error={fieldErrors.type}>
            {DEAL_TYPES.map((value) => (
              <option key={value} value={value}>
                {statusLabel.dealType(value)}
              </option>
            ))}
          </SelectInput>
          <TextInput
            type="date"
            label={t('form.expectedClose')}
            value={expectedCloseDate}
            onChange={(e) => setExpectedCloseDate(e.target.value)}
            error={fieldErrors.expectedCloseDate}
          />
        </div>

        <TextInput
          label={t('form.title')}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={defaultTitle ?? undefined}
          helperText={defaultTitle ? t('form.titleHelper', { default: defaultTitle }) : undefined}
          error={fieldErrors.title}
        />

        {canReassign && !isEdit && (
          <SelectInput label={t('form.salesperson')} value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} error={fieldErrors.ownerUserId}>
            <option value="">{t('form.salespersonDefault')}</option>
            {staff
              .filter((member) => member.isActive !== false)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {getStaffDisplayName(member)}
                </option>
              ))}
          </SelectInput>
        )}

        <TextareaInput
          label={t('form.notes')}
          aria-label={t('form.notes')}
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          error={fieldErrors.notes}
        />

        {submitError && (
          <p className={styles.error} role="alert">
            {submitError}
          </p>
        )}

        <div className={styles.actions}>
          <Button variant="ghost" type="button" onClick={() => navigate(-1)}>
            {t('form.cancel')}
          </Button>
          <Button variant="primary" type="submit" isLoading={isSaving}>
            {isEdit ? t('form.save') : t('form.create')}
          </Button>
        </div>
      </Card>
    </form>
  );
};

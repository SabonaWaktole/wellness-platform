import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { useToast } from '../../components/ui/Toast/toastContext';
import { RiskBadge } from '../../components/clients/RiskBadge';
import { PriceBreakdown } from '../../components/pricing/PriceBreakdown';
import { SalesScriptButton } from '../../components/salesScript/SalesScriptButton';
import { useActiveLookups } from '../../hooks/useActiveLookups';
import { useDealText } from '../../hooks/useDealText';
import { useDebounce } from '../../hooks/useDebounce';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { usePermission } from '../../hooks/usePermission';
import { clientService } from '../../services/clientService';
import { dealService } from '../../services/dealService';
import { pricingService } from '../../services/pricingService';
import type { ContactPerson } from '../../types/client';
import { OPEN_DEAL_STAGES, type DealSummary } from '../../types/deal';
import type { OfferView, PricingChoices, PricingScreenView, PricingTarget } from '../../types/offer';
import { lookupLabel } from '../../utils/lookupLabel';
import { pricingScreenError } from './pricingScreenError';
import styles from './PricingContent.module.css';

/** What the salesperson has typed and chosen, as typed. */
interface FormState {
  employees: string;
  businessTypeId: string;
  zoneId: string;
  frequencyId: string;
  packageId: string;
  discount: string;
  /** FR-DSC-03: why the discount is above the cap. */
  reason: string;
  note: string;
  alsoUpdateCompany: boolean;
  /** FR-OFR-02: '' is the company's primary contact. */
  contactPersonId: string;
}

const WHOLE_NUMBER = /^\d+$/;
/** A percentage as the server accepts it: digits, and up to two decimals (FR-DSC-01). */
const PERCENT = /^\d+(\.\d{1,2})?$/;

const validEmployees = (value: string) => WHOLE_NUMBER.test(value.trim()) && Number(value) >= 1;
const validDiscount = (value: string) => PERCENT.test(value.trim()) && Number(value) <= 100;

/** The choices the server prices; an input left empty or not valid yet is left to the server's default. */
function choicesFrom(form: FormState): PricingChoices {
  const choices: PricingChoices = {};
  if (validEmployees(form.employees)) choices.employees = Number(form.employees);
  if (form.businessTypeId) choices.businessTypeId = form.businessTypeId;
  if (form.zoneId) choices.zoneId = form.zoneId;
  if (form.frequencyId) choices.frequencyId = form.frequencyId;
  if (form.packageId) choices.packageId = form.packageId;
  if (validDiscount(form.discount)) choices.discountPercent = form.discount.trim();
  return choices;
}

/** A deal's draft offer, as the choices it was priced with (FR-OFR-04). */
function choicesOf(draft: OfferView): PricingChoices {
  const choices: PricingChoices = {};
  if (draft.employeesPriced) choices.employees = draft.employeesPriced;
  if (draft.pricingInputs?.businessType) choices.businessTypeId = draft.pricingInputs.businessType.id;
  if (draft.zoneId) choices.zoneId = draft.zoneId;
  if (draft.frequencyId) choices.frequencyId = draft.frequencyId;
  if (draft.packageId) choices.packageId = draft.packageId;
  const discount = draft.discountPercent ?? draft.pricingInputs?.discountPercent;
  if (discount) choices.discountPercent = discount;
  return choices;
}

/**
 * The pricing screen (M2 Slice 8, FR-PRC-01..07, 10..12), opened from a deal
 * or a company. The inputs start from the company record, or from the deal's
 * draft offer, and every change is priced again on the server about 250 ms
 * after the last keystroke. The screen only shows the amounts the server
 * returns: it has no price formula of its own (NFR-ACC-02). Saving creates or
 * updates the deal's draft offer; from a company, the salesperson picks one
 * of its open deals.
 */
export const PricingContent: React.FC = () => {
  const { t, i18n } = useTranslation('pricing');
  const { tenantSlug, dealId, clientId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const money = useMoneyFormat();
  const dealText = useDealText();
  const canSeeOffers = usePermission('commercial.view');
  const canEditCompany = usePermission('companies.edit');
  const businessTypes = useActiveLookups('business-types');

  const [prefill, setPrefill] = useState<{ choices: PricingChoices; note: string; contactPersonId: string } | null>(null);
  const [contacts, setContacts] = useState<ContactPerson[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [view, setView] = useState<PricingScreenView | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [openDeals, setOpenDeals] = useState<DealSummary[] | null>(null);
  const [chosenDealId, setChosenDealId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const latest = useRef(0);

  // Start from the deal's draft offer, if it has one; otherwise from the company.
  useEffect(() => {
    if (!tenantSlug) return;
    if (!dealId || !canSeeOffers) {
      setPrefill({ choices: {}, note: '', contactPersonId: '' });
      return;
    }
    dealService
      .offers(tenantSlug, dealId)
      .then((offers) => {
        // The offer the pricing screen changes: the latest one still a draft or ready (Slice 9).
        // A pending offer is read-only here: it is decided inline on the deal page (Slice 10).
        const draft = offers.find((offer) => !offer.superseded && (offer.status === 'DRAFT' || offer.status === 'READY'));
        setPrefill(
          draft
            ? { choices: choicesOf(draft), note: draft.note ?? '', contactPersonId: draft.contactPersonId ?? '' }
            : { choices: {}, note: '', contactPersonId: '' }
        );
      })
      .catch(() => setPrefill({ choices: {}, note: '', contactPersonId: '' }));
  }, [tenantSlug, dealId, canSeeOffers]);

  // From a company, the offer is saved on one of its open deals.
  useEffect(() => {
    if (!tenantSlug || !clientId) return;
    dealService
      .list(tenantSlug, { clientId, stage: [...OPEN_DEAL_STAGES], pageSize: 100 })
      .then((page) => setOpenDeals(page.items))
      .catch(() => setOpenDeals([]));
  }, [tenantSlug, clientId]);

  const saveDealId = dealId ?? (chosenDealId || null);
  const target: PricingTarget | null = saveDealId ? { dealId: saveDealId } : clientId ? { clientId } : null;
  const invalidEmployees = !!form && !validEmployees(form.employees);
  const invalidDiscount = !!form && form.discount.trim() !== '' && !validDiscount(form.discount);
  const choices = useMemo(() => (form ? choicesFrom(form) : (prefill?.choices ?? null)), [form, prefill]);
  const request = useDebounce(
    target && choices && !invalidEmployees && !invalidDiscount ? JSON.stringify({ target, choices }) : null,
    250
  );

  useEffect(() => {
    if (!tenantSlug || !request) return;
    const { target: to, choices: chosen } = JSON.parse(request) as { target: PricingTarget; choices: PricingChoices };
    const call = ++latest.current;
    pricingService
      .calculate(tenantSlug, to, chosen)
      .then((result) => {
        if (call !== latest.current) return;
        setView(result);
        setCalcError(null);
        // The first answer fills the inputs; after that, they are the salesperson's.
        setForm(
          (current) =>
            current ?? {
              employees: result.inputs.employees === null ? '' : String(result.inputs.employees),
              businessTypeId: result.inputs.businessTypeId ?? '',
              zoneId: result.inputs.zoneId ?? '',
              frequencyId: result.inputs.frequencyId ?? '',
              packageId: result.inputs.packageId ?? '',
              discount: result.inputs.discountPercent ?? chosen.discountPercent ?? '0',
              reason: '',
              note: prefill?.note ?? '',
              alsoUpdateCompany: false,
              contactPersonId: prefill?.contactPersonId ?? '',
            }
        );
      })
      .catch((error) => call === latest.current && setCalcError(pricingScreenError(error, t)));
  }, [tenantSlug, request, prefill, t]);

  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) => setForm((current) => (current ? { ...current, [key]: value } : current));

  const percent = (value: string | undefined) =>
    value === undefined ? '' : new Intl.NumberFormat(money.locale || undefined, { maximumFractionDigits: 2 }).format(Number(value));

  const companyId = view?.subject.clientId ?? clientId;

  // FR-OFR-02: the offer is addressed to the primary contact unless another is chosen.
  useEffect(() => {
    if (!tenantSlug || !companyId) return;
    clientService
      .getClient(tenantSlug, companyId)
      .then((company) => setContacts(company.contacts ?? []))
      .catch(() => setContacts([]));
  }, [tenantSlug, companyId]);
  const primaryContact = contacts.find((contact) => contact.isPrimary) ?? null;
  const backTo = dealId ? `/${tenantSlug}/deals/${dealId}` : `/${tenantSlug}/clients/${clientId}`;
  const editCompany = `/${tenantSlug}/clients/${companyId}/edit`;
  const result = view?.result;
  const employeesDiffer =
    !!form && !!view && validEmployees(form.employees) && Number(form.employees) !== view.subject.employeeCount;
  const offerUpdateCompany = !!saveDealId && canEditCompany && employeesDiffer;
  // FR-DSC-03: above the cap the save becomes a request with a reason. It
  // needs a price (no approval on "Price on request") and a reason.
  const aboveCap = !!view?.discountAboveCap;
  const reasonMissing = aboveCap && form?.reason.trim() === '';
  const canSave =
    !!saveDealId &&
    !!form &&
    !!view &&
    !isSaving &&
    !invalidEmployees &&
    !invalidDiscount &&
    !reasonMissing &&
    view.subject.dealOpen !== false &&
    (result?.kind === 'PRICED' || (result?.kind === 'PRICE_ON_REQUEST' && !aboveCap)) &&
    !!form.businessTypeId &&
    !!form.frequencyId &&
    !!form.packageId;

  const save = async () => {
    if (!tenantSlug || !saveDealId || !form || !canSave) return;
    setIsSaving(true);
    try {
      const offer = await dealService.saveOffer(tenantSlug, saveDealId, {
        employees: Number(form.employees),
        businessTypeId: form.businessTypeId,
        zoneId: form.zoneId || null,
        frequencyId: form.frequencyId,
        packageId: form.packageId,
        discountPercent: form.discount.trim() || '0',
        note: form.note.trim() || null,
        alsoUpdateCompany: offerUpdateCompany && form.alsoUpdateCompany,
        contactPersonId: form.contactPersonId || null,
        reason: aboveCap ? form.reason.trim() || null : null,
      });
      toast.success(t(offer.status === 'PENDING_APPROVAL' ? 'approvalRequested' : 'saved'));
      navigate(`/${tenantSlug}/deals/${saveDealId}`);
    } catch (error) {
      toast.error(pricingScreenError(error, t));
    } finally {
      setIsSaving(false);
    }
  };

  const chosenPackage = view?.options.packages.find((pkg) => pkg.id === form?.packageId) ?? null;
  const zones = view?.options.zones ?? [];
  const zoneLabel = (zone: (typeof zones)[number]) =>
    zone.surchargePercent === undefined
      ? lookupLabel(zone, i18n.language)
      : t('zoneLabel', { name: lookupLabel(zone, i18n.language), percent: percent(zone.surchargePercent) });
  const cap = percent(view?.options.discountCapPercent);

  return (
    <div className={styles.container}>
      <Link className={styles.back} to={backTo}>
        <ArrowLeft size={16} aria-hidden="true" /> {dealId ? t('back.deal') : t('back.company')}
      </Link>

      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{t('title')}</h1>
          {view && <p className={styles.subtitle}>{view.subject.companyName}</p>}
        </div>
        <div className={styles.headerActions}>
          <SalesScriptButton outline />
        </div>
      </div>

      {calcError && (
        <p className={styles.errorText} role="alert">
          {calcError}
        </p>
      )}

      <div className={styles.grid}>
        <Card padding="lg">
          <h2 className={styles.sectionTitle}>{t('inputs')}</h2>
          {!form || !view ? (
            <p className={styles.muted}>{t('calculating')}</p>
          ) : (
            <div className={styles.fields}>
              {clientId && openDeals && openDeals.length > 0 && (
                <SelectInput label={t('deal')} value={chosenDealId} onChange={(e) => setChosenDealId(e.target.value)}>
                  <option value="">{t('chooseDeal')}</option>
                  {openDeals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {dealText.title(deal)}
                    </option>
                  ))}
                </SelectInput>
              )}
              {clientId && openDeals?.length === 0 && <p className={styles.notice}>{t('noOpenDeal')}</p>}

              <div className={styles.field}>
                <TextInput
                  label={t('employees')}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={form.employees}
                  error={invalidEmployees ? t('employeesInvalid') : undefined}
                  onChange={(e) => set('employees')(e.target.value)}
                />
                {offerUpdateCompany && (
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={form.alsoUpdateCompany}
                      onChange={(e) => set('alsoUpdateCompany')(e.target.checked)}
                    />
                    <span>{t('alsoUpdateCompany', { current: view.subject.employeeCount ?? '—' })}</span>
                  </label>
                )}
              </div>

              <div className={styles.field}>
                <SelectInput label={t('businessType')} value={form.businessTypeId} onChange={(e) => set('businessTypeId')(e.target.value)}>
                  <option value="">{t('choose')}</option>
                  {businessTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {lookupLabel(type, i18n.language)}
                    </option>
                  ))}
                </SelectInput>
                {view.inputs.riskLevel && (
                  <div className={styles.inline}>
                    <span className={styles.muted}>{t('risk')}</span>
                    <RiskBadge risk={view.inputs.riskLevel} />
                  </div>
                )}
              </div>

              <div className={styles.readOnly}>
                <span className={styles.readOnlyLabel}>{t('city')}</span>
                <span>
                  {view.subject.city
                    ? t('cityValue', {
                        city: lookupLabel(view.subject.city, i18n.language),
                        area: view.subject.area ? lookupLabel(view.subject.area, i18n.language) : '',
                      })
                    : t('cityNone')}
                </span>
                <Link to={editCompany}>{t('editCompany')}</Link>
              </div>

              {zones.length > 1 && (
                <SelectInput label={t('zone')} value={form.zoneId} onChange={(e) => set('zoneId')(e.target.value)}>
                  <option value="">{t('choose')}</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zoneLabel(zone)}
                    </option>
                  ))}
                </SelectInput>
              )}
              {zones.length === 1 && (
                <div className={styles.readOnly}>
                  <span className={styles.readOnlyLabel}>{t('zone')}</span>
                  <span>{zoneLabel(zones[0])}</span>
                </div>
              )}

              <SelectInput label={t('frequency')} value={form.frequencyId} onChange={(e) => set('frequencyId')(e.target.value)}>
                <option value="">{t('choose')}</option>
                {view.options.frequencies.map((frequency) => (
                  <option key={frequency.id} value={frequency.id}>
                    {lookupLabel(frequency, i18n.language)}
                  </option>
                ))}
              </SelectInput>

              <div className={styles.field}>
                <SelectInput label={t('package')} value={form.packageId} onChange={(e) => set('packageId')(e.target.value)}>
                  <option value="">{t('choose')}</option>
                  {view.options.packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {lookupLabel(pkg, i18n.language)}
                    </option>
                  ))}
                </SelectInput>
                {chosenPackage && chosenPackage.services.length > 0 && (
                  <ul className={styles.services} aria-label={t('packageServices')}>
                    {chosenPackage.services.map((service) => (
                      <li key={service.id}>{lookupLabel(service, i18n.language)}</li>
                    ))}
                  </ul>
                )}
              </div>

              <TextInput
                label={t('discount')}
                inputMode="decimal"
                value={form.discount}
                helperText={cap ? t('discountHint', { cap }) : undefined}
                error={invalidDiscount ? t('discountInvalid') : undefined}
                onChange={(e) => set('discount')(e.target.value)}
              />

              {view.discountAboveCap && (
                <TextareaInput
                  label={t('reason')}
                  placeholder={t('reasonPlaceholder', { cap })}
                  rows={3}
                  maxLength={2000}
                  value={form.reason}
                  error={reasonMissing ? t('reasonRequired') : undefined}
                  onChange={(e) => set('reason')(e.target.value)}
                />
              )}

              {saveDealId && contacts.length > 0 && (
                <SelectInput label={t('contact')} value={form.contactPersonId} onChange={(e) => set('contactPersonId')(e.target.value)}>
                  <option value="">
                    {primaryContact ? t('contactPrimary', { name: primaryContact.name }) : t('contactNone')}
                  </option>
                  {contacts
                    .filter((contact) => !contact.isPrimary)
                    .map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.position ? `${contact.name} · ${contact.position}` : contact.name}
                      </option>
                    ))}
                </SelectInput>
              )}

              {saveDealId && (
                <TextareaInput
                  label={t('note')}
                  placeholder={t('notePlaceholder')}
                  rows={3}
                  maxLength={5000}
                  value={form.note}
                  onChange={(e) => set('note')(e.target.value)}
                />
              )}
            </div>
          )}
        </Card>

        <Card padding="lg">
          <h2 className={styles.sectionTitle}>{t('result')}</h2>
          <section aria-live="polite" className={styles.result}>
            {!result && <p className={styles.muted}>{t('calculating')}</p>}

            {result?.kind === 'PRICED' && (
              <PriceBreakdown
                rows={[
                  { key: 'baseFee', label: t('breakdown.baseFee'), amount: result.baseFee },
                  { key: 'riskFee', label: t('breakdown.riskFee'), amount: result.riskFee },
                  { key: 'visitFee', label: t('breakdown.visitFee'), amount: result.visitFee },
                  { key: 'locationFee', label: t('breakdown.locationFee'), amount: result.locationFee },
                  { key: 'listPrice', label: t('breakdown.listPrice'), amount: result.listPrice, total: true },
                  ...(result.discountPercent !== undefined && Number(result.discountPercent) > 0
                    ? [
                        {
                          key: 'discountAmount',
                          label: t('breakdown.discountAmount', { percent: percent(result.discountPercent) }),
                          amount: result.discountAmount,
                          negative: true,
                        },
                      ]
                    : []),
                  { key: 'netMonthlyPrice', label: t('breakdown.netMonthlyPrice'), amount: result.netMonthlyPrice, total: true },
                  { key: 'pricePerEmployee', label: t('breakdown.pricePerEmployee'), amount: result.pricePerEmployee },
                  { key: 'annualValue', label: t('breakdown.annualValue'), amount: result.annualValue },
                ]}
              />
            )}

            {result?.kind === 'PRICE_ON_REQUEST' && (
              <div className={styles.warning}>
                <p className={styles.warningTitle}>{t('priceOnRequest')}</p>
                <p>{t(`reasons.${result.reason}`)}</p>
              </div>
            )}

            {result?.kind === 'COMPANY_INCOMPLETE' && (
              <div className={styles.warning}>
                <p className={styles.warningTitle}>{t('incomplete.title')}</p>
                <p>{t('incomplete.text', { fields: result.missing.map((field) => t(`incomplete.${field}`)).join(', ') })}</p>
                <Link to={editCompany}>{t('incomplete.link')}</Link>
              </div>
            )}

            {result?.kind === 'INPUT_REQUIRED' && (
              <ul className={styles.missing}>
                {result.missing.map((input) => (
                  <li key={input}>{t(`inputRequired.${input}`)}</li>
                ))}
              </ul>
            )}

            {view?.discountAboveCap && (
              <p className={styles.warning} role="alert">
                {t('aboveCap', { cap })}
              </p>
            )}
            {view?.subject.dealOpen === false && <p className={styles.notice}>{t('dealClosed')}</p>}
            {clientId && openDeals && openDeals.length > 0 && !chosenDealId && <p className={styles.notice}>{t('chooseDealToSave')}</p>}
          </section>

          {(dealId || (openDeals && openDeals.length > 0)) && (
            <div className={styles.actions}>
              <Button variant="primary" onClick={save} disabled={!canSave} isLoading={isSaving}>
                {t(aboveCap ? 'requestApproval' : 'save')}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

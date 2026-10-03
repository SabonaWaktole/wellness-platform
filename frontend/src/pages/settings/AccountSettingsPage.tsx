import { ChevronRight, ImagePlus, Globe } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../../components/layout/Sidebar/Sidebar';
import type { NavItem } from '../../components/layout/Sidebar/Sidebar';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { SettingsLayout } from '../../components/layout/SettingsLayout/SettingsLayout';
import { useAuthStore } from '../../store/useAuthStore';
import { useLogout } from '../../hooks/useLogout';
import { usePermission } from '../../hooks/usePermission';
import { useTenantSettings, SUPPORTED_LOCALES } from '../../hooks/useTenantSettings';
import type { TenantSettings } from '../../hooks/useTenantSettings';
import { useToast } from '../../components/ui/Toast';
import { ImagePicker } from '../../components/ui/ImagePicker';
import { LanguagePicker } from '../../components/settings/LanguagePicker';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AccountSettingsPage.module.css';
import { getUserDisplayName } from '../../utils/userUtils';
// Currency/timezone/locale option lists live in a shared module — the
// platform console's Settings page (platform defaults + bulk apply to
// selected tenants) edits these same six fields and must offer the same
// choices, or the two pickers would silently drift apart.
import {
  CURRENCY_OPTIONS,
  TIMEZONE_OPTIONS,
  LOCALE_LABELS,
  DATE_FORMAT_LABELS,
} from '../../constants/workspaceSettingsOptions';
import { DATE_FORMATS } from '../../hooks/useTenantSettings';

const mockNavItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'clients', label: 'Clients', icon: 'group' },
  { id: 'appointments', label: 'Appointments', icon: 'event' },
  { id: 'inventory', label: 'Products & Stock', icon: 'inventory_2' },
  { id: 'quotations', label: 'Quotations', icon: 'description' },
  { id: 'reports', label: 'Reports', icon: 'bar_chart' },
  { id: 'settings', label: 'Settings', icon: 'settings', isActive: true },
];

/** The fields this form owns. Branding is deliberately not among them. */
type FormState = Pick<
  TenantSettings,
  | 'name'
  | 'currency'
  | 'locale'
  | 'timezone'
  | 'dateFormat'
  | 'defaultLanguage'
  | 'requiresQuotationApproval'
  | 'registrationNumber'
  | 'addressLine'
  | 'addressCity'
  | 'addressState'
  | 'addressPostalCode'
  | 'contactEmail'
  | 'contactPhone'
>;

const EMPTY_FORM: FormState = {
  name: '',
  currency: 'USD',
  locale: 'en-US',
  timezone: 'UTC',
  dateFormat: 'MM/DD/YYYY',
  defaultLanguage: 'en',
  requiresQuotationApproval: true,
  registrationNumber: '',
  addressLine: '',
  addressCity: '',
  addressState: '',
  addressPostalCode: '',
  contactEmail: '',
  contactPhone: '',
};

const toFormState = (settings: TenantSettings): FormState => ({
  name: settings.name ?? '',
  currency: settings.currency,
  locale: settings.locale,
  timezone: settings.timezone,
  dateFormat: settings.dateFormat,
  defaultLanguage: settings.defaultLanguage,
  requiresQuotationApproval: settings.requiresQuotationApproval,
  // Null means "never set". The inputs are controlled, so it becomes '' here
  // and is normalised back to null server-side on save.
  registrationNumber: settings.registrationNumber ?? '',
  addressLine: settings.addressLine ?? '',
  addressCity: settings.addressCity ?? '',
  addressState: settings.addressState ?? '',
  addressPostalCode: settings.addressPostalCode ?? '',
  contactEmail: settings.contactEmail ?? '',
  contactPhone: settings.contactPhone ?? '',
});

export const AccountSettingsPage = () => {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { user, updateUser } = useAuthStore();
  const { logout } = useLogout();
  const toast = useToast();
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const { fetchSettings, updateSettings, loading } = useTenantSettings();

  // One expression for "may edit workspace settings", used by every control on
  // the page. There used to be two — an `isBusinessOwner` const and a separate
  // `roleName !== 'Business Owner'` string comparison — which could disagree
  // for SUPER_ADMIN. Same class of bug as the duplicated nav arrays. Now reads
  // settings.manage (FR-RBAC-07) rather than the BUSINESS_OWNER role.
  const isBusinessOwner = usePermission('settings.manage');
  const salesProcess = user?.tenantSalesWorkflow === 'SALES_PROCESS';

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saved, setSaved] = useState<TenantSettings | null>(null);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const loadSettings = () => {
    fetchSettings()
      .then((settings) => {
        setSaved(settings);
        setForm(toFormState(settings));
      })
      .catch(() => toast.error(tc('feedback.loadFailed')));
  };

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSettings]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSave = async () => {
    try {
      const updated = await updateSettings(form);
      setSaved(updated);
      setForm(toFormState(updated));

      // The money formatter reads currency and locale from the auth store, and
      // useLanguageSync reads the language from it, so both have to learn about
      // the change without waiting for a page reload.
      //
      // Every field the server persists here must be mirrored back. Language
      // was missing, which made saving a new workspace language look like it
      // did nothing: the PUT stored it, the success toast fired, but the store
      // still held the old value, so the interface stayed in the old language
      // until the next sign-in refetched /me.
      if (user) {
        updateUser({
          tenantCurrency: updated.currency,
          tenantLocale: updated.locale,
          tenantTimezone: updated.timezone,
          tenantDateFormat: updated.dateFormat,
          tenantDefaultLanguage: updated.defaultLanguage,
        });
      }
      toast.success(tc('feedback.saved'));
    } catch {
      toast.error(tc('feedback.saveFailed'));
    }
  };

  const handleDiscard = () => {
    if (saved) setForm(toFormState(saved));
  };

  const userName = getUserDisplayName(user, 'Settings User');

  const handleNavClick = (id: string) => {
    navigate(`/${tenantSlug || ''}/${id === 'dashboard' ? '' : id}`);
  };

  return (
    <AppLayout
      userName={userName}
      onLogout={handleLogout}
      onSettingsClick={() => navigate(`/${tenantSlug}/settings/profile`)}
      sidebar={
        <Sidebar
          navItems={mockNavItems}
          onLogoutClick={handleLogout}
          onNavItemClick={handleNavClick}
        />
      }
    >
      <SettingsLayout activeNavId="company">
        <div className={styles.container}>
          <div className={styles.headerBlock}>
            <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
              <ol className={styles.breadcrumbList}>
                <li><a href="#settings" className={styles.breadcrumbLink}>{t('breadcrumb')}</a></li>
                <li><ChevronRight size={14} /></li>
                <li aria-current="page" className={styles.breadcrumbCurrent}>{t('company.title')}</li>
              </ol>
            </nav>
            <h1 className={styles.title}>{t('company.title')}</h1>
            <p className={styles.subtitle}>{t('company.subtitle')}</p>
          </div>

          <div className={styles.sectionsColumn}>
            {/*
              Branding uploads immediately and is therefore NOT governed by the
              Save/Discard footer below. Previously the page-wide footer implied
              it was, so "Discard Changes" appeared to offer a way back from a
              logo replacement that had in fact already been committed. Saying so
              on the card is the honest fix; making Save/Discard actually govern
              an upload would mean deferring the upload and deleting the orphaned
              asset on discard, which is a media-lifecycle feature, not this.
            */}
            <Card padding="lg" className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderWithIcon}>
                  <ImagePlus size={17} />
                  <h2 className={styles.cardTitle}>{t('company.branding.title')}</h2>
                </div>
                <span className={styles.comingSoonBadge}>{t('company.branding.savedAutomatically')}</span>
              </div>

              <ImagePicker
                kind="logo"
                tenantSlug={tenantSlug || ''}
                value={user?.tenantLogoUrl ?? null}
                onChange={(url) => user && updateUser({ tenantLogoUrl: url })}
                label={t('company.branding.logoLabel')}
                hint={t('company.branding.logoHint')}
                disabled={!isBusinessOwner}
              />

              <ImagePicker
                kind="company-cover"
                tenantSlug={tenantSlug || ''}
                value={user?.tenantCoverImageUrl ?? null}
                onChange={(url) => user && updateUser({ tenantCoverImageUrl: url })}
                variant="banner"
                label={t('company.branding.bannerLabel')}
                hint={t('company.branding.bannerHint')}
                disabled={!isBusinessOwner}
              />

              <p className={styles.helperText}>{t('company.branding.autosaveNote')}</p>

              {!isBusinessOwner && (
                <p className={styles.helperText}>{t('company.branding.ownerOnly')}</p>
              )}
            </Card>

            <Card padding="lg" className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t('company.profile.title')}</h2>
              </div>

              <div className={styles.twoColGrid}>
                <TextInput
                  label={t('company.profile.nameLabel')}
                  placeholder={t('company.profile.namePlaceholder')}
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  disabled={!isBusinessOwner}
                />
                <TextInput
                  label={t('company.profile.registrationNumberLabel')}
                  placeholder={t('company.profile.registrationNumberPlaceholder')}
                  value={form.registrationNumber ?? ''}
                  onChange={(e) => setField('registrationNumber', e.target.value)}
                  disabled={!isBusinessOwner}
                />
              </div>

              <div>
                <TextInput
                  label={t('company.profile.addressLabel')}
                  placeholder={t('company.profile.addressPlaceholder')}
                  value={form.addressLine ?? ''}
                  onChange={(e) => setField('addressLine', e.target.value)}
                  disabled={!isBusinessOwner}
                />
                <div className={styles.addressRow}>
                  <TextInput
                    placeholder={t('company.profile.city')}
                    aria-label={t('company.profile.city')}
                    value={form.addressCity ?? ''}
                    onChange={(e) => setField('addressCity', e.target.value)}
                    disabled={!isBusinessOwner}
                  />
                  <TextInput
                    placeholder={t('company.profile.state')}
                    aria-label={t('company.profile.state')}
                    value={form.addressState ?? ''}
                    onChange={(e) => setField('addressState', e.target.value)}
                    disabled={!isBusinessOwner}
                  />
                  <TextInput
                    placeholder={t('company.profile.postalCode')}
                    aria-label={t('company.profile.postalCode')}
                    value={form.addressPostalCode ?? ''}
                    onChange={(e) => setField('addressPostalCode', e.target.value)}
                    disabled={!isBusinessOwner}
                  />
                </div>
              </div>

              {/*
                No asterisk on the contact email: every existing tenant has none,
                so requiring it would make the form unsubmittable for all of them.
                It is optional in the database and optional here.
              */}
              <div className={styles.twoColGrid}>
                <TextInput
                  label={t('company.profile.contactEmailLabel')}
                  type="email"
                  placeholder={t('company.profile.contactEmailPlaceholder')}
                  value={form.contactEmail ?? ''}
                  onChange={(e) => setField('contactEmail', e.target.value)}
                  disabled={!isBusinessOwner}
                />
                <TextInput
                  label={t('company.profile.contactPhoneLabel')}
                  type="tel"
                  placeholder={t('company.profile.contactPhonePlaceholder')}
                  value={form.contactPhone ?? ''}
                  onChange={(e) => setField('contactPhone', e.target.value)}
                  disabled={!isBusinessOwner}
                />
              </div>
            </Card>

            <div className={styles.localizationGrid}>
              <Card padding="lg">
                <div className={styles.cardHeader}>
                  <div>
                    <h2 className={styles.cardTitle}>{t('company.localization.title')}</h2>
                    <p className={styles.cardSubtitle}>{t('company.localization.subtitle')}</p>
                  </div>
                </div>

                <div className={styles.sectionsColumn} style={{ marginTop: 'var(--spacing-md)' }}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="currencySelect">{t('company.localization.currencyLabel')}</label>
                    <select
                      id="currencySelect"
                      className={styles.nativeSelect}
                      value={form.currency}
                      onChange={(e) => setField('currency', e.target.value)}
                      disabled={!isBusinessOwner}
                    >
                      {/*
                        A tenant whose stored currency is outside the shortlist
                        still sees its own value rather than being silently
                        switched to the first option on the next save.
                      */}
                      {!CURRENCY_OPTIONS.some((c) => c.code === form.currency) && (
                        <option value={form.currency}>{form.currency}</option>
                      )}
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                    <p className={styles.helperText}>{t('company.localization.currencyHint')}</p>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="localeSelect">{t('company.localization.conventionsLabel')}</label>
                    <select
                      id="localeSelect"
                      className={styles.nativeSelect}
                      value={form.locale}
                      onChange={(e) => setField('locale', e.target.value as FormState['locale'])}
                      disabled={!isBusinessOwner}
                    >
                      {SUPPORTED_LOCALES.map((code) => (
                        <option key={code} value={code}>{LOCALE_LABELS[code]}</option>
                      ))}
                    </select>
                  </div>

                  {/*
                    Timezone decides which day an instant belongs to on both the
                    dashboard KPI and the calendar. Date Format decides the
                    day/month/year ORDER everywhere a date is shown — it is now
                    the source of truth for ordering (see useDateFormat and
                    utils/dateFormatPattern.ts), resolving the disagreement that
                    kept it disabled. See TD-012.
                  */}
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="timezoneSelect">
                      {t('company.localization.timezoneLabel')}
                    </label>
                    <select
                      id="timezoneSelect"
                      className={styles.nativeSelect}
                      value={form.timezone}
                      onChange={(e) => setField('timezone', e.target.value)}
                      disabled={!isBusinessOwner}
                    >
                      {/* A tenant already on a zone outside the shortlist keeps
                          its own value rather than being switched on next save. */}
                      {!TIMEZONE_OPTIONS.includes(form.timezone) && (
                        <option value={form.timezone}>{form.timezone}</option>
                      )}
                      {TIMEZONE_OPTIONS.map((zone) => (
                        <option key={zone} value={zone}>{zone}</option>
                      ))}
                    </select>
                    <p className={styles.helperText}>{t('company.localization.timezoneHint')}</p>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="dateFormatSelect">
                      {t('company.localization.dateFormatLabel')}
                    </label>
                    <select
                      id="dateFormatSelect"
                      className={styles.nativeSelect}
                      value={form.dateFormat}
                      onChange={(e) => setField('dateFormat', e.target.value as FormState['dateFormat'])}
                      disabled={!isBusinessOwner}
                    >
                      {DATE_FORMATS.map((f) => (
                        <option key={f} value={f}>{DATE_FORMAT_LABELS[f]}</option>
                      ))}
                    </select>
                    <p className={styles.helperText}>{t('company.localization.dateFormatHint')}</p>
                  </div>
                </div>
              </Card>

              <Card padding="lg">
                <div className={styles.cardHeaderWithIcon} style={{ borderBottom: '1px solid var(--color-outline-variant)', paddingBottom: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                  <Globe color="var(--color-on-surface-variant)" />
                  <h2 className={styles.cardTitle}>{t('company.language.title')}</h2>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="defaultLanguageSelect">
                    {t('company.language.defaultLabel')}
                  </label>
                  <LanguagePicker
                    id="defaultLanguageSelect"
                    value={form.defaultLanguage}
                    onChange={(next) => next && setField('defaultLanguage', next)}
                    disabled={!isBusinessOwner}
                  />
                  <p className={styles.helperText}>{t('company.language.hint')}</p>
                </div>
              </Card>

              {/* FR-RBAC-18: under the sales process, approval follows the discount cap and
                  "Discounts: approve", so the old quotation approval switch does not apply. */}
              {!salesProcess && (
                <Card padding="lg">
                  <div className={styles.cardHeader} style={{ borderBottom: '1px solid var(--color-outline-variant)', paddingBottom: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                    <div>
                      <h2 className={styles.cardTitle}>{t('company.quotations.title')}</h2>
                      <p className={styles.cardSubtitle}>{t('company.quotations.subtitle')}</p>
                    </div>
                  </div>

                  <div className={styles.fieldGroup}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={form.requiresQuotationApproval}
                        onChange={(e) => setField('requiresQuotationApproval', e.target.checked)}
                        disabled={loading || !isBusinessOwner}
                        className={styles.checkbox}
                      />
                      <span className={styles.checkboxText}>{t('company.quotations.requireApproval')}</span>
                    </label>
                    <p className={styles.helperText} style={{ marginLeft: '26px' }}>
                      {t('company.quotations.requireApprovalHint')}
                    </p>
                  </div>
                </Card>
              )}
            </div>
          </div>

          {isBusinessOwner && (
            <div className={styles.footer}>
              <Button variant="outline" onClick={handleDiscard} disabled={loading || !saved}>
                {tc('actions.discardChanges')}
              </Button>
              <Button variant="primary" onClick={handleSave} isLoading={loading}>
                {tc('actions.saveChanges')}
              </Button>
            </div>
          )}
        </div>
      </SettingsLayout>
    </AppLayout>
  );
};

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Users2 } from 'lucide-react';
import { Card } from '../../components/ui/Card/Card';
import { Button } from '../../components/ui/Button/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { LanguagePicker } from '../../components/settings/LanguagePicker';
import { useToast } from '../../components/ui/Toast';
import { usePlatformSettings, useBulkTenantSettings } from '../../hooks/usePlatformSettings';
import { useTenants } from '../../hooks/useDashboard';
import { TenantPickerModal } from './TenantPickerModal';
import {
  CURRENCY_OPTIONS,
  TIMEZONE_OPTIONS,
  LOCALE_LABELS,
  DATE_FORMAT_LABELS,
} from '../../constants/workspaceSettingsOptions';
import { SUPPORTED_LOCALES, DATE_FORMATS } from '../../hooks/useTenantSettings';
import type { Language } from '../../i18n/config';
import type { WorkspaceSettingsFields } from '../../services/dashboardService';
import styles from './PlatformSettingsPage.module.css';

type Scope = 'platform' | 'tenants';

const EMPTY_FORM: Required<WorkspaceSettingsFields> = {
  requiresQuotationApproval: true,
  currency: 'USD',
  locale: 'en-US',
  timezone: 'UTC',
  dateFormat: 'MM/DD/YYYY',
  defaultLanguage: 'en',
};

/**
 * The platform console's Settings page.
 *
 * Two genuinely different actions share one form, distinguished by an
 * explicit SCOPE the operator picks before saving:
 *
 *  - "Platform default" writes to the platform's own settings row, which only
 *    ever affects a workspace at the moment it is CREATED — never an existing
 *    one. See UpdatePlatformSettingsUseCase.
 *  - "Selected workspaces" writes directly onto the chosen tenants' own
 *    settings, immediately — the same effect as each one's own Business Owner
 *    making the change, just done to several at once. See
 *    BulkUpdateTenantSettingsUseCase.
 *
 * The scope is shown, unmissably, right above Save — and confirmed a second
 * time in a dialog naming exactly what is about to change — because the two
 * actions have very different blast radii and nothing here disables Save for
 * picking the "wrong" one; the only guard is making it impossible to be
 * unsure which one is about to happen.
 */
export const PlatformSettingsPage: React.FC = () => {
  // Two namespaces: `superAdmin.*` (platform-console copy) lives in
  // `dashboard`, but the field labels this page reuses verbatim from the
  // workspace Settings page (`company.*`) live in `settings`.
  const { t } = useTranslation('dashboard');
  const { t: ts } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const toast = useToast();

  const { settings, isLoading, isSaving: isSavingPlatform, saveSettings } = usePlatformSettings();
  const { applyToTenants, isSaving: isSavingBulk } = useBulkTenantSettings();
  const { tenants, isLoading: tenantsLoading } = useTenants(0, 500);

  const [form, setForm] = useState<Required<WorkspaceSettingsFields>>(EMPTY_FORM);
  const [scope, setScope] = useState<Scope>('platform');
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // The form always reflects the platform's own saved values — the scope
  // decides WHERE a save is written, not what the fields start out showing.
  // There is no single "current value" to show for an arbitrary set of
  // tenants, so the form does not pretend to have one.
  useEffect(() => {
    if (settings) {
      setForm({
        requiresQuotationApproval: settings.requiresQuotationApproval,
        currency: settings.currency,
        locale: settings.locale,
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
        defaultLanguage: settings.defaultLanguage,
      });
    }
  }, [settings]);

  const setField = <K extends keyof WorkspaceSettingsFields>(
    key: K,
    value: Required<WorkspaceSettingsFields>[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const selectedTenants = tenants.filter((t) => selectedTenantIds.includes(t.id));
  const isSaving = isSavingPlatform || isSavingBulk;
  const canSave = scope === 'platform' || selectedTenantIds.length > 0;

  const handleConfirm = async () => {
    if (scope === 'platform') {
      const result = await saveSettings(form);
      if (!result) {
        toast.error(tc('feedback.saveFailed'));
        return;
      }
    } else {
      const count = await applyToTenants(selectedTenantIds, form);
      if (count === null) {
        toast.error(tc('feedback.saveFailed'));
        return;
      }
    }
    setIsConfirmOpen(false);
    toast.success(tc('feedback.saved'));
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('superAdmin.platformSettingsTitle')}</h1>
          <p className={styles.subtitle}>{t('superAdmin.platformSettingsSubtitle')}</p>
        </div>
      </header>

      {/* ------------------------------------------------------------------
          Scope selector. Comes FIRST, above the form fields, so the operator
          decides where a change is going before they start describing what
          it is.
      ------------------------------------------------------------------ */}
      <Card padding="lg" className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{t('superAdmin.scopeTitle')}</h2>
          <p className={styles.cardSubtitle}>{t('superAdmin.scopeSubtitle')}</p>
        </div>

        <div className={styles.scopeOptions}>
          <label className={`${styles.scopeOption} ${scope === 'platform' ? styles.scopeOptionActive : ''}`}>
            <input
              type="radio"
              name="settings-scope"
              checked={scope === 'platform'}
              onChange={() => setScope('platform')}
            />
            <Globe size={18} className={styles.scopeIcon} />
            <div>
              <span className={styles.scopeLabel}>{t('superAdmin.scopePlatformLabel')}</span>
              <span className={styles.scopeHint}>{t('superAdmin.scopePlatformHint')}</span>
            </div>
          </label>

          <label className={`${styles.scopeOption} ${scope === 'tenants' ? styles.scopeOptionActive : ''}`}>
            <input
              type="radio"
              name="settings-scope"
              checked={scope === 'tenants'}
              onChange={() => setScope('tenants')}
            />
            <Users2 size={18} className={styles.scopeIcon} />
            <div>
              <span className={styles.scopeLabel}>{t('superAdmin.scopeTenantsLabel')}</span>
              <span className={styles.scopeHint}>{t('superAdmin.scopeTenantsHint')}</span>
            </div>
          </label>
        </div>

        {scope === 'tenants' && (
          <div className={styles.tenantSelection}>
            <Button type="button" variant="outline" onClick={() => setIsPickerOpen(true)}>
              {t('superAdmin.selectTenants')}
            </Button>
            {selectedTenants.length === 0 ? (
              <span className={styles.tenantSelectionEmpty}>{t('superAdmin.noTenantsSelected')}</span>
            ) : (
              <div className={styles.tenantChips}>
                {selectedTenants.map((tenant) => (
                  <span key={tenant.id} className={styles.tenantChip}>
                    {tenant.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------------------
          The fields. Identical set to a workspace's own Settings page —
          currency, locale, timezone, date format (not currently consumed,
          same as there), default language, quotation-approval policy.
      ------------------------------------------------------------------ */}
      <div className={styles.fieldsGrid}>
        <Card padding="lg">
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{ts('company.localization.title')}</h2>
          </div>

          <div className={styles.sectionsColumn}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="platformCurrency">
                {ts('company.localization.currencyLabel')}
              </label>
              <select
                id="platformCurrency"
                className={styles.nativeSelect}
                value={form.currency}
                onChange={(e) => setField('currency', e.target.value)}
                disabled={isLoading}
              >
                {!CURRENCY_OPTIONS.some((c) => c.code === form.currency) && (
                  <option value={form.currency}>{form.currency}</option>
                )}
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="platformLocale">
                {ts('company.localization.conventionsLabel')}
              </label>
              <select
                id="platformLocale"
                className={styles.nativeSelect}
                value={form.locale}
                onChange={(e) => setField('locale', e.target.value)}
                disabled={isLoading}
              >
                {SUPPORTED_LOCALES.map((code) => (
                  <option key={code} value={code}>{LOCALE_LABELS[code]}</option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="platformTimezone">
                {ts('company.localization.timezoneLabel')}
              </label>
              <select
                id="platformTimezone"
                className={styles.nativeSelect}
                value={form.timezone}
                onChange={(e) => setField('timezone', e.target.value)}
                disabled={isLoading}
              >
                {!TIMEZONE_OPTIONS.includes(form.timezone) && (
                  <option value={form.timezone}>{form.timezone}</option>
                )}
                {TIMEZONE_OPTIONS.map((zone) => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
            </div>

            {/* Now the source of truth for day/month/year order everywhere a
                date is shown — see useDateFormat and utils/dateFormatPattern.ts.
                Same live treatment as the workspace Settings page. See TD-012. */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="platformDateFormat">
                {ts('company.localization.dateFormatLabel')}
              </label>
              <select
                id="platformDateFormat"
                className={styles.nativeSelect}
                value={form.dateFormat}
                onChange={(e) => setField('dateFormat', e.target.value)}
                disabled={isLoading}
              >
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>{DATE_FORMAT_LABELS[f]}</option>
                ))}
              </select>
              <p className={styles.helperText}>{ts('company.localization.dateFormatHint')}</p>
            </div>
          </div>
        </Card>

        <Card padding="lg">
          <div className={styles.cardHeaderWithIcon}>
            <Globe color="var(--color-on-surface-variant)" size={18} />
            <h2 className={styles.cardTitle}>{ts('company.language.title')}</h2>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="platformLanguage">
              {ts('company.language.defaultLabel')}
            </label>
            <LanguagePicker
              id="platformLanguage"
              // The DTO carries the field as a plain `string` (it is an
              // unvalidated wire value until the server checks it); the picker
              // needs the narrower `Language` the UI catalogue is keyed by.
              value={form.defaultLanguage as Language}
              onChange={(next) => next && setField('defaultLanguage', next)}
              disabled={isLoading}
            />
          </div>
        </Card>

        <Card padding="lg">
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>{ts('company.quotations.title')}</h2>
            <p className={styles.cardSubtitle}>{ts('company.quotations.subtitle')}</p>
          </div>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={form.requiresQuotationApproval}
              onChange={(e) => setField('requiresQuotationApproval', e.target.checked)}
              disabled={isLoading}
            />
            <span>{ts('company.quotations.requireApproval')}</span>
          </label>
        </Card>
      </div>

      {/* ------------------------------------------------------------------
          The scope, restated right above the action — this is the "clearly
          displayed before saving" guard the feature asks for.
      ------------------------------------------------------------------ */}
      <div className={styles.footer}>
        <div className={styles.scopeSummary} role="status">
          {scope === 'platform' ? (
            <span>{t('superAdmin.applyingToPlatform')}</span>
          ) : (
            <span>
              {t('superAdmin.applyingToTenants', { count: selectedTenantIds.length })}
            </span>
          )}
        </div>
        <Button
          variant="primary"
          onClick={() => setIsConfirmOpen(true)}
          disabled={isLoading || isSaving || !canSave}
        >
          {tc('actions.saveChanges')}
        </Button>
      </div>

      <TenantPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        tenants={tenants}
        isLoading={tenantsLoading}
        initialSelectedIds={selectedTenantIds}
        onApply={(ids) => {
          setSelectedTenantIds(ids);
          setIsPickerOpen(false);
        }}
      />

      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirm}
        tone="primary"
        title={
          scope === 'platform'
            ? t('superAdmin.confirmPlatformTitle')
            : t('superAdmin.confirmTenantsTitle')
        }
        message={
          scope === 'platform' ? (
            t('superAdmin.confirmPlatformMessage')
          ) : (
            <>
              <p>{t('superAdmin.confirmTenantsMessage', { count: selectedTenants.length })}</p>
              <ul className={styles.confirmList}>
                {selectedTenants.map((tenant) => (
                  <li key={tenant.id}>{tenant.name}</li>
                ))}
              </ul>
            </>
          )
        }
        confirmLabel={tc('actions.saveChanges')}
      />
    </div>
  );
};

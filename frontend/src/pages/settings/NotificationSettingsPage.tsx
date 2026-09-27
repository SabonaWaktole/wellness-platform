import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Bell, CalendarClock, FileClock, Mail } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '../../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../../components/layout/Sidebar/Sidebar';
import { SettingsLayout } from '../../components/layout/SettingsLayout/SettingsLayout';
import { Card } from '../../components/ui/Card/Card';
import { Button } from '../../components/ui/Button/Button';
import { useToast } from '../../components/ui/Toast';
import { useAuthStore } from '../../store/useAuthStore';
import { useLogout } from '../../hooks/useLogout';
import { useNavigation } from '../../hooks/useNavigation';
import { usePermission } from '../../hooks/usePermission';
import { getUserDisplayName } from '../../utils/userUtils';
import {
  notificationSettingsService,
  type NotificationSettings,
  type NotificationRecipientRole,
} from '../../services/notificationSettingsService';
import styles from './NotificationSettingsPage.module.css';

/** The mutable half of the payload — the catalogue and limits are read-only. */
type FormState = Omit<
  NotificationSettings,
  'availableEventTypes' | 'availableRecipientRoles' | 'limits'
>;

const toFormState = (settings: NotificationSettings): FormState => ({
  emailEnabled: settings.emailEnabled,
  emailEventTypes: settings.emailEventTypes,
  emailRecipientRoles: settings.emailRecipientRoles,
  appointmentRemindersEnabled: settings.appointmentRemindersEnabled,
  appointmentReminderLeadMinutes: settings.appointmentReminderLeadMinutes,
  quotationFollowUpEnabled: settings.quotationFollowUpEnabled,
  quotationFollowUpDays: settings.quotationFollowUpDays,
  quotationAutoExpireEnabled: settings.quotationAutoExpireEnabled,
  quotationExpiryDays: settings.quotationExpiryDays,
});

/**
 * Lead-time choices, in minutes.
 *
 * A fixed list rather than a free number field: the server accepts anything
 * from 15 minutes to 14 days, but "how long before" is a decision with about
 * six sensible answers, and a spinner inviting 437 minutes makes the setting
 * harder to use rather than more flexible.
 */
const LEAD_TIME_OPTIONS = [15, 30, 60, 120, 240, 720, 1440, 2880, 10080];

/**
 * Per-business notification policy (§6.6).
 *
 * Every SRS requirement that says "configurable per business" about
 * notifications lands on this page: which events email, which roles receive
 * them, the reminder lead time, and the follow-up waiting period.
 */
export const NotificationSettingsPage = () => {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { user } = useAuthStore();
  const { logout } = useLogout();
  const toast = useToast();
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation('common');

  // Named for the reader, not the source: still gates the whole page, now on
  // settings.manage (FR-RBAC-07) rather than the BUSINESS_OWNER role.
  const isBusinessOwner = usePermission('settings.manage');

  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const navItems = useNavigation(user, `/${tenantSlug}/settings`);

  const load = useCallback(async () => {
    if (!tenantSlug) return;
    try {
      setLoading(true);
      const loaded = await notificationSettingsService.get(tenantSlug);
      setSettings(loaded);
      setForm(toFormState(loaded));
    } catch {
      toast.error(tc('feedback.loadFailed'));
    } finally {
      setLoading(false);
    }
    // `toast` and `tc` are stable for the lifetime of the page; including them
    // would re-run the fetch on every render of the toast provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  /** Add or remove one value from an array field, preserving the rest. */
  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const handleSave = async () => {
    if (!tenantSlug || !form) return;
    try {
      setSaving(true);
      const updated = await notificationSettingsService.update(tenantSlug, form);
      setSettings(updated);
      setForm(toFormState(updated));
      toast.success(tc('feedback.saved'));
    } catch (error: any) {
      /*
       * The one cross-field rule the server enforces gets its own message.
       * "Request failed" would leave an owner staring at two fields that each
       * look individually valid, which is exactly the case the entity refuses.
       */
      const message = error?.response?.data?.error ?? '';
      toast.error(
        message.includes('before expiry')
          ? t('notifications.followUpAfterExpiry')
          : tc('feedback.saveFailed')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (settings) setForm(toFormState(settings));
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sidebar = (
    <Sidebar
      navItems={navItems}
      onNavItemClick={(id) => navigate(`/${tenantSlug}/${id === 'dashboard' ? '' : id}`)}
      onLogoutClick={handleLogout}
    />
  );

  return (
    <AppLayout
      userName={getUserDisplayName(user, 'Settings User')}
      onLogout={handleLogout}
      onSettingsClick={() => navigate(`/${tenantSlug}/settings/profile`)}
      sidebar={sidebar}
    >
      <SettingsLayout activeNavId="notifications">
        <div className={styles.container}>
          <div className={styles.headerBlock}>
            <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
              <ol className={styles.breadcrumbList}>
                <li><span className={styles.breadcrumbLink}>{t('breadcrumb')}</span></li>
                <li><ChevronRight size={14} /></li>
                <li aria-current="page" className={styles.breadcrumbCurrent}>
                  {t('notifications.breadcrumb')}
                </li>
              </ol>
            </nav>
            <h1 className={styles.title}>{t('notifications.title')}</h1>
            <p className={styles.subtitle}>{t('notifications.subtitle')}</p>
            {!isBusinessOwner && (
              // Staff can read the policy — it governs mail landing in their own
              // inbox — but every control below is disabled for them.
              <p className={styles.readOnlyNotice}>{t('notifications.ownerOnly')}</p>
            )}
          </div>

          {loading || !form || !settings ? (
            <div className={styles.skeletonColumn} aria-busy="true">
              <div className={`${styles.skeletonCard} skeleton`} />
              <div className={`${styles.skeletonCard} skeleton`} />
            </div>
          ) : (
            <>
              <div className={styles.sectionsColumn}>
                <Card padding="lg">
                  <div className={styles.cardHeaderWithIcon}>
                    <Mail size={17} />
                    <h2 className={styles.cardTitle}>{t('notifications.emailSection')}</h2>
                  </div>
                  <p className={styles.helperText}>{t('notifications.emailSectionHint')}</p>

                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={form.emailEnabled}
                      onChange={(e) => setField('emailEnabled', e.target.checked)}
                      disabled={!isBusinessOwner || saving}
                    />
                    <span>{t('notifications.emailEnabled')}</span>
                  </label>
                  <p className={styles.helperTextIndented}>
                    {t('notifications.emailEnabledHint')}
                  </p>

                  {/*
                    The event and role pickers stay mounted but disabled when
                    email is off, rather than unmounting. An owner switching the
                    master toggle back on should find their selection intact,
                    not an empty list they have to rebuild.
                  */}
                  <fieldset
                    className={styles.fieldset}
                    disabled={!isBusinessOwner || !form.emailEnabled || saving}
                  >
                    <legend className={styles.legend}>{t('notifications.eventsLabel')}</legend>
                    <div className={styles.checkGrid}>
                      {settings.availableEventTypes.map((type) => (
                        <label key={type} className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={form.emailEventTypes.includes(type)}
                            onChange={() =>
                              setField('emailEventTypes', toggleIn(form.emailEventTypes, type))
                            }
                          />
                          <span>{t(`notifications.eventType.${type}`, type)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset
                    className={styles.fieldset}
                    disabled={!isBusinessOwner || !form.emailEnabled || saving}
                  >
                    <legend className={styles.legend}>{t('notifications.rolesLabel')}</legend>
                    <div className={styles.checkGrid}>
                      {settings.availableRecipientRoles.map((role) => (
                        <label key={role} className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={form.emailRecipientRoles.includes(role)}
                            onChange={() =>
                              setField(
                                'emailRecipientRoles',
                                toggleIn<NotificationRecipientRole>(form.emailRecipientRoles, role)
                              )
                            }
                          />
                          <span>{t(`notifications.role.${role}`, role)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </Card>

                <Card padding="lg">
                  <div className={styles.cardHeaderWithIcon}>
                    <CalendarClock size={17} />
                    <h2 className={styles.cardTitle}>{t('notifications.remindersSection')}</h2>
                  </div>

                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={form.appointmentRemindersEnabled}
                      onChange={(e) => setField('appointmentRemindersEnabled', e.target.checked)}
                      disabled={!isBusinessOwner || saving}
                    />
                    <span>{t('notifications.remindersEnabled')}</span>
                  </label>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="leadTime">
                      {t('notifications.leadTimeLabel')}
                    </label>
                    <select
                      id="leadTime"
                      className={styles.nativeSelect}
                      value={form.appointmentReminderLeadMinutes}
                      onChange={(e) =>
                        setField('appointmentReminderLeadMinutes', Number(e.target.value))
                      }
                      disabled={!isBusinessOwner || !form.appointmentRemindersEnabled || saving}
                    >
                      {/* A stored value outside the shortlist keeps its place
                          rather than being silently changed on the next save. */}
                      {!LEAD_TIME_OPTIONS.includes(form.appointmentReminderLeadMinutes) && (
                        <option value={form.appointmentReminderLeadMinutes}>
                          {formatLeadTime(form.appointmentReminderLeadMinutes, t)}
                        </option>
                      )}
                      {LEAD_TIME_OPTIONS.map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {formatLeadTime(minutes, t)}
                        </option>
                      ))}
                    </select>
                  </div>
                </Card>

                <Card padding="lg">
                  <div className={styles.cardHeaderWithIcon}>
                    <FileClock size={17} />
                    <h2 className={styles.cardTitle}>{t('notifications.followUpSection')}</h2>
                  </div>

                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={form.quotationFollowUpEnabled}
                      onChange={(e) => setField('quotationFollowUpEnabled', e.target.checked)}
                      disabled={!isBusinessOwner || saving}
                    />
                    <span>{t('notifications.followUpEnabled')}</span>
                  </label>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="followUpDays">
                      {t('notifications.followUpDaysLabel')}
                    </label>
                    <input
                      id="followUpDays"
                      type="number"
                      className={styles.numberInput}
                      min={settings.limits.followUpDays.min}
                      max={settings.limits.followUpDays.max}
                      value={form.quotationFollowUpDays}
                      onChange={(e) => setField('quotationFollowUpDays', Number(e.target.value))}
                      disabled={!isBusinessOwner || !form.quotationFollowUpEnabled || saving}
                    />
                    <span className={styles.unit}>{t('notifications.days')}</span>
                  </div>
                </Card>

                <Card padding="lg">
                  <div className={styles.cardHeaderWithIcon}>
                    <Bell size={17} />
                    <h2 className={styles.cardTitle}>{t('notifications.expirySection')}</h2>
                  </div>

                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={form.quotationAutoExpireEnabled}
                      onChange={(e) => setField('quotationAutoExpireEnabled', e.target.checked)}
                      disabled={!isBusinessOwner || saving}
                    />
                    <span>{t('notifications.expiryEnabled')}</span>
                  </label>
                  <p className={styles.helperTextIndented}>
                    {t('notifications.expiryEnabledHint')}
                  </p>

                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel} htmlFor="expiryDays">
                      {t('notifications.expiryDaysLabel')}
                    </label>
                    <input
                      id="expiryDays"
                      type="number"
                      className={styles.numberInput}
                      min={settings.limits.expiryDays.min}
                      max={settings.limits.expiryDays.max}
                      value={form.quotationExpiryDays}
                      onChange={(e) => setField('quotationExpiryDays', Number(e.target.value))}
                      disabled={!isBusinessOwner || !form.quotationAutoExpireEnabled || saving}
                    />
                    <span className={styles.unit}>{t('notifications.days')}</span>
                  </div>
                </Card>
              </div>

              {isBusinessOwner && (
                <div className={styles.footer}>
                  <Button variant="outline" onClick={handleDiscard} disabled={saving || !settings}>
                    {tc('actions.discardChanges')}
                  </Button>
                  <Button variant="primary" onClick={handleSave} isLoading={saving}>
                    {tc('actions.saveChanges')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </SettingsLayout>
    </AppLayout>
  );
};

/** "90 minutes" reads worse than "1.5 hours"; "1440 minutes" reads worse still. */
function formatLeadTime(minutes: number, t: (key: string) => string): string {
  if (minutes < 60) return `${minutes} ${t('notifications.minutes')}`;
  if (minutes < 1440) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ${t('notifications.hours')}`;
  }
  const days = minutes / 1440;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} ${t('notifications.days')}`;
}

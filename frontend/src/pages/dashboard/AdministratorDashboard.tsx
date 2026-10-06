import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useDateFormat } from '../../hooks/useDateFormat';
import { usePermission } from '../../hooks/usePermission';
import { lookupLabel } from '../../utils/lookupLabel';
import { RoleDashboardFrame } from './RoleDashboardFrame';
import { useDashboardFormat } from './useDashboardFormat';
import { useRoleDashboard } from './useRoleDashboard';
import styles from './RoleDashboard.module.css';

/**
 * The Administrator's dashboard (FR-DSH-11): the pricing configuration with the date each part last changed, the
 * users per role and the inactive ones, the last 20 changes from the audit log with a link to all of it, and what
 * needs attention. It describes the workspace now, so it has no period, and it carries no sales figure.
 */
export const AdministratorDashboard: React.FC = () => {
  const { t, i18n } = useTranslation('dashboard');
  const { t: ta } = useTranslation('audit');
  const { tenantSlug = '' } = useParams();
  const { figure } = useDashboardFormat();
  const dates = useDateFormat();
  const canSeeAudit = usePermission('audit.view');
  const state = useRoleDashboard('ADMINISTRATOR');
  const { data } = state;

  const pricing = data?.tables.pricing ?? [];
  const roles = data?.tables.usersPerRole ?? [];
  const attention = data?.tables.attention ?? [];
  const recent = data?.tables.recentChanges ?? [];

  const changed = (iso: string | null) => (iso ? dates.dateMedium(iso) : t('role.admin.neverChanged'));

  return (
    <RoleDashboardFrame title={t('role.admin.title')} subtitle={t('role.admin.subtitle')} state={state} showPeriod={false} showLocation={false}>
      <div className={styles.sections}>
        <section className={styles.panel} aria-label={t('role.admin.pricing')}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t('role.admin.pricing')}</h2>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('role.admin.setting')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.admin.value')}</th>
                  <th scope="col">{t('role.admin.lastChange')}</th>
                </tr>
              </thead>
              <tbody>
                {pricing.map((row) => (
                  <tr key={row.key} data-setting={row.key}>
                    <th scope="row">{t(`role.admin.parts.${row.key}`)}</th>
                    <td className={styles.numeric}>
                      {row.key === 'DISCOUNT_CAP'
                        ? row.discountCapPercent === undefined
                          ? '—'
                          : `${new Intl.NumberFormat(i18n.language.startsWith('sq') ? 'sq-AL' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(row.discountCapPercent))}%`
                        : figure(row.count, 'count')}
                    </td>
                    <td>{changed(row.lastChangedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel} aria-label={t('role.admin.usersPerRole')}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t('role.admin.usersPerRole')}</h2>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('role.admin.role')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.admin.activeUsers')}</th>
                  <th scope="col" className={styles.numeric}>{t('role.admin.inactiveUsers')}</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.roleId}>
                    <th scope="row">{lookupLabel({ nameSq: role.nameSq, nameEn: role.nameEn }, i18n.language)}</th>
                    <td className={styles.numeric}>{figure(role.activeUsers, 'count')}</td>
                    <td className={styles.numeric}>{figure(role.inactiveUsers, 'count')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel} aria-label={t('role.admin.attention')}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>{t('role.admin.attention')}</h2>
          </div>
          {attention.length === 0 ? (
            <p className={styles.panelNote}>{t('role.admin.attentionNone')}</p>
          ) : (
            <ul className={styles.list}>
              {attention.map((item) => (
                <li key={item.key} className={styles.listItem} data-attention={item.key}>
                  <span>{t(`role.admin.attentionItems.${item.key}`, { count: item.count })}</span>
                  <span className={styles.listMeta}>
                    {item.examples.map((example) => example.name).join(', ')}
                    {item.count > item.examples.length ? ` +${item.count - item.examples.length}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canSeeAudit && (
          <section className={styles.panel} aria-label={t('role.admin.recentChanges')}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>{t('role.admin.recentChanges')}</h2>
              <Link className={styles.panelLink} to={`/${tenantSlug}/settings/audit`}>
                {t('role.admin.fullLog')}
              </Link>
            </div>
            {recent.length === 0 ? (
              <p className={styles.panelNote}>{t('role.admin.noChanges')}</p>
            ) : (
              <ul className={styles.list}>
                {recent.map((entry) => (
                  <li key={entry.id} className={styles.listItem}>
                    <span>
                      {ta(`actions.${entry.action}`, { defaultValue: entry.action })} · {ta(`entityTypes.${entry.entityType}`, { defaultValue: entry.entityType })}
                      {entry.entityLabel ? ` · ${entry.entityLabel}` : ''}
                    </span>
                    <span className={styles.listMeta}>
                      {entry.userName ?? ta('actors.system', { defaultValue: 'System' })} · {dates.dateTime(entry.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </RoleDashboardFrame>
  );
};

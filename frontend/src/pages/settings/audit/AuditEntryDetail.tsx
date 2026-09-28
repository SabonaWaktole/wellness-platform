import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AuditChange, AuditEntry } from '../../../services/auditService';
import { useDateFormat } from '../../../hooks/useDateFormat';
import { roleLabel } from '../../../utils/roleLabel';
import styles from './AuditLogContent.module.css';

/** The literal marker `diff()` stores for a redacted secret field (FR-AUD-07). */
const REDACTED_MARKER = 'changed';

/** One field / before / after row's value, rendered for whatever shape `AuditChange` carries. */
const AuditValue: React.FC<{ value: unknown }> = ({ value }) => {
  const { t } = useTranslation('audit');

  if (value === null || value === undefined) {
    return <span className={styles.dash}>{t('dash')}</span>;
  }
  if (value === REDACTED_MARKER) {
    return <span className={styles.redacted}>{t('redacted')}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className={styles.dash}>{t('dash')}</span>;
    }
    return (
      <span className={styles.chipList}>
        {value.map((item, index) => (
          <span key={index} className={styles.chip}>{String(item)}</span>
        ))}
      </span>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return (
      <span className={styles.objectLines}>
        {entries.map(([key, val]) => (
          <span key={key} className={styles.objectLine}>{key}: {String(val)}</span>
        ))}
      </span>
    );
  }
  return <>{String(value)}</>;
};

/** The field / before / after table for one entry, opened in the drawer (FR-AUD-06). */
export const AuditEntryDetail: React.FC<{ entry: AuditEntry }> = ({ entry }) => {
  const { t, i18n } = useTranslation('audit');
  const { dateTime } = useDateFormat();

  const actorName = entry.userId === null
    ? t(entry.userRole === 'PLATFORM_OPERATOR' ? 'actors.platformOperator' : 'actors.system')
    : (entry.userName ?? entry.userId);
  const roleName = entry.roleNameSq || entry.roleNameEn ? roleLabel({ nameSq: entry.roleNameSq, nameEn: entry.roleNameEn }, i18n.language) : entry.userRole;

  return (
    <div className={styles.detail}>
      <dl className={styles.detailMeta}>
        <div>
          <dt>{t('columns.entity')}</dt>
          <dd>{t(`entityTypes.${entry.entityType}`, { defaultValue: entry.entityType })}{entry.entityLabel ? ` — ${entry.entityLabel}` : ''}</dd>
        </div>
        <div>
          <dt>{t('columns.user')}</dt>
          <dd>{`${actorName} (${roleName})`}</dd>
        </div>
        <div>
          <dt>{t('columns.at')}</dt>
          <dd>{dateTime(entry.at)}</dd>
        </div>
        <div>
          <dt>{t('columns.action')}</dt>
          <dd>{t(`actions.${entry.action}`, { defaultValue: entry.action })}</dd>
        </div>
      </dl>

      {entry.changes.length === 0 ? (
        <p className={styles.mutedText}>{t('detail.noChanges')}</p>
      ) : (
        <table className={styles.changesTable}>
          <thead>
            <tr>
              <th>{t('detail.field')}</th>
              <th>{t('detail.old')}</th>
              <th>{t('detail.new')}</th>
            </tr>
          </thead>
          <tbody>
            {entry.changes.map((change: AuditChange) => (
              <tr key={change.field}>
                <td>{t(`fields.${change.field}`, { defaultValue: change.field })}</td>
                <td><AuditValue value={change.old} /></td>
                <td><AuditValue value={change.new} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

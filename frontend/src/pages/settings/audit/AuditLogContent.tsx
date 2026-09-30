import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Card } from '../../../components/ui/Card/Card';
import { Badge } from '../../../components/ui/Badge/Badge';
import type { BadgeProps } from '../../../components/ui/Badge/Badge';
import { Button } from '../../../components/ui/Button/Button';
import { SelectInput } from '../../../components/ui/SelectInput/SelectInput';
import { DataTable } from '../../../components/ui/DataTable/DataTable';
import type { DataTableColumn } from '../../../components/ui/DataTable/DataTable';
import { Pagination } from '../../../components/ui/Pagination/Pagination';
import { SlideOver } from '../../../components/ui/SlideOver/SlideOver';
import { useAuditLog } from '../../../hooks/useAuditLog';
import { useTeam } from '../../../hooks/useTeam';
import { useDateFormat } from '../../../hooks/useDateFormat';
import { dayBoundsInZone } from '../../../utils/tenantDay';
import { getStaffDisplayName } from '../../../utils/userUtils';
import { roleLabel } from '../../../utils/roleLabel';
import { useAuditEntityTypes } from '../../../hooks/useAuditEntityTypes';
import type { AuditAction, AuditEntry, AuditFilters } from '../../../services/auditService';
import { AuditEntryDetail } from './AuditEntryDetail';
import styles from './AuditLogContent.module.css';

const ACTIONS: AuditAction[] = ['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE'];

const ACTION_BADGE: Record<AuditAction, BadgeProps['variant']> = {
  CREATE: 'success',
  UPDATE: 'primary',
  DELETE: 'error',
  STATUS_CHANGE: 'warning',
};

/** The record-type select's value: a whole group (`group:<key>`) or one type (`type:<key>`). */
function recordTypeValue(filters: AuditFilters): string {
  if (filters.entityGroup) return `group:${filters.entityGroup}`;
  if (filters.entityType) return `type:${filters.entityType}`;
  return '';
}

function recordTypeFilter(value: string): Pick<AuditFilters, 'entityGroup' | 'entityType'> {
  const [kind, key] = value.split(':');
  if (kind === 'group') return { entityGroup: key, entityType: undefined };
  if (kind === 'type') return { entityGroup: undefined, entityType: key };
  return { entityGroup: undefined, entityType: undefined };
}

/** A tenant-local `YYYY-MM-DD` (from `<input type="date">`) resolved to the instant its day starts or ends at. */
function dayBoundsFor(dateString: string, timeZone: string): { start: Date; end: Date } {
  // Noon UTC keeps the picked calendar day correct across every real
  // timezone offset; dayBoundsInZone then reads the day off that instant.
  return dayBoundsInZone(timeZone, 0, new Date(`${dateString}T12:00:00Z`));
}

/**
 * Settings → Audit log (Slice 7). Administrator and CEO search the
 * compliance trail Slices 2, 5 and 6 write, open an entry to compare its
 * old and new values, and export the current filter as CSV (FR-AUD-06, 08).
 */
export const AuditLogContent: React.FC = () => {
  const { t, i18n } = useTranslation('audit');
  const { timeZone, dateTime } = useDateFormat();
  const { filters, updateFilters, page, setPage, limit, entries, total, loading, loadFailed, fetchEntries, exportCsv } = useAuditLog();
  const { staff, fetchStaff } = useTeam();
  const { groups: entityGroups } = useAuditEntityTypes();
  const [openEntry, setOpenEntry] = useState<AuditEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleDateChange = (which: 'from' | 'to', value: string) => {
    if (which === 'from') setFromInput(value);
    else setToInput(value);

    const from = which === 'from' ? value : fromInput;
    const to = which === 'to' ? value : toInput;
    updateFilters({
      ...filters,
      from: from ? dayBoundsFor(from, timeZone).start : undefined,
      to: to ? dayBoundsFor(to, timeZone).end : undefined,
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportCsv();
    } finally {
      setExporting(false);
    }
  };

  const columns: DataTableColumn<AuditEntry>[] = useMemo(() => [
    {
      id: 'at',
      header: t('columns.at'),
      render: (entry) => dateTime(entry.at),
      nowrap: true,
    },
    {
      id: 'user',
      header: t('columns.user'),
      render: (entry) => {
        const name = entry.userId === null
          ? t(entry.userRole === 'PLATFORM_OPERATOR' ? 'actors.platformOperator' : 'actors.system')
          : (entry.userName ?? entry.userId);
        const role = entry.roleNameSq || entry.roleNameEn
          ? roleLabel({ nameSq: entry.roleNameSq, nameEn: entry.roleNameEn }, i18n.language)
          : entry.userRole;
        return (
          <span className={styles.userCell}>
            <span>{name}</span>
            <span className={styles.mutedText}>{role}</span>
          </span>
        );
      },
    },
    {
      id: 'action',
      header: t('columns.action'),
      render: (entry) => <Badge variant={ACTION_BADGE[entry.action]}>{t(`actions.${entry.action}`, { defaultValue: entry.action })}</Badge>,
    },
    {
      id: 'entity',
      header: t('columns.entity'),
      render: (entry) => (
        <span>
          {t(`entityTypes.${entry.entityType}`, { defaultValue: entry.entityType })}
          {entry.entityLabel ? <span className={styles.mutedText}> — {entry.entityLabel}</span> : null}
        </span>
      ),
    },
  ], [t, i18n.language, dateTime]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.headerTitle}>{t('title')}</h2>
          <p className={styles.headerSubtitle}>{t('subtitle')}</p>
        </div>
        <Button variant="outline" icon={<Download size={16} />} onClick={handleExport} isLoading={exporting}>
          {t('export')}
        </Button>
      </div>

      <Card padding="md" className={styles.filters}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>{t('filters.from')}</span>
          <input type="date" className={styles.dateInput} value={fromInput} onChange={(e) => handleDateChange('from', e.target.value)} />
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>{t('filters.to')}</span>
          <input type="date" className={styles.dateInput} value={toInput} onChange={(e) => handleDateChange('to', e.target.value)} />
        </label>
        <SelectInput
          label={t('filters.user')}
          value={filters.userId ?? ''}
          onChange={(e) => updateFilters({ ...filters, userId: e.target.value || undefined })}
        >
          <option value="">{t('filters.allUsers')}</option>
          <option value="SYSTEM">{t('filters.system')}</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>{getStaffDisplayName(member)}</option>
          ))}
        </SelectInput>
        <SelectInput
          label={t('filters.entityType')}
          value={recordTypeValue(filters)}
          onChange={(e) => updateFilters({ ...filters, ...recordTypeFilter(e.target.value) })}
        >
          <option value="">{t('filters.allEntityTypes')}</option>
          {entityGroups.map(({ group, types }) => {
            const groupLabel = t(`entityGroups.${group}`, { defaultValue: group });
            return (
              <optgroup key={group} label={groupLabel}>
                <option value={`group:${group}`}>{t('filters.allInGroup', { group: groupLabel })}</option>
                {types.map((type) => (
                  <option key={type} value={`type:${type}`}>{t(`entityTypes.${type}`, { defaultValue: type })}</option>
                ))}
              </optgroup>
            );
          })}
        </SelectInput>
        <SelectInput
          label={t('filters.action')}
          value={filters.action ?? ''}
          onChange={(e) => updateFilters({ ...filters, action: (e.target.value || undefined) as AuditAction | undefined })}
        >
          <option value="">{t('filters.allActions')}</option>
          {ACTIONS.map((action) => (
            <option key={action} value={action}>{t(`actions.${action}`, { defaultValue: action })}</option>
          ))}
        </SelectInput>
      </Card>

      {loadFailed ? (
        <p className={styles.errorText} role="alert">{t('loadFailed')}</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={entries}
            rowKey={(entry) => entry.id}
            isLoading={loading}
            onRowClick={(entry) => setOpenEntry(entry)}
            caption={t('title')}
            empty={{ title: t('empty.title'), description: t('empty.description') }}
          />
          <Pagination page={page} pageSize={limit} total={total} onPageChange={setPage} />
        </>
      )}

      <SlideOver isOpen={openEntry !== null} onClose={() => setOpenEntry(null)} title={t('detail.title')}>
        {openEntry && <AuditEntryDetail entry={openEntry} />}
      </SlideOver>
    </div>
  );
};

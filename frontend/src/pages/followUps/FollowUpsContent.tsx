import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card/Card';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { Tabs } from '../../components/ui/Tabs/Tabs';
import { FollowUpList } from '../../components/followUps/FollowUpList';
import { usePermission, usePermissionScope } from '../../hooks/usePermission';
import { useTeam } from '../../hooks/useTeam';
import { followUpService } from '../../services/followUpService';
import { getStaffDisplayName } from '../../utils/userUtils';
import type { FollowUp, FollowUpGroups } from '../../types/followUp';
import styles from './FollowUpsContent.module.css';

type Tab = 'mine' | 'team';
const GROUPS: (keyof FollowUpGroups)[] = ['overdue', 'today', 'upcoming'];

/**
 * "My follow-ups" (FR-FUP-07): the caller's open follow-ups grouped as
 * Overdue (in red), Today and Upcoming, in the workspace's time zone. With
 * `calendar.view` at Team or All, the Team tab (FR-FUP-08) lists the team's,
 * filtered by salesperson or to the overdue ones, read-only without
 * `followups.manage` (the CEO). `?open=<id>` points at one follow-up, as a
 * notification does.
 */
export const FollowUpsContent: React.FC = () => {
  const { t } = useTranslation('followUps');
  const { tenantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('open');
  const calendarScope = usePermissionScope('calendar.view');
  const canManage = usePermission('followups.manage');
  const seesTeam = calendarScope === 'TEAM' || calendarScope === 'ALL';
  const { staff, fetchStaff } = useTeam();

  // A dashboard figure opens the team's overdue follow-ups, or a salesperson's (M3 Slice 13, FR-DSH-05).
  const asksForTeam = seesTeam && (searchParams.get('overdueOnly') === 'true' || searchParams.get('assignedUserId') !== null);
  const [tab, setTab] = useState<Tab>(asksForTeam ? 'team' : 'mine');
  const [mine, setMine] = useState<FollowUpGroups | null>(null);
  const [team, setTeam] = useState<FollowUp[] | null>(null);
  const [salesperson, setSalesperson] = useState(searchParams.get('assignedUserId') ?? '');
  const [overdueOnly, setOverdueOnly] = useState(searchParams.get('overdueOnly') === 'true');
  const [loadFailed, setLoadFailed] = useState(false);

  const loadMine = useCallback(async () => {
    if (!tenantSlug) return;
    try {
      setMine(await followUpService.mine(tenantSlug));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [tenantSlug]);

  const loadTeam = useCallback(async () => {
    if (!tenantSlug || !seesTeam) return;
    try {
      setTeam(await followUpService.list(tenantSlug, { assignedUserId: salesperson || undefined, overdueOnly }));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [tenantSlug, seesTeam, salesperson, overdueOnly]);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  useEffect(() => {
    if (tab === 'team') loadTeam();
  }, [tab, loadTeam]);

  useEffect(() => {
    if (seesTeam) fetchStaff();
  }, [seesTeam, fetchStaff]);

  // A follow-up opened from a notification that is not the caller's own is in the team's list.
  useEffect(() => {
    if (!highlightId || !mine || !seesTeam) return;
    const inMine = GROUPS.some((group) => mine[group].some((item) => item.id === highlightId));
    if (!inMine) setTab('team');
  }, [highlightId, mine, seesTeam]);

  const reload = () => {
    loadMine();
    if (tab === 'team') loadTeam();
  };

  const total = mine ? GROUPS.reduce((sum, group) => sum + mine[group].length, 0) : 0;

  return (
    <div className={styles.container}>
      <div>
        <div className={styles.breadcrumb}>{t('title')}</div>
        <h1 className={styles.title}>{tab === 'mine' ? t('tabs.mine') : t('tabs.team')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </div>

      {seesTeam && (
        <Tabs<Tab>
          label={t('title')}
          tabs={[
            { id: 'mine', label: t('tabs.mine'), count: mine?.overdue.length || undefined },
            { id: 'team', label: t('tabs.team') },
          ]}
          activeId={tab}
          onChange={setTab}
        />
      )}

      {loadFailed && <p className={styles.message}>{t('loadFailed')}</p>}

      {tab === 'mine' && (
        <>
          {!mine && !loadFailed && <p className={styles.message}>{t('loading')}</p>}
          {mine && total === 0 && (
            <Card padding="lg">
              <p className={styles.message}>{t('empty')}</p>
            </Card>
          )}
          {mine &&
            total > 0 &&
            GROUPS.map((group) => (
              <section key={group} className={styles.group} aria-labelledby={`follow-ups-${group}`}>
                <h2 id={`follow-ups-${group}`} className={`${styles.groupTitle} ${group === 'overdue' && mine.overdue.length > 0 ? styles.groupOverdue : ''}`}>
                  {t(`groups.${group}`)} <span className={styles.count}>{mine[group].length}</span>
                </h2>
                {mine[group].length === 0 ? (
                  <p className={styles.message}>{t(`groupEmpty.${group}`)}</p>
                ) : (
                  <FollowUpList items={mine[group]} onChanged={reload} highlightId={highlightId} />
                )}
              </section>
            ))}
        </>
      )}

      {tab === 'team' && seesTeam && (
        <>
          <div className={styles.filters}>
            <div className={styles.filter}>
              <SelectInput label={t('team.salesperson')} value={salesperson} onChange={(event) => setSalesperson(event.target.value)}>
                <option value="">{t('team.everyone')}</option>
                {staff
                  .filter((member) => member.isActive !== false)
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {getStaffDisplayName(member)}
                    </option>
                  ))}
              </SelectInput>
            </div>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} />
              {t('team.overdueOnly')}
            </label>
          </div>
          {!canManage && <p className={styles.message}>{t('team.readOnly')}</p>}
          {!team && !loadFailed && <p className={styles.message}>{t('loading')}</p>}
          {team && team.length === 0 && <p className={styles.message}>{t('team.empty')}</p>}
          {team && team.length > 0 && <FollowUpList items={team} onChanged={reload} showAssignee readOnly={!canManage} highlightId={highlightId} />}
        </>
      )}
    </div>
  );
};

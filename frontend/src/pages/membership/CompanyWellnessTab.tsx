import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Card } from '../../components/ui/Card/Card';
import { useAuthStore } from '../../store/useAuthStore';
import { useDateFormat } from '../../hooks/useDateFormat';
import { dayAsDate } from '../../components/calendar/calendarGrouping';
import { TIERS } from '../../services/membershipSettingsService';
import { companyMembershipService, type CompanyMembership } from '../../services/companyMembershipService';
import { StatusBadge, TierBadge } from './MemberBadges';
import { RemoveFromCompanyDialog } from './RemoveFromCompanyDialog';
import { useTierLabels } from './useTierLabels';
import styles from './Members.module.css';

/**
 * The Wellness+ tab of the company page (M4 Slice 10, FR-MEM-11, FR-EMP-13): "N members of M employees", the members
 * with the count per tier, the former employees with their leaving date, the upload button and the upload history.
 * The server counts and judges; this screen only shows. Selected members are removed in one request (FR-EMP-15).
 */
export const CompanyWellnessTab: React.FC<{ clientId: string }> = ({ clientId }) => {
  const { t } = useTranslation('members');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const dates = useDateFormat();
  const tier = useTierLabels(tenantSlug);
  const canManage = useAuthStore((s) => s.user?.permissions?.['members.manage'] !== undefined);
  const canImport = useAuthStore((s) => s.user?.permissions?.['members.import'] !== undefined);

  const [data, setData] = useState<CompanyMembership | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [selected, setSelected] = useState<string[]>([]);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    if (!tenantSlug) return;
    try {
      setData(await companyMembershipService.get(tenantSlug, clientId));
      setState('ready');
    } catch (error) {
      console.error('Failed to load the Wellness+ tab', error);
      setState('failed');
    }
  }, [tenantSlug, clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const day = (key: string) => dates.date(dayAsDate(key));
  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  if (state === 'loading') return <Card padding="lg"><p role="status">{'…'}</p></Card>;
  if (state === 'failed' || !data) return <Card padding="lg"><p role="alert">{t('companyTab.loadFailed')}</p></Card>;

  const { summary, sponsor, members, formerEmployees, uploads } = data;
  const allSelected = members.length > 0 && selected.length === members.length;
  const open = (id: string) => navigate(`/${tenantSlug}/members/${id}`);

  return (
    <Card padding="lg">
      <div className={styles.header}>
        <div>
          <h2 className={styles.sectionTitle}>{t('companyTab.title')}</h2>
          <p className={styles.subtitle}>
            {summary.employees === null
              ? t('companyTab.membersOnly', { members: summary.members })
              : t('companyTab.membersOfEmployees', { members: summary.members, employees: summary.employees })}
          </p>
          <p className={styles.muted}>
            {sponsor.valid && sponsor.endsOn ? t('companyTab.sponsorValid', { date: day(sponsor.endsOn) }) : t('companyTab.sponsorNone')}
          </p>
        </div>
        {canImport && (
          <div className={styles.headerActions}>
            <Button variant="outline" icon={<Upload size={16} />} onClick={() => navigate(`/${tenantSlug}/members/employee-upload?clientId=${clientId}`)}>
              {t('companyTab.upload')}
            </Button>
          </div>
        )}
      </div>

      <ul className={styles.chips} aria-label={t('companyTab.perTier')}>
        {TIERS.map((value) => (
          <li key={value} className={styles.chip}>{t('companyTab.tierCount', { tier: tier(value).label, count: summary.perTier[value] })}</li>
        ))}
      </ul>

      <h3 className={styles.sectionTitle}>{t('companyTab.members')}</h3>
      {canManage && selected.length > 0 && (
        <div className={styles.headerActions}>
          <Button variant="danger" onClick={() => setRemoving(true)}>{t('companyTab.removeSelected', { count: selected.length })}</Button>
        </div>
      )}
      {members.length === 0 ? (
        <p>{t('companyTab.noMembers')}</p>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                {canManage && (
                  <th scope="col">
                    <input type="checkbox" aria-label={t('companyTab.selectAll')} checked={allSelected} onChange={() => setSelected(allSelected ? [] : members.map((m) => m.id))} />
                  </th>
                )}
                <th scope="col">{t('list.columns.name')}</th>
                <th scope="col">{t('list.columns.tier')}</th>
                <th scope="col">{t('list.columns.status')}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  {canManage && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t('companyTab.select', { name: `${member.firstName} ${member.lastName}` })}
                        checked={selected.includes(member.id)}
                        onChange={() => toggle(member.id)}
                      />
                    </td>
                  )}
                  <td>
                    <button type="button" className={styles.memberLink} onClick={() => open(member.id)}>
                      {member.firstName} {member.lastName}
                    </button>
                    <div className={styles.muted}>{member.memberNumber}</div>
                  </td>
                  <td><TierBadge tier={member.tier} label={tier(member.tier).label} colour={tier(member.tier).colour} /></td>
                  <td><StatusBadge status={member.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className={styles.sectionTitle}>{t('companyTab.former', { count: summary.formerEmployees })}</h3>
      {formerEmployees.length === 0 ? (
        <p>{t('companyTab.noFormer')}</p>
      ) : (
        <>
        <div className={styles.headerActions}>
          <Button variant="ghost" onClick={() => navigate(`/${tenantSlug}/members?formerEmployerClientId=${clientId}`)}>{t('companyTab.openInList')}</Button>
        </div>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('list.columns.name')}</th>
                <th scope="col">{t('list.columns.tier')}</th>
                <th scope="col">{t('companyTab.leftOn')}</th>
              </tr>
            </thead>
            <tbody>
              {formerEmployees.map((member) => (
                <tr key={member.id}>
                  <td>
                    <button type="button" className={styles.memberLink} onClick={() => open(member.id)}>
                      {member.firstName} {member.lastName}
                    </button>
                    <div className={styles.muted}>{member.memberNumber}</div>
                  </td>
                  <td><TierBadge tier={member.tier} label={tier(member.tier).label} colour={tier(member.tier).colour} /></td>
                  <td>{member.leftCompanyAt ? day(member.leftCompanyAt) : t('detail.none')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <h3 className={styles.sectionTitle}>{t('companyTab.uploads')}</h3>
      {uploads.length === 0 ? (
        <p>{t('companyTab.noUploads')}</p>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('companyTab.uploadFile')}</th>
                <th scope="col">{t('companyTab.uploadBy')}</th>
                <th scope="col">{t('companyTab.uploadWhen')}</th>
                <th scope="col">{t('companyTab.uploadCounts')}</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((upload) => (
                <tr key={upload.id}>
                  <td>{upload.fileName}</td>
                  <td>{upload.uploadedByName ?? t('detail.none')}</td>
                  <td>{dates.date(new Date(upload.confirmedAt ?? upload.createdAt))}</td>
                  <td>
                    {upload.status === 'CONFIRMED'
                      ? t('companyTab.counts', { created: upload.created, linked: upload.linked, skipped: upload.skipped + upload.refused + upload.errors })
                      : t(`companyTab.uploadStatus.${upload.status}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {removing && tenantSlug && (
        <RemoveFromCompanyDialog
          tenantSlug={tenantSlug}
          memberIds={selected}
          companyName={data.company.name}
          onClose={() => setRemoving(false)}
          onDone={() => {
            setRemoving(false);
            setSelected([]);
            void load();
          }}
        />
      )}
    </Card>
  );
};

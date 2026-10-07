import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Modal } from '../../components/ui/Modal/Modal';
import { Tabs } from '../../components/ui/Tabs/Tabs';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { useAuthStore } from '../../store/useAuthStore';
import { useDateFormat } from '../../hooks/useDateFormat';
import { dayAsDate } from '../../components/calendar/calendarGrouping';
import { lookupService, type City } from '../../services/lookupService';
import { lookupLabel } from '../../utils/lookupLabel';
import { memberService, type MemberDetail, type StatusAction } from '../../services/memberService';
import { StatusBadge, TierBadge } from './MemberBadges';
import { useTierLabels } from './useTierLabels';
import styles from './Members.module.css';

type TabId = 'overview' | 'terms' | 'history' | 'note';

/** The actions a status allows (FR-MEM-05). */
const ACTIONS_FOR: Record<MemberDetail['status'], StatusAction[]> = {
  ACTIVE: ['SUSPEND', 'CLOSE'],
  SUSPENDED: ['REINSTATE', 'CLOSE'],
  CLOSED: ['REOPEN'],
};

/**
 * The member page (FR-MEM-08): every field, the current tier with its term dates, the term history, the tier
 * history, the status history and the internal note. The tier shown is the one the server calculated for today
 * from the terms, never a stored value. No control edits the tier, an expiry date or the member ID (FR-MEM-09).
 * Payments, the family group and the verification events fill in with Slices 5, 6 and 13.
 */
export const MemberDetailContent: React.FC = () => {
  const { t, i18n } = useTranslation('members');
  const { tenantSlug, memberId } = useParams();
  const navigate = useNavigate();
  const dates = useDateFormat();
  const canManage = useAuthStore((s) => s.user?.permissions?.['members.manage'] !== undefined);
  const tier = useTierLabels(tenantSlug);

  const [member, setMember] = useState<MemberDetail | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'notFound' | 'failed'>('loading');
  const [tab, setTab] = useState<TabId>('overview');
  const [action, setAction] = useState<StatusAction | null>(null);
  const [reason, setReason] = useState('');
  const [statusError, setStatusError] = useState<'reason' | 'failed' | null>(null);
  const [changing, setChanging] = useState(false);

  const load = useCallback(async () => {
    if (!tenantSlug || !memberId) return;
    try {
      setMember(await memberService.get(tenantSlug, memberId));
      setState('ready');
    } catch (err) {
      setState((err as { response?: { status?: number } })?.response?.status === 404 ? 'notFound' : 'failed');
    }
  }, [tenantSlug, memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tenantSlug) lookupService.list(tenantSlug, 'cities').then(setCities, () => setCities([]));
  }, [tenantSlug]);

  const day = (key: string) => dates.date(dayAsDate(key));
  const stamp = (iso: string) => dates.date(new Date(iso));

  const closeDialog = () => {
    setAction(null);
    setReason('');
    setStatusError(null);
  };

  const confirmStatus = async () => {
    if (!tenantSlug || !memberId || !action) return;
    if (action === 'SUSPEND' && reason.trim() === '') return setStatusError('reason');
    setChanging(true);
    try {
      await memberService.changeStatus(tenantSlug, memberId, action, reason.trim() || undefined);
      closeDialog();
      await load();
    } catch {
      setStatusError('failed');
    } finally {
      setChanging(false);
    }
  };

  if (state === 'loading') return <div className={styles.container}><p role="status">{'…'}</p></div>;
  if (state !== 'ready' || !member) {
    return (
      <div className={styles.container}>
        <p role="alert">{t(state === 'notFound' ? 'detail.notFound' : 'detail.loadFailed')}</p>
        <div><Button variant="outline" onClick={() => navigate(`/${tenantSlug}/members`)}>{t('detail.back')}</Button></div>
      </div>
    );
  }

  const style = tier(member.effectiveTier);
  const city = cities.find((c) => c.id === member.cityId);
  const none = <span className={styles.muted}>{t('detail.none')}</span>;
  const validityText = member.validity.valid
    ? t('validity.valid')
    : t('validity.notValid', { reason: t(`status.${member.validity.reason ?? member.status}`) });
  const historyBy = (name: string | null) => name ?? t('detail.history.system');

  const fact = (label: string, value: React.ReactNode) => (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>
            <a href={`/${tenantSlug}/members`} onClick={(e) => { e.preventDefault(); navigate(`/${tenantSlug}/members`); }} style={{ color: 'inherit', textDecoration: 'none' }}>
              {t('detail.back')}
            </a>
            {' · '}{member.memberNumber}
          </div>
          <h1 className={styles.title}>{member.firstName} {member.lastName}</h1>
          <div className={styles.chips} style={{ marginTop: 8 }}>
            <TierBadge tier={member.effectiveTier} label={style.label} colour={style.colour} />
            <StatusBadge status={member.status} />
            <span className={styles.chip}>{validityText}</span>
          </div>
        </div>
        {canManage && (
          <div className={styles.headerActions}>
            <Button variant="outline" icon={<Pencil size={16} />} onClick={() => navigate(`/${tenantSlug}/members/${member.id}/edit`)}>
              {t('detail.edit')}
            </Button>
            {ACTIONS_FOR[member.status].map((a) => (
              <Button key={a} variant={a === 'CLOSE' ? 'danger' : 'outline'} onClick={() => setAction(a)}>
                {t(`detail.actions.${a}`)}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardBody}>
          <h2 className={styles.sectionTitle}>{t('detail.tierCard.title')}</h2>
          <div className={styles.tierCard}>
            <TierBadge tier={member.effectiveTier} label={style.label} colour={style.colour} />
            <span>
              {member.currentTerm
                ? member.currentTerm.endsOn
                  ? t('detail.tierCard.term', { from: day(member.currentTerm.startsOn), to: day(member.currentTerm.endsOn) })
                  : t('detail.tierCard.noEnd', { from: day(member.currentTerm.startsOn) })
                : t('detail.tierCard.floor')}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.tabs}>
          <Tabs<TabId>
            label={t('detail.tabs.label')}
            activeId={tab}
            onChange={setTab}
            tabs={[
              { id: 'overview', label: t('detail.tabs.overview') },
              { id: 'terms', label: t('detail.tabs.terms'), count: member.terms.length },
              { id: 'history', label: t('detail.tabs.history') },
              { id: 'note', label: t('detail.tabs.note') },
            ]}
          />
        </div>

        <div className={styles.cardBody}>
          {tab === 'overview' && (
            <dl className={styles.facts}>
              {fact(t('detail.fields.memberNumber'), member.memberNumber)}
              {fact(t('detail.fields.dateOfBirth'), member.dateOfBirth ? day(member.dateOfBirth) : none)}
              {member.phone !== undefined && fact(t('detail.fields.phone'), member.phone ?? none)}
              {member.email !== undefined && fact(t('detail.fields.email'), member.email ?? none)}
              {fact(t('detail.fields.language'), t(`languages.${member.language}`))}
              {fact(t('detail.fields.city'), city ? lookupLabel(city, i18n.language) : none)}
              {fact(t('detail.fields.startsOn'), day(member.startsOn))}
              {fact(t('detail.fields.employer'), member.employer?.name ?? none)}
              {fact(t('detail.fields.family'), member.family.principalMemberId ? t(`source.FAMILY`) : none)}
              {fact(t('detail.fields.createdBy'), member.createdBy.name ?? none)}
              {fact(t('detail.fields.createdAt'), stamp(member.createdAt))}
              {member.closedAt && fact(t('detail.fields.closedAt'), stamp(member.closedAt))}
            </dl>
          )}

          {tab === 'terms' && (
            <>
              <h2 className={styles.sectionTitle}>{t('detail.terms.title')}</h2>
              {member.terms.length === 0 ? (
                <p>{t('detail.terms.empty')}</p>
              ) : (
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">{t('detail.terms.tier')}</th>
                        <th scope="col">{t('detail.terms.source')}</th>
                        <th scope="col">{t('detail.terms.from')}</th>
                        <th scope="col">{t('detail.terms.to')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {member.terms.map((term) => (
                        <tr key={term.id}>
                          <td><TierBadge tier={term.tier} label={tier(term.tier).label} colour={tier(term.tier).colour} /></td>
                          <td>{t(`detail.termSource.${term.source}`)}</td>
                          <td>{day(term.startsOn)}</td>
                          <td>{term.endsOn ? day(term.endsOn) : t('detail.terms.openEnded')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'history' && (
            <>
              <h2 className={styles.sectionTitle}>{t('detail.history.tierTitle')}</h2>
              {member.tierHistory.length === 0 ? (
                <p>{t('detail.history.tierEmpty')}</p>
              ) : (
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">{t('detail.history.date')}</th>
                        <th scope="col">{t('detail.history.change')}</th>
                        <th scope="col">{t('detail.history.reason')}</th>
                        <th scope="col">{t('detail.history.by')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {member.tierHistory.map((h) => (
                        <tr key={h.id}>
                          <td>{stamp(h.createdAt)}</td>
                          <td>{tier(h.fromTier).label} → {tier(h.toTier).label}</td>
                          <td>{t(`detail.tierReason.${h.reason}`, { defaultValue: h.reason })}{h.comment ? ` · ${h.comment}` : ''}</td>
                          <td>{historyBy(h.changedBy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h2 className={styles.sectionTitle}>{t('detail.history.statusTitle')}</h2>
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">{t('detail.history.date')}</th>
                      <th scope="col">{t('detail.history.change')}</th>
                      <th scope="col">{t('detail.history.reason')}</th>
                      <th scope="col">{t('detail.history.by')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.statusHistory.map((h) => (
                      <tr key={h.id}>
                        <td>{stamp(h.createdAt)}</td>
                        <td>{h.fromStatus ? `${t(`status.${h.fromStatus}`)} → ${t(`status.${h.toStatus}`)}` : `${t('detail.history.registered')}: ${t(`status.${h.toStatus}`)}`}</td>
                        <td>{h.reason ?? <span className={styles.muted}>—</span>}</td>
                        <td>{historyBy(h.changedBy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'note' && (
            <>
              <h2 className={styles.sectionTitle}>{t('detail.tabs.note')}</h2>
              <p className={styles.warning}>{t('form.noteWarning')}</p>
              {member.note ? <p className={styles.noteText}>{member.note}</p> : <p className={styles.muted}>{t('detail.notePanel.empty')}</p>}
            </>
          )}
        </div>
      </div>

      <Modal isOpen={action !== null} onClose={closeDialog} title={action ? t(`detail.statusDialog.${action}`) : ''}>
        <div className={styles.modalBody}>
          {action === 'SUSPEND' && <p>{t('detail.statusDialog.suspendHelp')}</p>}
          {action === 'CLOSE' && <p>{t('detail.statusDialog.closeHelp')}</p>}
          <TextareaInput
            label={t('detail.statusDialog.reason')}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setStatusError(null);
            }}
            rows={3}
            error={statusError === 'reason' ? t('detail.statusDialog.reasonRequired') : undefined}
          />
          {statusError === 'failed' && <p className={styles.formError} role="alert">{t('detail.statusDialog.failed')}</p>}
          <div className={styles.modalActions}>
            <Button variant="ghost" onClick={closeDialog}>{t('detail.statusDialog.cancel')}</Button>
            <Button variant={action === 'CLOSE' ? 'danger' : 'primary'} isLoading={changing} onClick={() => void confirmStatus()}>
              {t('detail.statusDialog.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

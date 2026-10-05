import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { RefreshCw, Search } from 'lucide-react';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { TextareaInput } from '../../components/ui/TextareaInput/TextareaInput';
import { Button } from '../../components/ui/Button/Button';
import { Modal } from '../../components/ui/Modal/Modal';
import { Pagination } from '../../components/ui/Pagination/Pagination';
import { Tabs } from '../../components/ui/Tabs/Tabs';
import { useToast } from '../../components/ui/Toast/toastContext';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useDebounce } from '../../hooks/useDebounce';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { useTeam } from '../../hooks/useTeam';
import { contractService } from '../../services/contractService';
import { lookupService, type LostReason } from '../../services/lookupService';
import { renewalService } from '../../services/renewalService';
import { lookupLabel } from '../../utils/lookupLabel';
import { getStaffDisplayName } from '../../utils/userUtils';
import { contractReference } from '../../utils/contractReference';
import { dayAsDate } from '../../components/calendar/calendarGrouping';
import { RENEWAL_WINDOWS } from '../../types/renewal';
import type { RenewalRow, RenewalsPage, RenewalWindow } from '../../types/renewal';
import styles from './RenewalsContent.module.css';

const PAGE_SIZE = 25;

/**
 * The tab a link asks for. The workspace's "expiring soon" window can be any number of days, the tabs
 * are 30, 60 and 90: the smallest tab that covers it, so nothing expiring soon is missing from the list.
 */
const windowFor = (requested: string | null): RenewalWindow => {
  if (requested === 'RECENTLY_EXPIRED') return requested;
  const days = Number(requested);
  if (!requested || !Number.isFinite(days)) return '30';
  return days <= 30 ? '30' : days <= 60 ? '60' : '90';
};

/** A contract this close to its end is picked out in the list. */
const SOON_DAYS = 14;

const STATE_CHIP: Record<string, string> = {
  IN_NEGOTIATION: styles.chipNegotiation,
  RENEWED: styles.chipRenewed,
  NOT_RENEWING: styles.chipNotRenewing,
};

/**
 * The Renewals screen (FR-REN-05, FR-REN-09): valid contracts ending in the next
 * 30, 60 or 90 days and the ones that ended in the last 90, each with the
 * renewal state the server worked out. It shows what the server sends and
 * works nothing out: which actions a row offers (`actions`) and what a row
 * carries (price, deal, reason) both come from the server and the viewer's
 * permissions, so Reception sees the validity of each contract and no more.
 */
export const RenewalsContent: React.FC = () => {
  const { t, i18n } = useTranslation('renewals');
  const { t: tc } = useTranslation('common');
  const dates = useDateFormat();
  const { format: formatMoney } = useMoneyFormat();
  const toast = useToast();
  const { tenantSlug } = useParams();
  // A dashboard figure opens the tab for its window and salesperson (M3 Slice 13, FR-DSH-05).
  const [startFilters] = useSearchParams();
  const navigate = useNavigate();
  const { staff, fetchStaff } = useTeam();

  const [window, setWindow] = useState<RenewalWindow>(() => windowFor(startFilters.get('window')));
  const [query, setQuery] = useState('');
  const [salespersonId, setSalespersonId] = useState(startFilters.get('salespersonId') ?? '');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<RenewalsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [markingFor, setMarkingFor] = useState<RenewalRow | null>(null);

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const filterKey = JSON.stringify({ window, query: debouncedQuery.trim() || undefined, assignedUserId: salespersonId || undefined });

  // A new tab or filter starts again from the first page.
  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  const load = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setFailed(false);
    try {
      setResult(await renewalService.fetchRenewals(tenantSlug, JSON.parse(filterKey), page, PAGE_SIZE));
    } catch (error) {
      console.error('Failed to load renewals', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, filterKey, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const day = (key: string) => dates.date(dayAsDate(key));
  const openContract = (id: string) => navigate(`/${tenantSlug}/contracts/${id}`);
  const openDeal = (id: string) => navigate(`/${tenantSlug}/deals/${id}`);

  const startRenewal = async (row: RenewalRow) => {
    if (!tenantSlug) return;
    try {
      const { dealId } = await contractService.startRenewal(tenantSlug, row.contractId);
      openDeal(dealId);
    } catch (error: any) {
      const data = error?.response?.data as { error?: string; code?: string; dealId?: string | null } | undefined;
      // A renewal deal is already open: open that one instead of starting a second.
      if (data?.code === 'RENEWAL_OPEN' && data.dealId) return openDeal(data.dealId);
      toast.error(data?.error ?? tc('state.error'));
      void load();
    }
  };

  const undoNotRenewing = async (row: RenewalRow) => {
    if (!tenantSlug) return;
    try {
      await renewalService.clearNotRenewing(tenantSlug, row.contractId);
      toast.success(t('notRenewing.undone'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? tc('state.error'));
    }
    void load();
  };

  const rows = result?.data ?? [];
  // The columns the server sent anything for: the first row decides, as every row of a response is shaped alike.
  const showsWorklist = rows.length === 0 || rows[0].state !== undefined;
  const showsPrice = rows.length === 0 || rows[0].monthlyPrice !== undefined;
  const columns = 4 + (showsWorklist ? 3 : 0) + (showsPrice ? 1 : 0);

  const tabs = RENEWAL_WINDOWS.map((id) => ({ id, label: t(`tabs.${id}`) }));

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{t('title')}</h1>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.tabs}>
          <Tabs<RenewalWindow> tabs={tabs} activeId={window} onChange={setWindow} label={t('tabsLabel')} />
        </div>

        <div className={styles.filters}>
          <TextInput
            label={t('filterSearch')}
            placeholder={t('searchPlaceholder')}
            iconLeft={<Search size={18} />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {showsWorklist && (
            <SelectInput label={t('filterSalesperson')} value={salespersonId} onChange={(event) => setSalespersonId(event.target.value)}>
              <option value="">{t('all')}</option>
              {staff.map((person: any) => (
                <option key={person.id} value={person.id}>
                  {getStaffDisplayName(person)}
                </option>
              ))}
            </SelectInput>
          )}
        </div>

        <div className={styles.tableContainer}>
          {failed ? (
            <div className={styles.emptyState} role="alert">
              <h3 className={styles.emptyTitle}>{t('failed')}</h3>
            </div>
          ) : !loading && rows.length === 0 ? (
            <div className={styles.emptyState}>
              <RefreshCw size={48} className={styles.emptyIcon} />
              <h3 className={styles.emptyTitle}>{t(`empty.${window}`)}</h3>
              <p className={styles.emptyMessage}>{t('emptyMessage')}</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('columnContract')}</th>
                  <th>{t('columnCompany')}</th>
                  {showsWorklist && <th>{t('columnSalesperson')}</th>}
                  <th>{t('columnEnds')}</th>
                  {showsPrice && <th className={styles.numeric}>{t('columnPrice')}</th>}
                  {showsWorklist && <th>{t('columnState')}</th>}
                  {showsWorklist && <th aria-label={t('columnActions')} />}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={columns} className={styles.loadingCell}>
                      {tc('state.loading')}
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((row) => (
                    <tr key={row.contractId} className={styles.row} onClick={() => openContract(row.contractId)}>
                      <td>
                        <a
                          className={styles.contractLink}
                          href={`/${tenantSlug}/contracts/${row.contractId}`}
                          onClick={(event) => {
                            // The row opens the contract; the link must not open it twice.
                            event.preventDefault();
                            event.stopPropagation();
                            openContract(row.contractId);
                          }}
                        >
                          {row.number || contractReference(row.contractId)}
                        </a>
                        {row.planName && <span className={styles.muted}> · {row.planName}</span>}
                      </td>
                      <td>{row.company.name}</td>
                      {showsWorklist && <td>{row.salesperson?.name ?? '—'}</td>}
                      <td>
                        {day(row.endsAt)}
                        <span className={`${styles.days} ${row.daysRemaining >= 0 && row.daysRemaining <= SOON_DAYS ? styles.daysSoon : ''}`}>
                          {row.daysRemaining >= 0 ? t('daysLeft', { count: row.daysRemaining }) : t('endedDaysAgo', { count: -row.daysRemaining })}
                        </span>
                      </td>
                      {showsPrice && <td className={styles.numeric}>{row.monthlyPrice !== undefined ? formatMoney(row.monthlyPrice) : '—'}</td>}
                      {showsWorklist && (
                        <td>
                          {row.state && (
                            <div className={styles.stateCell}>
                              <span className={`${styles.chip} ${STATE_CHIP[row.state] ?? ''}`} data-state={row.state}>
                                {t(`state.${row.state}`)}
                              </span>
                              {row.state === 'IN_NEGOTIATION' && row.openDealId && (
                                <button
                                  type="button"
                                  className={styles.inlineLink}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openDeal(row.openDealId!);
                                  }}
                                >
                                  {t('openDeal')}
                                </button>
                              )}
                              {row.state === 'RENEWED' && row.renewedInto && (
                                <button
                                  type="button"
                                  className={styles.inlineLink}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openContract(row.renewedInto!.id);
                                  }}
                                >
                                  {t('renewedBy', { number: row.renewedInto.number ?? contractReference(row.renewedInto.id) })}
                                </button>
                              )}
                              {row.state === 'NOT_RENEWING' && row.notRenewing && (
                                <span className={styles.stateNote}>
                                  {lookupLabel({ nameSq: row.notRenewing.reasonSq, nameEn: row.notRenewing.reasonEn }, i18n.language)}
                                  {row.notRenewing.note ? ` — ${row.notRenewing.note}` : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      {showsWorklist && (
                        <td onClick={(event) => event.stopPropagation()}>
                          <div className={styles.actions}>
                            {row.actions?.includes('START_RENEWAL') && (
                              <Button size="sm" variant="primary" onClick={() => startRenewal(row)}>
                                {t('startRenewal')}
                              </Button>
                            )}
                            {row.actions?.includes('MARK_NOT_RENEWING') && (
                              <Button size="sm" variant="outline" onClick={() => setMarkingFor(row)}>
                                {t('markNotRenewing')}
                              </Button>
                            )}
                            {row.actions?.includes('UNDO_NOT_RENEWING') && (
                              <Button size="sm" variant="outline" onClick={() => undoNotRenewing(row)}>
                                {t('undoNotRenewing')}
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        {(result?.count ?? 0) > 0 && <Pagination page={page} pageSize={PAGE_SIZE} total={result!.count} onPageChange={setPage} itemLabel={t('items')} />}
      </div>

      {tenantSlug && (
        <NotRenewingDialog
          tenantSlug={tenantSlug}
          row={markingFor}
          onClose={() => setMarkingFor(null)}
          onDone={() => {
            setMarkingFor(null);
            void load();
          }}
        />
      )}
    </div>
  );
};

/** FR-REN-08: "Not renewing" needs a reason from the active lost-deal reasons, and takes a note. */
const NotRenewingDialog: React.FC<{ tenantSlug: string; row: RenewalRow | null; onClose: () => void; onDone: () => void }> = ({
  tenantSlug,
  row,
  onClose,
  onDone,
}) => {
  const { t, i18n } = useTranslation('renewals');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const [reasons, setReasons] = useState<LostReason[]>([]);
  const [reasonId, setReasonId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const isOpen = row !== null;

  useEffect(() => {
    if (!isOpen) return;
    setReasonId('');
    setNote('');
    lookupService.list(tenantSlug, 'lost-reasons').then(setReasons).catch(() => toast.error(t('notRenewing.reasonsFailed')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tenantSlug]);

  const save = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await renewalService.markNotRenewing(tenantSlug, row.contractId, { reasonId, note: note.trim() || null });
      toast.success(t('notRenewing.done'));
      onDone();
    } catch (error: any) {
      toast.error(error?.response?.data?.error ?? tc('state.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('notRenewing.title')} maxWidth="sm">
      <div className={styles.modalBody}>
        <p className={styles.muted}>{t('notRenewing.hint', { company: row?.company.name ?? '' })}</p>
        <SelectInput label={t('notRenewing.reason')} value={reasonId} onChange={(event) => setReasonId(event.target.value)} required>
          <option value="" disabled>
            —
          </option>
          {reasons.map((reason) => (
            <option key={reason.id} value={reason.id}>
              {lookupLabel(reason, i18n.language)}
            </option>
          ))}
        </SelectInput>
        <TextareaInput label={t('notRenewing.note')} rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onClose}>
            {t('notRenewing.cancel')}
          </Button>
          <Button variant="primary" onClick={save} isLoading={saving} disabled={!reasonId}>
            {t('notRenewing.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

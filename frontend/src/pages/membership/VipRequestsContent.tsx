import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button/Button';
import { Pagination } from '../../components/ui/Pagination/Pagination';
import { SelectInput } from '../../components/ui/SelectInput/SelectInput';
import { useAuthStore } from '../../store/useAuthStore';
import { useDateFormat } from '../../hooks/useDateFormat';
import { memberVipService, type VipRequestsPage } from '../../services/memberVipService';
import type { VipRequest, VipRequestStatus } from '../../services/memberService';
import { VipDecisionDialog } from './VipDecisionDialog';
import styles from './Members.module.css';

const PAGE_SIZE = 25;
const STATUSES: VipRequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

/**
 * The VIP requests list for approvers (FR-VIP-02): pending first by default, with Approve and Reject on every
 * request that somebody else made. The decision is the server's, and a request one made oneself is shown without
 * buttons.
 */
export const VipRequestsContent: React.FC = () => {
  const { t } = useTranslation('members');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const dates = useDateFormat();
  const userId = useAuthStore((s) => s.user?.userId);
  const [status, setStatus] = useState<VipRequestStatus | ''>('PENDING');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<VipRequestsPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [deciding, setDeciding] = useState<{ request: VipRequest; decision: 'APPROVE' | 'REJECT' } | null>(null);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const load = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setFailed(false);
    try {
      setResult(await memberVipService.list(tenantSlug, { status, page, limit: PAGE_SIZE }));
    } catch (error) {
      console.error('Failed to load VIP requests', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = result?.data ?? [];
  const stamp = (iso: string) => dates.date(new Date(iso));

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('breadcrumb')}</div>
          <h1 className={styles.title}>{t('vip.list.title')}</h1>
          <p className={styles.subtitle}>{t('vip.list.subtitle')}</p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.filters}>
          <SelectInput label={t('vip.columns.status')} value={status} onChange={(e) => setStatus(e.target.value as VipRequestStatus | '')}>
            <option value="">{t('list.filters.any')}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>{t(`vip.status.${value}`)}</option>
            ))}
          </SelectInput>
        </div>

        {failed ? (
          <p role="alert" className={styles.formError}>{t('vip.list.loadFailed')}</p>
        ) : rows.length === 0 && !loading ? (
          <p>{t('vip.list.empty')}</p>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('vip.columns.member')}</th>
                  <th scope="col">{t('vip.columns.date')}</th>
                  <th scope="col">{t('vip.columns.status')}</th>
                  <th scope="col">{t('vip.columns.reason')}</th>
                  <th scope="col">{t('vip.columns.requestedBy')}</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button type="button" className={styles.memberLink} onClick={() => navigate(`/${tenantSlug}/members/${r.member.id}`)}>
                        {r.member.memberNumber} {r.member.name}
                      </button>
                    </td>
                    <td>{stamp(r.createdAt)}</td>
                    <td><span className={styles.chip}>{t(`vip.status.${r.status}`)}</span></td>
                    <td>{r.reason}</td>
                    <td>{r.requestedBy.name ?? <span className={styles.muted}>—</span>}</td>
                    <td>
                      {r.status === 'PENDING' &&
                        (r.requestedBy.id === userId ? (
                          <span className={styles.muted}>{t('vip.ownRequest')}</span>
                        ) : (
                          <div className={styles.rowActions}>
                            <Button onClick={() => setDeciding({ request: r, decision: 'APPROVE' })}>{t('vip.decide.approve')}</Button>
                            <Button variant="outline" onClick={() => setDeciding({ request: r, decision: 'REJECT' })}>{t('vip.decide.reject')}</Button>
                          </div>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result && result.total > PAGE_SIZE && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={result.total} onPageChange={setPage} />
        )}
      </div>

      {deciding && tenantSlug && (
        <VipDecisionDialog
          tenantSlug={tenantSlug}
          request={deciding.request}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            void load();
          }}
        />
      )}
    </div>
  );
};

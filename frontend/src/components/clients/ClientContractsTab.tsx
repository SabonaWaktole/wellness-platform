import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { FileSignature, Plus } from 'lucide-react';
import { Card } from '../ui/Card/Card';
import { StatusBadge } from '../ui/StatusBadge/StatusBadge';
import { Button } from '../ui/Button/Button';
import { Can } from '../auth/Can';
import { useContracts } from '../../hooks/useContracts';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { useStatusLabel } from '../../hooks/useStatusLabel';
import { useDateFormat } from '../../hooks/useDateFormat';
import { contractReference } from '../../utils/contractReference';
import type { ClientContracts } from '../../types/contract';
import styles from './ClientContractsTab.module.css';

/**
 * The client page's answer to "are they a paying customer, and do they owe us
 * anything?"
 *
 * The headline strip above the list is the point of this tab. The terms
 * themselves are secondary — somebody opening a client mid-call needs the
 * subscription status in one glance, not a table to read.
 */
export const ClientContractsTab: React.FC<{ clientId: string }> = ({ clientId }) => {
  const { t } = useTranslation('contracts');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const dates = useDateFormat();
  const { format: formatMoney } = useMoneyFormat();
  const statusLabel = useStatusLabel();

  const { fetchClientContracts, loading } = useContracts();
  const [data, setData] = useState<ClientContracts | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchClientContracts(clientId));
    } catch (error) {
      console.error('Failed to load client contracts', error);
    }
  }, [clientId, fetchClientContracts]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary;

  return (
    <Card padding="lg">
      <div className={styles.header}>
        <h2 className={styles.title}>{t('clientTab.title')}</h2>
        <Can permission="contracts.manage">
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => navigate(`/${tenantSlug}/contracts/new?clientId=${clientId}`)}
          >
            {t('clientTab.newContract')}
          </Button>
        </Can>
      </div>

      {summary && (
        <div className={styles.summaryStrip}>
          <div className={styles.summaryItem}>
            <FileSignature size={18} className={styles.summaryIcon} />
            <span className={styles.summaryPrimary}>
              {summary.hasActiveContract && summary.activeEndsAt
                ? t('clientTab.subscribedUntil', {
                    plan: summary.activePlanName,
                    date: dates.date(summary.activeEndsAt),
                  })
                : t('clientTab.notSubscribed')}
            </span>
          </div>
          {/* Only sent to a viewer holding payments.view (FR-RBAC-06). */}
          {summary.outstanding !== undefined && (
            <span
              className={`${styles.summarySecondary} ${
                (summary.overdueCount ?? 0) > 0 ? styles.summaryAlert : ''
              }`}
            >
              {summary.outstanding > 0
                ? t('clientTab.outstanding', { amount: formatMoney(summary.outstanding) })
                : t('clientTab.allSettled')}
              {(summary.overdueCount ?? 0) > 0 &&
                ` · ${t('clientTab.overdue', { count: summary.overdueCount })}`}
            </span>
          )}
        </div>
      )}

      {loading && !data && <div className={styles.emptyMessage}>{tc('state.loading')}</div>}

      {data && data.contracts.length === 0 && (
        <div className={styles.emptyMessage}>{t('clientTab.empty')}</div>
      )}

      <div className={styles.list}>
        {data?.contracts.map((contract) => (
          <button
            key={contract.id}
            type="button"
            className={styles.row}
            onClick={() => navigate(`/${tenantSlug}/contracts/${contract.id}`)}
          >
            <div className={styles.rowMain}>
              <span className={styles.rowPlan}>
                {contract.planName}{' '}
                <span className={styles.rowReference}>{contract.number ?? contractReference(contract.id)}</span>
              </span>
              <span className={styles.rowTerm}>
                {dates.date(contract.startsAt)} – {dates.date(contract.endsAt)}
                {/* The price is only sent with commercial.view (FR-RBAC-06). */}
                {contract.amount !== undefined && contract.billingPeriod && (
                  <>
                    {' · '}
                    {formatMoney(contract.amount)} / {statusLabel.billingPeriod(contract.billingPeriod)}
                  </>
                )}
              </span>
            </div>
            <div className={styles.rowSide}>
              {contract.paymentSummary && contract.paymentSummary.outstanding > 0 && (
                <span className={styles.rowOwed}>
                  {formatMoney(contract.paymentSummary.outstanding)}
                </span>
              )}
              <StatusBadge domain="contract" status={contract.status} />
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
};

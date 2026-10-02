import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Card } from '../ui/Card/Card';
import { Button } from '../ui/Button/Button';
import { StatusBadge } from '../ui/StatusBadge/StatusBadge';
import { Can } from '../auth/Can';
import { useDealText } from '../../hooks/useDealText';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { dealService } from '../../services/dealService';
import type { DealSummary } from '../../types/deal';
import styles from './ClientDealsTab.module.css';

/**
 * The company's deals, open and closed (FR-DEAL-01), newest change first,
 * with "New deal" for whoever may create one. Loaded when the tab is opened.
 * Only reached with `deals.view`, so Reception never asks (FR-DEAL-04).
 */
export const ClientDealsTab: React.FC<{ clientId: string }> = ({ clientId }) => {
  const { t } = useTranslation('deals');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const text = useDealText();
  const money = useMoneyFormat();
  const [deals, setDeals] = useState<DealSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!tenantSlug || !clientId) return;
    let current = true;
    dealService
      .list(tenantSlug, { clientId, pageSize: 100 })
      .then((page) => current && setDeals(page.items))
      .catch(() => current && setLoadFailed(true));
    return () => {
      current = false;
    };
  }, [tenantSlug, clientId]);

  return (
    <Card padding="lg">
      <div className={styles.header}>
        <h2 className={styles.title}>{t('clientTab.title')}</h2>
        <Can permission="deals.edit">
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate(`/${tenantSlug}/deals/new?clientId=${clientId}`)}>
            {t('newDeal')}
          </Button>
        </Can>
      </div>

      {loadFailed && <div className={styles.emptyMessage}>{t('clientTab.loadFailed')}</div>}
      {!deals && !loadFailed && <div className={styles.emptyMessage}>{tc('state.loading')}</div>}
      {deals?.length === 0 && <div className={styles.emptyMessage}>{t('clientTab.empty')}</div>}

      <div className={styles.list}>
        {deals?.map((deal) => (
          <button key={deal.id} type="button" className={styles.row} onClick={() => navigate(`/${tenantSlug}/deals/${deal.id}`)}>
            <div className={styles.rowMain}>
              <span className={styles.rowTitle}>{text.title(deal)}</span>
              <span className={styles.rowMeta}>
                {deal.ownerName}
                {deal.expectedCloseDate && ` · ${text.calendarDate(deal.expectedCloseDate)}`}
                {/* Absent without commercial.view (FR-RBAC-17). */}
                {deal.netMonthlyPrice != null && ` · ${t('perMonth', { amount: money.format(Number(deal.netMonthlyPrice)) })}`}
              </span>
            </div>
            <StatusBadge domain="deal" status={deal.stage} />
          </button>
        ))}
      </div>
    </Card>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { Card } from '../../components/ui/Card/Card';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable/DataTable';
import { Pagination } from '../../components/ui/Pagination/Pagination';
import { useDateFormat } from '../../hooks/useDateFormat';
import { useMoneyFormat } from '../../hooks/useMoneyFormat';
import { offerService } from '../../services/offerService';
import type { PendingApprovalPage, PendingApprovalView } from '../../types/offer';
import styles from '../deals/DealListContent.module.css';

/**
 * Pending discount approvals (M2 Slice 10, FR-DSC-06): the queue of requests
 * whose deal is inside the viewer's `discounts.approve` scope, oldest first,
 * with the company, salesperson, list price, requested % (or manual price,
 * FR-PRC-09) and reason.
 * A row opens the offer's deal on that offer, where the inline approve /
 * reject steps live (the list shows the queue, the offer decides it).
 */
export const ApprovalsContent: React.FC = () => {
  const { t } = useTranslation('offers');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const dates = useDateFormat();
  const money = useMoneyFormat();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState<PendingApprovalPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const latest = useRef(0);

  useEffect(() => {
    if (!tenantSlug) return;
    const request = ++latest.current;
    setIsLoading(true);
    offerService
      .pendingApprovals(tenantSlug, page, pageSize)
      .then((found) => {
        if (request !== latest.current) return;
        setResult(found);
        setLoadFailed(false);
      })
      .catch(() => request === latest.current && setLoadFailed(true))
      .finally(() => request === latest.current && setIsLoading(false));
  }, [tenantSlug, page, pageSize]);

  const columns: DataTableColumn<PendingApprovalView>[] = [
    {
      id: 'reference',
      header: t('approvalsList.columns.reference'),
      render: (row) => (
        <span>
          <strong>{row.reference}</strong> · {row.companyName}
        </span>
      ),
    },
    {
      id: 'salesperson',
      header: t('approvalsList.columns.salesperson'),
      render: (row) => row.requestedByName,
    },
    {
      id: 'requested',
      header: t('approvalsList.columns.requested'),
      // FR-DSC-06: the requested % on the list price; FR-PRC-09: the proposed manual price.
      render: (row) =>
        row.kind === 'MANUAL_PRICE'
          ? t('approvalsList.manualPrice', { price: money.format(Number(row.requestedMonthlyPrice)) })
          : t('approvalsList.discount', { percent: row.requestedPercent, listPrice: money.format(Number(row.listPriceAtRequest)) }),
    },
    {
      id: 'reason',
      header: t('approvalsList.columns.reason'),
      render: (row) => row.reason,
    },
    {
      id: 'requestedAt',
      header: t('approvalsList.columns.requestedAt'),
      render: (row) => dates.date(row.createdAt),
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>{t('approvalsList.breadcrumb')}</div>
          <h1 className={styles.title}>{t('approvalsList.title')}</h1>
        </div>
      </div>

      {loadFailed && <p className={styles.message}>{t('approvalsList.loadFailed')}</p>}

      <Card padding="none" className={styles.tableCard}>
        <DataTable
          columns={columns}
          rows={result?.data ?? []}
          rowKey={(row) => row.id}
          isLoading={isLoading && !result}
          onRowClick={(row) => navigate(`/${tenantSlug}/deals/${row.dealId}?offer=${row.offerId}`)}
          empty={{
            icon: <ClipboardCheck size={28} />,
            title: t('approvalsList.empty'),
            description: t('approvalsList.emptyMessage'),
          }}
        />
      </Card>

      {result && result.total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={result.total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          pageSizeOptions={[25, 50, 100]}
          itemLabel={t('approvalsList.itemLabel')}
        />
      )}
    </div>
  );
};

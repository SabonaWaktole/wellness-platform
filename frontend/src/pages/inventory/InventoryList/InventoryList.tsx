import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  DollarSign,
  Package,
  PlusSquare,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import styles from './InventoryList.module.css';
import { Button } from '../../../components/ui/Button';
import { KPICard } from '../../../components/ui/KPICard';
import { TextInput } from '../../../components/ui/TextInput';
import { SelectInput } from '../../../components/ui/SelectInput';
import { Pagination } from '../../../components/ui/Pagination';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/Toast';
import { useMoneyFormat } from '../../../hooks/useMoneyFormat';
import { InventoryTable } from '../../../components/inventory/InventoryTable';
import { StockAdjustmentPanel } from '../../../components/inventory/StockAdjustmentPanel/StockAdjustmentPanel';
import { AppLayout } from '../../../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../../../components/layout/Sidebar/Sidebar';

import {
  useBulkProductAction,
  useDeleteProduct,
  useProductFacets,
  useProducts,
  useUpdateProduct,
} from '../../../hooks/useInventory';
import { useCategories } from '../../../hooks/useCategories';
import { useWarehouses } from '../../../hooks/useWarehouses';
import { useAuthStore } from '../../../store/useAuthStore';
import { useLogout } from '../../../hooks/useLogout';
import { useNavigation } from '../../../hooks/useNavigation';
import { useStatusLabel } from '../../../hooks/useStatusLabel';
import type { BulkProductAction, Product, ProductStatus } from '../../../types/inventory';
import { getUserDisplayName } from '../../../utils/userUtils';

const STATUS_OPTIONS: ProductStatus[] = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'ARCHIVED'];

const InventoryListContent: React.FC = () => {
  const { t } = useTranslation('inventory');
  const { formatWhole: formatMoney } = useMoneyFormat();
  const statusLabel = useStatusLabel();
  const navigate = useNavigate();
  const toast = useToast();
  const { tenantSlug } = useParams();

  const {
    products,
    summary,
    total,
    currentPage,
    pageSize,
    filters,
    isLoading,
    error,
    setFilters,
    goToPage,
    toggleSort,
    patchProduct,
    refetch,
  } = useProducts();

  const { categories, fetchCategories } = useCategories();
  const { warehouses, fetchWarehouses } = useWarehouses();
  const { facets, refetch: refetchFacets } = useProductFacets();

  const { updateProduct } = useUpdateProduct();
  const { deleteProduct } = useDeleteProduct();
  const { runBulkAction, isPending: isBulkPending } = useBulkProductAction();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<BulkProductAction | null>(null);

  React.useEffect(() => {
    fetchCategories();
    fetchWarehouses();
  }, [fetchCategories, fetchWarehouses]);

  const hasActiveFilters = Boolean(
    filters.query ||
      filters.categoryId ||
      filters.warehouseId ||
      filters.brand ||
      filters.status ||
      filters.tags?.length
  );

  const clearFilters = () =>
    setFilters({
      query: '',
      categoryId: undefined,
      warehouseId: undefined,
      brand: undefined,
      status: undefined,
      tags: undefined,
    });

  // ---- Single-row actions -------------------------------------------------

  /**
   * Archiving is reversible and its effect is a single badge, so the row is
   * updated straight away and reconciled from the refetch. A failure puts the
   * old value back.
   */
  const handleToggleArchive = async (product: Product) => {
    const next = !product.isArchived;
    patchProduct(product.id, {
      isArchived: next,
      status: next ? 'ARCHIVED' : product.availability,
    });
    try {
      await updateProduct(product.id, { isArchived: next });
      toast.success(next ? `"${product.name}" was archived.` : `"${product.name}" was restored.`);
      await refetch();
    } catch (err: any) {
      patchProduct(product.id, { isArchived: product.isArchived, status: product.status });
      toast.error(err?.response?.data?.error ?? 'Could not change the archive state.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProduct(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" was deleted.`);
      setSelectedIds((current) => current.filter((id) => id !== deleteTarget.id));
      await Promise.all([refetch(), refetchFacets()]);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Could not delete this product.');
      throw err;
    }
  };

  // ---- Bulk actions -------------------------------------------------------

  const runBulk = async (action: BulkProductAction) => {
    try {
      const result = await runBulkAction(selectedIds, action);
      const verb = action === 'delete' ? 'deleted' : action === 'archive' ? 'archived' : 'restored';

      if (result.succeeded.length > 0) {
        toast.success(
          `${result.succeeded.length} product${result.succeeded.length === 1 ? '' : 's'} ${verb}.`
        );
      }
      // Partial success is the normal outcome for a delete across a mixed
      // selection, so the reasons are surfaced rather than swallowed.
      if (result.failed.length > 0) {
        toast.warning(
          result.failed.length === 1
            ? result.failed[0].reason
            : `${result.failed.length} products could not be ${verb}. ${result.failed[0].reason}`,
          { title: 'Some products were skipped' }
        );
      }

      setSelectedIds(result.failed.map((entry) => entry.id));
      await Promise.all([refetch(), refetchFacets()]);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'That bulk action could not be completed.');
      throw err;
    }
  };

  const bulkCopy: Record<BulkProductAction, { title: string; confirm: string; message: string }> = {
    delete: {
      title: t('list.bulkDeleteTitle', { count: selectedIds.length }),
      confirm: 'Delete permanently',
      message:
        'Their images, stock levels and movement history will be permanently removed. Products referenced by a quotation will be skipped.',
    },
    archive: {
      title: t('list.bulkArchiveTitle', { count: selectedIds.length }),
      confirm: 'Archive',
      message: 'Archived products drop out of the catalogue but keep all of their history.',
    },
    unarchive: {
      title: t('list.bulkRestoreTitle', { count: selectedIds.length }),
      confirm: 'Restore',
      message: 'They will reappear in the catalogue with their stock status recalculated.',
    },
  };

  const kpis = useMemo(
    () => [
      {
        title: t('list.kpiActiveProducts'),
        value: summary.totalProducts.toString(),
        icon: <Package size={20} />,
        trendValue: t('list.kpiUnitsOnHand', { count: summary.totalUnits }),
      },
      {
        title: t('list.kpiNeedsAttention'),
        value: (summary.outOfStock + summary.lowStock).toString(),
        icon: <AlertCircle size={20} />,
        iconColor: 'var(--color-error)',
        iconBgColor: 'var(--color-error-container)',
        trendValue: t('list.kpiStockSummary', { outOfStock: summary.outOfStock, lowStock: summary.lowStock }),
      },
      {
        title: t('list.kpiInventoryValue'),
        value: formatMoney(summary.inventoryValue),
        icon: <DollarSign size={20} />,
        iconColor: 'var(--color-secondary)',
        iconBgColor: 'var(--color-secondary-container)',
        trendValue:
          summary.inventoryCost > 0
            ? t('list.kpiAtCost', { value: formatMoney(summary.inventoryCost) })
            : t('list.kpiAddCosts'),
      },
      {
        title: t('list.kpiArchived'),
        value: summary.archived.toString(),
        icon: <Archive size={20} />,
        trendValue: t('list.kpiHidden'),
      },
    ],
    // formatMoney is memoised on the tenant's currency and locale, so listing it
    // here is what makes the Inventory Value tile re-render when the workspace
    // currency changes. Without it the tile kept its old symbol until something
    // else happened to change `summary`.
    [summary, formatMoney, t]
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleContainer}>
          <h1 className={styles.title}>{t('list.title')}</h1>
          <p className={styles.subtitle}>{t('list.subtitle')}</p>
        </div>
        <Button
          variant="primary"
          icon={<PlusSquare size={20} />}
          onClick={() => navigate(`/${tenantSlug}/inventory/new`)}
        >
          {t('list.addProduct')}
        </Button>
      </div>

      <div className={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <KPICard key={kpi.title} {...kpi} trendDirection="neutral" />
        ))}
      </div>

      {/* Filters */}
      <div className={styles.filtersBar}>
        <div className={styles.filtersLeft}>
          <TextInput
            placeholder={t('list.searchPlaceholder')}
            iconLeft={<Search size={18} />}
            className={styles.searchInput}
            value={filters.query ?? ''}
            onChange={(event) => setFilters({ query: event.target.value })}
            aria-label={t('list.searchAria')}
          />

          <SelectInput
            className={styles.selectInput}
            value={filters.categoryId ?? ''}
            onChange={(event) => setFilters({ categoryId: event.target.value || undefined })}
            aria-label={t('list.filterCategoryAria')}
          >
            <option value="">{t('list.allCategories')}</option>
            {categories.map((entry) => (
              <option key={entry.category.id} value={entry.category.id}>
                {entry.category.name}
              </option>
            ))}
          </SelectInput>

          <SelectInput
            className={styles.selectInput}
            value={filters.warehouseId ?? ''}
            onChange={(event) => setFilters({ warehouseId: event.target.value || undefined })}
            aria-label={t('list.filterWarehouseAria')}
          >
            <option value="">{t('list.allWarehouses')}</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </SelectInput>

          <SelectInput
            className={styles.selectInput}
            value={filters.status ?? ''}
            onChange={(event) =>
              setFilters({ status: (event.target.value || undefined) as ProductStatus | undefined })
            }
            aria-label={t('list.filterStatusAria')}
          >
            <option value="">{t('list.allStatuses')}</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {statusLabel.product(status)}
              </option>
            ))}
          </SelectInput>

          {facets.brands.length > 0 && (
            <SelectInput
              className={styles.selectInput}
              value={filters.brand ?? ''}
              onChange={(event) => setFilters({ brand: event.target.value || undefined })}
              aria-label={t('list.filterBrandAria')}
            >
              <option value="">{t('list.allBrands')}</option>
              {facets.brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </SelectInput>
          )}

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" icon={<X size={15} />} onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Tag chips act as a second filter axis; toggling one narrows the list. */}
      {facets.tags.length > 0 && (
        <div className={styles.tagFilterBar}>
          {facets.tags.map((tag) => {
            const active = filters.tags?.includes(tag) ?? false;
            return (
              <button
                key={tag}
                type="button"
                className={[styles.tagChip, active ? styles.tagChipActive : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={active}
                onClick={() => {
                  const current = filters.tags ?? [];
                  const next = active
                    ? current.filter((item) => item !== tag)
                    : [...current, tag];
                  setFilters({ tags: next.length > 0 ? next : undefined });
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* A persistent bar rather than a floating one: it pushes the table down
          instead of covering the rows the selection refers to. */}
      {selectedIds.length > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>
            {selectedIds.length} selected
          </span>
          <div className={styles.bulkActions}>
            <Button
              variant="outline"
              size="sm"
              icon={<Archive size={15} />}
              onClick={() => setBulkConfirm('archive')}
              disabled={isBulkPending}
            >
              Archive
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<ArchiveRestore size={15} />}
              onClick={() => setBulkConfirm('unarchive')}
              disabled={isBulkPending}
            >
              Restore
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={15} />}
              onClick={() => setBulkConfirm('delete')}
              disabled={isBulkPending}
            >
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className={styles.errorBanner} role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      <div className={styles.content}>
        <InventoryTable
          products={products}
          isLoading={isLoading}
          isFiltered={hasActiveFilters}
          sort={{
            field: filters.sortBy ?? 'name',
            direction: filters.sortDirection ?? 'asc',
            onSort: (field) => toggleSort(field as NonNullable<typeof filters.sortBy>),
          }}
          selection={{ selectedIds, onChange: setSelectedIds }}
          onEdit={(product) => navigate(`/${tenantSlug}/inventory/${product.id}/edit`)}
          onAdjustStock={setAdjustTarget}
          onToggleArchive={handleToggleArchive}
          onDelete={setDeleteTarget}
          emptyAction={
            !hasActiveFilters ? (
              <Button
                variant="primary"
                icon={<PlusSquare size={18} />}
                onClick={() => navigate(`/${tenantSlug}/inventory/new`)}
              >
                Add your first product
              </Button>
            ) : (
              <Button variant="outline" onClick={clearFilters}>
                {t('list.clearFilters')}
              </Button>
            )
          }
        />

        {total > 0 && (
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            total={total}
            itemLabel="products"
            onPageChange={goToPage}
            onPageSizeChange={(size) => setFilters({ pageSize: size })}
          />
        )}
      </div>

      {adjustTarget && (
        <StockAdjustmentPanel
          isOpen
          onClose={() => {
            setAdjustTarget(null);
            void refetch();
          }}
          productId={adjustTarget.id}
          productName={adjustTarget.name}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete this product?"
        confirmLabel="Delete permanently"
        cancelLabel="Keep product"
        message={
          <>
            <strong>{deleteTarget?.name}</strong> and its images, stock levels and movement history
            will be permanently removed. This cannot be undone.
          </>
        }
      />

      <ConfirmDialog
        isOpen={Boolean(bulkConfirm)}
        onClose={() => setBulkConfirm(null)}
        onConfirm={() => runBulk(bulkConfirm!)}
        tone={bulkConfirm === 'delete' ? 'danger' : 'primary'}
        title={bulkConfirm ? bulkCopy[bulkConfirm].title : ''}
        confirmLabel={bulkConfirm ? bulkCopy[bulkConfirm].confirm : ''}
        message={bulkConfirm ? bulkCopy[bulkConfirm].message : ''}
      />
    </div>
  );
};

export const InventoryList: React.FC = () => {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { user } = useAuthStore();
  const { logout } = useLogout();
  const location = useLocation();
  const navItems = useNavigation(user, location.pathname);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userName = getUserDisplayName(user, 'Business Owner');

  return (
    <AppLayout
      userName={userName}
      onLogout={handleLogout}
      onSettingsClick={() => navigate(`/${tenantSlug}/settings/profile`)}
      sidebar={
        <Sidebar
          navItems={navItems}
          onLogoutClick={handleLogout}
          onNavItemClick={(id) => navigate(`/${tenantSlug || ''}/${id === 'dashboard' ? '' : id}`)}
        />
      }
    >
      <InventoryListContent />
    </AppLayout>
  );
};

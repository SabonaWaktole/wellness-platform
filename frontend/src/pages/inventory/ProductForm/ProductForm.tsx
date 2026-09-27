import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, DollarSign, Info, Trash2 } from 'lucide-react';

import { TextInput } from '../../../components/ui/TextInput/TextInput';
import { TextareaInput } from '../../../components/ui/TextareaInput/TextareaInput';
import { SelectInput } from '../../../components/ui/SelectInput/SelectInput';
import { Button } from '../../../components/ui/Button/Button';
import { Badge } from '../../../components/ui/Badge';
import { TagInput } from '../../../components/ui/TagInput';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/Toast';
import { useMoneyFormat } from '../../../hooks/useMoneyFormat';
import { ProductImageManager } from '../../../components/inventory/ProductImageManager';
import { WarehouseStockAllocation } from '../../../components/inventory/WarehouseStockAllocation/WarehouseStockAllocation';
import { AppLayout } from '../../../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../../../components/layout/Sidebar/Sidebar';

import {
  useCreateProduct,
  useDeleteProduct,
  useProduct,
  useProductFacets,
  useUpdateProduct,
} from '../../../hooks/useInventory';
import { useProductImages } from '../../../hooks/useProductImages';
import { useCategories } from '../../../hooks/useCategories';
import { useWarehouses } from '../../../hooks/useWarehouses';
import { useAuthStore } from '../../../store/useAuthStore';
import { useLogout } from '../../../hooks/useLogout';
import { useNavigation } from '../../../hooks/useNavigation';
import { useStatusLabel } from '../../../hooks/useStatusLabel';
import type { ProductStatus } from '../../../types/inventory';

import styles from './ProductForm.module.css';
import { useDateFormat } from '../../../hooks/useDateFormat';
import { getUserDisplayName } from '../../../utils/userUtils';

interface FormState {
  name: string;
  sku: string;
  brand: string;
  description: string;
  categoryId: string;
  price: string;
  cost: string;
  lowStockThreshold: string;
  tags: string[];
}

const EMPTY_FORM: FormState = {
  name: '',
  sku: '',
  brand: '',
  description: '',
  categoryId: '',
  price: '',
  cost: '',
  lowStockThreshold: '10',
  tags: [],
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const STATUS_VARIANT: Record<ProductStatus, 'success' | 'warning' | 'error' | 'secondary'> = {
  IN_STOCK: 'success',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'error',
  ARCHIVED: 'secondary',
};

/**
 * Validates the whole form at once rather than field-by-field on every
 * keystroke, so a half-typed price is not flagged as an error mid-entry.
 */
const validate = (form: FormState): FieldErrors => {
  const errors: FieldErrors = {};

  if (!form.name.trim()) errors.name = 'A product name is required.';
  else if (form.name.trim().length > 200) errors.name = 'Keep the name under 200 characters.';

  if (form.sku && !/^[A-Za-z0-9._\-/ ]+$/.test(form.sku)) {
    errors.sku = 'Use only letters, numbers and - _ . /';
  } else if (form.sku.length > 64) {
    errors.sku = 'Keep the SKU under 64 characters.';
  }

  const price = Number(form.price);
  if (form.price.trim() === '') errors.price = 'A price is required.';
  else if (!Number.isFinite(price)) errors.price = 'Enter a valid number.';
  else if (price < 0) errors.price = 'Price cannot be negative.';

  if (form.cost.trim() !== '') {
    const cost = Number(form.cost);
    if (!Number.isFinite(cost)) errors.cost = 'Enter a valid number.';
    else if (cost < 0) errors.cost = 'Cost cannot be negative.';
  }

  if (form.lowStockThreshold.trim() !== '') {
    const threshold = Number(form.lowStockThreshold);
    if (!Number.isInteger(threshold)) errors.lowStockThreshold = 'Enter a whole number.';
    else if (threshold < 0) errors.lowStockThreshold = 'Cannot be negative.';
  }

  return errors;
};

const ProductFormContent: React.FC = () => {
  const dates = useDateFormat();
  const { t } = useTranslation('inventory');
  const { format: formatMoney } = useMoneyFormat();
  const statusLabel = useStatusLabel();
  const navigate = useNavigate();
  const toast = useToast();
  const { tenantSlug, productId } = useParams();
  const isEdit = Boolean(productId);

  const { product, isLoading, error: loadError, refetch } = useProduct(productId);
  const { categories, fetchCategories } = useCategories();
  const { warehouses, fetchWarehouses } = useWarehouses();
  const { facets } = useProductFacets();

  const { createProduct, isPending: isCreating } = useCreateProduct();
  const { updateProduct, isPending: isUpdating } = useUpdateProduct();
  const { deleteProduct } = useDeleteProduct();

  const gallery = useProductImages(productId ?? null, product?.images ?? []);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isDirty, setIsDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [allocationRows, setAllocationRows] = useState<
    { id: string; warehouseId: string; quantity: number }[]
  >([]);

  useEffect(() => {
    fetchCategories();
    fetchWarehouses();
  }, [fetchCategories, fetchWarehouses]);

  // Populate the form once the product arrives. Keyed on the product id so a
  // background refetch cannot clobber edits already in progress.
  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name,
      sku: product.sku ?? '',
      brand: product.brand ?? '',
      description: product.description ?? '',
      categoryId: product.categoryId ?? '',
      price: String(product.price),
      cost: product.cost === null ? '' : String(product.cost),
      lowStockThreshold: String(product.lowStockThreshold),
      tags: product.tags,
    });
    gallery.reset(product.images);
    setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  // Warn before a reload or tab close discards unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setIsDirty(true);
    // Clear a field's error as soon as it is touched; re-validated on submit.
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const margin = useMemo(() => {
    const price = Number(form.price);
    const cost = Number(form.cost);
    if (!Number.isFinite(price) || !Number.isFinite(cost) || !form.cost.trim() || price <= 0) {
      return null;
    }
    return ((price - cost) / price) * 100;
  }, [form.price, form.cost]);

  const buildPayload = () => ({
    name: form.name.trim(),
    description: form.description.trim(),
    sku: form.sku.trim() || null,
    brand: form.brand.trim() || null,
    categoryId: form.categoryId || null,
    price: Number(form.price),
    cost: form.cost.trim() === '' ? null : Number(form.cost),
    tags: form.tags,
    lowStockThreshold:
      form.lowStockThreshold.trim() === '' ? undefined : Number(form.lowStockThreshold),
  });

  const handleSave = async () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error('Fix the highlighted fields before saving.');
      return;
    }

    try {
      if (isEdit && productId) {
        await updateProduct(productId, buildPayload());
        setIsDirty(false);
        toast.success(`"${form.name.trim()}" was saved.`);
        await refetch();
        return;
      }

      const initialStock = allocationRows
        .filter((row) => row.warehouseId && row.quantity > 0)
        .map((row) => ({ warehouseId: row.warehouseId, quantity: Number(row.quantity) }));

      const created = await createProduct({ ...buildPayload(), initialStock });

      // The product had no id until now, so any images picked during creation
      // were held locally; attach them before leaving the page.
      if (gallery.hasStaged) {
        try {
          await gallery.flushTo(created.id);
        } catch {
          toast.warning(
            `"${created.name}" was created, but its images could not be uploaded. Add them from the edit page.`
          );
          navigate(`/${tenantSlug}/inventory/${created.id}/edit`);
          return;
        }
      }

      setIsDirty(false);
      toast.success(`"${created.name}" was added to your inventory.`);
      navigate(`/${tenantSlug}/inventory`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Could not save this product.');
    }
  };

  const handleToggleArchive = async () => {
    if (!productId || !product) return;
    const next = !product.isArchived;
    try {
      await updateProduct(productId, { isArchived: next });
      toast.success(next ? `"${product.name}" was archived.` : `"${product.name}" was restored.`);
      await refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Could not change the archive state.');
    }
  };

  const handleDelete = async () => {
    if (!productId || !product) return;
    try {
      await deleteProduct(productId);
      toast.success(`"${product.name}" was deleted.`);
      navigate(`/${tenantSlug}/inventory`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Could not delete this product.');
      throw err;
    }
  };

  const handleDiscard = () => {
    if (isDirty && !window.confirm('Discard your unsaved changes?')) return;
    navigate(`/${tenantSlug}/inventory`);
  };

  // ---- Initial stock rows (create only) -----------------------------------

  const handleAddRow = () =>
    setAllocationRows((rows) => [
      ...rows,
      { id: `row-${Date.now()}`, warehouseId: '', quantity: 0 },
    ]);

  const handleChangeRow = (id: string, field: 'warehouseId' | 'quantity', value: any) => {
    setAllocationRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
    setIsDirty(true);
  };

  const handleRemoveRow = (id: string) =>
    setAllocationRows((rows) => rows.filter((row) => row.id !== id));

  // ---- Render -------------------------------------------------------------

  const isSaving = isCreating || isUpdating;

  if (isEdit && isLoading) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.centeredState}>{t('form.loading')}</div>
      </div>
    );
  }

  if (isEdit && loadError) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.centeredState}>
          <p>{loadError}</p>
          <Button variant="outline" onClick={() => navigate(`/${tenantSlug}/inventory`)}>
            {t('form.backToInventory')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <div className={styles.breadcrumb}>
          <button
            type="button"
            className={styles.breadcrumbLink}
            onClick={() => navigate(`/${tenantSlug}/inventory`)}
          >
            {t('form.breadcrumbInventory')}
          </button>
          <span className={styles.breadcrumbSeparator}>/</span>
          <span className={styles.breadcrumbActive}>
            {isEdit ? product?.name ?? t('form.editProduct') : t('form.addProduct')}
          </span>
        </div>

        {isEdit && product && (
          <Badge variant={STATUS_VARIANT[product.status]}>
            {statusLabel.product(product.status)}
          </Badge>
        )}
      </header>

      <div className={styles.scrollArea}>
        <div className={styles.contentWrapper}>
          <div className={styles.gridContainer}>
            {/* ---- Left column ---- */}
            <div className={styles.leftCol}>
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>{t('form.productInformation')}</h2>

                <TextInput
                  label={t('form.nameLabel')}
                  placeholder={t('form.namePlaceholder')}
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  error={errors.name}
                  required
                />

                <div className={styles.twoColGrid}>
                  <TextInput
                    label="SKU"
                    placeholder="e.g. CHR-ERG-001"
                    value={form.sku}
                    onChange={(e) => setField('sku', e.target.value)}
                    error={errors.sku}
                    helperText={t('form.skuHelper')}
                  />
                  <TextInput
                    label="Brand"
                    placeholder="e.g. Herman Miller"
                    value={form.brand}
                    onChange={(e) => setField('brand', e.target.value)}
                    list="product-brand-suggestions"
                  />
                  <datalist id="product-brand-suggestions">
                    {facets.brands.map((brand) => (
                      <option key={brand} value={brand} />
                    ))}
                  </datalist>
                </div>

                <TextareaInput
                  label="Description"
                  placeholder="Enter detailed product description…"
                  rows={4}
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                />

                <SelectInput
                  label={t('form.categoryLabel')}
                  value={form.categoryId}
                  onChange={(e) => setField('categoryId', e.target.value)}
                >
                  <option value="">{t('form.uncategorised')}</option>
                  {categories.map((entry) => (
                    <option key={entry.category.id} value={entry.category.id}>
                      {entry.category.name}
                    </option>
                  ))}
                </SelectInput>

                <TagInput
                  label="Tags"
                  value={form.tags}
                  onChange={(tags) => setField('tags', tags)}
                  suggestions={facets.tags}
                  helperText={t('form.tagsHelper')}
                />
              </section>

              <section className={styles.card}>
                <h2 className={styles.cardTitle}>{t('form.pricingAndStock')}</h2>

                <div className={styles.threeColGrid}>
                  <TextInput
                    label={t('form.priceLabel')}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    iconLeft={<DollarSign size={16} />}
                    value={form.price}
                    onChange={(e) => setField('price', e.target.value)}
                    error={errors.price}
                    required
                  />
                  <TextInput
                    label="Unit Cost"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    iconLeft={<DollarSign size={16} />}
                    value={form.cost}
                    onChange={(e) => setField('cost', e.target.value)}
                    error={errors.cost}
                    helperText={t('form.costHelper')}
                  />
                  <TextInput
                    label="Low Stock Threshold"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={form.lowStockThreshold}
                    onChange={(e) => setField('lowStockThreshold', e.target.value)}
                    error={errors.lowStockThreshold}
                    helperText={t('form.thresholdHelper')}
                  />
                </div>

                {margin !== null && (
                  <p className={styles.marginNote}>
                    Margin: <strong>{margin.toFixed(1)}%</strong> (
                    {formatMoney(Number(form.price) - Number(form.cost))} per unit)
                  </p>
                )}
              </section>

              {/* Initial stock only makes sense before the product exists; once
                  it does, stock moves through adjustments and transfers so the
                  movement history stays truthful. */}
              {!isEdit && (
                <WarehouseStockAllocation
                  rows={allocationRows}
                  availableWarehouses={warehouses}
                  onAddRow={handleAddRow}
                  onChangeRow={handleChangeRow}
                  onRemoveRow={handleRemoveRow}
                />
              )}
            </div>

            {/* ---- Right column ---- */}
            <div className={styles.rightCol}>
              <ProductImageManager
                gallery={gallery}
                disabled={isSaving}
                onRejected={(reasons) => reasons.forEach((reason) => toast.error(reason))}
              />

              {isEdit && product && (
                <>
                  <section className={styles.card}>
                    <h2 className={styles.cardTitle}>{t('form.stockOnHand')}</h2>
                    {product.stockBreakdown.length === 0 ? (
                      <p className={styles.emptyNote}>
                        No stock recorded. Use Adjust Stock from the inventory list to add some.
                      </p>
                    ) : (
                      <div className={styles.metadataList}>
                        {product.stockBreakdown.map((entry) => (
                          <div key={entry.warehouseId} className={styles.metadataItem}>
                            <span className={styles.metadataLabel}>{entry.warehouseName}</span>
                            <span className={styles.metadataValue}>{entry.quantity}</span>
                          </div>
                        ))}
                        <div className={styles.metadataItem}>
                          <span className={styles.metadataLabel}>{t('form.total')}</span>
                          <span className={styles.metadataValue}>{product.totalUnits}</span>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className={styles.card}>
                    <h2 className={styles.cardTitle}>{t('form.details')}</h2>
                    <div className={styles.metadataList}>
                      <div className={styles.metadataItem}>
                        <span className={styles.metadataLabel}>{t('form.created')}</span>
                        <span className={styles.metadataValue}>
                          {dates.date(product.createdAt)}
                        </span>
                      </div>
                      <div className={styles.metadataItem}>
                        <span className={styles.metadataLabel}>{t('form.lastEdited')}</span>
                        <span className={styles.metadataValue}>
                          {dates.date(product.updatedAt)}
                        </span>
                      </div>
                      <div className={styles.metadataItem}>
                        <span className={styles.metadataLabel}>{t('form.inventoryValue')}</span>
                        <span className={styles.metadataValue}>
                          {formatMoney(product.price * product.totalUnits)}
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className={styles.card}>
                    <h2 className={styles.cardTitle}>{t('form.dangerZone')}</h2>
                    <p className={styles.emptyNote}>
                      Archiving hides the product from the catalogue but keeps its history.
                      Deleting is permanent and only possible if no quotation references it.
                    </p>
                    <div className={styles.dangerActions}>
                      <Button
                        variant="outline"
                        type="button"
                        fullWidth
                        icon={
                          product.isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />
                        }
                        onClick={handleToggleArchive}
                        disabled={isSaving}
                      >
                        {product.isArchived ? t('form.restoreProduct') : t('form.archiveProduct')}
                      </Button>
                      <Button
                        variant="danger"
                        type="button"
                        fullWidth
                        icon={<Trash2 size={16} />}
                        onClick={() => setConfirmDelete(true)}
                        disabled={isSaving}
                      >
                        {t('form.deleteProduct')}
                      </Button>
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <Info size={16} className={styles.infoIcon} />
          <span className={styles.infoText}>
            {isEdit
              ? isDirty
                ? t('form.unsavedChanges')
                : t('form.allSaved')
              : t('form.nothingSaved')}
          </span>
        </div>
        <div className={styles.footerRight}>
          <Button variant="ghost" type="button" onClick={handleDiscard} disabled={isSaving}>
            {isEdit ? t('form.close') : t('form.discard')}
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleSave}
            isLoading={isSaving}
            disabled={gallery.isUploading}
          >
            {isEdit ? t('form.saveChanges') : t('form.commitProduct')}
          </Button>
        </div>
      </footer>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title={t('form.deleteTitle')}
        confirmLabel={t('form.deleteConfirm')}
        cancelLabel={t('form.keepProduct')}
        message={
          <>
            <strong>{product?.name}</strong> and its images, stock levels and movement history will
            be permanently removed. This cannot be undone.
          </>
        }
      />
    </div>
  );
};

export const ProductForm: React.FC = () => {
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
      <ProductFormContent />
    </AppLayout>
  );
};

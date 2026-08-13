import React from 'react';
import { Plus, Settings, FileText, Activity, AlertTriangle, Edit2, Trash2, ChevronRight, MoreVertical } from 'lucide-react';
import styles from './CategoryList.module.css';

interface CategoryRowData {
  id: string;
  name: string;
  description?: string;
  isArchived?: boolean;
  itemCount: number;
  iconType: 'hardware' | 'description' | 'manufacturing' | 'security';
}

import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, useArchiveCategories } from '../../../hooks/useCategories';
import { CategoryFormModal, type CategoryFormData } from '../../../components/inventory/CategoryFormModal/CategoryFormModal';
import { DeleteCategoryModal } from '../../../components/inventory/DeleteCategoryModal/DeleteCategoryModal';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '../../../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../../../components/layout/Sidebar/Sidebar';
import { SettingsLayout } from '../../../components/layout/SettingsLayout/SettingsLayout';
import { useAuthStore } from '../../../store/useAuthStore';
import { useLogout } from '../../../hooks/useLogout';
import { useNavigation } from '../../../hooks/useNavigation';
import { getUserDisplayName } from '../../../utils/userUtils';

const CategoryListContent: React.FC = () => {
  const { t } = useTranslation('inventory');
  const [showArchived, setShowArchived] = React.useState(false);
  const { categories: realCategories, fetchCategories } = useCategories(showArchived);
  const { createCategory } = useCreateCategory();
  const { updateCategory } = useUpdateCategory();
  const { deleteCategory } = useDeleteCategory();
  const {
    cleanupCategories,
    fetchCleanupCandidates,
    candidates: cleanupCandidates,
    isPending: isCleaningUp,
  } = useArchiveCategories();

  const { user } = useAuthStore();
  const isBusinessOwner = user?.role === 'BUSINESS_OWNER';

  React.useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  React.useEffect(() => {
    if (isBusinessOwner) {
      fetchCleanupCandidates();
    }
  }, [isBusinessOwner, fetchCleanupCandidates]);

  const handleRunCleanup = async () => {
    // Names the categories rather than just counting them. This action archives
    // real data, and the previous version asked for confirmation of nothing at
    // all while displaying a fabricated count. TD-027.
    const names = cleanupCandidates.map((c) => c.name).join(', ');
    if (!window.confirm(t('categories.confirmCleanup', { names }))) return;
    try {
      const result = await cleanupCategories();
      await fetchCategories();
      await fetchCleanupCandidates();
      window.alert(t('categories.cleanupDone', { count: result?.count ?? 0 }));
    } catch {
      window.alert(t('categories.cleanupFailed'));
    }
  };

  const [isFormModalOpen, setIsFormModalOpen] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<CategoryRowData | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
  const [deletingCategory, setDeletingCategory] = React.useState<CategoryRowData | null>(null);

  const handleOpenAdd = () => {
    setEditingCategory(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (cat: CategoryRowData) => {
    setEditingCategory(cat);
    setIsFormModalOpen(true);
  };

  const handleSaveForm = async (data: CategoryFormData) => {
    if (editingCategory) {
      await updateCategory(editingCategory.id, data);
    } else {
      await createCategory(data);
    }
    await fetchCategories();
    setIsFormModalOpen(false);
  };

  const handleOpenDelete = (cat: CategoryRowData) => {
    setDeletingCategory(cat);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deletingCategory) {
      await deleteCategory(deletingCategory.id);
      await fetchCategories();
      setIsDeleteModalOpen(false);
    }
  };

  // Item counts are real; only the icons are decorative. useMemo prevents them
  // from changing on re-renders.
  const categories = React.useMemo(() => {
    return realCategories.map((c, i) => ({
      id: c.category.id,
      name: c.category.name,
      description: c.category.description || undefined,
      isArchived: c.category.isArchived,
      itemCount: c.itemCount,
      iconType: ['hardware', 'description', 'manufacturing', 'security'][i % 4] as CategoryRowData['iconType']
    }));
  }, [realCategories]);

  // The unused-category count deliberately does NOT come from itemCount here.
  // "Unused" also requires no historical quotation reference, which only the
  // server can answer — see fetchCleanupCandidates and TD-027.

  const getIcon = (type: CategoryRowData['iconType']) => {
    switch (type) {
      case 'hardware': return <Hardware className={styles.iconPrimary} />;
      case 'description': return <Description className={styles.iconTertiary} />;
      case 'manufacturing': return <PrecisionManufacturing className={styles.iconSecondary} />;
      case 'security': return <Security className={styles.iconPrimaryFixed} />;
    }
  };

  return (
    <div className={styles.pageContainer}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.breadcrumbs}>
          <span>{t('categories.breadcrumbSettings')}</span>
          <ChevronRight size={16} />
          <span>{t('categories.breadcrumbInventory')}</span>
          <ChevronRight size={16} />
          <span className={styles.breadcrumbActive}>{t('categories.title')}</span>
        </div>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.pageTitle}>{t('categories.title')}</h1>
            <p className={styles.pageSubtitle}>{t('categories.subtitle')}</p>
          </div>
          {isBusinessOwner && (
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--color-on-surface-variant)' }}>
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                {t('categories.showArchived')}
              </label>
              <button className={styles.primaryButton} onClick={handleOpenAdd}>
                <Plus size={20} />
                {t('categories.newCategory')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/*
        The "Inventory Config" panel that used to sit to the left is gone, and
        with it the third level of navigation. Every entry in it was already
        reachable one level up in the settings nav — General Defaults was
        Company, Warehouse Zones was Warehouses — Category Labels was a link to
        the page it was already on, and Tax Configurations only ever raised a
        "coming soon" alert. Opening Categories now lands directly on the list.
      */}
      <div className={styles.grid}>
        {/* Main List Area */}
        <div className={styles.mainContent}>
          <div className={styles.listContainer}>
            <div className={styles.listHeader}>
              <div className={styles.colName}>{t('categories.columnName')}</div>
              <div className={styles.colItems}>{t('categories.columnItemCount')}</div>
              {isBusinessOwner && <div className={styles.colActions}>{t('categories.columnActions')}</div>}
            </div>

            <div className={styles.listBody}>
              {categories.map(cat => (
                <div key={cat.id} className={styles.row}>
                  <div className={styles.colName}>
                    <div className={styles.catIconWrap}>
                      {getIcon(cat.iconType)}
                    </div>
                    <div>
                      <div className={styles.catName}>
                        {cat.name} {cat.isArchived && <span style={{ fontSize: '12px', padding: '2px 6px', background: '#e0e0e0', borderRadius: '4px', marginLeft: '8px' }}>{t('categories.archivedBadge')}</span>}
                      </div>
                      <div className={styles.catId}>{t('categories.keyId', { id: cat.id })}</div>
                    </div>
                  </div>
                  <div className={styles.colItems}>
                    <div className={styles.itemCountWrap}>
                      <div className={`${styles.dot} ${styles[`dot-${cat.iconType}`]}`} />
                      <span>{t('categories.items', { count: cat.itemCount })}</span>
                    </div>
                  </div>
                  {isBusinessOwner && (
                    <div className={styles.colActions}>
                      <button className={styles.actionBtn} title={t('categories.edit')} onClick={() => handleOpenEdit(cat)}>
                        <Edit2 size={18} />
                      </button>
                      <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} title={t('categories.delete')} onClick={() => handleOpenDelete(cat)}>
                        <Trash2 size={18} />
                      </button>
                      <button className={styles.actionBtn} disabled title={t('categories.moreSoon')}>
                        <MoreVertical size={18} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/*
            REMOVED: a "Hierarchy Health" widget reporting 14 root categories
            and 82 sub-categories over fixed 65%/88% bars. Categories have no
            `parentId` — there is no hierarchy in the data model at all — so
            the widget described a structure that does not exist and could not
            be wired without a schema change. TD-020.
          */}
          <div className={styles.widgetsGrid}>
            <div className={`${styles.widgetCard} ${styles.widgetCardHigh}`}>
              <h3 className={styles.widgetTitle}>{t('categories.quickAudit')}</h3>
              <div className={styles.auditAlert}>
                <div className={styles.auditIconWrap}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  {/*
                    Was a hard-coded 3. This is the server's own answer now,
                    from the very same query the button acts on — the two used
                    to be computed independently, which is how a fabricated
                    number came to label a real destructive action. TD-027.
                  */}
                  <div className={styles.auditMain}>
                    {t('categories.unusedCategories', { count: cleanupCandidates.length })}
                  </div>
                  <div className={styles.auditSub}>{t('categories.unusedHint')}</div>
                </div>
              </div>
              <button
                className={styles.auditBtn}
                onClick={handleRunCleanup}
                disabled={isCleaningUp || cleanupCandidates.length === 0}
              >
                {isCleaningUp ? t('categories.cleaningUp') : t('categories.runCleanup')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <CategoryFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSave={handleSaveForm}
        initialData={editingCategory ? { name: editingCategory.name, description: editingCategory.description || '' } : null}
      />

      {deletingCategory && (
        <DeleteCategoryModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
          categoryName={deletingCategory.name}
        />
      )}
    </div>
  );
};

// Simple icon mocks
function Hardware(props: any) { return <Settings {...props} />; }
function Description(props: any) { return <FileText {...props} />; }
function PrecisionManufacturing(props: any) { return <Activity {...props} />; }
function Security(props: any) { return <AlertTriangle {...props} />; }

/**
 * Wrapped in `AppLayout` + `Sidebar`, matching every other settings page
 * (WarehouseList, NotificationSettingsPage, AccountSettingsPage).
 *
 * It previously rendered `SettingsLayout` alone, which dropped the main
 * workspace navigation the moment Categories was opened — the settings
 * sub-navigation replaced the app shell instead of sitting inside it, leaving
 * no way back to Dashboard, Clients or anything else without the browser's
 * back button. `SettingsLayout` is the SECONDARY nav; it was never meant to be
 * the outermost element.
 */
export const CategoryList: React.FC = () => {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const { user } = useAuthStore();
  const { logout } = useLogout();
  // The same path the other settings pages pass, so "Settings" is the item
  // highlighted in the main sidebar rather than Products & Stock.
  const navItems = useNavigation(user, `/${tenantSlug}/settings`);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <AppLayout
      userName={getUserDisplayName(user, 'Settings User')}
      onLogout={handleLogout}
      onSettingsClick={() => navigate(`/${tenantSlug}/settings/profile`)}
      sidebar={
        <Sidebar
          orgName={tenantSlug || 'Workspace'}
          orgTier={user?.role ?? ''}
          navItems={navItems}
          onNavItemClick={(id) => navigate(`/${tenantSlug}/${id === 'dashboard' ? '' : id}`)}
          onLogoutClick={handleLogout}
        />
      }
    >
      <SettingsLayout activeNavId="settings/categories">
        <CategoryListContent />
      </SettingsLayout>
    </AppLayout>
  );
};

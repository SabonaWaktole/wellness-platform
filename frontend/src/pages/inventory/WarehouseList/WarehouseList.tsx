import React, { useState } from 'react';
import { Plus, Warehouse, Package, Truck } from 'lucide-react';
import { KPICard } from '../../../components/ui/KPICard';
import { WarehouseTable } from '../../../components/inventory/WarehouseTable/WarehouseTable';
import type { WarehouseRowData } from '../../../components/inventory/WarehouseTable/WarehouseTable';
import { WarehouseFormModal } from '../../../components/inventory/WarehouseFormModal/WarehouseFormModal';
import type { WarehouseFormData } from '../../../components/inventory/WarehouseFormModal/WarehouseFormModal';
import { DeleteWarehouseModal } from '../../../components/inventory/DeleteWarehouseModal/DeleteWarehouseModal';
import styles from './WarehouseList.module.css';

import { useWarehouses, useCreateWarehouse, useUpdateWarehouse, useDeleteWarehouse } from '../../../hooks/useWarehouses';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '../../../components/layout/AppLayout/AppLayout';
import { Sidebar } from '../../../components/layout/Sidebar/Sidebar';
import { SettingsLayout } from '../../../components/layout/SettingsLayout/SettingsLayout';
import { ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../../store/useAuthStore';
import { useLogout } from '../../../hooks/useLogout';
import { usePermissionScope } from '../../../hooks/usePermission';
import { useNavigation } from '../../../hooks/useNavigation';
import { getUserDisplayName } from '../../../utils/userUtils';

const WarehouseListContent: React.FC = () => {
  const { t } = useTranslation('inventory');
  const { warehouses, fetchWarehouses } = useWarehouses();
  const { createWarehouse } = useCreateWarehouse();
  const { updateWarehouse } = useUpdateWarehouse();
  const { deleteWarehouse } = useDeleteWarehouse();

  React.useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseRowData | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingWarehouse, setDeletingWarehouse] = useState<WarehouseRowData | null>(null);

  const handleOpenAdd = () => {
    setEditingWarehouse(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (wh: WarehouseRowData) => {
    setEditingWarehouse(wh);
    setIsFormModalOpen(true);
  };

  const handleSaveForm = async (data: WarehouseFormData) => {
    if (editingWarehouse) {
      await updateWarehouse(editingWarehouse.id, data);
    } else {
      await createWarehouse(data);
    }
    await fetchWarehouses();
    setIsFormModalOpen(false);
  };

  const handleOpenDelete = (wh: WarehouseRowData) => {
    setDeletingWarehouse(wh);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deletingWarehouse) {
      await deleteWarehouse(deletingWarehouse.id);
      await fetchWarehouses();
      setIsDeleteModalOpen(false);
    }
  };

  // Map backend Warehouse[] (address: string | null | undefined) to WarehouseRowData[] (address: string | null)
  const warehouseRows: WarehouseRowData[] = warehouses.map(w => ({
    id: w.id,
    name: w.name,
    address: w.address ?? null,
  }));

  // Creating/editing a warehouse needs inventory.manage at ALL, not merely a
  // grant — Sales User holds it at OWN (their own warehouse), which reads
  // products but not this management screen (FR-RBAC-07).
  const isBusinessOwner = usePermissionScope('inventory.manage') === 'ALL';

  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.pageTitle}>{t('warehouses.title')}</h2>
          <p className={styles.pageSubtitle}>{t('warehouses.subtitle')}</p>
        </div>
        {isBusinessOwner && (
          <button className={styles.addButton} onClick={handleOpenAdd}>
            <Plus size={20} />
            {t('warehouses.addButton')}
          </button>
        )}
      </header>

      {/* MOCK DATA - Backend currently only supports Warehouse entities, not capacity/traffic KPIs */}
      <div className={styles.kpiGrid}>
        <KPICard
          title={t('warehouses.totalActive')}
          value={warehouses.length.toString()}
          icon={<Warehouse />}
          trendValue="0%"
          trendDirection="up"
        />
        <KPICard
          title={t('warehouses.capacityUsed')}
          value="84%"
          icon={<Package />}
          trendValue="2%"
          trendDirection="up"
        />
        <KPICard
          title={t('warehouses.hubTraffic')}
          value={t('warehouses.hubTrafficOptimal')}
          icon={<Truck />}
        />
      </div>

      <WarehouseTable 
        warehouses={warehouseRows}
        onEdit={handleOpenEdit}
        onDelete={handleOpenDelete}
        readOnly={!isBusinessOwner}
      />

      <WarehouseFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSave={handleSaveForm}
        initialData={editingWarehouse ? { name: editingWarehouse.name, address: editingWarehouse.address ?? '' } : null}
      />

      {deletingWarehouse && (
        <DeleteWarehouseModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
          warehouseName={deletingWarehouse.name}
        />
      )}
    </div>
  );
};

export const WarehouseList: React.FC = () => {
  const { t } = useTranslation('inventory');
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
      <SettingsLayout activeNavId="warehouses">
        <div style={{ maxWidth: '1024px', margin: '0 auto', width: '100%' }}>
          
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <nav aria-label="Breadcrumb" style={{ display: 'flex', alignItems: 'center', color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-size-label-sm)', marginBottom: 'var(--spacing-xs)' }}>
              <ol style={{ display: 'flex', alignItems: 'center', listStyle: 'none', padding: 0, margin: 0, gap: '8px' }}>
                <li><a href="#settings" onClick={(e) => { e.preventDefault(); navigate(`/${tenantSlug}/settings/profile`); }} style={{ color: 'inherit', textDecoration: 'none' }}>{t('warehouses.breadcrumbSettings')}</a></li>
                <li><ChevronRight size={14} /></li>
                <li aria-current="page" style={{ color: 'var(--color-on-surface)', fontWeight: 600 }}>{t('warehouses.breadcrumbCurrent')}</li>
              </ol>
            </nav>
          </div>

          <WarehouseListContent />

        </div>
      </SettingsLayout>
    </AppLayout>
  );
};

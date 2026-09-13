import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { 
  Plus, 
  Filter, 
  Search, 
  MoreVertical, 
  ChevronLeft,
  ChevronRight,
  Edit,
  Users,
  Trash2,
  RotateCcw,
  Archive,
} from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Badge } from '../../components/ui/Badge/Badge';
import { Avatar } from '../../components/ui/Avatar/Avatar';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { DropdownMenu } from '../../components/ui/DropdownMenu/DropdownMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ExcelImportButton } from '../../components/clients/ExcelImportButton';
import { clientService } from '../../services/clientService';
import styles from './ClientListContent.module.css';

import {
  useClients,
  useArchiveClient,
  useRestoreClient,
  useClientRelatedCounts,
} from '../../hooks/useClients';
import { useAuthStore } from '../../store/useAuthStore';
import type { Client } from '../../types/client';
import { useTeam } from '../../hooks/useTeam';
import { findPersonById, getStaffDisplayName, getStaffInitials } from '../../utils/userUtils';
import { useDebounce } from '../../hooks/useDebounce';
import { useStatusLabel } from '../../hooks/useStatusLabel';

export const ClientListContent: React.FC = () => {
  const { t } = useTranslation('clients');
  const statusLabel = useStatusLabel();
  const [searchTerm, setSearchTerm] = useState('');
  const { tenantSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  /*
   * `loadError` was previously destructured away and dropped. A search that
   * failed left the table rendering its ordinary "no clients yet" empty state,
   * so a broken request and an empty workspace looked identical — and the
   * page said "add your first client" to someone who already had hundreds.
   * Whatever goes wrong next, it says so.
   */
  const { clients, total, isLoading, error: loadError, fetchClients } = useClients();
  const { user } = useAuthStore();
  /* Archiving is Business-Owner-only on the backend (ArchiveClientUseCase).
   * Hiding the action for everyone else keeps the UI honest rather than
   * offering a button that always 403s — the backend stays the enforcement
   * point either way. */
  const canArchive = user?.role === 'BUSINESS_OWNER' || user?.role === 'SUPER_ADMIN';
  const { archiveClient } = useArchiveClient();
  const { restoreClient } = useRestoreClient();
  const { counts, fetchRelatedCounts } = useClientRelatedCounts();
  /** Which side of the soft-delete line the list is showing. */
  const [showArchived, setShowArchived] = useState(false);
  const [archivingClient, setArchivingClient] = useState<Client | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /*
   * The staff dashboard's "Log note" quick action has no client of its own, so
   * it sends the user here to pick one and passes the intent along in the URL.
   * We hand it on to the detail page, which opens its interaction slide-over on
   * the requested channel. Absent the param this is an ordinary client link.
   */
  const pendingInteraction = searchParams.get('logInteraction');
  const clientHref = (clientId: string) =>
    pendingInteraction
      ? `/${tenantSlug}/clients/${clientId}?logInteraction=${encodeURIComponent(pendingInteraction)}`
      : `/${tenantSlug}/clients/${clientId}`;
  // Only the staff list is needed here; fetchPendingInvitations is a
  // Business-Owner-only endpoint and is deliberately not called.
  const { staff, fetchStaff } = useTeam();
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    // One box, matched across name / email / phone — SRS §6.2.
    fetchClients({ search: debouncedSearchTerm, archived: showArchived });
  }, [fetchClients, debouncedSearchTerm, showArchived]);

  const refresh = () => fetchClients({ search: debouncedSearchTerm, archived: showArchived });

  /* Counts are fetched when the dialog opens rather than per row: the list
   * endpoint does not carry them, and four COUNT queries per row would be a
   * needless cost for a dialog most rows never open. */
  const openArchiveDialog = (client: Client) => {
    setActionError(null);
    setArchivingClient(client);
    fetchRelatedCounts(client.id);
  };

  const handleArchive = async () => {
    if (!archivingClient) return;
    try {
      await archiveClient(archivingClient.id);
      setArchivingClient(null);
      refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.error ?? t('list.archiveFailed'));
    }
  };

  const handleRestore = async (client: Client) => {
    setActionError(null);
    try {
      await restoreClient(client.id);
      refresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.error ?? t('list.restoreFailed'));
    }
  };

  /** Spells out what archiving keeps, so "delete" is not read as "destroy". */
  const archiveMessage = () => {
    if (!counts) return t('list.archiveConfirmGeneric', { name: archivingClient?.name ?? '' });
    const kept = counts.interactions + counts.appointments + counts.quotations + counts.invoices;
    if (kept === 0) {
      return t('list.archiveConfirmNoRecords', { name: archivingClient?.name ?? '' });
    }
    return t('list.archiveConfirmWithRecords', {
      name: archivingClient?.name ?? '',
      invoices: counts.invoices,
      quotations: counts.quotations,
      appointments: counts.appointments,
      interactions: counts.interactions,
    });
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'primary';
      case 'prospect': return 'outline';
      case 'inactive': return 'secondary';
      default: return 'secondary';
    }
  };


  type ClientRow = (typeof clients)[number];

  const columns: DataTableColumn<ClientRow>[] = [
    {
      id: 'client',
      header: t('list.columnClient'),
      cardLabel: null,
      render: (client) => (
        <div className={styles.clientCell}>
          <Avatar
            src={undefined}
            fallback={(client.name || 'Client').substring(0, 2).toUpperCase()}
            size="md"
          />
          <div className={styles.clientInfo}>
            <span className={styles.clientName}>{client.name}</span>
            <span className={styles.clientEmail}>{client.contactInfo?.email}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'status',
      header: t('list.columnStatus'),
      render: (client) => (
        <Badge variant={getStatusBadgeVariant(client.status.toLowerCase()) as any}>
          {statusLabel.client(client.status)}
        </Badge>
      ),
    },
    {
      id: 'assigned',
      header: t('list.columnAssigned'),
      render: (client) => {
        // Resolve the stored id to a person; previously both the avatar and the
        // label rendered raw UUID fragments.
        const assignee = findPersonById(staff, client.assignedUserId);
        return (
          <div className={styles.assigneeCell}>
            <Avatar src={undefined} size="sm" fallback={getStaffInitials(assignee)} />
            <span className={styles.assigneeName}>{getStaffDisplayName(assignee)}</span>
          </div>
        );
      },
    },
    /*
      REMOVED: a "Recent Activity" column that rendered the not-set dash on
      every row, always — it was never wired to any source. Removed rather than
      disclosed, because a column header promises a per-row value and there is
      nothing a "coming soon" marker could usefully occupy a whole table column
      with. Interaction history already has a real home on the client detail
      page. The list endpoint would need a last-interaction aggregate before
      this column could return. TD-020.
    */
    {
      id: 'actions',
      header: '',
      align: 'right',
      width: '64px',
      cardLabel: null,
      render: (client) => (
        <DropdownMenu
          trigger={
            <button className={styles.actionButton} aria-label={t('list.actionsFor', { name: client.name })}>
              <MoreVertical size={18} />
            </button>
          }
          items={[
            {
              id: 'view',
              label: t('list.viewDetails'),
              icon: <Edit size={16} />,
              onClick: () => navigate(clientHref(client.id)),
            },
            ...(canArchive && !showArchived
              ? [{
                  id: 'archive',
                  label: t('list.deleteClient'),
                  icon: <Trash2 size={16} />,
                  danger: true,
                  onClick: () => openArchiveDialog(client),
                }]
              : []),
            ...(canArchive && showArchived
              ? [{
                  id: 'restore',
                  label: t('list.restoreClient'),
                  icon: <RotateCcw size={16} />,
                  onClick: () => handleRestore(client),
                }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <div className={styles.breadcrumb}>{t('list.breadcrumb')}</div>
          <h1 className={styles.title}>{t('list.title')}</h1>
        </div>
        <div className={styles.headerActions}>
          <ExcelImportButton
            label={t('import.importClients')}
            templateFileName="clients-template.xlsx"
            onImport={(file) => clientService.importClients(tenantSlug!, file)}
            onDownloadTemplate={() => clientService.downloadClientTemplate(tenantSlug!)}
            onImported={() => fetchClients({ search: debouncedSearchTerm })}
          />
          <Button variant="outline" icon={<Filter size={18} />}>
            {t('list.filter')}
          </Button>
          <Button variant="primary" icon={<Plus size={18} />} onClick={() => navigate(`/${tenantSlug}/clients/new`)}>
            {t('list.addClient')}
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <div className={`${styles.tableCard} premium-card`}>
        {/* Toolbar */}
        <div className={styles.tableToolbar}>
          <div className={styles.searchWrapper}>
            <TextInput 
              placeholder={t('list.searchPlaceholder')}
              iconLeft={<Search size={18} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {/* Owners need somewhere to see and undo archives; without this the
              archived clients would be unreachable from the UI entirely. */}
          {canArchive && (
            <Button
              variant={showArchived ? 'primary' : 'outline'}
              icon={<Archive size={18} />}
              onClick={() => setShowArchived((v) => !v)}
              aria-pressed={showArchived}
            >
              {showArchived ? t('list.viewActive') : t('list.viewArchived')}
            </Button>
          )}
        </div>

        {(actionError || loadError) && (
          <div className={styles.actionError} role="alert">{actionError ?? loadError}</div>
        )}

        {/* Table */}
        <DataTable
          columns={columns}
          rows={clients}
          rowKey={(client) => client.id}
          isLoading={isLoading}
          caption={t('list.caption')}
          className={styles.table}
          onRowClick={(client) => navigate(clientHref(client.id))}
          empty={{
            icon: <Users size={20} />,
            title: showArchived
              ? t('list.emptyArchived')
              : searchTerm ? t('list.emptyNoMatch') : t('list.empty'),
            description: showArchived
              ? t('list.emptyArchivedDescription')
              : searchTerm
              ? t('list.emptyNoMatchDescription', { term: searchTerm })
              : t('list.emptyDescription'),
            action: searchTerm || showArchived ? undefined : (
              <Button
                variant="primary"
                icon={<Plus size={18} />}
                onClick={() => navigate(`/${tenantSlug}/clients/new`)}
              >
                {t('list.addClient')}
              </Button>
            ),
          }}
        />

        {/* Pagination Footer */}
        <div className={styles.pagination}>
          <span className={styles.paginationText}>
            {t('list.showing', { shown: clients.length, total })}
          </span>
          <div className={styles.paginationControls}>
            <Button variant="outline" disabled icon={<ChevronLeft size={18} />}>
              {t('list.prev')}
            </Button>
            <Button variant="outline" disabled icon={<ChevronRight size={18} />} iconPosition="right">
              {t('list.next')}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!archivingClient}
        onClose={() => setArchivingClient(null)}
        onConfirm={handleArchive}
        title={t('list.deleteClientTitle')}
        message={archiveMessage()}
        confirmLabel={t('list.deleteClientConfirm')}
        tone="danger"
      />
    </div>
  );
};

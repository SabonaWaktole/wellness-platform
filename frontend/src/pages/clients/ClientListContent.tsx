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
} from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { Badge } from '../../components/ui/Badge/Badge';
import { Avatar } from '../../components/ui/Avatar/Avatar';
import { TextInput } from '../../components/ui/TextInput/TextInput';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { DropdownMenu } from '../../components/ui/DropdownMenu/DropdownMenu';
import { ExcelImportButton } from '../../components/clients/ExcelImportButton';
import { clientService } from '../../services/clientService';
import styles from './ClientListContent.module.css';

import { useClients } from '../../hooks/useClients';
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
  const { clients, total, isLoading, fetchClients } = useClients();

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
    fetchClients({ search: debouncedSearchTerm });
  }, [fetchClients, debouncedSearchTerm]);

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
            fallback={client.name.substring(0, 2).toUpperCase()}
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
        </div>

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
            title: searchTerm ? t('list.emptyNoMatch') : t('list.empty'),
            description: searchTerm
              ? t('list.emptyNoMatchDescription', { term: searchTerm })
              : t('list.emptyDescription'),
            action: searchTerm ? undefined : (
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
    </div>
  );
};

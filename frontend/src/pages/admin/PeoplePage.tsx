import { useState } from 'react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Users, MoreVertical, Ban, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { TextInput } from '../../components/ui/TextInput';
import { SelectInput } from '../../components/ui/SelectInput';
import { Badge } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { DropdownMenu } from '../../components/ui/DropdownMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { InviteUserModal } from './InviteUserModal';
import { useTenants, useUserAdmin } from '../../hooks/useDashboard';
import { usePlatformUsers, useInvitePlatformUser } from '../../hooks/usePlatformUsers';
import { useDateFormat } from '../../hooks/useDateFormat';
import type {
  InvitePlatformUserInput,
  OwnershipResolution,
  OwnershipTransferCandidate,
  PlatformUser,
} from '../../services/dashboardService';
import styles from './PeoplePage.module.css';

interface PendingSuspend {
  user: PlatformUser;
  candidates: OwnershipTransferCandidate[];
  isLoadingCandidates: boolean;
  selectedOwnerId: string;
  validationError: string | null;
}

interface PendingReactivate {
  user: PlatformUser;
  /** `null` means "not yet chosen" — only relevant when the user has a pending transfer. */
  ownershipResolution: OwnershipResolution | null;
}

interface PendingDelete {
  user: PlatformUser;
  candidates: OwnershipTransferCandidate[];
  isLoadingCandidates: boolean;
  selectedOwnerId: string;
  confirmText: string;
  validationError: string | null;
}

/**
 * The reactivation choices, in the order they are offered.
 *
 * A list rather than three hand-written blocks so a fourth resolution — or a
 * reworded third — is one entry, and so the radios cannot drift apart in
 * markup. The values are the server's `ownershipResolution` enum verbatim.
 */
const OWNERSHIP_RESOLUTIONS: {
  value: OwnershipResolution;
  labelKey: string;
  descriptionKey: string;
}[] = [
  {
    value: 'RESTORE',
    labelKey: 'superAdmin.restoreOriginalOwnership',
    descriptionKey: 'superAdmin.restoreOriginalOwnershipDescription',
  },
  {
    value: 'KEEP',
    labelKey: 'superAdmin.keepCurrentOwnership',
    descriptionKey: 'superAdmin.keepCurrentOwnershipDescription',
  },
  {
    value: 'KEEP_BOTH',
    labelKey: 'superAdmin.keepBothOwners',
    descriptionKey: 'superAdmin.keepBothOwnersDescription',
  },
];

/**
 * Everyone on the platform, across every workspace.
 *
 * Unlike Team Settings (which a Business Owner uses on their own staff, and
 * which flatly refuses to touch a Business Owner at all), this console can
 * suspend, reactivate or delete ANY account — Business Owner included. That
 * is what makes the ownership-transfer flow necessary here and nowhere else:
 * suspending or deleting the sole owner of a workspace that still has staff
 * must hand the workspace to one of them first. See PlatformSuspendUserUseCase
 * / PlatformDeleteUserUseCase on the backend.
 */
export const PeoplePage = () => {
  const { t } = useTranslation('dashboard');
  const dates = useDateFormat();
  const { tenants } = useTenants();
  const { users, total, isLoading, error, filters, setFilters, refresh } = usePlatformUsers();
  const {
    inviteUser,
    isSubmitting: isInviting,
    error: inviteError,
    clearError: clearInviteError,
  } = useInvitePlatformUser();
  const {
    getOwnershipTransferCandidates,
    suspendUser,
    reactivateUser,
    deleteUser,
    isSubmitting,
    error: adminError,
    clearError: clearAdminError,
  } = useUserAdmin();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [pendingSuspend, setPendingSuspend] = useState<PendingSuspend | null>(null);
  const [pendingReactivate, setPendingReactivate] = useState<PendingReactivate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  /*
   * No `refresh()` afterwards: an invitation is not an account yet, so
   * nothing this page lists has changed. The row appears once the invitee
   * accepts.
   */
  const handleInvite = (tenantId: string | null, input: InvitePlatformUserInput): Promise<boolean> =>
    inviteUser(tenantId, input);

  const openSuspend = async (user: PlatformUser) => {
    clearAdminError();
    setPendingSuspend({
      user,
      candidates: [],
      isLoadingCandidates: user.role === 'BUSINESS_OWNER',
      selectedOwnerId: '',
      validationError: null,
    });
    if (user.role !== 'BUSINESS_OWNER') return;

    const candidates = await getOwnershipTransferCandidates(user.id);
    setPendingSuspend((prev) =>
      prev && prev.user.id === user.id ? { ...prev, candidates, isLoadingCandidates: false } : prev
    );
  };

  const openReactivate = (user: PlatformUser) => {
    clearAdminError();
    setPendingReactivate({ user, ownershipResolution: null });
  };

  const openDelete = async (user: PlatformUser) => {
    clearAdminError();
    setPendingDelete({
      user,
      candidates: [],
      isLoadingCandidates: user.role === 'BUSINESS_OWNER',
      selectedOwnerId: '',
      confirmText: '',
      validationError: null,
    });
    if (user.role !== 'BUSINESS_OWNER') return;

    const candidates = await getOwnershipTransferCandidates(user.id);
    setPendingDelete((prev) =>
      prev && prev.user.id === user.id ? { ...prev, candidates, isLoadingCandidates: false } : prev
    );
  };

  const handleConfirmSuspend = async () => {
    if (!pendingSuspend) return;
    const { user, candidates, selectedOwnerId } = pendingSuspend;

    if (user.role === 'BUSINESS_OWNER' && candidates.length > 0 && !selectedOwnerId) {
      setPendingSuspend((prev) => (prev ? { ...prev, validationError: t('superAdmin.selectOwnerRequired') } : prev));
      throw new Error('newOwnerId required');
    }

    const result = await suspendUser(user.id, selectedOwnerId || undefined);
    if (!result) throw new Error(adminError ?? 'Action failed');

    setPendingSuspend(null);
    refresh();
  };

  const handleConfirmReactivate = async () => {
    if (!pendingReactivate) return;
    const { user, ownershipResolution } = pendingReactivate;

    const result = await reactivateUser(user.id, ownershipResolution ?? undefined);
    if (!result) throw new Error(adminError ?? 'Action failed');

    setPendingReactivate(null);
    refresh();
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const { user, candidates, selectedOwnerId, confirmText } = pendingDelete;

    if (confirmText !== user.email) {
      setPendingDelete((prev) => (prev ? { ...prev, validationError: t('superAdmin.confirmDeleteUserMismatch') } : prev));
      throw new Error('confirmation mismatch');
    }
    if (user.role === 'BUSINESS_OWNER' && candidates.length > 0 && !selectedOwnerId) {
      setPendingDelete((prev) => (prev ? { ...prev, validationError: t('superAdmin.selectOwnerRequired') } : prev));
      throw new Error('newOwnerId required');
    }

    const success = await deleteUser(user.id, confirmText, selectedOwnerId || undefined);
    if (!success) throw new Error(adminError ?? 'Delete failed');

    setPendingDelete(null);
    refresh();
  };

  const columns: DataTableColumn<PlatformUser>[] = [
    {
      id: 'person',
      header: t('superAdmin.columnPerson'),
      cardLabel: null,
      render: (user) => {
        const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
        return (
          <div className={styles.personCell}>
            {/* Name when there is one, email otherwise — an account created
                without a name still has to be identifiable in this list. */}
            <span className={styles.personName}>{name || user.email}</span>
            {name && <span className={styles.personEmail}>{user.email}</span>}
          </div>
        );
      },
    },
    {
      id: 'workspace',
      header: t('superAdmin.columnWorkspace'),
      render: (user) =>
        // Null means the platform role, which belongs to no workspace. Saying so
        // is more useful than an empty cell.
        user.tenantName ?? <span className={styles.platformCell}>{t('superAdmin.platform')}</span>,
    },
    {
      id: 'role',
      header: t('superAdmin.columnRole'),
      nowrap: true,
      render: (user) => t(`superAdmin.role${roleKey(user.role)}`),
    },
    {
      id: 'status',
      header: t('superAdmin.columnStatus'),
      nowrap: true,
      render: (user) =>
        user.isActive ? (
          <Badge variant="success">{t('superAdmin.userActive')}</Badge>
        ) : (
          <Badge variant="error">{t('superAdmin.userDeactivated')}</Badge>
        ),
    },
    {
      id: 'joined',
      header: t('superAdmin.columnDateJoined'),
      nowrap: true,
      render: (user) => (
        <span className={styles.dateCell}>
          {dates.custom(user.createdAt, { year: 'numeric', month: 'short', day: 'numeric' })}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      width: '64px',
      cardLabel: null,
      render: (user) => {
        // SUPER_ADMIN accounts are out of scope for this feature entirely —
        // the backend rejects every one of these actions against them, so no
        // menu promising options that would only 403.
        if (user.role === 'SUPER_ADMIN') return null;

        const isPending = isSubmitting && (
          pendingSuspend?.user.id === user.id ||
          pendingReactivate?.user.id === user.id ||
          pendingDelete?.user.id === user.id
        );

        return (
          <DropdownMenu
            align="right"
            trigger={
              <button
                className={styles.actionButton}
                disabled={isPending}
                aria-label={t('superAdmin.userActionsFor', { name: user.email })}
              >
                <MoreVertical size={16} />
              </button>
            }
            items={[
              user.isActive
                ? {
                    id: 'suspend',
                    label: t('superAdmin.suspendUser'),
                    icon: <Ban size={16} />,
                    danger: true,
                    onClick: () => openSuspend(user),
                    disabled: isPending,
                  }
                : {
                    id: 'reactivate',
                    label: t('superAdmin.reactivateUser'),
                    icon: <CheckCircle2 size={16} />,
                    onClick: () => openReactivate(user),
                    disabled: isPending,
                  },
              {
                id: 'delete',
                label: t('superAdmin.deleteUser'),
                icon: <Trash2 size={16} />,
                danger: true,
                onClick: () => openDelete(user),
                disabled: isPending,
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('superAdmin.peopleTitle')}</h1>
          <p className={styles.subtitle}>{t('superAdmin.peopleSubtitle', { count: total })}</p>
        </div>
        <div className={styles.headerActions}>
          {/* Not disabled on `tenants.length === 0`: a Platform Admin invite
              belongs to no workspace, so it still works on an empty platform. */}
          <Button
            variant="outline"
            icon={<UserPlus size={20} />}
            onClick={() => {
              clearInviteError();
              setIsInviteOpen(true);
            }}
          >
            {t('superAdmin.inviteUser')}
          </Button>
        </div>
      </header>

      <div className={styles.filters}>
        <TextInput
          label={t('superAdmin.filterSearch')}
          value={filters.q ?? ''}
          // Replaces the whole filter object so the effect in usePlatformUsers
          // refetches; `skip` resets because the previous page number means
          // nothing against a different result set.
          onChange={(e) => setFilters({ ...filters, q: e.target.value || undefined, skip: 0 })}
          placeholder={t('superAdmin.filterSearchPlaceholder')}
        />

        <SelectInput
          label={t('superAdmin.filterWorkspace')}
          value={filters.tenantId ?? ''}
          onChange={(e) => setFilters({ ...filters, tenantId: e.target.value || undefined, skip: 0 })}
        >
          <option value="">{t('superAdmin.filterAllWorkspaces')}</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </SelectInput>

        <SelectInput
          label={t('superAdmin.filterRole')}
          value={filters.role ?? ''}
          onChange={(e) => setFilters({ ...filters, role: e.target.value || undefined, skip: 0 })}
        >
          <option value="">{t('superAdmin.filterAllRoles')}</option>
          <option value="BUSINESS_OWNER">{t('superAdmin.roleBusinessOwner')}</option>
          <option value="STAFF">{t('superAdmin.roleStaff')}</option>
          <option value="SUPER_ADMIN">{t('superAdmin.roleSuperAdmin')}</option>
        </SelectInput>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {adminError && !pendingSuspend && !pendingReactivate && !pendingDelete && (
        <p className={styles.error} role="alert">
          {adminError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={users}
        rowKey={(user) => user.id}
        isLoading={isLoading}
        caption={t('superAdmin.peopleTableCaption')}
        empty={{
          icon: <Users size={20} />,
          title: t('superAdmin.peopleEmptyTitle'),
          description: t('superAdmin.peopleEmptyDescription'),
        }}
      />

      <InviteUserModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        tenants={tenants}
        onSubmit={handleInvite}
        isSubmitting={isInviting}
        serverError={inviteError}
      />

      <ConfirmDialog
        isOpen={pendingSuspend !== null}
        onClose={() => setPendingSuspend(null)}
        onConfirm={handleConfirmSuspend}
        tone="danger"
        title={t('superAdmin.confirmSuspendUserTitle')}
        confirmLabel={t('superAdmin.suspendUser')}
        message={
          pendingSuspend && (
            <div className={styles.dialogContent}>
              <p>{t('superAdmin.confirmSuspendUserMessage', { name: userLabel(pendingSuspend.user) })}</p>
              {pendingSuspend.user.role === 'BUSINESS_OWNER' && (
                <OwnershipTransferPicker
                  isLoading={pendingSuspend.isLoadingCandidates}
                  candidates={pendingSuspend.candidates}
                  selectedOwnerId={pendingSuspend.selectedOwnerId}
                  onSelect={(id) =>
                    setPendingSuspend((prev) => (prev ? { ...prev, selectedOwnerId: id, validationError: null } : prev))
                  }
                  helpText={t('superAdmin.ownershipTransferHelpSuspend')}
                />
              )}
              {pendingSuspend.validationError && (
                <p className={styles.error} role="alert">
                  {pendingSuspend.validationError}
                </p>
              )}
            </div>
          )
        }
      />

      <ConfirmDialog
        isOpen={pendingReactivate !== null}
        onClose={() => setPendingReactivate(null)}
        onConfirm={handleConfirmReactivate}
        tone="primary"
        title={t('superAdmin.confirmReactivateUserTitle')}
        confirmLabel={t('superAdmin.reactivateUser')}
        message={
          pendingReactivate && (
            <div className={styles.dialogContent}>
              <p>{t('superAdmin.confirmReactivateUserMessage', { name: userLabel(pendingReactivate.user) })}</p>
              {pendingReactivate.user.pendingOwnershipTransfer && (
                <div className={styles.ownershipChoice}>
                  <p>
                    {t('superAdmin.ownershipRestoreChoiceIntro', {
                      name: pendingReactivate.user.pendingOwnershipTransfer.actingOwnerName,
                    })}
                  </p>
                  {/* Three choices, and only the last one demotes nobody: a
                      workspace may have several Business Owners, so bringing
                      the original back does not have to cost the stand-in
                      their role. */}
                  {OWNERSHIP_RESOLUTIONS.map(({ value, labelKey, descriptionKey }) => (
                    <label key={value} className={styles.radioOption}>
                      <input
                        type="radio"
                        name="ownershipResolution"
                        checked={pendingReactivate.ownershipResolution === value}
                        onChange={() =>
                          setPendingReactivate((prev) =>
                            prev ? { ...prev, ownershipResolution: value } : prev
                          )
                        }
                      />
                      <span>
                        <strong>{t(labelKey)}</strong>
                        <br />
                        {t(descriptionKey)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        }
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
        tone="danger"
        title={t('superAdmin.confirmDeleteUserTitle')}
        confirmLabel={t('superAdmin.deleteUser')}
        message={
          pendingDelete && (
            <div className={styles.dialogContent}>
              <p>{t('superAdmin.confirmDeleteUserMessage', { name: userLabel(pendingDelete.user) })}</p>
              {pendingDelete.user.role === 'BUSINESS_OWNER' && (
                <OwnershipTransferPicker
                  isLoading={pendingDelete.isLoadingCandidates}
                  candidates={pendingDelete.candidates}
                  selectedOwnerId={pendingDelete.selectedOwnerId}
                  onSelect={(id) =>
                    setPendingDelete((prev) => (prev ? { ...prev, selectedOwnerId: id, validationError: null } : prev))
                  }
                  helpText={t('superAdmin.ownershipTransferHelpDelete')}
                />
              )}
              <p>{t('superAdmin.confirmDeleteUserInstruction', { email: pendingDelete.user.email })}</p>
              <label>
                <span className={styles.srOnly}>{t('superAdmin.confirmDeleteUserInputLabel')}</span>
                <input
                  type="text"
                  className={styles.deleteConfirmInput}
                  value={pendingDelete.confirmText}
                  onChange={(e) =>
                    setPendingDelete((prev) =>
                      prev ? { ...prev, confirmText: e.target.value, validationError: null } : prev
                    )
                  }
                  autoComplete="off"
                  autoFocus
                />
              </label>
              {pendingDelete.validationError && (
                <p className={styles.error} role="alert">
                  {pendingDelete.validationError}
                </p>
              )}
            </div>
          )
        }
      />
    </div>
  );
};

/** Maps a stored role onto the `superAdmin.role*` translation keys. */
const roleKey = (role: PlatformUser['role']) =>
  role === 'BUSINESS_OWNER' ? 'BusinessOwner' : role === 'STAFF' ? 'Staff' : 'SuperAdmin';

const userLabel = (user: { firstName: string | null; lastName: string | null; email: string }) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

/** The required-when-staff-exist picker shared by the suspend and delete dialogs. */
const OwnershipTransferPicker: FC<{
  isLoading: boolean;
  candidates: OwnershipTransferCandidate[];
  selectedOwnerId: string;
  onSelect: (id: string) => void;
  helpText: string;
}> = ({ isLoading, candidates, selectedOwnerId, onSelect, helpText }) => {
  const { t } = useTranslation('dashboard');

  if (isLoading) {
    return <p className={styles.platformCell}>{t('superAdmin.loadingCandidates')}</p>;
  }
  if (candidates.length === 0) {
    // No other staff — the operation proceeds directly, nothing to pick.
    return null;
  }

  return (
    <div className={styles.dialogContent}>
      <p>{helpText}</p>
      <SelectInput
        label={t('superAdmin.newBusinessOwner')}
        value={selectedOwnerId}
        onChange={(e) => onSelect(e.target.value)}
        required
      >
        <option value="">{t('superAdmin.selectOwnerPlaceholder')}</option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {userLabel(candidate)}
          </option>
        ))}
      </SelectInput>
    </div>
  );
};

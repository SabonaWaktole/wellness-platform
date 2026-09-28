import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/ui/Card/Card';
import { Badge } from '../../../components/ui/Badge/Badge';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { Button } from '../../../components/ui/Button/Button';
import { SelectInput } from '../../../components/ui/SelectInput/SelectInput';
import { useTeam, type DeactivationImpact, type Role, type StaffMember } from '../../../hooks/useTeam';
import { usePermission } from '../../../hooks/usePermission';
import { roleLabel } from '../../../utils/roleLabel';
import { teamErrorMessage } from './teamErrorMessage';
import { InviteMemberModal } from './InviteMemberModal';
import { EditMemberModal } from './EditMemberModal';
import { Mail, Shield, Clock, Edit2, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { useAuthStore } from '../../../store/useAuthStore';
import styles from './TeamSettingsContent.module.css';
import { useDateFormat } from '../../../hooks/useDateFormat';

export const TeamSettingsContent: React.FC = () => {
  const dates = useDateFormat();
  const { t, i18n } = useTranslation('settings');
  const { staff, pendingInvitations, loadingStaff, loadingInvitations, fetchStaff, fetchPendingInvitations, fetchRoles, inviteStaff, updateStaffRole, cancelInvitation, fetchDeactivationImpact, deactivateStaff, reactivateStaff } = useTeam();
  const [roles, setRoles] = useState<Role[]>([]);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [memberToDeactivate, setMemberToDeactivate] = useState<StaffMember | null>(null);
  const [impact, setImpact] = useState<DeactivationImpact | null>(null);
  const [successorId, setSuccessorId] = useState('');
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  const closeDeactivateDialog = () => {
    setMemberToDeactivate(null);
    setImpact(null);
    setSuccessorId('');
    setDeactivateError(null);
  };

  const openDeactivateDialog = async (member: StaffMember) => {
    setMemberToDeactivate(member);
    setImpact(null);
    setSuccessorId('');
    setDeactivateError(null);
    try {
      setImpact(await fetchDeactivationImpact(member.id));
    } catch {
      // The counts are advisory; if they cannot be loaded the dialog still
      // works, it just omits the "still holds" line rather than blocking.
    }
  };
  const { user } = useAuthStore();
  // FR-RBAC-07: decided by permission, never by comparing role names.
  const canManage = usePermission('users.manage');

  useEffect(() => {
    fetchStaff();
    fetchPendingInvitations();
  }, [fetchStaff, fetchPendingInvitations]);

  useEffect(() => {
    if (!canManage) return;
    fetchRoles()
      .then(setRoles)
      .catch(() => setRoles([]));
  }, [canManage, fetchRoles]);

  const handleInvite = async (email: string, roleId: string, warehouseId?: string) => {
    await inviteStaff(email, roleId, warehouseId);
  };

  const memberRoleLabel = (member: StaffMember) =>
    member.roleNameSq || member.roleNameEn
      ? roleLabel({ nameSq: member.roleNameSq, nameEn: member.roleNameEn }, i18n.language)
      : t(`team.roles.${member.role}`, { defaultValue: member.role });

  const invitationRoleLabel = (invitation: { roleId?: string | null; role: string }) => {
    const role = roles.find((r) => r.id === invitation.roleId);
    return role ? roleLabel(role, i18n.language) : t(`team.roles.${invitation.role}`, { defaultValue: invitation.role });
  };

  // FR-USR-05: who can take the member's companies — any other active colleague.
  const successors = staff.filter((m) => m.isActive !== false && m.id !== memberToDeactivate?.id);
  const needsSuccessor = (impact?.clients ?? 0) > 0;

  const handleDeactivate = async () => {
    if (!memberToDeactivate) return;
    setDeactivateError(null);
    try {
      await deactivateStaff(memberToDeactivate.id, needsSuccessor ? successorId : undefined);
    } catch (err) {
      setDeactivateError(teamErrorMessage(err, t, t('team.deactivate.failed')));
      // Rethrown so the dialog stays open with the reason showing.
      throw err;
    }
  };

  /**
   * Confirmed, but without the impact dialog deactivation uses. There is
   * nothing to warn about: reactivation restores sign-in and touches no
   * assignments. TD-030.
   */
  const handleReactivate = async (member: StaffMember) => {
    const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.email;
    if (!window.confirm(t('team.confirmReactivate', { name }))) return;
    await reactivateStaff(member.id);
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (window.confirm(t('team.confirmCancelInvitation'))) {
      await cancelInvitation(invitationId);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.headerTitle}>{t('team.title')}</h2>
          <p className={styles.headerSubtitle}>{t('team.subtitle')}</p>
        </div>
        {canManage && (
          <Button variant="primary" onClick={() => setIsInviteModalOpen(true)}>
            {t('team.inviteMember')}
          </Button>
        )}
      </div>

      <Card padding="md">
        {/*
          "Team Members", not "Active Members". The staff endpoint has always
          returned deactivated members too, so the old heading described the
          list incorrectly. Renaming rather than filtering is deliberate:
          deactivated members must stay visible to be reactivated. TD-030.
        */}
        <h3 className={styles.cardTitle}>{t('team.members')}</h3>
        {loadingStaff ? (
          <p className={styles.mutedText}>{t('team.loadingMembers')}</p>
        ) : staff.length === 0 ? (
          <p className={styles.mutedText}>{t('team.noMembers')}</p>
        ) : (
          <div className={styles.list}>
            {staff.map((member) => (
              <div key={member.id} className={styles.row}>
                <div className={styles.rowLeft}>
                  <div className={styles.avatar}>
                    {member.firstName ? member.firstName[0] : member.email[0].toUpperCase()}
                  </div>
                  <div className={styles.memberInfo}>
                    <div className={styles.memberName}>
                      {member.firstName} {member.lastName}
                      {member.isActive === false && (
                        <Badge variant="secondary" className={styles.statusBadge}>
                          {t('team.deactivatedBadge')}
                        </Badge>
                      )}
                    </div>
                    <div className={styles.memberEmail}>{member.email}</div>
                  </div>
                </div>
                <div className={styles.rowRight}>
                  <div className={styles.roleBadge}>
                    <Shield size={14} />
                    {memberRoleLabel(member)}
                  </div>
                  {canManage && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setEditingMember(member)}
                        className={styles.iconButton}
                        aria-label={t('team.editAria', { email: member.email })}
                      >
                        <Edit2 size={14} />
                      </Button>
                      {/* Nobody can deactivate themselves; the server also refuses
                          to deactivate the last user who can manage roles. */}
                      {member.id !== user?.userId && (
                        member.isActive === false ? (
                          <Button
                            variant="outline"
                            onClick={() => handleReactivate(member)}
                            className={styles.iconButton}
                            aria-label={t('team.reactivateAria', { email: member.email })}
                          >
                            <UserPlus size={14} />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => openDeactivateDialog(member)}
                            className={styles.iconButton}
                            aria-label={t('team.deactivateAria', { email: member.email })}
                          >
                            <UserMinus size={14} />
                          </Button>
                        )
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {canManage && (
        <Card padding="md">
          <h3 className={styles.cardTitle}>{t('team.pendingInvitations')}</h3>
          {loadingInvitations ? (
            <p className={styles.mutedText}>{t('team.loadingInvitations')}</p>
          ) : pendingInvitations.length === 0 ? (
            <p className={styles.mutedText}>{t('team.noInvitations')}</p>
          ) : (
            <div className={styles.list}>
              {pendingInvitations.map((inv) => (
                <div key={inv.id} className={styles.row}>
                  <div className={styles.rowLeft}>
                    <div className={`${styles.avatar} ${styles.avatarNeutral}`}>
                      <Mail size={20} />
                    </div>
                    <div className={styles.memberInfo}>
                      <div className={styles.memberName}>{inv.email}</div>
                      <div className={styles.memberExpiry}>
                        <Clock size={12} />
                        {t('team.expires', { date: dates.date(inv.expiresAt) })}
                      </div>
                    </div>
                  </div>
                  <div className={styles.rowRight}>
                    <div className={styles.roleBadge}>
                      <Shield size={14} />
                      {invitationRoleLabel(inv)}
                    </div>
                    {canManage && (
                      <Button
                        variant="outline"
                        onClick={() => handleCancelInvitation(inv.id)}
                        className={`${styles.iconButton} ${styles.dangerButton}`}
                        title={t('team.cancelInvitation')}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        roles={roles}
        onInvite={handleInvite}
      />

      <EditMemberModal
        member={editingMember}
        onClose={() => setEditingMember(null)}
        roles={roles}
        onUpdate={updateStaffRole}
      />

      <ConfirmDialog
        isOpen={!!memberToDeactivate}
        onClose={closeDeactivateDialog}
        onConfirm={handleDeactivate}
        confirmDisabled={needsSuccessor && !successorId}
        title={t('team.deactivate.title')}
        confirmLabel={t('team.deactivate.confirm')}
        tone="danger"
        message={
          <>
            <p>
              {t('team.deactivate.intro', {
                name: memberToDeactivate?.firstName || memberToDeactivate?.email,
              })}
            </p>

            {impact && needsSuccessor && (
              <div className={styles.reassign}>
                <p>{t('team.deactivate.companiesIntro', { count: impact.clients })}</p>
                <ul className={styles.companyList}>
                  {impact.companies.map((company) => (
                    <li key={company.id}>{company.name}</li>
                  ))}
                </ul>
                {impact.clients > impact.companies.length && (
                  <p className={styles.mutedText}>
                    {t('team.deactivate.moreCompanies', { count: impact.clients - impact.companies.length })}
                  </p>
                )}
                <SelectInput
                  label={t('team.deactivate.reassignTo')}
                  value={successorId}
                  onChange={(e) => setSuccessorId(e.target.value)}
                  helperText={
                    impact.openContracts > 0
                      ? t('team.deactivate.contractsFollow', { count: impact.openContracts })
                      : undefined
                  }
                  required
                >
                  <option value="">{t('team.deactivate.chooseColleague')}</option>
                  {successors.map((m) => (
                    <option key={m.id} value={m.id}>
                      {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.email}
                    </option>
                  ))}
                </SelectInput>
              </div>
            )}

            {impact && impact.upcomingAppointments > 0 && (
              <p>{t('team.deactivate.appointmentsStay', { count: impact.upcomingAppointments })}</p>
            )}

            {/* Slice 3 checks the account on every request, so a deactivated
                user's open session stops working on their next action. */}
            <p>{t('team.deactivate.residualAccess')}</p>

            {deactivateError && (
              <p role="alert" className={styles.errorText}>
                {deactivateError}
              </p>
            )}
          </>
        }
      />
    </div>
  );
};

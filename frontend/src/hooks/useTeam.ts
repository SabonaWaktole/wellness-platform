import { useState, useCallback } from 'react';
import { apiClient as api } from '../api';
import { useParams } from 'react-router-dom';

/** One of the workspace's roles, as the role picker offers it (FR-USR-02). */
export interface Role {
  id: string;
  key: string;
  nameSq: string;
  nameEn: string;
  isSystem: boolean;
}

export interface StaffMember {
  id: string;
  email: string;
  /** Legacy role string ('BUSINESS_OWNER' | 'STAFF'); the role itself is `roleId`. */
  role: string;
  roleId?: string | null;
  roleKey?: string | null;
  roleNameSq?: string | null;
  roleNameEn?: string | null;
  firstName?: string;
  lastName?: string;
  warehouseId?: string;
  /** Deactivated members are retained but cannot sign in. */
  isActive?: boolean;
}

export interface DeactivationImpact {
  clients: number;
  upcomingAppointments: number;
  openContracts: number;
  /** The first of the member's companies by name; `clients` is the full count. */
  companies: Array<{ id: string; name: string }>;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  roleId?: string | null;
  expiresAt: string;
  warehouseId?: string;
}

export const useTeam = () => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const { tenantSlug } = useParams();

  const fetchStaff = useCallback(async () => {
    if (!tenantSlug) return;
    setLoadingStaff(true);
    try {
      const response = await api.get(`/${tenantSlug}/auth/staff`);
      setStaff(response.data.items || []);
    } catch (error) {
      console.error('Failed to fetch staff', error);
    } finally {
      setLoadingStaff(false);
    }
  }, [tenantSlug]);

  const fetchPendingInvitations = useCallback(async () => {
    if (!tenantSlug) return;
    setLoadingInvitations(true);
    try {
      const response = await api.get(`/${tenantSlug}/auth/invitations`);
      setPendingInvitations(response.data);
    } catch (error) {
      console.error('Failed to fetch pending invitations', error);
    } finally {
      setLoadingInvitations(false);
    }
  }, [tenantSlug]);

  const fetchRoles = useCallback(async (): Promise<Role[]> => {
    if (!tenantSlug) return [];
    const response = await api.get(`/${tenantSlug}/auth/roles`);
    return response.data.roles;
  }, [tenantSlug]);

  const inviteStaff = async (email: string, roleId: string, warehouseId?: string) => {
    if (!tenantSlug) return;
    try {
      await api.post(`/${tenantSlug}/auth/invitations`, { email, roleId, warehouseId });
      await fetchPendingInvitations();
    } catch (error) {
      console.error('Failed to invite staff', error);
      throw error;
    }
  };

  const updateStaffRole = async (userId: string, roleId: string, warehouseId?: string) => {
    if (!tenantSlug) return;
    try {
      await api.put(`/${tenantSlug}/auth/staff/${userId}`, { roleId, warehouseId: warehouseId ?? null });
      await fetchStaff();
    } catch (error) {
      console.error('Failed to update staff role', error);
      throw error;
    }
  };

  /** What the member still holds, shown before confirming deactivation. */
  const fetchDeactivationImpact = async (userId: string): Promise<DeactivationImpact> => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    const response = await api.get(`/${tenantSlug}/auth/staff/${userId}/deactivation-impact`);
    return response.data;
  };

  /** `reassignToUserId` takes over the member's companies and open contracts (FR-USR-05). */
  const deactivateStaff = async (userId: string, reassignToUserId?: string) => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    try {
      await api.post(`/${tenantSlug}/auth/staff/${userId}/deactivate`, { reassignToUserId: reassignToUserId ?? null });
      await fetchStaff();
    } catch (error) {
      console.error('Failed to deactivate staff member', error);
      throw error;
    }
  };

  /**
   * The counterpart to deactivateStaff. Until TD-030 there was no caller
   * anywhere that set a user active again — `setActive` existed on the
   * repository but only ever received `false`.
   */
  const reactivateStaff = async (userId: string) => {
    if (!tenantSlug) throw new Error('Missing tenant context');
    try {
      await api.post(`/${tenantSlug}/auth/staff/${userId}/reactivate`);
      await fetchStaff();
    } catch (error) {
      console.error('Failed to reactivate staff member', error);
      throw error;
    }
  };

  const cancelInvitation = async (invitationId: string) => {
    if (!tenantSlug) return;
    try {
      await api.delete(`/${tenantSlug}/auth/invitations/${invitationId}`);
      await fetchPendingInvitations();
    } catch (error) {
      console.error('Failed to cancel invitation', error);
      throw error;
    }
  };

  return {
    staff,
    pendingInvitations,
    loadingStaff,
    loadingInvitations,
    fetchStaff,
    fetchPendingInvitations,
    fetchRoles,
    inviteStaff,
    updateStaffRole,
    cancelInvitation,
    fetchDeactivationImpact,
    deactivateStaff,
    reactivateStaff,
  };
};

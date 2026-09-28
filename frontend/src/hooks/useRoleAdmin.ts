import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient as api } from '../api';

export type PermissionScope = 'OWN' | 'TEAM' | 'ALL';
/** A scoped permission's reach, or `true` for a plain capability. */
export type PermissionGrant = PermissionScope | true;
export type GrantMap = Record<string, PermissionGrant>;

/** One permission of the in-code catalogue (FR-RBAC-02), as `GET /roles` sends it. */
export interface CatalogueEntry {
  key: string;
  group: string;
  supportsScope: boolean;
  /** Configurable now, enforced from this milestone on. */
  milestone?: 'M2' | 'M3';
}

export interface RoleDetail {
  id: string;
  key: string;
  nameSq: string;
  nameEn: string;
  isSystem: boolean;
  baseKey: string | null;
  grants: GrantMap;
  /** Users holding the role, active or deactivated. */
  users: number;
}

export interface RoleNames {
  nameSq: string;
  nameEn: string;
}

/** The Roles & permissions screen's data (Slice 6: FR-RBAC-03, 04). */
export const useRoleAdmin = () => {
  const { tenantSlug } = useParams();
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);
  const [roles, setRoles] = useState<RoleDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchRoles = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const response = await api.get(`/${tenantSlug}/roles`);
      setCatalogue(response.data.catalogue);
      setRoles(response.data.roles);
    } catch (error) {
      console.error('Failed to fetch roles', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  /** Replaces the role's whole permission set with `grants`. */
  const savePermissions = async (roleId: string, grants: GrantMap) => {
    const permissions = Object.entries(grants).map(([key, grant]) => ({ key, scope: grant === true ? null : grant }));
    const response = await api.put(`/${tenantSlug}/roles/${roleId}/permissions`, { permissions });
    const saved = response.data.role as Omit<RoleDetail, 'users'>;
    setRoles((current) => current.map((role) => (role.id === roleId ? { ...role, grants: saved.grants } : role)));
  };

  /** Returns the new role's id. */
  const copyRole = async (sourceRoleId: string, names: RoleNames): Promise<string> => {
    const response = await api.post(`/${tenantSlug}/roles/${sourceRoleId}/copy`, names);
    await fetchRoles();
    return response.data.role.id;
  };

  const renameRole = async (roleId: string, names: RoleNames) => {
    await api.patch(`/${tenantSlug}/roles/${roleId}`, names);
    setRoles((current) => current.map((role) => (role.id === roleId ? { ...role, ...names } : role)));
  };

  const deleteRole = async (roleId: string) => {
    await api.delete(`/${tenantSlug}/roles/${roleId}`);
    setRoles((current) => current.filter((role) => role.id !== roleId));
  };

  return { catalogue, roles, loading, loadFailed, fetchRoles, savePermissions, copyRole, renameRole, deleteRole };
};

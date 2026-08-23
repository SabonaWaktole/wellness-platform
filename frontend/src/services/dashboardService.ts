import { apiClient } from '../api';

export interface DashboardMetrics {
  totalClients: number;
  totalClientsLastWeek: number;
  /** Clients assigned to the signed-in user. Personal for every role. */
  assignedClients: number;
  /** Sent quotations still unanswered past the workspace's follow-up period. */
  openFollowUps: number;
  /** That period, in days, so the card can say what "open" means. */
  followUpThresholdDays: number;
  /** Appointments scheduled for today, excluding cancelled ones. */
  appointmentsToday: number;
  /** Same window yesterday, for the day-over-day delta. */
  appointmentsYesterday: number;
  /** Quotations that are neither accepted, rejected nor expired. */
  openQuotations: number;
  quotationsAwaitingApproval: number;
  /** Products at or below their low-stock threshold. */
  lowStockProducts: number;
  outOfStockProducts: number;
}

export interface ActivityFeedItem {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  actor: {
    id: string;
    name: string;
  };
  details?: any;
}

/**
 * Whether a workspace may operate. SUSPENDED retains all data — a suspended
 * tenant's users simply cannot log in or reach any endpoint. There is no
 * "deleted" state: hard deletion is not implemented anywhere.
 */
export type SubscriptionStatus = 'ACTIVE' | 'SUSPENDED';

export interface Tenant {
  id: string;
  name: string;
  urlSlug: string;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
}

export interface PaginatedTenants {
  items: Tenant[];
  total: number;
}

export interface CreateTenantInput {
  companyName: string;
  urlSlug: string;
  ownerEmail: string;
  ownerPassword: string;
}

/** A person as the platform console lists them — with their workspace's name. */
export interface PlatformUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'SUPER_ADMIN' | 'BUSINESS_OWNER' | 'STAFF';
  isActive: boolean;
  tenantId: string | null;
  /** Null for a platform administrator, who belongs to no workspace. */
  tenantName: string | null;
  createdAt: string;
  /**
   * Set only when this row is the ORIGINAL owner of an unresolved
   * suspension-time ownership transfer. Reactivating them requires the
   * restore/keep choice rather than a plain confirm — see `reactivateUser`.
   */
  pendingOwnershipTransfer: { actingOwnerName: string } | null;
}

/** A staff member eligible to become the new Business Owner of their workspace. */
export interface OwnershipTransferCandidate {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'SUPER_ADMIN' | 'BUSINESS_OWNER' | 'STAFF';
  isActive: boolean;
  tenantId: string | null;
  createdAt: string;
}

export interface PlatformUserFilters {
  tenantId?: string;
  role?: string;
  isActive?: boolean;
  q?: string;
  skip?: number;
  take?: number;
}

/**
 * A Platform Admin inviting someone by email. `role: 'BUSINESS_OWNER' |
 * 'STAFF'` goes to a workspace (the third way to become a Business Owner,
 * next to being promoted from staff and being invited by an existing owner —
 * adds an owner; a workspace may have several). `role: 'SUPER_ADMIN'`
 * appoints another Platform Admin instead, and belongs to no workspace.
 */
export interface InvitePlatformUserInput {
  email: string;
  role: 'BUSINESS_OWNER' | 'STAFF' | 'SUPER_ADMIN';
}

/**
 * What to do with the stand-in Business Owner when the original one is
 * reactivated. `KEEP_BOTH` demotes nobody — the workspace simply ends up with
 * two owners, which it is allowed to have.
 */
export type OwnershipResolution = 'RESTORE' | 'KEEP' | 'KEEP_BOTH';

/**
 * The six fields both platform-wide defaults and a bulk apply to selected
 * tenants can set — the same set a workspace's own Settings page edits.
 * Company identity (name, address, branding) is deliberately absent: it names
 * one business and cannot mean anything applied to several, or as a "default"
 * with no business behind it yet.
 */
export interface WorkspaceSettingsFields {
  requiresQuotationApproval?: boolean;
  currency?: string;
  locale?: string;
  timezone?: string;
  dateFormat?: string;
  defaultLanguage?: string;
}

export interface PlatformSettings extends Required<WorkspaceSettingsFields> {
  /** Null until this row has ever been saved — the platform is on the shipped defaults. */
  updatedAt: string | null;
}

/** Platform-wide Monthly Recurring Revenue, for the dashboard's Global MRR card. */
export interface GlobalMrr {
  amountCents: number;
  currency: string;
}

/** Platform system health, for the dashboard's System Health card. */
export interface SystemHealth {
  status: 'HEALTHY' | 'DEGRADED';
  checkedAt: string;
  checks: {
    database: 'UP' | 'DOWN';
  };
}

/** Live request latency/traffic, for the dashboard's Global Latency / Active Requests / Real-time Traffic panel. */
export interface SystemMetrics {
  avgLatencyMs: number;
  requestsPerSecond: number;
  buckets: number[];
}

/** One row of the append-only platform audit log, as the Platform Activity feed consumes it. */
export interface PlatformActivityEvent {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  tenantId: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const dashboardService = {
  getTenantClientMetrics: async (tenantSlug: string): Promise<DashboardMetrics> => {
    const response = await apiClient.get<DashboardMetrics>(`/${tenantSlug}/dashboard/metrics`);
    return response.data;
  },

  getTenantActivityFeed: async (tenantSlug: string, limit?: number): Promise<ActivityFeedItem[]> => {
    const params = limit ? { limit } : {};
    const response = await apiClient.get<{ timeline: ActivityFeedItem[] }>(`/${tenantSlug}/dashboard/feed`, { params });
    return response.data.timeline;
  },

  getTenants: async (skip?: number, take?: number): Promise<PaginatedTenants> => {
    const params: any = {};
    if (skip !== undefined) params.skip = skip;
    if (take !== undefined) params.take = take;
    // Note: This endpoint is mounted at the root /api/tenants, not /api/:tenantSlug/...
    const response = await apiClient.get<PaginatedTenants>(`/tenants`, { params });
    return response.data;
  },

  getPlatformActivity: async (take?: number): Promise<PlatformActivityEvent[]> => {
    const params = take ? { take } : {};
    const response = await apiClient.get<{ items: PlatformActivityEvent[] }>(`/tenants/activity`, { params });
    return response.data.items;
  },

  getGlobalMrr: async (): Promise<GlobalMrr> => {
    const response = await apiClient.get<GlobalMrr>(`/tenants/mrr`);
    return response.data;
  },

  getSystemHealth: async (): Promise<SystemHealth> => {
    const response = await apiClient.get<SystemHealth>(`/tenants/health`);
    return response.data;
  },

  getSystemMetrics: async (): Promise<SystemMetrics> => {
    const response = await apiClient.get<SystemMetrics>(`/tenants/metrics`);
    return response.data;
  },

  /*
   * Platform administration. All three are SUPER_ADMIN-only and, like the list
   * above, live at the root /api/tenants rather than under /api/:tenantSlug —
   * they act ON tenants rather than within one.
   */

  createTenant: async (input: CreateTenantInput): Promise<Tenant> => {
    const response = await apiClient.post<{ tenant: Tenant }>(`/tenants`, input);
    return response.data.tenant;
  },

  /** Idempotent server-side: suspending an already-suspended tenant succeeds. */
  suspendTenant: async (tenantId: string): Promise<Tenant> => {
    const response = await apiClient.patch<{ tenant: Tenant }>(`/tenants/${tenantId}/suspend`);
    return response.data.tenant;
  },

  reactivateTenant: async (tenantId: string): Promise<Tenant> => {
    const response = await apiClient.patch<{ tenant: Tenant }>(`/tenants/${tenantId}/reactivate`);
    return response.data.tenant;
  },

  /**
   * Permanently deletes a workspace: every row and every uploaded file that
   * belongs to it. `confirmSlug` must equal the workspace's own `urlSlug` —
   * enforced server-side, not just a client-side gate.
   */
  deleteTenant: async (tenantId: string, confirmSlug: string): Promise<void> => {
    await apiClient.delete(`/tenants/${tenantId}`, { data: { confirmSlug } });
  },

  /**
   * Enter a workspace and administer it as its owner.
   *
   * Replaces the session cookie server-side, so the caller must re-read
   * /auth/me before navigating — the store still holds the platform session at
   * the moment this resolves.
   */
  enterTenant: async (tenantId: string): Promise<{ tenantSlug: string; tenantName: string }> => {
    const response = await apiClient.post<{ tenantSlug: string; tenantName: string }>(
      `/tenants/${tenantId}/enter`
    );
    return response.data;
  },

  /** Every account on the platform. SUPER_ADMIN only. */
  getPlatformUsers: async (
    filters: PlatformUserFilters = {}
  ): Promise<{ items: PlatformUser[]; total: number }> => {
    const params: Record<string, unknown> = {};
    if (filters.tenantId) params.tenantId = filters.tenantId;
    if (filters.role) params.role = filters.role;
    // Sent only when actually set: omitting it means "any", and `false` is a
    // real filter value that must survive the trip.
    if (filters.isActive !== undefined) params.isActive = filters.isActive;
    if (filters.q) params.q = filters.q;
    if (filters.skip !== undefined) params.skip = filters.skip;
    if (filters.take !== undefined) params.take = filters.take;

    const response = await apiClient.get<{ items: PlatformUser[]; total: number }>(
      `/tenants/users`,
      { params }
    );
    return response.data;
  },

  /**
   * Invite someone into a workspace by email, defaulting to Business Owner.
   * Lets the recipient choose their own password through the ordinary
   * invitation-acceptance page. Returns no token — the link only ever
   * travels by email.
   */
  invitePlatformUser: async (
    tenantId: string,
    input: InvitePlatformUserInput
  ): Promise<{ email: string; role: string }> => {
    const response = await apiClient.post<{ invitation: { email: string; role: string } }>(
      `/tenants/${tenantId}/invitations`,
      input
    );
    return response.data.invitation;
  },

  /**
   * Invite another Platform Admin by email — the tenant-less counterpart to
   * `invitePlatformUser`. No workspace to address it to.
   */
  invitePlatformAdmin: async (input: { email: string }): Promise<{ email: string; role: string }> => {
    const response = await apiClient.post<{ invitation: { email: string; role: string } }>(
      `/tenants/platform-admins/invitations`,
      input
    );
    return response.data.invitation;
  },

  /**
   * Platform Admin user lifecycle. All four are SUPER_ADMIN-only and, like the
   * tenant actions above, live at the root /api/tenants/users rather than
   * under /api/:tenantSlug — they act on ANY account across workspaces.
   */

  /** Active staff eligible to become the new Business Owner of `userId`'s workspace. */
  getOwnershipTransferCandidates: async (userId: string): Promise<OwnershipTransferCandidate[]> => {
    const response = await apiClient.get<{ items: OwnershipTransferCandidate[] }>(
      `/tenants/users/${userId}/ownership-transfer-candidates`
    );
    return response.data.items;
  },

  /**
   * Idempotent server-side. `newOwnerId` is required only when the target is
   * a Business Owner with other active staff — the server responds 409 with
   * `code: 'OWNERSHIP_TRANSFER_REQUIRED'` when it's missing.
   */
  suspendUser: async (userId: string, newOwnerId?: string): Promise<PlatformUser> => {
    const response = await apiClient.patch<{ user: PlatformUser }>(
      `/tenants/users/${userId}/suspend`,
      { newOwnerId }
    );
    return response.data.user;
  },

  /**
   * Idempotent server-side. `ownershipResolution` is required only when the
   * target has an unresolved ownership transfer from their suspension — the
   * server responds 409 with `code: 'RESTORE_CHOICE_REQUIRED'` when it's
   * missing.
   */
  reactivateUser: async (
    userId: string,
    ownershipResolution?: OwnershipResolution
  ): Promise<PlatformUser> => {
    const response = await apiClient.patch<{ user: PlatformUser }>(
      `/tenants/users/${userId}/reactivate`,
      { ownershipResolution }
    );
    return response.data.user;
  },

  /**
   * Permanently (soft-)deletes an account. `confirmEmail` must equal the
   * target's own current email — enforced server-side, not just a
   * client-side gate. `newOwnerId` is required only when the target is a
   * Business Owner with other active staff.
   */
  deleteUser: async (userId: string, confirmEmail: string, newOwnerId?: string): Promise<void> => {
    await apiClient.delete(`/tenants/users/${userId}`, { data: { confirmEmail, newOwnerId } });
  },

  /**
   * Close YOUR OWN platform admin account. There is no id — the server always
   * targets the caller, so no admin can remove another this way.
   *
   * Responds 409 `LAST_PLATFORM_ADMIN` when no other admin would remain, which
   * is the condition the profile page checks before enabling its control.
   */
  deleteOwnPlatformAdmin: async (confirmEmail: string): Promise<void> => {
    await apiClient.delete(`/tenants/platform-admins/me`, { data: { confirmEmail } });
  },

  /**
   * The values a NEWLY provisioned workspace starts with. Never touches an
   * existing tenant — see `bulkUpdateTenantSettings` for the separate action
   * that does.
   */
  getPlatformSettings: async (): Promise<PlatformSettings> => {
    const response = await apiClient.get<PlatformSettings>(`/platform-settings`);
    return response.data;
  },

  updatePlatformSettings: async (patch: WorkspaceSettingsFields): Promise<PlatformSettings> => {
    const response = await apiClient.put<PlatformSettings>(`/platform-settings`, patch);
    return response.data;
  },

  /**
   * Writes directly onto each selected tenant's OWN settings — the same effect
   * as that workspace's Business Owner making the change themselves, just done
   * to several at once. Returns how many rows actually matched, so a caller
   * can tell "applied" from "some of those workspaces no longer exist".
   */
  bulkUpdateTenantSettings: async (
    tenantIds: string[],
    settings: WorkspaceSettingsFields
  ): Promise<{ updatedCount: number }> => {
    const response = await apiClient.put<{ updatedCount: number }>(`/tenants/bulk-settings`, {
      tenantIds,
      settings,
    });
    return response.data;
  },
};

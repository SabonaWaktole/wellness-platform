import { z } from 'zod';
import { SUPPORTED_LANGUAGES } from '../../../../tenant/domain/entities/Tenant';

/*
 * `register` used to live here, for public self-registration. Workspaces are now
 * provisioned only by a platform administrator through POST /api/tenants, which
 * validates the identical fields via `tenantSchemas.createTenant` against the
 * same `CreateTenantWithOwnerUseCase`. Nothing was lost by removing it — the
 * route was the only caller.
 */
export const authSchemas = {
  login: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
  inviteStaff: z.object({
    email: z.string().email(),
    // One of the workspace's roles (FR-USR-02); the use case checks it belongs to this tenant.
    roleId: z.string().min(1),
    warehouseId: z.string().optional().nullable(),
  }),
  /**
   * Creating an account with its password already set, as opposed to
   * `inviteStaff`, which only sends a link. Same role choice and same password
   * floor: an admin-set password is a real credential, so it is not relaxed.
   */
  createUser: z.object({
    email: z.string().email(),
    password: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
    roleId: z.string().min(1),
    firstName: z.string().min(1).optional().nullable(),
    lastName: z.string().min(1).optional().nullable(),
    phone: z.string().optional().nullable(),
    warehouseId: z.string().optional().nullable(),
  }),
  updateStaffRole: z.object({
    roleId: z.string().min(1),
    warehouseId: z.string().optional().nullable(),
  }),
  deactivateStaff: z.object({
    // FR-USR-05: required by the use case whenever the user still has companies.
    reassignToUserId: z.string().min(1).optional().nullable(),
  }),
  acceptInvitation: z.object({
    token: z.string().min(1),
    newPassword: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  }),
  requestPasswordReset: z.object({
    email: z.string().email(),
  }),
  resetPassword: z.object({
    token: z.string().min(1),
    newPassword: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  }),
  updateProfile: z.object({
    firstName: z.string().min(1).optional().nullable(),
    lastName: z.string().min(1).optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional(),
    // Interface language override. Explicitly nullable: sending null is how a
    // user returns to "follow the workspace default", which is a real choice
    // and not the same as omitting the field.
    language: z.enum(SUPPORTED_LANGUAGES).optional().nullable(),
  }),
  changePassword: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  }),
};

import { z } from 'zod';

export const tenantSchemas = {
  /**
   * Super Admin provisioning a workspace on a business's behalf.
   *
   * Deliberately the same field names and the same rules as
   * `authSchemas.register`, because both feed the same
   * `CreateTenantWithOwnerUseCase`. Two schemas that disagreed about what a
   * valid slug or password is would mean a workspace an admin can create but
   * its owner could never have registered, or vice versa.
   *
   * The password rules in particular are NOT relaxed for the admin path. An
   * admin-set password is a real credential the owner will log in with, so it
   * gets the same floor as a self-chosen one.
   */
  createTenant: z.object({
    companyName: z.string().min(1),
    urlSlug: z.string().min(1).regex(/^[a-z0-9-]+$/),
    ownerEmail: z.string().email(),
    ownerPassword: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  }),

  /**
   * Super Admin creating a user inside an existing workspace, from the platform
   * console rather than from inside that workspace.
   *
   * `SUPER_ADMIN` is absent from the role enum on purpose, and not only as
   * defence in depth: the platform role belongs to no workspace, so creating one
   * "in" a tenant is not a request that can be honoured. `CreateUserUseCase`
   * rejects it too, for callers that never pass through this schema.
   */
  createUser: z.object({
    email: z.string().email(),
    password: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
    role: z.enum(['STAFF', 'BUSINESS_OWNER']),
    firstName: z.string().min(1).optional().nullable(),
    lastName: z.string().min(1).optional().nullable(),
    phone: z.string().optional().nullable(),
    warehouseId: z.string().optional().nullable(),
  }),

  /**
   * Super Admin permanently deleting a workspace. `confirmSlug` must equal
   * the workspace's own `urlSlug`, checked again in `DeleteTenantUseCase`
   * against the real record — this only guards against an empty or
   * obviously-wrong body reaching the use case at all.
   */
  deleteTenant: z.object({
    confirmSlug: z.string().min(1),
  }),

  /**
   * Super Admin suspending any platform user. `newOwnerId` is only required
   * when the target is a Business Owner with other active staff —
   * `PlatformSuspendUserUseCase` is what actually enforces that, this only
   * shapes the optional field.
   */
  suspendUser: z.object({
    newOwnerId: z.string().optional(),
  }),

  /**
   * Super Admin reactivating any platform user. `ownershipResolution` is only
   * required when the target has an unresolved ownership transfer —
   * `PlatformReactivateUserUseCase` enforces that, and documents what each of
   * the three choices does.
   */
  reactivateUser: z.object({
    ownershipResolution: z.enum(['RESTORE', 'KEEP', 'KEEP_BOTH']).optional(),
  }),

  /**
   * Super Admin inviting someone into a workspace from outside the platform —
   * the third route to becoming a Business Owner, alongside promotion from
   * staff and an invitation from an existing owner.
   *
   * The role defaults to BUSINESS_OWNER because that is what this endpoint is
   * for; STAFF stays available so the console does not need a near-identical
   * second endpoint to invite a team member. `SUPER_ADMIN` is absent for the
   * same reason it is absent from `createUser` above.
   */
  inviteUser: z.object({
    email: z.string().email(),
    role: z.enum(['BUSINESS_OWNER', 'STAFF']).default('BUSINESS_OWNER'),
  }),

  /**
   * Super Admin permanently deleting a platform user. `confirmEmail` must
   * equal the target's own current email, checked again in
   * `PlatformDeleteUserUseCase` against the real record — same "type it
   * exactly" pattern as `deleteTenant` above.
   */
  deleteUser: z.object({
    confirmEmail: z.string().min(1),
    newOwnerId: z.string().optional(),
  }),

  /**
   * One platform administrator appointing another.
   *
   * No `role` and no `tenantId`: both are fixed by what this endpoint is. The
   * role is SUPER_ADMIN by definition, and a platform admin belongs to no
   * workspace — accepting either field would invite a caller to think they
   * could vary it. Same password floor as every other account-creating schema
   * here.
   */
  createPlatformAdmin: z.object({
    email: z.string().email(),
    password: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
    firstName: z.string().min(1).optional().nullable(),
    lastName: z.string().min(1).optional().nullable(),
  }),

  /**
   * A platform administrator closing their own account. No id: the target is
   * always the caller — see `DeletePlatformAdminSelfUseCase` for why that is
   * structural rather than a convenience.
   */
  deleteOwnPlatformAdmin: z.object({
    confirmEmail: z.string().min(1),
  }),
};

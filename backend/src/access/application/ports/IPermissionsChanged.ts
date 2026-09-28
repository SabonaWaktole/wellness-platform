/**
 * Signalled whenever a write could change what some user's `AccessContext`
 * looks like, so the cache that sits in front of `ResolveAccessContextUseCase`
 * never has to be trusted for longer than its TTL. Slice 5 (role change,
 * deactivate, reactivate) and Slice 6 (edit a role's permissions) call this;
 * this slice only defines and wires it.
 */
export interface IPermissionsChanged {
  /** This one user's role or account status changed. */
  userChanged(userId: string): void;
  /** A role's permissions changed, or a role was deleted — invalidate everyone in the tenant. */
  tenantChanged(tenantId: string): void;
}

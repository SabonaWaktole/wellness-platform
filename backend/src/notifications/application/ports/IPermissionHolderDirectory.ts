/**
 * Who may decide something gated by a scoped permission (M2 Slice 10, D9).
 *
 * `toRole` only knows the coarse `UserRole`, so it cannot express "Sales
 * Manager, or the CEO when the Sales Manager asks". This resolves every
 * active user whose role holds the key at a scope that admits the subject's
 * owner — minus the requester — so a Sales Manager's own request goes to the
 * CEO by default (Q8, FR-DSC-09).
 */
export interface IPermissionHolderDirectory {
  /**
   * Active user ids of the tenant holding `permissionKey` whose grant admits
   * a record owned by `subjectOwnerId` (or by no one, when null), without
   * `excludeUserId`. Never returns deactivated or cross-tenant users.
   * With `onlyScope`, only holders whose grant is at exactly that scope: "the
   * Sales Manager" of an instalment is the holder at Team (M3 Slice 9, FR-PAY-13).
   */
  approvers(
    tenantId: string,
    permissionKey: string,
    subjectOwnerId: string | null,
    excludeUserId?: string,
    onlyScope?: 'OWN' | 'TEAM' | 'ALL'
  ): Promise<string[]>;
}

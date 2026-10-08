export type FamilyLinkRefusal = 'SELF_LINK' | 'PRINCIPAL_IS_FAMILY_MEMBER' | 'ALREADY_HAS_PRINCIPAL' | 'MEMBER_IS_PRINCIPAL';

export interface FamilyLinkContext {
  memberId: string;
  principalId: string;
  /** The principal the candidate already has, if any. */
  memberPrincipalId: string | null;
  /** The principal the proposed principal has, if any. */
  principalPrincipalId: string | null;
  /** Whether the candidate is already the principal of someone. */
  memberHasDependants: boolean;
}

/**
 * FR-FAM-03: a family member has one principal, a principal cannot be a family
 * member of another, and nobody is linked to themselves. Returns the refusal,
 * or null when the link is allowed.
 */
export function checkFamilyLink(ctx: FamilyLinkContext): FamilyLinkRefusal | null {
  if (ctx.memberId === ctx.principalId) return 'SELF_LINK';
  if (ctx.principalPrincipalId !== null) return 'PRINCIPAL_IS_FAMILY_MEMBER';
  if (ctx.memberPrincipalId !== null) return 'ALREADY_HAS_PRINCIPAL';
  if (ctx.memberHasDependants) return 'MEMBER_IS_PRINCIPAL';
  return null;
}

import type { Validity } from '../domain/memberValidity';
import type { Tier } from '../domain/Tier';
import type { TermSource } from '../domain/MemberTerm';
import type { MemberPaymentView } from './presentMemberPayment';
import type { VipRequestView } from './presentVip';
import type { VerificationLogEntry } from './presentVerification';
import type { MemberFamilyEventRecord, MemberRecord, MemberStatusHistoryRecord, MemberTermRecord, MemberTierHistoryRecord } from './ports/IMemberStore';

/**
 * What the member routes send (FR-MEM-02, FR-MEM-08). This is the one place
 * that decides the shape of a member response; the route then passes it through
 * `redactMemberFields`, which removes contact fields, the note, payments and the
 * verification log by permission (FR-RBAC-27). The card token is not here.
 */
export interface MemberSummary {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  /** The stored copy, kept by the domain actions and the daily job (D2). */
  tier: Tier;
  status: MemberRecord['status'];
  valid: boolean;
  source: 'CORPORATE' | 'INDIVIDUAL' | 'FAMILY';
  startsOn: string;
  employer: { id: string; name: string | null } | null;
  formerEmployee: boolean;
  /** A paid term ends within the Expiring soon window (FR-TIR-10). */
  expiringSoon: boolean;
}

export function presentMemberSummary(member: MemberRecord, expiringSoon = false): MemberSummary {
  return {
    id: member.id,
    memberNumber: member.memberNumber,
    firstName: member.firstName,
    lastName: member.lastName,
    dateOfBirth: member.dateOfBirth,
    phone: member.phone,
    email: member.email,
    tier: member.currentTier,
    status: member.status,
    valid: member.status === 'ACTIVE',
    source: member.employerClientId ? 'CORPORATE' : member.principalMemberId ? 'FAMILY' : 'INDIVIDUAL',
    startsOn: member.startsOn,
    employer: member.employerClientId ? { id: member.employerClientId, name: member.employerName } : null,
    formerEmployee: member.formerEmployerClientId !== null,
    expiringSoon,
  };
}

export interface RelationshipLabel {
  id: string;
  nameSq: string;
  nameEn: string;
}

/** The family group of FR-FAM-07: the principal of a family member, or the members of a principal. */
export interface FamilyGroup {
  principalMemberId: string | null;
  relationshipId: string | null;
  principal: {
    id: string;
    memberNumber: string;
    name: string;
    relationship: RelationshipLabel | null;
    confirmedBy: string | null;
    confirmedAt: Date | null;
  } | null;
  dependants: Array<{
    id: string;
    memberNumber: string;
    name: string;
    relationship: RelationshipLabel | null;
    tier: Tier;
    status: MemberRecord['status'];
    valid: boolean;
    confirmedBy: string | null;
    confirmedAt: Date | null;
  }>;
  /** Links and removals, newest first, so a removed link is still explainable (FR-FAM-06). */
  history: Array<{
    kind: MemberFamilyEventRecord['kind'];
    principal: string | null;
    relationship: RelationshipLabel | null;
    reason: string | null;
    by: string | null;
    at: Date;
  }>;
}

export interface MemberDetail extends MemberSummary {
  language: MemberRecord['language'];
  cityId: string | null;
  note: string | null;
  createdBy: { id: string; name: string | null };
  createdAt: Date;
  closedAt: Date | null;
  /** Calculated on today's date from the terms (FR-MEM-06, D2). */
  effectiveTier: Tier;
  validity: { valid: boolean; reason: 'SUSPENDED' | 'CLOSED' | null };
  currentTerm: { source: TermSource; startsOn: string; endsOn: string | null } | null;
  terms: MemberTermRecord[];
  tierHistory: Array<MemberTierHistoryRecord & { changedBy: string | null }>;
  statusHistory: Array<MemberStatusHistoryRecord & { changedBy: string | null }>;
  family: FamilyGroup;
  /** Requests, decisions and endings, newest first, and the review date of the VIP term running today (FR-VIP-05). */
  vip: { requests: VipRequestView[]; reviewDate: string | null };
  formerEmployerClientId: string | null;
  leftCompanyAt: string | null;
  /** The checks of this card by Reception and partner clinics, newest first (FR-VER-06). Removed without "Members: view" (FR-RBAC-27). */
  verificationEvents: VerificationLogEntry[];
  /** Present only for a user who holds "Members: view payments" (FR-MPAY-08). */
  payments?: MemberPaymentView[];
}

export function presentMember(input: {
  member: MemberRecord;
  terms: MemberTermRecord[];
  tierHistory: MemberTierHistoryRecord[];
  statusHistory: MemberStatusHistoryRecord[];
  effectiveTier: Tier;
  current: { source: TermSource; startsOn: string; endsOn: string | null } | null;
  validity: Validity;
  userNames: Record<string, string>;
  family: Omit<FamilyGroup, 'principalMemberId' | 'relationshipId'>;
  vip: MemberDetail['vip'];
  expiringSoon: boolean;
  verificationEvents: VerificationLogEntry[];
}): MemberDetail {
  const { member, userNames } = input;
  const nameOf = (id: string | null) => (id ? (userNames[id] ?? null) : null);
  return {
    ...presentMemberSummary(member, input.expiringSoon),
    // The member page shows the calculated tier; `tier` of the summary is the stored copy.
    tier: input.effectiveTier,
    language: member.language,
    cityId: member.cityId,
    note: member.note,
    createdBy: { id: member.createdBy, name: nameOf(member.createdBy) },
    createdAt: member.createdAt,
    closedAt: member.closedAt,
    effectiveTier: input.effectiveTier,
    validity: { valid: input.validity.valid, reason: input.validity.reason },
    currentTerm: input.current,
    terms: input.terms,
    tierHistory: input.tierHistory.map((h) => ({ ...h, changedBy: nameOf(h.changedByUserId) })),
    statusHistory: input.statusHistory.map((h) => ({ ...h, changedBy: nameOf(h.changedByUserId) })),
    family: { principalMemberId: member.principalMemberId, relationshipId: member.relationshipId, ...input.family },
    vip: input.vip,
    formerEmployerClientId: member.formerEmployerClientId,
    leftCompanyAt: member.leftCompanyAt,
    verificationEvents: input.verificationEvents,
  };
}

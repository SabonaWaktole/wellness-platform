import type { Validity } from '../domain/memberValidity';
import type { Tier } from '../domain/Tier';
import type { TermSource } from '../domain/MemberTerm';
import type { MemberPaymentView } from './presentMemberPayment';
import type { MemberRecord, MemberStatusHistoryRecord, MemberTermRecord, MemberTierHistoryRecord } from './ports/IMemberStore';

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
}

export function presentMemberSummary(member: MemberRecord): MemberSummary {
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
  };
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
  family: { principalMemberId: string | null; relationshipId: string | null; dependants: never[] };
  formerEmployerClientId: string | null;
  leftCompanyAt: string | null;
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
}): MemberDetail {
  const { member, userNames } = input;
  const nameOf = (id: string | null) => (id ? (userNames[id] ?? null) : null);
  return {
    ...presentMemberSummary(member),
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
    // Slice 6 fills the family group.
    family: { principalMemberId: member.principalMemberId, relationshipId: member.relationshipId, dependants: [] },
    formerEmployerClientId: member.formerEmployerClientId,
    leftCompanyAt: member.leftCompanyAt,
  };
}

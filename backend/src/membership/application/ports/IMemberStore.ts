import type { PersonalDetails, MemberLanguage } from '../../domain/Member';
import type { MemberStatus } from '../../domain/memberValidity';
import type { Tier } from '../../domain/Tier';
import type { TermSource } from '../../domain/MemberTerm';

/**
 * A member as the application sees it. The card token is deliberately not
 * here: nothing in the member record, its audit entry or its presenter can
 * leak it (FR-AUD-16, FR-CRD-08). Slice 11 reads it through its own port.
 * Dates are calendar days, YYYY-MM-DD.
 */
export interface MemberRecord {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  language: MemberLanguage;
  cityId: string | null;
  status: MemberStatus;
  /** The stored copy. Single-member reads calculate the tier from the terms (D2). */
  currentTier: Tier;
  startsOn: string;
  employerClientId: string | null;
  employerName: string | null;
  formerEmployerClientId: string | null;
  leftCompanyAt: string | null;
  principalMemberId: string | null;
  relationshipId: string | null;
  relationshipConfirmedBy: string | null;
  relationshipConfirmedAt: Date | null;
  note: string | null;
  createdBy: string;
  createdAt: Date;
  closedAt: Date | null;
  anonymisedAt: Date | null;
}

export interface MemberTermRecord {
  id: string;
  tier: Tier;
  source: TermSource;
  startsOn: string;
  endsOn: string | null;
}

export interface MemberTierHistoryRecord {
  id: string;
  fromTier: Tier;
  toTier: Tier;
  reason: string;
  comment: string | null;
  changedByUserId: string | null;
  createdAt: Date;
}

export interface MemberStatusHistoryRecord {
  id: string;
  fromStatus: MemberStatus | null;
  toStatus: MemberStatus;
  reason: string | null;
  changedByUserId: string | null;
  createdAt: Date;
}

export interface MemberFamilyEventRecord {
  id: string;
  kind: 'LINKED' | 'REMOVED';
  principalMemberId: string | null;
  relationshipId: string | null;
  reason: string | null;
  byUserId: string;
  at: Date;
}

export interface FamilyLinkData {
  principalMemberId: string;
  relationshipId: string;
  confirmedBy: string;
  confirmedAt: Date;
}

export type MemberSource = 'CORPORATE' | 'INDIVIDUAL' | 'FAMILY';
export type MemberSortField = 'name' | 'memberNumber' | 'tier' | 'createdAt';

export interface MemberSearchParams {
  query?: string;
  tier?: Tier;
  status?: MemberStatus;
  validity?: 'VALID' | 'NOT_VALID';
  source?: MemberSource;
  employerClientId?: string;
  expiringSoon?: { from: string; to: string };
  /** A VIP term ending in the window, with no later VIP term (FR-VIP-04). */
  vipReviewDue?: { from: string; to: string };
  formerEmployee?: boolean;
  /** The Area and City of the employer company (FR-MEM-07). */
  areaId?: string;
  cityId?: string;
  sortBy: MemberSortField;
  sortDir: 'asc' | 'desc';
  page: number;
  limit: number;
}

export interface NewMemberData {
  id: string;
  tenantId: string;
  memberNumber: string;
  cardToken: string;
  createdBy: string;
  startsOn: string;
  details: PersonalDetails;
}

export interface StatusHistoryEntry {
  memberId: string;
  fromStatus: MemberStatus | null;
  toStatus: MemberStatus;
  reason: string | null;
  changedByUserId: string | null;
}

export interface IMemberStore {
  create(data: NewMemberData): Promise<MemberRecord>;
  find(tenantId: string, id: string): Promise<MemberRecord | null>;
  /**
   * FR-MEM-04: members with the same email, or the same phone, or the same
   * first name, last name and date of birth. Details are already normalised,
   * and the comparison ignores case.
   */
  findDuplicates(tenantId: string, details: PersonalDetails, excludeId?: string): Promise<MemberRecord[]>;
  updateDetails(tenantId: string, id: string, details: PersonalDetails): Promise<void>;
  setStatus(tenantId: string, id: string, status: MemberStatus, closedAt: Date | null): Promise<void>;
  addStatusHistory(entry: StatusHistoryEntry): Promise<void>;
  /** True when the id is a city of this workspace's predefined list (FR-MEM-02). */
  cityExists(tenantId: string, cityId: string): Promise<boolean>;
  search(tenantId: string, params: MemberSearchParams): Promise<{ data: MemberRecord[]; total: number }>;
  listTerms(memberId: string): Promise<MemberTermRecord[]>;
  listTierHistory(memberId: string): Promise<MemberTierHistoryRecord[]>;
  listStatusHistory(memberId: string): Promise<MemberStatusHistoryRecord[]>;
  /** The latest end date of each member's paid terms, for the Expiring soon badge (FR-TIR-10). Members with none are left out. */
  latestPaidEnds(memberIds: string[]): Promise<Record<string, string>>;
  /** The members whose principal is this member (FR-FAM-07). */
  listDependants(tenantId: string, principalId: string): Promise<MemberRecord[]>;
  /** Sets the family link, or clears it with null (FR-FAM-01, FR-FAM-06). */
  setFamilyLink(tenantId: string, id: string, link: FamilyLinkData | null): Promise<void>;
  addFamilyEvent(event: Omit<MemberFamilyEventRecord, 'id' | 'at'> & { memberId: string }): Promise<void>;
  listFamilyEvents(memberId: string): Promise<MemberFamilyEventRecord[]>;
  /** Display names for the users who created or changed members, by user id. */
  userNames(tenantId: string, userIds: string[]): Promise<Record<string, string>>;
}

/** The next member number, from the workspace prefix and a sequence with no yearly restart (FR-MEM-03). */
export interface IMemberNumbers {
  next(tenantId: string): Promise<string>;
}

/** Mints the secret behind a member's card link. */
export type CardTokenGenerator = () => string;

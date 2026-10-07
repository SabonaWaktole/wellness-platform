import { apiClient as api } from '../api';
import type { Tier } from './membershipSettingsService';
import type { MemberPayment } from './memberPaymentService';

export type MemberStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
export type MemberSource = 'CORPORATE' | 'INDIVIDUAL' | 'FAMILY';
export type MemberLanguage = 'sq' | 'en' | 'el' | 'it';
export const MEMBER_LANGUAGES: MemberLanguage[] = ['sq', 'en', 'el', 'it'];
export type StatusAction = 'SUSPEND' | 'REINSTATE' | 'CLOSE' | 'REOPEN';

/** A row of the list. `phone` and `email` are absent without "Members: view" (FR-RBAC-27). */
export interface MemberSummary {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  phone?: string | null;
  email?: string | null;
  tier: Tier;
  status: MemberStatus;
  valid: boolean;
  source: MemberSource;
  startsOn: string;
  employer: { id: string; name: string | null } | null;
  formerEmployee: boolean;
}

export interface MemberTerm {
  id: string;
  tier: Tier;
  source: 'PAID' | 'SPONSORED' | 'VIP' | 'DOWNGRADE' | 'CORRECTION';
  startsOn: string;
  endsOn: string | null;
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
    confirmedAt: string | null;
  } | null;
  dependants: Array<{
    id: string;
    memberNumber: string;
    name: string;
    relationship: RelationshipLabel | null;
    tier: Tier;
    status: MemberStatus;
    valid: boolean;
    confirmedBy: string | null;
    confirmedAt: string | null;
  }>;
  history: Array<{ kind: 'LINKED' | 'REMOVED'; principal: string | null; relationship: RelationshipLabel | null; reason: string | null; by: string | null; at: string }>;
}

/** Adding a family member: an existing member, or the details of a new one (FR-FAM-01). */
export interface AddFamilyInput {
  relationshipId: string;
  confirmed: boolean;
  memberId?: string;
  member?: Partial<MemberDetailsInput>;
}

export interface MemberDetail extends MemberSummary {
  language: MemberLanguage;
  cityId: string | null;
  note?: string | null;
  createdBy: { id: string; name: string | null };
  createdAt: string;
  closedAt: string | null;
  effectiveTier: Tier;
  validity: { valid: boolean; reason: 'SUSPENDED' | 'CLOSED' | null };
  currentTerm: { source: MemberTerm['source']; startsOn: string; endsOn: string | null } | null;
  terms: MemberTerm[];
  tierHistory: Array<{ id: string; fromTier: Tier; toTier: Tier; reason: string; comment: string | null; createdAt: string; changedBy: string | null }>;
  statusHistory: Array<{ id: string; fromStatus: MemberStatus | null; toStatus: MemberStatus; reason: string | null; createdAt: string; changedBy: string | null }>;
  family: FamilyGroup;
  formerEmployerClientId: string | null;
  leftCompanyAt: string | null;
  /** Only for a user who holds "Members: view payments" (FR-MPAY-08). */
  payments?: MemberPayment[];
}

/** The personal details of FR-MEM-09: the only fields a member form can send. */
export interface MemberDetailsInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  language: MemberLanguage;
  cityId: string | null;
  note: string | null;
}

export interface MemberQuery {
  query?: string;
  tier?: Tier | '';
  status?: MemberStatus | '';
  validity?: 'VALID' | 'NOT_VALID' | '';
  source?: MemberSource | '';
  employerClientId?: string;
  expiringSoon?: boolean;
  vipReviewDue?: boolean;
  formerEmployee?: boolean;
  areaId?: string;
  cityId?: string;
  sortBy?: 'name' | 'memberNumber' | 'tier' | 'createdAt';
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface MemberPage {
  data: MemberSummary[];
  total: number;
  page: number;
  limit: number;
}

const base = (slug: string) => `/${slug}/membership/members`;

/** Drops empty filters, so the URL only carries what the user chose. */
const clean = (query: MemberQuery) =>
  Object.fromEntries(Object.entries(query).filter(([, value]) => value !== '' && value !== undefined && value !== false));

export const memberService = {
  search: async (slug: string, query: MemberQuery) => (await api.get<MemberPage>(base(slug), { params: clean(query) })).data,
  get: async (slug: string, id: string) => (await api.get<{ data: MemberDetail }>(`${base(slug)}/${id}`)).data.data,
  /** `confirmDifferentPerson` saves a member the duplicate check reported (FR-MEM-04). */
  register: async (slug: string, body: MemberDetailsInput, confirmDifferentPerson = false) =>
    (await api.post<{ data: MemberSummary }>(base(slug), { ...body, ...(confirmDifferentPerson ? { confirmDifferentPerson } : {}) })).data.data,
  update: async (slug: string, id: string, body: Partial<MemberDetailsInput>, confirmDifferentPerson = false) =>
    (await api.patch<{ data: MemberSummary }>(`${base(slug)}/${id}`, { ...body, ...(confirmDifferentPerson ? { confirmDifferentPerson } : {}) })).data.data,
  changeStatus: async (slug: string, id: string, action: StatusAction, reason?: string) =>
    (await api.post<{ data: MemberSummary }>(`${base(slug)}/${id}/status`, { action, ...(reason ? { reason } : {}) })).data.data,
  /** The relationships a new family link can use, active ones only (FR-FAM-02). */
  familyRelationships: async (slug: string) => (await api.get<{ data: RelationshipLabel[] }>(`${base(slug)}/family/relationships`)).data.data,
  addFamilyMember: async (slug: string, principalId: string, body: AddFamilyInput, confirmDifferentPerson = false) =>
    (await api.post<{ data: MemberSummary }>(`${base(slug)}/${principalId}/family`, { ...body, ...(confirmDifferentPerson ? { confirmDifferentPerson } : {}) })).data.data,
  removeFamilyLink: async (slug: string, memberId: string, reason: string) =>
    (await api.post<{ data: MemberSummary }>(`${base(slug)}/${memberId}/family/remove`, { reason })).data.data,
};

/** The code of a 409 about a family link (FAMILY_LINK_REFUSED) with its reason, if the error is one. */
export const familyRefusalOf = (err: unknown): string | null => {
  const response = (err as { response?: { status?: number; data?: { code?: string; reason?: string } } })?.response;
  return response?.status === 409 && response.data?.code === 'FAMILY_LINK_REFUSED' ? (response.data.reason ?? null) : null;
};

/** The existing members a duplicate refusal names, when the error is one (FR-MEM-04). */
export const duplicatesOf = (err: unknown): MemberSummary[] | null => {
  const response = (err as { response?: { status?: number; data?: { code?: string; duplicates?: MemberSummary[] } } })?.response;
  return response?.status === 409 && response.data?.code === 'DUPLICATE_MEMBER' ? (response.data.duplicates ?? []) : null;
};

/** The field a server refusal names, if any. */
export const refusedField = (err: unknown): string | null => (err as { response?: { data?: { field?: string } } })?.response?.data?.field ?? null;

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
  family: { principalMemberId: string | null; relationshipId: string | null; dependants: unknown[] };
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
};

/** The existing members a duplicate refusal names, when the error is one (FR-MEM-04). */
export const duplicatesOf = (err: unknown): MemberSummary[] | null => {
  const response = (err as { response?: { status?: number; data?: { code?: string; duplicates?: MemberSummary[] } } })?.response;
  return response?.status === 409 && response.data?.code === 'DUPLICATE_MEMBER' ? (response.data.duplicates ?? []) : null;
};

/** The field a server refusal names, if any. */
export const refusedField = (err: unknown): string | null => (err as { response?: { data?: { field?: string } } })?.response?.data?.field ?? null;

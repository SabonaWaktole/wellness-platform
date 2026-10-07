import { apiClient as api } from '../api';
import type { Tier } from './membershipSettingsService';

export const REPORT_PRESETS = ['THIS_WEEK', 'THIS_MONTH', 'THIS_QUARTER', 'THIS_YEAR', 'CUSTOM'] as const;
export type ReportPreset = 'TODAY' | 'LAST_MONTH' | (typeof REPORT_PRESETS)[number];

export type ReportName =
  | 'active'
  | 'monthly'
  | 'new'
  | 'renewals'
  | 'upgrades'
  | 'downgrades'
  | 'segments'
  | 'employers'
  | 'revenue'
  | 'expiring'
  | 'vip-reviews'
  | 'former-employees';

export interface ReportFilters {
  tier: Tier | '';
  segment: 'CORPORATE' | 'INDIVIDUAL' | '';
  employerClientId: string;
  areaId: string;
  cityId: string;
}

export interface ReportParams extends Partial<ReportFilters> {
  preset: ReportPreset;
  from?: string;
  to?: string;
}

export interface WorkingListRow {
  memberId: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  tier: Tier;
  date: string | null;
  employer: { id: string; name: string | null } | null;
  /** Only for a user with "Members: view". */
  phone?: string | null;
  email?: string | null;
}

export interface EmployerRow {
  companyId: string;
  name: string | null;
  members: number;
  sponsoredSilver: number;
  upgradedToPaid: number;
  formerEmployees: number;
}

/** The report as the server calculated it. Every figure is final: this client formats and never adds up (NFR-ACC-05). */
export interface MembershipReport {
  period: { preset: ReportPreset; from: string; to: string };
  asOf: string;
  active: {
    total: number;
    perTier: Array<{ tier: Tier; count: number; share: string | null }>;
    monthly: Array<{ month: string; total: number; perTier: Array<{ tier: Tier; count: number }> }>;
  };
  segments: { corporate: { count: number; share: string | null }; individual: { count: number; share: string | null } };
  newMembers: { total: number; corporate: number; individual: number; newPaidMemberships: number };
  renewals: {
    due: number;
    renewed: number;
    notRenewed: number;
    rate: string | null;
    perTier: Array<{ tier: Tier; due: number; renewed: number; notRenewed: number; rate: string | null }>;
  };
  upgrades: { count: number; amount?: string; perPath: Array<{ path: string; count: number; amount?: string }> };
  downgrades: { total: number; perPath: Array<{ path: string; count: number }>; perReason: Array<{ reason: string; count: number }> };
  employers: { rows: EmployerRow[]; totals: { members: number; sponsoredSilver: number; upgradedToPaid: number; formerEmployees: number } };
  /** Only for a user with "Members: view payments". */
  revenue?: { count: number; total: string; rows: Array<{ kind: string; tier: Tier; count: number; total: string }> };
  lists: { expiring: WorkingListRow[]; vipReviews: WorkingListRow[]; formerEmployees: WorkingListRow[] };
}

const clean = (params: object) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined));
const base = (slug: string) => `/${slug}/membership/reports`;

export const membershipReportService = {
  get: async (slug: string, params: ReportParams): Promise<MembershipReport> =>
    (await api.get<{ data: MembershipReport }>(base(slug), { params: clean(params) })).data.data,
  /** One report as a CSV file with the same filters. The export is recorded in the audit log (FR-AUD-16). */
  downloadCsv: async (slug: string, report: ReportName, params: ReportParams): Promise<Blob> =>
    (await api.get<Blob>(`${base(slug)}/export.csv`, { params: clean({ ...params, report }), responseType: 'blob' })).data,
};

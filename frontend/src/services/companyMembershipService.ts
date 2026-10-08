import { apiClient as api } from '../api';
import type { MemberSummary } from './memberService';
import type { Tier } from './membershipSettingsService';
import type { EmployeeImportSummary } from './employeeImportService';

/** The data of the company page's Wellness+ tab (M4 Slice 10, FR-MEM-11). The server counts and judges; the screen only shows. */
export interface CompanyMembership {
  company: { id: string; name: string; employeeCount: number | null };
  summary: { members: number; employees: number | null; formerEmployees: number; perTier: Record<Tier, number> };
  /** Whether the employer's contract covers today, and the end date sponsored members show (FR-EMP-09). */
  sponsor: { valid: boolean; endsOn: string | null };
  members: MemberSummary[];
  formerEmployees: Array<MemberSummary & { leftCompanyAt: string | null }>;
  uploads: EmployeeImportSummary[];
}

export const companyMembershipService = {
  get: async (slug: string, clientId: string) => (await api.get<{ data: CompanyMembership }>(`/${slug}/clients/${clientId}/membership`)).data.data,
};

import { apiClient as api } from '../api';
import type { VipRequest, VipRequestStatus } from './memberService';

const base = (slug: string) => `/${slug}/membership/members`;

export interface VipRequestsPage {
  data: VipRequest[];
  total: number;
  page: number;
  limit: number;
}

export type VipRefusal = 'MEMBER_CLOSED' | 'OPEN_REQUEST' | 'OWN_REQUEST' | 'NOT_PENDING' | 'NOT_VIP';

/**
 * VIP requests (M4 Slice 7). The request carries a reason and nothing else: the term, its dates, the tier and the
 * review date are decided on the server (FR-VIP-03, FR-MEM-09).
 */
export const memberVipService = {
  request: async (slug: string, memberId: string, reason: string) =>
    (await api.post<{ data: VipRequest }>(`${base(slug)}/${memberId}/vip/request`, { reason })).data.data,
  decide: async (slug: string, requestId: string, decision: 'APPROVE' | 'REJECT', note?: string) =>
    (await api.post<{ data: VipRequest }>(`${base(slug)}/vip/requests/${requestId}/decision`, { decision, ...(note ? { note } : {}) })).data.data,
  end: async (slug: string, memberId: string, reason: string) =>
    (await api.post<{ data: { memberId: string; endedOn: string } }>(`${base(slug)}/${memberId}/vip/end`, { reason })).data.data,
  list: async (slug: string, params: { status?: VipRequestStatus | ''; page?: number; limit?: number }) =>
    (await api.get<VipRequestsPage>(`${base(slug)}/vip/requests`, { params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)) })).data,
};

/** The reason of a 409 about a VIP action (VIP_REFUSED), if the error is one. */
export const vipRefusalOf = (err: unknown): VipRefusal | null => {
  const response = (err as { response?: { status?: number; data?: { code?: string; reason?: VipRefusal } } })?.response;
  return response?.status === 409 && response.data?.code === 'VIP_REFUSED' ? (response.data.reason ?? null) : null;
};

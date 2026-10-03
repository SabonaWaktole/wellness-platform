import { apiClient as api } from '../api';
import type { OfferLanguage, OfferListParams, OfferPage, OfferView, PendingApprovalPage } from '../types/offer';

/** The offers API (M2 Slice 9: FR-OFR-05..15). Every response is scoped and redacted on the server. */
const base = (tenantSlug: string) => `/${tenantSlug}/offers`;
/** Discount approvals above the cap (M2 Slice 10: FR-DSC-03..12). */
const approvalsBase = (tenantSlug: string) => `/${tenantSlug}/discount-approvals`;

/** `filename="Oferta_kafe-blloku_OF-2026-0001.pdf"` from a Content-Disposition header. */
export function fileNameFrom(header: string | undefined): string | null {
  const match = header ? /filename="([^"]+)"/.exec(header) : null;
  return match ? match[1] : null;
}

const action = (path: string) => async (tenantSlug: string, id: string, body: object = {}): Promise<OfferView> =>
  (await api.post<{ data: OfferView }>(`${base(tenantSlug)}/${id}/${path}`, body)).data.data;

export const offerService = {
  /** FR-OFR-14: filters by status, salesperson, company and date. */
  list: async (tenantSlug: string, params: OfferListParams = {}): Promise<OfferPage> =>
    (
      await api.get<OfferPage>(base(tenantSlug), {
        params: { ...params, status: params.status?.length ? params.status.join(',') : undefined },
      })
    ).data,

  markReady: (tenantSlug: string, id: string) => action('mark-ready')(tenantSlug, id),
  /** FR-OFR-10: the date the PDF was emailed, YYYY-MM-DD. */
  markSent: (tenantSlug: string, id: string, sentDate: string) => action('mark-sent')(tenantSlug, id, { sentDate }),
  markAccepted: (tenantSlug: string, id: string, note: string | null) => action('mark-accepted')(tenantSlug, id, { note }),
  markRejected: (tenantSlug: string, id: string, note: string | null) => action('mark-rejected')(tenantSlug, id, { note }),
  /** FR-OFR-11: returns the new version. */
  revise: (tenantSlug: string, id: string) => action('revise')(tenantSlug, id),

  /** FR-DSC-06: the approver's pending list, oldest first. */
  pendingApprovals: async (tenantSlug: string, page = 1, pageSize = 25): Promise<PendingApprovalPage> =>
    (await api.get<PendingApprovalPage>(`${approvalsBase(tenantSlug)}/pending`, { params: { page, pageSize } })).data,

  /** FR-DSC-06: approve at the requested percent, or a lower one. Returns the ready offer. */
  approveDiscount: (tenantSlug: string, approvalId: string, approvedPercent?: string, comment?: string | null) =>
    api
      .post<{ data: OfferView }>(`${approvalsBase(tenantSlug)}/${approvalId}/approve`, { approvedPercent, comment })
      .then((response) => response.data.data),

  /** FR-DSC-06, 07: reject with a required comment. Returns the draft at the cap. */
  rejectDiscount: (tenantSlug: string, approvalId: string, comment: string) =>
    api
      .post<{ data: OfferView }>(`${approvalsBase(tenantSlug)}/${approvalId}/reject`, { comment })
      .then((response) => response.data.data),

  /** FR-DSC-10: the requester withdraws their pending request. Returns the draft. */
  withdrawApproval: (tenantSlug: string, approvalId: string) =>
    api
      .post<{ data: OfferView }>(`${approvalsBase(tenantSlug)}/${approvalId}/withdraw`, {})
      .then((response) => response.data.data),

  /**
   * The offer's PDF (FR-OFR-05, 06). Fetched as a blob through the
   * authenticated client: a bare URL in an iframe or a link would not carry
   * the session reliably. The preview asks for it inline, the download as an
   * attachment; the server names the file.
   */
  pdf: async (
    tenantSlug: string,
    id: string,
    language: OfferLanguage,
    disposition: 'inline' | 'attachment'
  ): Promise<{ blob: Blob; fileName: string | null }> => {
    const response = await api.get<Blob>(`${base(tenantSlug)}/${id}/pdf`, {
      params: { lang: language, disposition },
      responseType: 'blob',
    });
    return { blob: response.data, fileName: fileNameFrom(response.headers['content-disposition'] as string | undefined) };
  },
};

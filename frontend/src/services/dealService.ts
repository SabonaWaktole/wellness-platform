import { apiClient as api } from '../api';
import type { ActivityView } from '../types/client';
import type { BoardColumn, DealDetail, DealInput, DealListParams, DealPage, DealStage, NewDealInput, PipelineBoard } from '../types/deal';
import type { OfferView, SaveOfferInput } from '../types/offer';

/** The deals API (M2 Slice 6: FR-DEAL-01..11, 13, 19). Every response is scoped and redacted on the server. */
const base = (tenantSlug: string) => `/${tenantSlug}/deals`;

/** Lists travel comma-separated, as the backend reads them. */
const listParams = (params: DealListParams) => ({
  ...params,
  stage: params.stage?.length ? params.stage.join(',') : undefined,
  type: params.type?.length ? params.type.join(',') : undefined,
});

export const dealService = {
  list: async (tenantSlug: string, params: DealListParams = {}): Promise<DealPage> =>
    (await api.get<{ data: DealPage }>(base(tenantSlug), { params: listParams(params) })).data.data,

  board: async (tenantSlug: string): Promise<PipelineBoard> =>
    (await api.get<{ data: PipelineBoard }>(`${base(tenantSlug)}/board`)).data.data,

  /** The next cards of one board column. */
  column: async (tenantSlug: string, stage: DealStage, cursor: string): Promise<Pick<BoardColumn, 'stage' | 'items' | 'nextCursor'>> =>
    (await api.get<{ data: Pick<BoardColumn, 'stage' | 'items' | 'nextCursor'> }>(`${base(tenantSlug)}/board/column`, { params: { stage, cursor } }))
      .data.data,

  get: async (tenantSlug: string, id: string): Promise<DealDetail> =>
    (await api.get<{ data: DealDetail }>(`${base(tenantSlug)}/${id}`)).data.data,

  /** The deal page's activities (FR-ACT-05), newest first by when they happened. */
  activities: async (tenantSlug: string, id: string): Promise<ActivityView[]> =>
    (await api.get<{ data: ActivityView[] }>(`${base(tenantSlug)}/${id}/activities`)).data.data,

  /** The deal's offers, newest first (FR-DEAL-03). Needs `commercial.view`. */
  offers: async (tenantSlug: string, id: string): Promise<OfferView[]> =>
    (await api.get<{ data: OfferView[] }>(`${base(tenantSlug)}/${id}/offers`)).data.data,

  /** Saves the pricing screen as the deal's draft offer, creating or updating it (FR-PRC-12). */
  saveOffer: async (tenantSlug: string, id: string, input: SaveOfferInput): Promise<OfferView> =>
    (await api.put<{ data: OfferView }>(`${base(tenantSlug)}/${id}/offer`, input)).data.data,

  create: async (tenantSlug: string, input: NewDealInput): Promise<DealDetail> =>
    (await api.post<{ data: DealDetail }>(base(tenantSlug), input)).data.data,

  update: async (tenantSlug: string, id: string, input: Partial<DealInput>): Promise<DealDetail> =>
    (await api.patch<{ data: DealDetail }>(`${base(tenantSlug)}/${id}`, input)).data.data,

  changeStage: async (tenantSlug: string, id: string, stage: DealStage): Promise<DealDetail> =>
    (await api.post<{ data: DealDetail }>(`${base(tenantSlug)}/${id}/stage`, { stage })).data.data,

  reassign: async (tenantSlug: string, id: string, ownerUserId: string): Promise<DealDetail> =>
    (await api.post<{ data: DealDetail }>(`${base(tenantSlug)}/${id}/reassign`, { ownerUserId })).data.data,

  remove: async (tenantSlug: string, id: string): Promise<void> => {
    await api.delete(`${base(tenantSlug)}/${id}`);
  },
};

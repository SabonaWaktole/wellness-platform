/**
 * Deals and the pipeline (M2 Slice 6). Mirrors the backend's DealSummary and
 * DealDetail views. Money arrives as a Decimal string ("49.40") and is only
 * formatted here; it is absent altogether for a viewer without
 * `commercial.view`, and null until the deal has a priced offer (Slice 8).
 */
export const DEAL_STAGES = [
  'NEW_LEAD',
  'CONTACTED',
  'INTERESTED',
  'OFFER_PREPARED',
  'OFFER_SENT',
  'FOLLOW_UP',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

/** Won and Lost are reached through their own win and lose actions (Slice 13), never a stage move (FR-DEAL-07). */
export const CLOSED_DEAL_STAGES: readonly DealStage[] = ['WON', 'LOST'];
export const OPEN_DEAL_STAGES: readonly DealStage[] = DEAL_STAGES.filter((stage) => !CLOSED_DEAL_STAGES.includes(stage));
export const isOpenStage = (stage: string): boolean => OPEN_DEAL_STAGES.includes(stage as DealStage);

export const DEAL_TYPES = ['NEW_CONTRACT', 'RENEWAL', 'EXTRA_SERVICES'] as const;
export type DealType = (typeof DEAL_TYPES)[number];

export interface DealSummary {
  id: string;
  clientId: string;
  companyName: string;
  type: DealType;
  /** null: the default "<company> – <type>", see useDealTitle. */
  title: string | null;
  stage: DealStage;
  ownerUserId: string;
  ownerName: string;
  /** `YYYY-MM-DD`. */
  expectedCloseDate: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  netMonthlyPrice?: string | null;
  annualValue?: string | null;
  /** The earliest open follow-up (Slice 11). */
  nextFollowUpAt: string | null;
  /** The latest activity other than a note, else when the deal was created. */
  lastActivityAt: string;
  /** FR-DEAL-12: an open follow-up is past due. */
  hasOverdueFollowUp: boolean;
  /** FR-DEAL-12: no activity for the workspace's number of days (default 14). */
  isStale: boolean;
}

export interface DealContact {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export interface DealStageChange {
  id: string;
  fromStage: DealStage | null;
  toStage: DealStage;
  /** null: the platform moved the deal. */
  changedByUserId: string | null;
  changedByName: string | null;
  at: string;
  /** Reopening keeps the previous result here (FR-DEAL-17). */
  note: string | null;
}

/** What a won or lost deal records (Slice 13). The agreed values are absent without `commercial.view`. */
export interface DealResult {
  wonAt: string | null;
  lostAt: string | null;
  lostReasonId: string | null;
  lostReasonSq: string | null;
  lostReasonEn: string | null;
  lostNote: string | null;
  agreedMonthlyPrice?: string | null;
  agreedAnnualValue?: string | null;
  packageId: string | null;
  packageNameSq: string | null;
  packageNameEn: string | null;
  wonQuotationId: string | null;
  wonQuotationReference: string | null;
}

export interface DealDetail extends DealSummary, DealResult {
  notes: string | null;
  createdByUserId: string;
  /** The contract made from this deal, if any (M3 FR-CON-01). */
  contractId?: string | null;
  /** The contract a Renewal deal renews, its number, and the day after it ends (M3 FR-REN-06, 07). */
  renewalOfContractId?: string | null;
  renewalOfContractNumber?: string | null;
  renewalStartsOn?: string | null;
  contacts: DealContact[];
  history: DealStageChange[];
}

export interface BoardColumn {
  stage: DealStage;
  count: number;
  totalNetMonthlyPrice?: string | null;
  items: DealSummary[];
  nextCursor: string | null;
}

export interface PipelineBoard {
  columns: BoardColumn[];
}

/** `value` sorts by the net monthly value of the deal's offer (Slice 8). */
export type DealSortField = 'updatedAt' | 'createdAt' | 'expectedCloseDate' | 'title' | 'value';

export interface DealListParams {
  clientId?: string;
  ownerUserId?: string;
  stage?: DealStage[];
  type?: DealType[];
  businessTypeId?: string;
  areaId?: string;
  cityId?: string;
  expectedCloseFrom?: string;
  expectedCloseTo?: string;
  /** Net monthly value bounds, as typed: "40" or "49.40" (Slice 8). */
  valueMin?: string;
  valueMax?: string;
  q?: string;
  sort?: DealSortField;
  direction?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface DealPage {
  items: DealSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DealInput {
  type: DealType;
  title?: string | null;
  expectedCloseDate?: string | null;
  notes?: string | null;
}

export interface NewDealInput extends DealInput {
  clientId: string;
  ownerUserId?: string | null;
}

export interface WinDealInput {
  /** Defaults to the deal's latest offer. */
  offerId?: string;
  /** `YYYY-MM-DD`; defaults to today on the server. */
  closingDate?: string;
  closeFollowUps: boolean;
}

export interface LoseDealInput {
  reasonId: string;
  note?: string | null;
  closingDate?: string;
}

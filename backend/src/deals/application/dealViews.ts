import { DealStage } from '../domain/DealStage';
import { DealType } from '../domain/DealType';

/**
 * A deal as the board, the list and the company's Deals tab show it.
 *
 * `netMonthlyPrice` and `annualValue` are the deal's offer value (Slice 8),
 * null until it has a priced offer, under the names `redactFields` guards
 * (FR-RBAC-17). `nextFollowUpAt` is its earliest open follow-up (Slice 11).
 * `hasOverdueFollowUp` and `isStale` are the FR-DEAL-12 markers, decided
 * when the deal is read.
 */
export interface DealSummary {
  id: string;
  clientId: string;
  companyName: string;
  type: DealType;
  /** NULL: the default "<company> – <type>", rendered in the reader's language. */
  title: string | null;
  stage: DealStage;
  ownerUserId: string;
  ownerName: string;
  /** `YYYY-MM-DD`: a calendar date, not an instant. */
  expectedCloseDate: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  netMonthlyPrice: string | null;
  annualValue: string | null;
  nextFollowUpAt: string | null;
  /** Its latest activity other than a note, else its creation (FR-DEAL-12). */
  lastActivityAt: string;
  hasOverdueFollowUp: boolean;
  isStale: boolean;
}

export interface DealContactView {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
}

export interface DealStageChangeView {
  id: string;
  fromStage: DealStage | null;
  toStage: DealStage;
  /** NULL: the platform moved the deal (FR-DEAL-08). */
  changedByUserId: string | null;
  changedByName: string | null;
  at: string;
}

/** The deal page (FR-DEAL-03). Offers, activities and follow-ups join it in Slices 7–11. */
export interface DealDetail extends DealSummary {
  notes: string | null;
  createdByUserId: string;
  contacts: DealContactView[];
  history: DealStageChangeView[];
}

export interface BoardColumn {
  stage: DealStage;
  count: number;
  /** The sum of the column's net monthly offer values; null when none has one. */
  totalNetMonthlyPrice: string | null;
  items: DealSummary[];
  /** Opaque; pass to the column page for the next cards. NULL when there are none. */
  nextCursor: string | null;
}

export interface PipelineBoard {
  columns: BoardColumn[];
}

/** A calendar date as the API sends it. Dates are stored at UTC midnight. */
export function calendarDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

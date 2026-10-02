import { DealStage } from '../domain/DealStage';
import { DealType } from '../domain/DealType';

/**
 * A deal as the board, the list and the company's Deals tab show it.
 *
 * `netMonthlyPrice` and `annualValue` come from the deal's latest offer and
 * `nextFollowUpAt` from its follow-ups. Neither exists before Slices 8 and 11,
 * so both are null until then, under the names `redactFields` already
 * guards (FR-RBAC-17).
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
  /** The sum of the cards' net monthly value; null until offers exist (Slice 8). */
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

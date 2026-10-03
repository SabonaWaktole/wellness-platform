import { RecordScope } from '../../../access/domain/RecordScope';
import { DealStage } from '../../domain/DealStage';
import { DealType } from '../../domain/DealType';
import { DealDetail, DealSummary } from '../dealViews';

export interface DealListFilters {
  clientId?: string;
  ownerUserId?: string;
  stages?: DealStage[];
  types?: DealType[];
  businessTypeId?: string;
  areaId?: string;
  cityId?: string;
  /** Inclusive calendar dates. */
  expectedCloseFrom?: Date;
  expectedCloseTo?: Date;
  /** Matches the title or the company name. */
  query?: string;
  /** Inclusive bounds on the net monthly value of the deal's offer, as two-decimal text (Slice 8). */
  valueMin?: string;
  valueMax?: string;
}

/** `value` sorts by the net monthly value of the deal's offer (Slice 8). */
export const DEAL_SORT_FIELDS = ['updatedAt', 'createdAt', 'expectedCloseDate', 'title', 'value'] as const;
export type DealSortField = (typeof DEAL_SORT_FIELDS)[number];

export interface DealSort {
  field: DealSortField;
  direction: 'asc' | 'desc';
}

/** Where a board column's next page starts: the last card's position in (updatedAt desc, id desc). */
export interface BoardCursor {
  updatedAt: Date;
  id: string;
}

export interface DealCompany {
  id: string;
  name: string;
  assignedUserId: string | null;
  /** Whether the company's salesperson is still an active user, so a deal can default to them. */
  assigneeActive: boolean;
}

/**
 * Reads of deals. Every method takes `tenantId` first and a `RecordScope`
 * where it returns deals, so the scope is a WHERE clause, never a filter
 * after loading (FR-RBAC-13). Deleted deals are never returned.
 */
export interface IDealStore {
  detail(tenantId: string, id: string, scope: RecordScope): Promise<DealDetail | null>;
  search(
    tenantId: string,
    scope: RecordScope,
    filters: DealListFilters,
    sort: DealSort,
    page: { skip: number; take: number }
  ): Promise<{ items: DealSummary[]; total: number }>;
  /**
   * Cards per stage, with the sum of their net monthly value (null when no
   * card has an offer value). Won and Lost count only deals closed at or
   * after `closedSince`.
   */
  boardCounts(tenantId: string, scope: RecordScope, closedSince: Date): Promise<Map<DealStage, { count: number; totalNetMonthlyPrice: string | null }>>;
  /** One board column, `take` cards from `cursor` on. */
  boardColumn(
    tenantId: string,
    scope: RecordScope,
    stage: DealStage,
    closedSince: Date,
    cursor: BoardCursor | null,
    take: number
  ): Promise<DealSummary[]>;
  /** A live company of the workspace, or null. Its scope is checked by the caller. */
  company(tenantId: string, clientId: string): Promise<DealCompany | null>;
  /** True for an active, not deleted user of the workspace. */
  isActiveUser(tenantId: string, userId: string): Promise<boolean>;
}

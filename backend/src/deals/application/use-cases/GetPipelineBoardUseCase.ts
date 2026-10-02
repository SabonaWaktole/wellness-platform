import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { dayBoundsInZone, dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { DealStage } from '../../domain/DealStage';
import { InvalidDealError } from '../../domain/errors';
import { VIEW_DEALS } from '../dealAccess';
import { BoardColumn, DealSummary, PipelineBoard } from '../dealViews';
import { BoardCursor, IDealStore } from '../ports/IDealStore';

/** Cards per column on each request (NFR-PERF-03: a column of 2,000 deals is paged, never sent whole). */
export const BOARD_PAGE_SIZE = 50;

/**
 * The pipeline board (FR-DEAL-10): one column per stage in pipeline order,
 * each with its card count and total value, and the first cards. Won and
 * Lost show this month's deals only, "this month" in the workspace's time
 * zone. One grouped query for the counts and one per column, all scoped
 * (FR-DEAL-04).
 */
export class GetPipelineBoardUseCase {
  constructor(
    private readonly store: IDealStore,
    private readonly scopes: RecordScopeResolver
  ) {}

  async board(input: { access: AccessContext; tenantId: string; timeZone: string; now?: Date }): Promise<PipelineBoard> {
    input.access.ensure(VIEW_DEALS);
    const scope = await this.scopes.resolve(input.access, VIEW_DEALS);
    const since = monthStart(input.timeZone, input.now ?? new Date());

    const [counts, pages] = await Promise.all([
      this.store.boardCounts(input.tenantId, scope, since),
      Promise.all(
        Object.values(DealStage).map((stage) =>
          this.store.boardColumn(input.tenantId, scope, stage, since, null, BOARD_PAGE_SIZE + 1)
        )
      ),
    ]);

    const columns: BoardColumn[] = Object.values(DealStage).map((stage, index) => ({
      stage,
      count: counts.get(stage) ?? 0,
      totalNetMonthlyPrice: null,
      ...page(pages[index]),
    }));
    return { columns };
  }

  /** The next cards of one column, from the cursor the previous page returned. */
  async column(input: {
    access: AccessContext;
    tenantId: string;
    timeZone: string;
    stage: DealStage;
    cursor: string | null;
    now?: Date;
  }): Promise<{ stage: DealStage; items: DealSummary[]; nextCursor: string | null }> {
    input.access.ensure(VIEW_DEALS);
    const scope = await this.scopes.resolve(input.access, VIEW_DEALS);
    const since = monthStart(input.timeZone, input.now ?? new Date());
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const cards = await this.store.boardColumn(input.tenantId, scope, input.stage, since, cursor, BOARD_PAGE_SIZE + 1);
    return { stage: input.stage, ...page(cards) };
  }
}

/** One page of cards: fetched one over the page size, so a full page knows whether more follow. */
function page(cards: DealSummary[]): { items: DealSummary[]; nextCursor: string | null } {
  const items = cards.slice(0, BOARD_PAGE_SIZE);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: cards.length > BOARD_PAGE_SIZE && last ? encodeCursor({ updatedAt: new Date(last.updatedAt), id: last.id }) : null,
  };
}

/** Midnight of the first day of the current month, in `timeZone`. */
function monthStart(timeZone: string, now: Date): Date {
  const dayOfMonth = Number(dayKeyInZone(now, timeZone).slice(8, 10));
  return dayBoundsInZone(timeZone, 1 - dayOfMonth, now).start;
}

function encodeCursor(cursor: BoardCursor): string {
  return Buffer.from(JSON.stringify([cursor.updatedAt.toISOString(), cursor.id])).toString('base64url');
}

function decodeCursor(value: string): BoardCursor {
  try {
    const [updatedAt, id] = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const at = new Date(updatedAt);
    if (typeof id !== 'string' || typeof updatedAt !== 'string' || Number.isNaN(at.getTime())) throw new Error();
    return { updatedAt: at, id };
  } catch {
    throw new InvalidDealError('cursor', 'The board cursor is not valid.');
  }
}

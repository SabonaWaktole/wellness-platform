import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { ALL_RECORDS } from '../../../access/domain/RecordScope';
import { dayBoundsInZone } from '../../../shared/domain/time/tenantDay';
import { FollowUpNotFoundError } from '../../domain/followUps/errors';
import { admits } from '../../../access/domain/RecordScope';
import { VIEW_CALENDAR } from './followUpAccess';
import { atTime, FollowUpGroups, FollowUpView } from './followUpViews';
import { IFollowUpStore } from './ports/IFollowUpStore';

/** Bounds one list; a salesperson with more open follow-ups than this has a different problem. */
export const FOLLOW_UP_LIST_LIMIT = 500;

/**
 * FR-FUP-07: the caller's open follow-ups, grouped as Overdue (due before
 * now), Today (later today in the workspace's zone) and Upcoming.
 */
export class ListMyFollowUpsUseCase {
  constructor(
    private readonly store: IFollowUpStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; timeZone: string }): Promise<FollowUpGroups> {
    input.access.ensure(VIEW_CALENDAR);
    const now = this.now();
    // Their own follow-ups, whatever their scope: a filter, not a widening.
    const items = await this.store.listOpen(input.tenantId, ALL_RECORDS, { assignedUserId: input.access.userId }, FOLLOW_UP_LIST_LIMIT);
    const endOfToday = dayBoundsInZone(input.timeZone, 0, now).end.getTime();
    const groups: FollowUpGroups = { overdue: [], today: [], upcoming: [] };
    for (const item of items.map((view) => atTime(view, now))) {
      const at = new Date(item.scheduledAt).getTime();
      if (item.isOverdue) groups.overdue.push(item);
      else if (at < endOfToday) groups.today.push(item);
      else groups.upcoming.push(item);
    }
    return groups;
  }
}

/** FR-FUP-07: the menu badge. */
export class CountMyOverdueFollowUpsUseCase {
  constructor(
    private readonly store: IFollowUpStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string }): Promise<{ count: number }> {
    input.access.ensure(VIEW_CALENDAR);
    return { count: await this.store.countOverdue(input.tenantId, input.access.userId, this.now()) };
  }
}

/**
 * FR-FUP-08 and the deal page (FR-DEAL-03): open follow-ups in the caller's
 * `calendar.view` scope: the Sales Manager's team, everyone for the CEO, a
 * Sales User's own. Filtered by salesperson, deal or company, or to the
 * overdue ones.
 */
export class ListFollowUpsUseCase {
  constructor(
    private readonly store: IFollowUpStore,
    private readonly scopes: RecordScopeResolver,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    access: AccessContext;
    tenantId: string;
    assignedUserId?: string;
    dealId?: string;
    clientId?: string;
    overdueOnly?: boolean;
  }): Promise<{ items: FollowUpView[] }> {
    input.access.ensure(VIEW_CALENDAR);
    const now = this.now();
    const scope = await this.scopes.resolve(input.access, VIEW_CALENDAR);
    const items = await this.store.listOpen(
      input.tenantId,
      scope,
      {
        assignedUserId: input.assignedUserId,
        dealId: input.dealId,
        clientId: input.clientId,
        dueBefore: input.overdueOnly ? now : undefined,
      },
      FOLLOW_UP_LIST_LIMIT
    );
    return { items: items.map((view) => atTime(view, now)) };
  }
}

/** One follow-up, open or closed, in the caller's `calendar.view` scope. */
export class GetFollowUpUseCase {
  constructor(
    private readonly store: IFollowUpStore,
    private readonly scopes: RecordScopeResolver,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string }): Promise<FollowUpView> {
    input.access.ensure(VIEW_CALENDAR);
    const [view, scope] = await Promise.all([this.store.view(input.tenantId, input.id), this.scopes.resolve(input.access, VIEW_CALENDAR)]);
    if (!view || !admits(scope, view.assignedUserId)) throw new FollowUpNotFoundError();
    return atTime(view, this.now());
  }
}

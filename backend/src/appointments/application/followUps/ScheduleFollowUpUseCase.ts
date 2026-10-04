import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits, RecordScope } from '../../../access/domain/RecordScope';
import { VIEW_DEALS } from '../../../deals/application/dealAccess';
import { dealInScope } from '../../../deals/application/dealRules';
import { DealCompany, IDealStore } from '../../../deals/application/ports/IDealStore';
import { IDealWrites } from '../../../deals/application/ports/IDealWriteTransaction';
import { Deal } from '../../../deals/domain/Deal';
import { DealStage } from '../../../deals/domain/DealStage';
import { DealNotFoundError } from '../../../deals/domain/errors';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { DEFAULT_FOLLOW_UP_TIME, followUpDue, followUpOn } from '../../domain/followUps/FollowUpSchedule';
import { ScheduledActivity, ScheduledActivityType } from '../../domain/followUps/ScheduledActivity';
import { InvalidFollowUpError } from '../../domain/followUps/errors';
import { MANAGE_FOLLOW_UPS } from './followUpAccess';
import { atTime, FollowUpView } from './followUpViews';
import { IFollowUpStore } from './ports/IFollowUpStore';
import { IFollowUpWriteTransaction } from './ports/IFollowUpWriteTransaction';
import { notifyAssigned } from './followUpNotices';

/** The longest "+N days" a follow-up can be scheduled with. */
export const MAX_INTERVAL_DAYS = 365;

export interface ScheduleFollowUpInput {
  access: AccessContext;
  tenantId: string;
  /** The workspace's time zone, in which "+N days" and the time of day are read (FR-FUP-01). */
  timeZone: string;
  clientId: string;
  dealId?: string | null;
  contactPersonId?: string | null;
  /** The activity just saved (FR-ACT-04): its deal, contact and next action are the defaults. */
  fromActivityId?: string | null;
  /** Default CALL (FR-FUP-02). */
  type?: ScheduledActivityType;
  /** A "+N days" button; or `dueDate` for "Custom date". */
  intervalDays?: number | null;
  /** `YYYY-MM-DD` in the workspace's time zone. */
  dueDate?: string | null;
  /** `HH:mm`, default 09:00 (FR-FUP-02). */
  time?: string | null;
  /** Undefined takes the activity's next action; null or text is the user's choice. */
  note?: string | null;
  /** Default the deal's salesperson, else the company's, else the caller (FR-FUP-02). */
  assignedUserId?: string | null;
}

/**
 * Schedules a follow-up with one click (FR-FUP-01, 02, FR-ACT-04). A
 * follow-up on a deal in Offer Sent moves it to Follow-Up in the same
 * transaction (FR-DEAL-08).
 */
export class ScheduleFollowUpUseCase {
  constructor(
    private readonly store: IFollowUpStore,
    private readonly deals: IDealStore,
    private readonly writeTx: IFollowUpWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly notifications?: NotificationService,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: ScheduleFollowUpInput): Promise<FollowUpView> {
    input.access.ensure(MANAGE_FOLLOW_UPS);
    const scope = await this.scopes.resolve(input.access, MANAGE_FOLLOW_UPS);
    const now = this.now();

    const company = await this.deals.company(input.tenantId, input.clientId);
    if (!company || !admits(scope, company.assignedUserId)) {
      throw new InvalidFollowUpError('clientId', 'Choose a company you can follow up.');
    }

    let dealId = input.dealId ?? null;
    let contactPersonId = input.contactPersonId ?? null;
    let note = input.note;
    if (input.fromActivityId) {
      const activity = await this.store.activity(input.tenantId, input.fromActivityId);
      if (!activity || activity.clientId !== input.clientId) {
        throw new InvalidFollowUpError('fromActivityId', 'Choose an activity of this company.');
      }
      dealId = input.dealId === undefined ? activity.dealId : dealId;
      contactPersonId = input.contactPersonId === undefined ? activity.contactPersonId : contactPersonId;
      if (note === undefined) note = activity.nextAction;
    }

    if (contactPersonId && !(await this.store.isContactOf(input.tenantId, input.clientId, contactPersonId))) {
      throw new InvalidFollowUpError('contactPersonId', 'Choose a contact person of this company.');
    }

    const dueAt = dueTime(input, now);
    const id = randomUUID();

    const assignedUserId = await this.writeTx.run(async ({ followUps, deals }) => {
      const deal = dealId ? await this.openDealOf(deals, input, dealId) : null;
      const assignee = await this.assignee(input, scope, company, deal);
      const followUp = ScheduledActivity.scheduleFollowUp(
        {
          id,
          tenantId: input.tenantId,
          clientId: input.clientId,
          dealId: deal?.id ?? null,
          contactPersonId,
          assignedUserId: assignee,
          type: input.type ?? 'CALL',
          dueAt,
          intervalDays: input.intervalDays ?? null,
          note: note ?? null,
        },
        now
      );
      await followUps.insert(followUp);

      // FR-DEAL-08: only from Offer Sent. advanceAutomatically alone would also
      // move an earlier deal forward, past stages it never reached.
      if (deal && deal.stage === DealStage.OfferSent) {
        const change = deal.advanceAutomatically(DealStage.FollowUp, now, randomUUID);
        if (change) {
          await deals.update(deal);
          await deals.recordChange(input.tenantId, change);
        }
      }
      return assignee;
    });

    const view = (await this.store.view(input.tenantId, id))!;
    if (assignedUserId !== input.access.userId) {
      await notifyAssigned(this.notifications, input.tenantId, view, input.access.userId);
    }
    return atTime(view, now);
  }

  /** An open deal of this company that the caller can see. */
  private async openDealOf(
    deals: IDealWrites,
    input: ScheduleFollowUpInput,
    dealId: string
  ): Promise<Deal> {
    let deal: Deal;
    try {
      deal = await dealInScope(deals, this.scopes, input.access, VIEW_DEALS, input.tenantId, dealId);
    } catch (error) {
      if (error instanceof DealNotFoundError) throw new InvalidFollowUpError('dealId', 'Choose an open deal of this company.');
      throw error;
    }
    if (deal.clientId !== input.clientId || !deal.isOpen) {
      throw new InvalidFollowUpError('dealId', 'Choose an open deal of this company.');
    }
    return deal;
  }

  /**
   * FR-FUP-02: the chosen salesperson must be an active user inside the
   * caller's scope. Without a choice: the deal's salesperson, else the
   * company's, else the caller, the first of them the caller may assign.
   */
  private async assignee(input: ScheduleFollowUpInput, scope: RecordScope, company: DealCompany, deal: Deal | null): Promise<string> {
    if (input.assignedUserId) {
      if (!admits(scope, input.assignedUserId) || !(await this.deals.isActiveUser(input.tenantId, input.assignedUserId))) {
        throw new InvalidFollowUpError('assignedUserId', 'You cannot give a follow-up to that user.');
      }
      return input.assignedUserId;
    }
    const candidates = [deal?.ownerUserId, company.assigneeActive ? company.assignedUserId : null];
    for (const candidate of candidates) {
      if (candidate && admits(scope, candidate) && (await this.deals.isActiveUser(input.tenantId, candidate))) return candidate;
    }
    return input.access.userId;
  }
}

/** "+N days" (FR-FUP-01, 03) or the custom date, at the chosen time in the workspace's zone. */
function dueTime(input: ScheduleFollowUpInput, now: Date): Date {
  const time = input.time || DEFAULT_FOLLOW_UP_TIME;
  if (input.intervalDays != null) {
    if (!Number.isInteger(input.intervalDays) || input.intervalDays < 1 || input.intervalDays > MAX_INTERVAL_DAYS) {
      throw new InvalidFollowUpError('intervalDays', `The interval must be between 1 and ${MAX_INTERVAL_DAYS} days.`);
    }
    return followUpDue(now, input.intervalDays, input.timeZone, time);
  }
  if (input.dueDate) return followUpOn(input.dueDate, time, input.timeZone);
  throw new InvalidFollowUpError('dueDate', 'Choose when to follow up.');
}

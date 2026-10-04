import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { PermissionScope } from '../../../access/domain/PermissionScope';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { IDealStore } from '../../../deals/application/ports/IDealStore';
import { NotificationService } from '../../../notifications/application/NotificationService';
import { DEFAULT_FOLLOW_UP_TIME, followUpDue, followUpOn } from '../../domain/followUps/FollowUpSchedule';
import { InvalidFollowUpError } from '../../domain/followUps/errors';
import { ScheduledActivity } from '../../domain/followUps/ScheduledActivity';
import { MANAGE_FOLLOW_UPS, followUpInScope } from './followUpAccess';
import { atTime, FollowUpView } from './followUpViews';
import { notifyAssigned } from './followUpNotices';
import { IFollowUpStore } from './ports/IFollowUpStore';
import { IFollowUpWriteTransaction } from './ports/IFollowUpWriteTransaction';
import { MAX_INTERVAL_DAYS } from './ScheduleFollowUpUseCase';

interface ChangeInput {
  access: AccessContext;
  tenantId: string;
  id: string;
}

/** Loads the follow-up in the caller's `followups.manage` scope, changes it and saves it, in one transaction. */
abstract class ChangeFollowUp {
  constructor(
    protected readonly store: IFollowUpStore,
    protected readonly writeTx: IFollowUpWriteTransaction,
    protected readonly scopes: RecordScopeResolver,
    protected readonly now: () => Date = () => new Date()
  ) {}

  protected async change(input: ChangeInput, work: (followUp: ScheduledActivity, now: Date) => Promise<void> | void): Promise<FollowUpView> {
    input.access.ensure(MANAGE_FOLLOW_UPS);
    const now = this.now();
    await this.writeTx.run(async ({ followUps }) => {
      const followUp = await followUpInScope(followUps, this.scopes, input.access, MANAGE_FOLLOW_UPS, input.tenantId, input.id);
      await work(followUp, now);
      await followUps.update(followUp);
    });
    return atTime((await this.store.view(input.tenantId, input.id))!, now);
  }
}

/** FR-FUP-06: a new date and time, or "+N days" from today; the previous date stays in the history. */
export class RescheduleFollowUpUseCase extends ChangeFollowUp {
  execute(
    input: ChangeInput & { timeZone: string; intervalDays?: number | null; dueDate?: string | null; time?: string | null; reason?: string | null }
  ): Promise<FollowUpView> {
    return this.change(input, (followUp, now) => {
      const time = input.time || DEFAULT_FOLLOW_UP_TIME;
      let at: Date;
      if (input.intervalDays != null) {
        if (!Number.isInteger(input.intervalDays) || input.intervalDays < 1 || input.intervalDays > MAX_INTERVAL_DAYS) {
          throw new InvalidFollowUpError('intervalDays', `The interval must be between 1 and ${MAX_INTERVAL_DAYS} days.`);
        }
        at = followUpDue(now, input.intervalDays, input.timeZone, time);
      } else if (input.dueDate) {
        at = followUpOn(input.dueDate, time, input.timeZone);
      } else {
        throw new InvalidFollowUpError('dueDate', 'Choose the new date.');
      }
      followUp.reschedule(at, input.reason ?? null, input.access.userId, now);
    });
  }
}

/** FR-FUP-06: cancelled with a reason. */
export class CancelFollowUpUseCase extends ChangeFollowUp {
  execute(input: ChangeInput & { reason: string }): Promise<FollowUpView> {
    return this.change(input, (followUp, now) => followUp.cancel(input.reason, now));
  }
}

/**
 * FR-FUP-10: the Sales Manager hands a follow-up to another salesperson.
 * Needs `followups.manage` at Team or wider, so a Sales User (Own) cannot,
 * and the new salesperson must be an active user inside that scope.
 */
export class ReassignFollowUpUseCase extends ChangeFollowUp {
  constructor(
    store: IFollowUpStore,
    writeTx: IFollowUpWriteTransaction,
    scopes: RecordScopeResolver,
    private readonly deals: IDealStore,
    private readonly notifications?: NotificationService,
    now?: () => Date
  ) {
    super(store, writeTx, scopes, now);
  }

  async execute(input: ChangeInput & { assignedUserId: string }): Promise<FollowUpView> {
    if (input.access.can(MANAGE_FOLLOW_UPS) && input.access.scopeOf(MANAGE_FOLLOW_UPS) === PermissionScope.Own) {
      throw new PermissionDeniedError(MANAGE_FOLLOW_UPS, 'Only a Sales Manager can reassign a follow-up.');
    }
    const scope = await this.scopes.resolve(input.access, MANAGE_FOLLOW_UPS);
    if (!admits(scope, input.assignedUserId) || !(await this.deals.isActiveUser(input.tenantId, input.assignedUserId))) {
      throw new InvalidFollowUpError('assignedUserId', 'You cannot give a follow-up to that user.');
    }
    let previous = '';
    const view = await this.change(input, (followUp, now) => {
      previous = followUp.reassign(input.assignedUserId, now);
    });
    if (previous !== input.assignedUserId && input.assignedUserId !== input.access.userId) {
      await notifyAssigned(this.notifications, input.tenantId, view, input.access.userId);
    }
    return view;
  }
}

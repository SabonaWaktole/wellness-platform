import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { ScheduledActivity } from '../../domain/followUps/ScheduledActivity';
import { FollowUpNotFoundError } from '../../domain/followUps/errors';
import { IFollowUpWrites } from './ports/IFollowUpWriteTransaction';

/** Scheduling, completing, rescheduling, cancelling and reassigning follow-ups. Scoped, on the salesperson. */
export const MANAGE_FOLLOW_UPS = 'followups.manage';

/** Reading follow-ups: "My follow-ups", the team view and the deal's (FR-FUP-07, 08). Scoped, on the salesperson. */
export const VIEW_CALENDAR = 'calendar.view';

/**
 * The open or closed follow-up, if its salesperson is inside the caller's
 * scope of `key`. Outside it the follow-up is "not found", exactly like one
 * that does not exist (FR-RBAC-05).
 */
export async function followUpInScope(
  followUps: IFollowUpWrites,
  scopes: RecordScopeResolver,
  access: AccessContext,
  key: string,
  tenantId: string,
  id: string
): Promise<ScheduledActivity> {
  const [followUp, scope] = await Promise.all([followUps.find(tenantId, id), scopes.resolve(access, key)]);
  if (!followUp || !admits(scope, followUp.assignedUserId)) throw new FollowUpNotFoundError();
  return followUp;
}

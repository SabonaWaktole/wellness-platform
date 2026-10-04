import { NotificationService } from '../../../notifications/application/NotificationService';
import { FollowUpView } from './followUpViews';

/**
 * Tells a salesperson that someone else gave them a follow-up (FR-FUP-02,
 * 10). `emitSafe`: the follow-up is already committed, and a failed
 * notification must not undo it. The time travels as an ISO instant, which
 * the reader's interface formats in the workspace's zone.
 */
export async function notifyAssigned(
  notifications: NotificationService | undefined,
  tenantId: string,
  followUp: Omit<FollowUpView, 'isOverdue'>,
  actorUserId: string
): Promise<void> {
  await notifications?.emitSafe({
    tenantId,
    recipientUserIds: [followUp.assignedUserId],
    type: 'FOLLOW_UP_ASSIGNED',
    params: { clientName: followUp.companyName, scheduledAt: followUp.scheduledAt, followUpType: followUp.type },
    actorUserId,
    entityType: 'FOLLOW_UP',
    entityId: followUp.id,
  });
}

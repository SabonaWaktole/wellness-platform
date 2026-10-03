import { randomUUID } from 'crypto';
import { Notification } from '../domain/Notification';
import { INotificationRepository } from '../domain/INotificationRepository';
import {
  NotificationType,
  NotificationEntityType,
  NotificationParams,
} from '../domain/NotificationType';
import { IUserRepository } from '../../auth/domain/repositories/IUserRepository';
import { UserRole } from '../../auth/domain/enums/UserRole';
import { IPermissionHolderDirectory } from './ports/IPermissionHolderDirectory';

export interface EmitInput {
  tenantId: string;
  /** Explicit recipients. Combined with `toRole` if both are given. */
  recipientUserIds?: string[];
  /** Fan-out to every ACTIVE holder of a role in the tenant. */
  toRole?: UserRole;
  /**
   * Fan-out to every active holder of a scoped permission whose grant admits
   * the subject's owner, minus the actor (M2 Slice 10, D9: discount
   * approvals, FR-DSC-05, 09).
   */
  toPermission?: {
    key: string;
    subjectOwnerId: string | null;
    /**
     * Left out besides the actor: e.g. the requester of a reminder, which has
     * no actor (FR-DSC-09, 12: nobody is asked to decide their own request).
     */
    excludeUserId?: string;
  };
  type: NotificationType;
  params: NotificationParams;
  actorUserId?: string | null;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
}

/**
 * The single place notifications are created.
 *
 * Every emitting site calls `emit`. Centralising it keeps three rules in one
 * place instead of eleven:
 *
 *  1. **Never notify the actor about their own action.** Approving your own
 *     quotation should not put a badge on your own bell.
 *  2. **Never notify a deactivated user.** Their token survives deactivation by
 *     up to an hour (TD-010), so recipients are filtered on the RECORD.
 *  3. **Emitting must never break the thing that triggered it.** See `emitSafe`.
 */
export class NotificationService {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly userRepo: IUserRepository,
    /**
     * Optional, and only used by `emitSafe`.
     *
     * `emit` deliberately does NOT dispatch email, because it is the form used
     * inside database transactions — see NotificationEmailDispatcher for why
     * sending from in there is wrong. Transactional callers pass the returned
     * notifications to the dispatcher themselves once their transaction has
     * committed.
     */
    private readonly emailDispatcher?: { dispatch(notifications: Notification[]): Promise<void> },
    /**
     * Optional, and only used when `emit` carries `toPermission` (M2 Slice
     * 10). Sites that never fan out by permission pass nothing.
     */
    private readonly permissionDirectory?: IPermissionHolderDirectory
  ) {}

  async emit(input: EmitInput): Promise<Notification[]> {
    const recipientIds = await this.resolveRecipients(input);
    if (recipientIds.length === 0) return [];

    const notifications = recipientIds.map((recipientUserId) =>
      Notification.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        recipientUserId,
        type: input.type,
        params: input.params,
        actorUserId: input.actorUserId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })
    );

    await this.notificationRepo.saveMany(notifications);
    return notifications;
  }

  /**
   * `emit` that swallows its own failures, and also sends the email half.
   *
   * Used at every emitting site that is NOT inside a transaction. A quotation
   * approval must not fail because the notification insert did — the business
   * action is the point, the notification is a side effect. Inside a unit of
   * work the opposite holds and `emit` is used directly, so the notification
   * commits or rolls back with the change it describes — and email is dispatched
   * by that caller after the commit instead of from in here.
   */
  async emitSafe(input: EmitInput): Promise<void> {
    try {
      const notifications = await this.emit(input);
      // Email is part of "emitting" for non-transactional callers, so they get
      // it without every call site having to remember. The dispatcher is
      // itself best-effort and never throws.
      await this.emailDispatcher?.dispatch(notifications);
    } catch (error) {
      console.error('Failed to emit notification', { type: input.type, error });
    }
  }

  private async resolveRecipients(input: EmitInput): Promise<string[]> {
    const ids = new Set(input.recipientUserIds ?? []);

    if (input.toRole) {
      const holders = await this.userRepo.findActiveByTenantAndRole(input.tenantId, input.toRole);
      for (const user of holders) ids.add(user.id);
    }

    if (input.toPermission) {
      if (!this.permissionDirectory) {
        throw new Error('NotificationService has no permission directory for toPermission.');
      }
      const approvers = await this.permissionDirectory.approvers(
        input.tenantId,
        input.toPermission.key,
        input.toPermission.subjectOwnerId,
        input.actorUserId ?? undefined
      );
      for (const id of approvers) if (id !== input.toPermission.excludeUserId) ids.add(id);
    }

    // Rule 1: never tell someone what they just did.
    if (input.actorUserId) ids.delete(input.actorUserId);

    const candidates = [...ids];
    if (candidates.length === 0) return [];

    // Rule 2. `toRole` already filtered on isActive, but explicit
    // recipientUserIds have not been checked at all — an appointment can be
    // assigned to a member who was deactivated moments earlier.
    const verified = await Promise.all(
      candidates.map(async (id) => {
        const user = await this.userRepo.findById(id);
        if (!user || !user.isActive) return null;
        // Tenant isolation on the record, not just the caller's token.
        if (user.tenantId !== input.tenantId) return null;
        return id;
      })
    );

    return verified.filter((id): id is string => id !== null);
  }
}

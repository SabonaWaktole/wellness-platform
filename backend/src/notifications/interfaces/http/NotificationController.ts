import { Request, Response } from 'express';
import { GetNotificationsUseCase } from '../../application/GetNotificationsUseCase';
import {
  MarkNotificationReadUseCase,
  MarkAllNotificationsReadUseCase,
} from '../../application/MarkNotificationReadUseCase';
import { requireTenantId } from "@main/interfaces/http/tenantContext";
import { Notification } from '../../domain/Notification';
import { GetNotificationSettingsUseCase } from '../../application/GetNotificationSettingsUseCase';
import { UpdateNotificationSettingsUseCase } from '../../application/UpdateNotificationSettingsUseCase';
import { InvalidNotificationSettingsError } from '../../domain/NotificationSettings';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { notificationSettingsSchema } from './schemas/notificationSettingsSchemas';
import { ZodError } from 'zod';

/**
 * Notifications are addressed to a person, so every handler reads the
 * recipient from the authenticated token — never from a parameter. There is
 * deliberately no "notifications for user X" endpoint: the only user a caller
 * can ask about is themselves, which removes a whole class of authorisation
 * question rather than answering it.
 */
export class NotificationController {
  constructor(
    private readonly getNotifications: GetNotificationsUseCase,
    private readonly markRead: MarkNotificationReadUseCase,
    private readonly markAllRead: MarkAllNotificationsReadUseCase,
    private readonly getSettings: GetNotificationSettingsUseCase,
    private readonly updateSettings: UpdateNotificationSettingsUseCase
  ) {}

  list = async (req: Request, res: Response) => {
    try {
      const result = await this.getNotifications.execute({
        tenantId: requireTenantId(req),
        recipientUserId: req.user!.userId,
        limit: this.parseLimit(req.query.limit),
        unreadOnly: req.query.unreadOnly === 'true',
      });

      res.json({
        items: result.items.map(toDTO),
        unreadCount: result.unreadCount,
      });
    } catch (error: any) {
      /*
       * Logged, and reported as 500 rather than 400. This handler takes no
       * meaningful input beyond two bounded query params, so nothing the caller
       * sent can make it fail — a throw here is the server's fault, and the
       * blanket 400 this used to return sent every future debugging session
       * looking at the request instead of at the logs.
       */
      console.error('Failed to list notifications', error);
      res.status(500).json({ error: 'Failed to load notifications' });
    }
  };

  markOneRead = async (req: Request, res: Response) => {
    try {
      const result = await this.markRead.execute({
        tenantId: requireTenantId(req),
        recipientUserId: req.user!.userId,
        notificationId: req.params.id as string,
      });

      // 404 rather than 403 when nothing matched. The row either does not
      // exist or belongs to someone else, and the caller must not be able to
      // tell those apart — a 403 would confirm the id is real.
      if (!result.updated) {
        return res.status(404).json({ error: 'Notification not found' });
      }
      res.json({ message: 'Notification marked read' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  markEverythingRead = async (req: Request, res: Response) => {
    try {
      const result = await this.markAllRead.execute({
        tenantId: requireTenantId(req),
        recipientUserId: req.user!.userId,
      });
      res.json({ updated: result.updated });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  /**
   * The workspace's notification policy (§6.6).
   *
   * Readable by everyone in the tenant, writable by Business Owners only — the
   * role check lives in the use case rather than as router middleware, because
   * GET and PUT on this resource have different answers and a router-level
   * `authorize` would have to gate the stricter one.
   */
  readSettings = async (req: Request, res: Response) => {
    try {
      const settings = await this.getSettings.execute(requireTenantId(req));
      res.json(settings.toJSON());
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  };

  writeSettings = async (req: Request, res: Response) => {
    try {
      /*
       * Parsed here rather than through the shared `validateRequest`
       * middleware, for the reason UpdateTenantSettingsUseCase documents: that
       * middleware throws away the parse RESULT, so every default and coercion
       * in a schema is inert and the handler still sees the raw body. This
       * schema strips unknown keys and coerces numbers, both of which have to
       * actually land. See TD-011.
       */
      const patch = notificationSettingsSchema.parse(req.body);

      const settings = await this.updateSettings.execute({
        tenantId: requireTenantId(req),
        access: req.access!,
        patch,
      });
      res.json(settings.toJSON());
    } catch (error: any) {
      if (error instanceof PermissionDeniedError) {
        return res.status(403).json({ error: error.message });
      }
      if (error instanceof InvalidNotificationSettingsError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof ZodError) {
        return res.status(400).json({ issues: error.issues });
      }
      res.status(400).json({ error: error.message });
    }
  };

  /** Bounded so a caller cannot ask for an unbounded page. */
  private parseLimit(raw: unknown): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 30;
    return Math.min(Math.floor(parsed), 100);
  }
}

const toDTO = (n: Notification) => ({
  id: n.id,
  type: n.type,
  params: n.params,
  actorUserId: n.actorUserId,
  entityType: n.entityType,
  entityId: n.entityId,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { requireTenant, requireTenantId } from '@main/interfaces/http/tenantContext';
import { PermissionDeniedError } from '../../../../access/domain/errors';
import { InvalidActivityError } from '../../../../clients/domain/errors';
import { DomainError } from '../../../../shared/domain/errors/DomainError';
import { FollowUpClosedError, FollowUpNotFoundError, InvalidFollowUpError } from '../../../domain/followUps/errors';
import { ScheduleFollowUpUseCase } from '../../../application/followUps/ScheduleFollowUpUseCase';
import { CompleteFollowUpUseCase } from '../../../application/followUps/CompleteFollowUpUseCase';
import {
  CancelFollowUpUseCase,
  ReassignFollowUpUseCase,
  RescheduleFollowUpUseCase,
} from '../../../application/followUps/ChangeFollowUpUseCases';
import {
  CountMyOverdueFollowUpsUseCase,
  GetFollowUpUseCase,
  ListFollowUpsUseCase,
  ListMyFollowUpsUseCase,
} from '../../../application/followUps/ListFollowUpsUseCases';
import { followUpSchemas } from './followUpSchemas';

/** Maps the follow-up errors to a status; anything else goes to the app's error handler. */
function sendFollowUpError(res: Response, next: NextFunction, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
  if (error instanceof FollowUpNotFoundError) return res.status(404).json({ error: error.message, code: error.code });
  if (error instanceof InvalidFollowUpError || error instanceof InvalidActivityError) {
    return res.status(400).json({ error: error.message, code: error.code, field: error.field });
  }
  if (error instanceof FollowUpClosedError) return res.status(409).json({ error: error.message, code: error.code });
  // The activity's other refusals (AddInteractionUseCase), e.g. a company now out of reach.
  if (error instanceof DomainError) return res.status(400).json({ error: error.message });
  return next(error);
}

const idOf = (req: Request) => req.params.id as string;

/** Follow-ups (M2 Slice 11). Parses, calls one use case, maps the result. */
export class FollowUpController {
  constructor(
    private readonly scheduleFollowUp: ScheduleFollowUpUseCase,
    private readonly completeFollowUp: CompleteFollowUpUseCase,
    private readonly rescheduleFollowUp: RescheduleFollowUpUseCase,
    private readonly cancelFollowUp: CancelFollowUpUseCase,
    private readonly reassignFollowUp: ReassignFollowUpUseCase,
    private readonly listMine: ListMyFollowUpsUseCase,
    private readonly countOverdue: CountMyOverdueFollowUpsUseCase,
    private readonly listFollowUps: ListFollowUpsUseCase,
    private readonly getFollowUp: GetFollowUpUseCase
  ) {}

  private handle =
    (work: (req: Request) => Promise<unknown>, status = 200) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(status).json({ data: await work(req) });
      } catch (error) {
        sendFollowUpError(res, next, error);
      }
    };

  mine = this.handle((req) => {
    const tenant = requireTenant(req);
    return this.listMine.execute({ access: req.access!, tenantId: tenant.id, timeZone: tenant.timezone });
  });

  overdueCount = this.handle((req) => this.countOverdue.execute({ access: req.access!, tenantId: requireTenantId(req) }));

  list = this.handle((req) => {
    const query = followUpSchemas.list.parse(req.query);
    return this.listFollowUps.execute({ access: req.access!, tenantId: requireTenantId(req), ...query });
  });

  get = this.handle((req) => this.getFollowUp.execute({ access: req.access!, tenantId: requireTenantId(req), id: idOf(req) }));

  schedule = this.handle((req) => {
    const tenant = requireTenant(req);
    return this.scheduleFollowUp.execute({ access: req.access!, tenantId: tenant.id, timeZone: tenant.timezone, ...req.body });
  }, 201);

  complete = this.handle((req) =>
    this.completeFollowUp.execute({ access: req.access!, tenantId: requireTenantId(req), id: idOf(req), activity: req.body })
  );

  reschedule = this.handle((req) => {
    const tenant = requireTenant(req);
    return this.rescheduleFollowUp.execute({ access: req.access!, tenantId: tenant.id, timeZone: tenant.timezone, id: idOf(req), ...req.body });
  });

  cancel = this.handle((req) =>
    this.cancelFollowUp.execute({ access: req.access!, tenantId: requireTenantId(req), id: idOf(req), reason: req.body.reason })
  );

  reassign = this.handle((req) =>
    this.reassignFollowUp.execute({
      access: req.access!,
      tenantId: requireTenantId(req),
      id: idOf(req),
      assignedUserId: req.body.assignedUserId,
    })
  );
}

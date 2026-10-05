import { Request, Response, Router } from 'express';
import { ZodError } from 'zod';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { requirePermission } from '@main/interfaces/http/middlewares/requirePermission';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { redactFields } from '../../../access/domain/redactFields';
import { SearchRenewalsUseCase } from '../../application/use-cases/SearchRenewalsUseCase';
import { presentRenewalRow } from '../../application/presentRenewals';
import { searchRenewalsSchema } from './schemas/contractSchemas';

/**
 * The Renewals screen (M3 Slice 11, FR-REN-05, FR-REN-09). Reading needs
 * `contracts.validity.view`, at the viewer's scope; what each row carries
 * depends on `contracts.manage` and `commercial.view` (see `presentRenewalRow`).
 */
export class RenewalsController {
  public router = Router({ mergeParams: true });

  constructor(private searchRenewals: SearchRenewalsUseCase) {
    this.router.get('/', requirePermission('contracts.validity.view'), this.search.bind(this));
  }

  private async search(req: Request, res: Response) {
    try {
      const { page, limit, window, ...params } = searchRenewalsSchema.parse(req.query);
      const result = await this.searchRenewals.execute({
        tenantId: requireTenantId(req),
        timezone: req.tenant!.timezone,
        access: req.access!,
        window,
        ...params,
        page,
        limit,
      });
      // The row presenter already leaves out what the viewer may not see; `redactFields` is the second
      // line (FR-RBAC-17). The row count is `count`, not `total`, which is a guarded money field name.
      res.json(
        redactFields(
          { data: result.rows.map((listing) => presentRenewalRow(listing, req.access!, result.today)), count: result.total, page, limit, window },
          req.access!
        )
      );
    } catch (error: any) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
      if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: String(error?.message ?? 'Unexpected error') });
    }
  }
}

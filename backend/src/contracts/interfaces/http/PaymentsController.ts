import { Request, Response, Router } from 'express';
import { ZodError } from 'zod';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { requirePermission } from '@main/interfaces/http/middlewares/requirePermission';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { csvRow, UTF8_BOM } from '../../../shared/infrastructure/csv/csvWriter';
import { ExportPaymentsUseCase, SearchPaymentsUseCase } from '../../application/use-cases/PaymentsOverviewUseCases';
import { csvColumns, csvRowFor, presentPaymentRow, presentPaymentTotals } from '../../application/presentPaymentsOverview';
import { paymentFiltersSchema, searchPaymentsSchema } from './schemas/contractSchemas';

/**
 * The Payments overview (FR-PAY-11) and its CSV export (FR-PAY-14). Both need
 * `payments.view`; Reception does not hold it and gets 403. Without
 * `commercial.view` the amounts are removed from the response and the export.
 */
export class PaymentsController {
  public router = Router({ mergeParams: true });

  constructor(
    private searchPayments: SearchPaymentsUseCase,
    private exportPayments: ExportPaymentsUseCase
  ) {
    // `export.csv` is declared first so it is never read as an id.
    this.router.get('/export.csv', requirePermission('payments.view'), this.exportCsv.bind(this));
    this.router.get('/', requirePermission('payments.view'), this.search.bind(this));
  }

  private fail(res: Response, error: any) {
    if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
    if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
    return res.status(400).json({ error: String(error?.message ?? 'Unexpected error') });
  }

  private async search(req: Request, res: Response) {
    try {
      const { page, limit, ...params } = searchPaymentsSchema.parse(req.query);
      const result = await this.searchPayments.execute({
        tenantId: requireTenantId(req),
        timezone: req.tenant!.timezone,
        access: req.access!,
        params,
        page,
        limit,
      });
      res.json({
        data: result.rows.map((row) => presentPaymentRow(row, req.access!, result.today)),
        total: result.total,
        page,
        limit,
        totals: presentPaymentTotals(result.totals, req.access!),
      });
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async exportCsv(req: Request, res: Response) {
    try {
      const params = paymentFiltersSchema.parse(req.query);
      const { rows, today } = await this.exportPayments.execute({
        tenantId: requireTenantId(req),
        timezone: req.tenant!.timezone,
        access: req.access!,
        actingUserId: req.user!.userId,
        params,
      });

      res.status(200);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="payments-${today.toISOString().slice(0, 10)}.csv"`);
      res.write(UTF8_BOM + csvRow(csvColumns(req.access!)));
      for await (const batch of rows) {
        for (const row of batch) res.write(csvRow(csvRowFor(row, req.access!, today)));
      }
      res.end();
    } catch (error: any) {
      // Headers may already be out if a batch failed midway; end the response either way.
      if (res.headersSent) return res.end();
      this.fail(res, error);
    }
  }
}


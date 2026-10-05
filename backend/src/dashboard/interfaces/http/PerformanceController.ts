import { Request, Response, Router } from 'express';
import { ZodError } from 'zod';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { requirePermission } from '@main/interfaces/http/middlewares/requirePermission';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { redactFields } from '../../../access/domain/redactFields';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { csvRow, UTF8_BOM } from '../../../shared/infrastructure/csv/csvWriter';
import { PerformancePdfRenderer } from '../../../reports/infrastructure/PerformancePdfRenderer';
import { ExportPerformanceUseCase } from '../../application/wellness/ExportPerformanceUseCase';
import { GetPerformanceRecordsUseCase } from '../../application/wellness/GetPerformanceRecordsUseCase';
import { GetPerformanceSeriesUseCase } from '../../application/wellness/GetPerformanceSeriesUseCase';
import { GetPerformanceUseCase } from '../../application/wellness/GetPerformanceUseCase';
import { EXPORT_TEXT, exportTable } from '../../application/wellness/performanceExport';
import { InvalidPeriodError } from '../../domain/PerformancePeriod';
import { performanceExportSchema, performanceRecordsSchema, performanceSchema, performanceSeriesSchema } from './performanceSchemas';

/**
 * The Performance screen (M3 Slice 12, FR-PRF-01 to 10). Every route needs `performance.view`; whose
 * rows a viewer gets is decided by the use cases from the access context, so a salesperson outside the
 * viewer's scope is a 403 whatever the request says (FR-RBAC-23). `redactFields` is the second line
 * for the value fields (FR-PRF-10).
 */
export class PerformanceController {
  public router = Router({ mergeParams: true });

  constructor(
    private readonly getPerformance: GetPerformanceUseCase,
    private readonly getRecords: GetPerformanceRecordsUseCase,
    private readonly getSeries: GetPerformanceSeriesUseCase,
    private readonly exportPerformance: ExportPerformanceUseCase,
    private readonly tenants: ITenantRepository,
    private readonly pdf: PerformancePdfRenderer = new PerformancePdfRenderer()
  ) {
    const view = requirePermission('performance.view');
    // Fixed paths first, so none is read as something else.
    this.router.get('/records', view, this.records.bind(this));
    this.router.get('/series', view, this.series.bind(this));
    this.router.get('/export', view, this.export.bind(this));
    this.router.get('/', view, this.table.bind(this));
  }

  private context(req: Request) {
    return { tenantId: requireTenantId(req), timezone: req.tenant!.timezone, access: req.access! };
  }

  private async table(req: Request, res: Response) {
    await this.respond(res, async () => {
      const result = await this.getPerformance.execute({ ...this.context(req), params: performanceSchema.parse(req.query) });
      return redactFields(result, req.access!);
    });
  }

  private async records(req: Request, res: Response) {
    await this.respond(res, async () => {
      const result = await this.getRecords.execute({ ...this.context(req), params: performanceRecordsSchema.parse(req.query) });
      return redactFields(result, req.access!);
    });
  }

  private async series(req: Request, res: Response) {
    await this.respond(res, async () => {
      const result = await this.getSeries.execute({ ...this.context(req), params: performanceSeriesSchema.parse(req.query) });
      return redactFields(result, req.access!);
    });
  }

  private async export(req: Request, res: Response) {
    try {
      const { format, locale, ...params } = performanceExportSchema.parse(req.query);
      const context = this.context(req);
      const result = await this.exportPerformance.execute({
        ...context,
        actingUserId: req.user!.userId,
        params,
        format: format === 'pdf' ? 'PDF' : 'CSV',
      });
      const canSeeValue = req.access!.can('commercial.view');
      const table = exportTable(result, locale, canSeeValue);
      const stamp = `${result.period.from}_${result.period.to}`;

      if (format === 'pdf') {
        const tenant = await this.tenants.findById(context.tenantId);
        const text = EXPORT_TEXT[locale];
        const pdf = await this.pdf.render({
          tenantName: tenant?.name ?? '',
          title: text.title,
          periodLine: `${text.period}: ${result.period.from} – ${result.period.to}`,
          generatedAt: new Date(),
          header: table.header,
          body: table.body,
          hasTotalRow: result.total !== null,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', pdf.length);
        res.setHeader('Content-Disposition', `attachment; filename="performance-${stamp}.pdf"`);
        return res.send(pdf);
      }

      res.status(200);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="performance-${stamp}.csv"`);
      res.write(UTF8_BOM + csvRow(table.header));
      for (const row of table.body) res.write(csvRow(row));
      res.end();
    } catch (error) {
      if (res.headersSent) return res.end();
      this.fail(res, error);
    }
  }

  private async respond(res: Response, work: () => Promise<unknown>) {
    try {
      res.json(await work());
    } catch (error) {
      this.fail(res, error);
    }
  }

  private fail(res: Response, error: unknown) {
    if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
    if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
    if (error instanceof InvalidPeriodError) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: 'Unexpected error' });
  }
}

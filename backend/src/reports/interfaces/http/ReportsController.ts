import { Request, Response, NextFunction } from 'express';
import { requireTenantId } from "@main/interfaces/http/tenantContext";
import { z } from 'zod';
import { GetRevenueReportUseCase } from '../../application/use-cases/GetRevenueReportUseCase';
import { GetClientReportUseCase } from '../../application/use-cases/GetClientReportUseCase';
import { GetInventoryReportUseCase } from '../../application/use-cases/GetInventoryReportUseCase';
import { GetAppointmentReportUseCase } from '../../application/use-cases/GetAppointmentReportUseCase';
import { GetClientTrendUseCase } from '../../application/use-cases/GetClientTrendUseCase';
import { GetLowStockReportUseCase } from '../../application/use-cases/GetLowStockReportUseCase';
import { ReportPdfRenderer } from '../../infrastructure/ReportPdfRenderer';

const exportPdfSchema = z.object({
  tenantName: z.string().default('Workspace'),
  currency: z.string().default('USD'),
  locale: z.string().default('en-US'),
  revenue: z.array(z.object({ month: z.string(), revenue: z.number() })).default([]),
  clients: z.array(z.object({ status: z.string(), count: z.number() })).default([]),
  inventory: z
    .array(z.object({ warehouseName: z.string(), totalItems: z.number(), totalValue: z.number() }))
    .default([]),
  clientTrend: z.array(z.object({ month: z.string(), count: z.number() })).default([]),
  appointmentsByStatus: z.array(z.object({ status: z.string(), count: z.number() })).default([]),
  byStaff: z
    .array(
      z.object({
        staffName: z.string(),
        scheduled: z.number(),
        confirmed: z.number(),
        completed: z.number(),
        cancelled: z.number(),
        total: z.number(),
      })
    )
    .default([]),
  lowStock: z
    .array(
      z.object({
        productName: z.string(),
        warehouseName: z.string(),
        quantity: z.number(),
        threshold: z.number(),
        status: z.string(),
      })
    )
    .default([]),
});

export class ReportsController {
  constructor(
    private readonly getRevenueReport: GetRevenueReportUseCase,
    private readonly getClientReport: GetClientReportUseCase,
    private readonly getInventoryReport: GetInventoryReportUseCase,
    private readonly getAppointmentReport: GetAppointmentReportUseCase,
    // `...UseCase` suffix on this one because the handler below is already
    // called `getClientTrend`, and the two would otherwise collide on the
    // instance.
    private readonly getClientTrendUseCase: GetClientTrendUseCase,
    private readonly getLowStockReport: GetLowStockReportUseCase,
    private readonly pdfRenderer: ReportPdfRenderer = new ReportPdfRenderer()
  ) {}

  getRevenue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = requireTenantId(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 12;
      
      const data = await this.getRevenueReport.execute(tenantId, limit, req.access!);
      res.status(200).json({ revenue: data });
    } catch (error) {
      next(error);
    }
  };

  getClients = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = requireTenantId(req);
      const data = await this.getClientReport.execute(tenantId, req.access!);
      res.status(200).json({ clients: data });
    } catch (error) {
      next(error);
    }
  };

  getInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = requireTenantId(req);
      const data = await this.getInventoryReport.execute(tenantId);
      res.status(200).json({ inventory: data });
    } catch (error) {
      next(error);
    }
  };

  /** §6.7 appointment statistics: counts by status, plus a per-staff breakdown. */
  getAppointments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = requireTenantId(req);
      const data = await this.getAppointmentReport.execute(tenantId, {
        from: parseDate(req.query.from),
        to: parseDate(req.query.to),
        assignedUserId: req.query.assignedUserId
          ? String(req.query.assignedUserId)
          : undefined,
      }, req.access!);
      res.status(200).json(data);
    } catch (error) {
      next(error);
    }
  };

  /** §6.7 new-client trend. */
  getClientTrend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = requireTenantId(req);
      const months = req.query.months ? parseInt(String(req.query.months), 10) : undefined;
      const data = await this.getClientTrendUseCase.execute(tenantId, months, req.access!);
      res.status(200).json({ trend: data });
    } catch (error) {
      next(error);
    }
  };

  /** §6.7 list of low-stock or unavailable items, per location. */
  getLowStock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = requireTenantId(req);
      const data = await this.getLowStockReport.execute(tenantId);
      res.status(200).json(data);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST rather than GET: report data is client-supplied rather than
   * re-queried here — it is the same numbers already on screen, and
   * re-querying risks the PDF disagreeing with what the user was just
   * looking at when they clicked the button. Charts are drawn server-side by
   * `ReportPdfRenderer` from these same numbers (see `pdfCharts.ts`), not
   * from a client-captured image.
   */
  exportPdf = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = exportPdfSchema.parse(req.body);
      const pdf = await this.pdfRenderer.render({
        tenantName: body.tenantName,
        currency: body.currency,
        locale: body.locale,
        generatedAt: new Date(),
        revenue: body.revenue,
        clients: body.clients,
        inventory: body.inventory,
        clientTrend: body.clientTrend,
        appointmentsByStatus: body.appointmentsByStatus,
        byStaff: body.byStaff,
        lowStock: body.lowStock,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdf.length);
      res.setHeader('Content-Disposition', 'attachment; filename="reports.pdf"');
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Query-string date, or undefined.
 *
 * An unparseable value becomes undefined rather than an Invalid Date: the
 * latter silently poisons a Prisma `gte` and returns an empty report, which
 * reads to the user as "you have no appointments" instead of "that filter was
 * nonsense".
 */
function parseDate(raw: unknown): Date | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

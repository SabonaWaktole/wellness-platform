import { Request, Response, Router } from 'express';
import { redactFields } from '../../../access/domain/redactFields';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { ZodError } from 'zod';
import { ConvertQuotationToInvoiceUseCase } from '../../application/use-cases/ConvertQuotationToInvoiceUseCase';
import { SendInvoiceUseCase } from '../../application/use-cases/SendInvoiceUseCase';
import { MarkInvoicePaidUseCase } from '../../application/use-cases/MarkInvoicePaidUseCase';
import { VoidInvoiceUseCase } from '../../application/use-cases/VoidInvoiceUseCase';
import { SearchInvoicesUseCase } from '../../application/use-cases/SearchInvoicesUseCase';
import { GetInvoiceDetailUseCase } from '../../application/use-cases/GetInvoiceDetailUseCase';
import { GetInvoicePdfViewUseCase } from '../../application/GetInvoicePdfViewUseCase';
import { InvoicePdfRenderer } from '../../infrastructure/InvoicePdfRenderer';
import { invoiceReference } from '../../domain/invoiceReference';
import { convertToInvoiceSchema, searchInvoicesSchema } from './schemas/invoiceSchemas';
import { requirePermission } from '@main/interfaces/http/middlewares/requirePermission';

export class InvoicesController {
  public router = Router();

  constructor(
    private convertQuotationToInvoiceUseCase: ConvertQuotationToInvoiceUseCase,
    private sendInvoiceUseCase: SendInvoiceUseCase,
    private markInvoicePaidUseCase: MarkInvoicePaidUseCase,
    private voidInvoiceUseCase: VoidInvoiceUseCase,
    private searchInvoicesUseCase: SearchInvoicesUseCase,
    private getInvoiceDetailUseCase: GetInvoiceDetailUseCase,
    private getInvoicePdfViewUseCase: GetInvoicePdfViewUseCase,
    private pdfRenderer: InvoicePdfRenderer
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // invoices.manage (scoped OWN/TEAM/ALL): the creator-only ("OWN") check
    // stays inside each use case — see GetInvoiceDetailUseCase and friends —
    // this only screens out someone with no invoices right at all.
    this.router.post(
      '/from-quotation/:quotationId',
      requirePermission('invoices.manage'),
      this.convertFromQuotation.bind(this)
    );
    this.router.get('/', requirePermission('invoices.manage'), this.searchInvoices.bind(this));
    this.router.get('/:id', requirePermission('invoices.manage'), this.getInvoiceDetail.bind(this));
    this.router.get('/:id/pdf', requirePermission('invoices.manage'), this.downloadPdf.bind(this));
    this.router.post('/:id/send', requirePermission('invoices.manage'), this.sendInvoice.bind(this));
    this.router.post('/:id/mark-paid', requirePermission('invoices.manage'), this.markPaid.bind(this));
    this.router.post('/:id/void', requirePermission('invoices.manage'), this.voidInvoice.bind(this));
  }

  private async convertFromQuotation(req: Request, res: Response) {
    try {
      const validatedData = convertToInvoiceSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const quotationId = req.params.quotationId as string;

      const result = await this.convertQuotationToInvoiceUseCase.execute({
        tenantId,
        quotationId,
        actingUserId: req.user!.userId,
        access: req.access!,
        dueDate: validatedData.dueDate ? new Date(validatedData.dueDate) : undefined
      });
      res.status(201).json(redactFields(result.invoice, req.access!));
    } catch (error: any) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async sendInvoice(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;
      const result = await this.sendInvoiceUseCase.execute({
        tenantId,
        invoiceId: id,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json(redactFields(result.invoice, req.access!));
    } catch (error: any) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async markPaid(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;
      const result = await this.markInvoicePaidUseCase.execute({
        tenantId,
        invoiceId: id,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json(redactFields(result.invoice, req.access!));
    } catch (error: any) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async voidInvoice(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;
      const result = await this.voidInvoiceUseCase.execute({
        tenantId,
        invoiceId: id,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json(redactFields(result.invoice, req.access!));
    } catch (error: any) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async searchInvoices(req: Request, res: Response) {
    try {
      const validatedQuery = searchInvoicesSchema.parse(req.query);
      const tenantId = requireTenantId(req);

      const result = await this.searchInvoicesUseCase.execute({
        tenantId,
        actingUserId: req.user!.userId,
        access: req.access!,
        params: {
          query: validatedQuery.query,
          status: validatedQuery.status,
          clientId: validatedQuery.clientId,
          page: validatedQuery.page,
          limit: validatedQuery.limit
        }
      });
      res.json(redactFields(result, req.access!));
    } catch (error: any) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
      res.status(400).json({ error: error.message });
    }
  }

  private async getInvoiceDetail(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;
      const result = await this.getInvoiceDetailUseCase.execute({
        tenantId,
        invoiceId: id,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json(redactFields(result, req.access!));
    } catch (error: any) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Always a staff download — there is no "customer inline view" case here
   * unlike the quotation PDF, so this always sets `attachment` rather than
   * `inline`.
   */
  private async downloadPdf(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;

      // Authorization/existence check first, through the same detail use case
      // every other route uses — the PDF reader below has no notion of "Staff
      // can only see their own", so the guard has to happen here.
      await this.getInvoiceDetailUseCase.execute({
        tenantId,
        invoiceId: id,
        actingUserId: req.user!.userId,
        access: req.access!,
      });

      const view = await this.getInvoicePdfViewUseCase.execute(tenantId, id, req.access!);
      if (!view) return res.status(404).json({ error: 'Invoice not found' });

      const pdf = await this.pdfRenderer.render(view);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdf.length);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="invoice-${invoiceReference(id)}.pdf"`
      );
      res.send(pdf);
    } catch (error: any) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error instanceof PermissionDeniedError) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }
}

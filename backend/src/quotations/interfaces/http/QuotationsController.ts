import { Request, Response, Router } from 'express';
import { requireTenantId } from "@main/interfaces/http/tenantContext";
import { ZodError } from 'zod';
import { CreateQuotationUseCase } from '../../application/use-cases/CreateQuotationUseCase';
import { UpdateQuotationUseCase } from '../../application/use-cases/UpdateQuotationUseCase';
import { SubmitQuotationUseCase } from '../../application/use-cases/SubmitQuotationUseCase';
import { ApproveQuotationUseCase } from '../../application/use-cases/ApproveQuotationUseCase';
import { ReturnQuotationToDraftUseCase } from '../../application/use-cases/ReturnQuotationToDraftUseCase';
import { MarkQuotationAcceptedUseCase } from '../../application/use-cases/MarkQuotationAcceptedUseCase';
import { MarkQuotationRejectedUseCase } from '../../application/use-cases/MarkQuotationRejectedUseCase';
import { ExpireQuotationUseCase } from '../../application/use-cases/ExpireQuotationUseCase';
import { SearchQuotationsUseCase } from '../../application/use-cases/SearchQuotationsUseCase';
import { GetQuotationDetailUseCase } from '../../application/use-cases/GetQuotationDetailUseCase';
import { GetPendingApprovalsUseCase } from '../../application/use-cases/GetPendingApprovalsUseCase';
import { SettingsService } from '../../../settings/SettingsService';
import { requirePermission } from '@main/interfaces/http/middlewares/requirePermission';
import {
  createQuotationSchema,
  updateQuotationSchema,
  searchQuotationsSchema,
  markAcceptedSchema,
  markRejectedSchema,
} from './schemas/quotationSchemas';

export class QuotationsController {
  public router = Router();

  constructor(
    private createQuotationUseCase: CreateQuotationUseCase,
    private updateQuotationUseCase: UpdateQuotationUseCase,
    private submitQuotationUseCase: SubmitQuotationUseCase,
    private approveQuotationUseCase: ApproveQuotationUseCase,
    private returnQuotationToDraftUseCase: ReturnQuotationToDraftUseCase,
    private markQuotationAcceptedUseCase: MarkQuotationAcceptedUseCase,
    private markQuotationRejectedUseCase: MarkQuotationRejectedUseCase,
    private expireQuotationUseCase: ExpireQuotationUseCase,
    private searchQuotationsUseCase: SearchQuotationsUseCase,
    private getQuotationDetailUseCase: GetQuotationDetailUseCase,
    private getPendingApprovalsUseCase: GetPendingApprovalsUseCase,
    private settingsService: SettingsService
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // quotations.manage (scoped OWN/TEAM/ALL): the creator-only ("OWN") check
    // stays inside each use case — see SearchQuotationsUseCase and friends —
    // this only screens out someone with no quotations right at all.
    // quotations.approve: Administrator only, per SRS §4.2.
    this.router.post('/', requirePermission('quotations.manage'), this.createQuotation.bind(this));
    this.router.get('/', requirePermission('quotations.manage'), this.searchQuotations.bind(this));
    this.router.get('/pending-approvals', requirePermission('quotations.approve'), this.getPendingApprovals.bind(this));
    this.router.get('/:id', requirePermission('quotations.manage'), this.getQuotationDetail.bind(this));
    this.router.put('/:id', requirePermission('quotations.manage'), this.updateQuotation.bind(this));
    this.router.post('/:id/submit', requirePermission('quotations.manage'), this.submitQuotation.bind(this));
    this.router.post('/:id/approve', requirePermission('quotations.approve'), this.approveQuotation.bind(this));
    this.router.post('/:id/return-to-draft', requirePermission('quotations.approve'), this.returnToDraft.bind(this));
    this.router.post('/:id/mark-accepted', requirePermission('quotations.manage'), this.markAccepted.bind(this));
    this.router.post('/:id/mark-rejected', requirePermission('quotations.manage'), this.markRejected.bind(this));
    this.router.post('/:id/expire', requirePermission('quotations.manage'), this.expireQuotation.bind(this));
  }

  private async createQuotation(req: Request, res: Response) {
    try {
      const validatedData = createQuotationSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const result = await this.createQuotationUseCase.execute({
        tenantId,
        clientId: validatedData.clientId,
        createdByUserId: req.user!.userId,
        authorRole: req.user!.role,
        lineItems: validatedData.lineItems
      });
      res.status(201).json(result.quotation);
    } catch (error: any) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async updateQuotation(req: Request, res: Response) {
    try {
      const validatedData = updateQuotationSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;
      const result = await this.updateQuotationUseCase.execute({
        tenantId,
        quotationId: id,
        actingUserId: req.user!.userId,
        actingUserRole: req.user!.role,
        lineItems: validatedData.lineItems
      });
      res.json(result.quotation);
    } catch (error: any) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async submitQuotation(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;
      
      const requiresApproval = await this.settingsService.getRequiresQuotationApproval(tenantId);

      const result = await this.submitQuotationUseCase.execute({
        tenantId,
        quotationId: id,
        actingUserId: req.user!.userId,
        actingUserRole: req.user!.role,
        requiresQuotationApproval: requiresApproval
      });
      res.json(result.quotation);
    } catch (error: any) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async approveQuotation(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;
      const result = await this.approveQuotationUseCase.execute({
        tenantId,
        quotationId: id,
        actingUserId: req.user!.userId,
        actingUserRole: req.user!.role
      });
      res.json(result.quotation);
    } catch (error: any) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async returnToDraft(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;
      const { reason } = req.body;
      const result = await this.returnQuotationToDraftUseCase.execute({
        tenantId,
        quotationId: id,
        actingUserId: req.user!.userId,
        actingUserRole: req.user!.role,
        reason
      });
      res.json(result.quotation);
    } catch (error: any) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async markAccepted(req: Request, res: Response) {
    try {
      markAcceptedSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;
      const result = await this.markQuotationAcceptedUseCase.execute({
        tenantId,
        quotationId: id,
        actingUserId: req.user!.userId,
        actingUserRole: req.user!.role
      });
      res.json(result.quotation);
    } catch (error: any) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async markRejected(req: Request, res: Response) {
    try {
      const validatedData = markRejectedSchema.parse(req.body);
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;
      const result = await this.markQuotationRejectedUseCase.execute({
        tenantId,
        quotationId: id,
        actingUserId: req.user!.userId,
        actingUserRole: req.user!.role,
        note: validatedData.note
      });
      res.json(result.quotation);
    } catch (error: any) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async expireQuotation(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;
      const result = await this.expireQuotationUseCase.execute({
        tenantId,
        quotationId: id,
        actingUserId: req.user!.userId,
        actingUserRole: req.user!.role
      });
      res.json(result.quotation);
    } catch (error: any) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async searchQuotations(req: Request, res: Response) {
    try {
      const validatedQuery = searchQuotationsSchema.parse(req.query);
      const tenantId = requireTenantId(req);

      const result = await this.searchQuotationsUseCase.execute({
        tenantId,
        actingUserId: req.user!.userId,
        actingUserRole: req.user!.role,
        params: {
          query: validatedQuery.query,
          status: validatedQuery.status,
          clientId: validatedQuery.clientId,
          page: validatedQuery.page,
          limit: validatedQuery.limit
        }
      });
      res.json(result);
    } catch (error: any) {
      if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
      res.status(400).json({ error: error.message });
    }
  }

  private async getPendingApprovals(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      const result = await this.getPendingApprovalsUseCase.execute({
        tenantId,
        actingUserRole: req.user!.role
      });
      res.json(result.quotations);
    } catch (error: any) {
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }

  private async getQuotationDetail(req: Request, res: Response) {
    try {
      const tenantId = requireTenantId(req);
      const id = req.params.id as string;
      const result = await this.getQuotationDetailUseCase.execute({
        tenantId,
        quotationId: id,
        actingUserId: req.user!.userId,
        actingUserRole: req.user!.role
      });

      /*
       * The customer link, assembled here rather than stored.
       *
       * The database holds the token; the URL around it depends on where the
       * frontend is deployed, which is configuration, not data. Storing the
       * full URL would freeze today's hostname into every historical row.
       *
       * Null until the quotation has been sent, which is what lets the UI show
       * a Share action only when there is something to share.
       */
      const shareUrl = result.quotation.shareToken
        ? `${process.env.FRONTEND_URL || 'http://localhost:5173'}/q/${result.quotation.shareToken}`
        : null;

      /*
       * The token travels too, so the UI can build the PDF URL against its own
       * API base. The server knows FRONTEND_URL but has no configured notion of
       * its own public origin, and guessing one from the request Host header is
       * how a proxied deployment ends up handing out internal hostnames.
       *
       * Safe to expose here: this endpoint already required authentication,
       * tenant resolution and — for STAFF — ownership of the quotation.
       */
      res.json({ ...result, shareUrl, shareToken: result.quotation.shareToken });
    } catch (error: any) {
      if (error.message.includes('not found')) return res.status(404).json({ error: error.message });
      if (error.message.includes('Unauthorized')) return res.status(403).json({ error: error.message });
      res.status(400).json({ error: error.message });
    }
  }
}

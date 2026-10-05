import { Request, Response, Router } from 'express';
import { presentClientContracts, presentContract, presentContractDetail, presentContracts } from '../../application/presentContract';
import { PermissionDeniedError } from '../../../access/domain/errors';
import multer from 'multer';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { ZodError } from 'zod';
import { CreateContractFromDealUseCase } from '../../application/use-cases/CreateContractFromDealUseCase';
import { RefreshContractFromDealUseCase } from '../../application/use-cases/RefreshContractFromDealUseCase';
import { ContractAlreadyExistsError, ContractValidationError } from '../../domain/contractErrors';
import { ContractEditRefusedError } from '../../domain/Contract';
import { CreateContractUseCase } from '../../application/use-cases/CreateContractUseCase';
import { UpdateContractUseCase } from '../../application/use-cases/UpdateContractUseCase';
import { ActivateContractUseCase } from '../../application/use-cases/ActivateContractUseCase';
import { CancelContractUseCase } from '../../application/use-cases/CancelContractUseCase';
import { RenewContractUseCase } from '../../application/use-cases/RenewContractUseCase';
import { SearchContractsUseCase } from '../../application/use-cases/SearchContractsUseCase';
import { GetContractDetailUseCase } from '../../application/use-cases/GetContractDetailUseCase';
import { GetClientContractsUseCase } from '../../application/use-cases/GetClientContractsUseCase';
import { RecordContractPaymentUseCase } from '../../application/use-cases/RecordContractPaymentUseCase';
import { AddContractPaymentUseCase } from '../../application/use-cases/AddContractPaymentUseCase';
import { UpdateContractPaymentUseCase } from '../../application/use-cases/UpdateContractPaymentUseCase';
import { DeleteContractPaymentUseCase } from '../../application/use-cases/DeleteContractPaymentUseCase';
import { AttachContractDocumentUseCase } from '../../application/use-cases/AttachContractDocumentUseCase';
import {
  CONTRACT_DOC_MIME,
  MAX_CONTRACT_DOC_BYTES,
} from '../../infrastructure/ContractDocumentStore';
import { requirePermission } from '@main/interfaces/http/middlewares/requirePermission';
import {
  createContractSchema,
  createContractFromDealSchema,
  updateContractSchema,
  renewContractSchema,
  cancelContractSchema,
  searchContractsSchema,
  recordPaymentSchema,
  addPaymentSchema,
  updatePaymentSchema,
} from './schemas/contractSchemas';

/**
 * Buffered in memory, never written straight to disk — same reasoning as
 * MediaController's uploader. The 15 MB cap is what keeps that safe.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CONTRACT_DOC_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!CONTRACT_DOC_MIME.includes(file.mimetype)) {
      cb(new Error('UNSUPPORTED_TYPE'));
      return;
    }
    cb(null, true);
  },
});

export class ContractsController {
  public router = Router({ mergeParams: true });

  constructor(
    private createContractUseCase: CreateContractUseCase,
    private updateContractUseCase: UpdateContractUseCase,
    private activateContractUseCase: ActivateContractUseCase,
    private cancelContractUseCase: CancelContractUseCase,
    private renewContractUseCase: RenewContractUseCase,
    private searchContractsUseCase: SearchContractsUseCase,
    private getContractDetailUseCase: GetContractDetailUseCase,
    private getClientContractsUseCase: GetClientContractsUseCase,
    private recordContractPaymentUseCase: RecordContractPaymentUseCase,
    private addContractPaymentUseCase: AddContractPaymentUseCase,
    private updateContractPaymentUseCase: UpdateContractPaymentUseCase,
    private deleteContractPaymentUseCase: DeleteContractPaymentUseCase,
    private attachContractDocumentUseCase: AttachContractDocumentUseCase,
    private createContractFromDealUseCase: CreateContractFromDealUseCase,
    private refreshContractFromDealUseCase: RefreshContractFromDealUseCase
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    // contracts.validity.view (scoped): reads. contracts.manage (scoped):
    // writes. At OWN scope the use cases narrow further to the caller's own
    // contracts (`contractAccess.canAccessContract`).
    //
    // `/client/:clientId` is declared BEFORE `/:id`, or Express would match
    // the literal segment "client" as a contract id.
    this.router.get('/client/:clientId', requirePermission('contracts.validity.view'), this.getClientContracts.bind(this));

    this.router.get('/', requirePermission('contracts.validity.view'), this.searchContracts.bind(this));
    this.router.post('/', requirePermission('contracts.manage'), this.createContract.bind(this));
    this.router.get('/:id', requirePermission('contracts.validity.view'), this.getContractDetail.bind(this));
    this.router.patch('/:id', requirePermission('contracts.manage'), this.updateContract.bind(this));
    this.router.post('/:id/refresh-from-deal', requirePermission('contracts.manage'), this.refreshFromDeal.bind(this));
    this.router.post('/:id/activate', requirePermission('contracts.manage'), this.activateContract.bind(this));
    this.router.post('/:id/cancel', requirePermission('contracts.manage'), this.cancelContract.bind(this));
    this.router.post('/:id/renew', requirePermission('contracts.manage'), this.renewContract.bind(this));

    this.router.post('/:id/payments', requirePermission('contracts.manage'), this.addPayment.bind(this));
    this.router.patch(
      '/:id/payments/:paymentId',
      requirePermission('contracts.manage'),
      this.updatePayment.bind(this)
    );
    this.router.post(
      '/:id/payments/:paymentId/record',
      requirePermission('contracts.manage'),
      this.recordPayment.bind(this)
    );
    this.router.delete(
      '/:id/payments/:paymentId',
      requirePermission('contracts.manage'),
      this.deletePayment.bind(this)
    );

    this.router.post(
      '/:id/document',
      requirePermission('contracts.manage'),
      // Multer errors (too large, wrong type) surface as thrown errors, so they
      // are translated here rather than falling through to the global 500
      // handler — same treatment as MediaController.
      (req, res, next) => {
        upload.single('file')(req, res, (err: any) => {
          if (!err) return next();
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'That file is too large (15 MB maximum).' });
          }
          if (err.message === 'UNSUPPORTED_TYPE') {
            return res.status(415).json({ error: 'Only PDF documents can be attached.' });
          }
          return res.status(400).json({ error: 'That file could not be uploaded.' });
        });
      },
      this.attachDocument.bind(this)
    );
    this.router.delete('/:id/document', requirePermission('contracts.manage'), this.clearDocument.bind(this));
  }

  /**
   * One translation of domain errors to status codes for every handler.
   *
   * The invoice controller repeats this three-line ladder in eight methods,
   * which is how two of them end up disagreeing about whether "not found" is a
   * 404. Here it is written once.
   */
  private fail(res: Response, error: any) {
    if (error instanceof ZodError) return res.status(400).json({ error: error.errors });
    if (error instanceof ContractValidationError) return res.status(400).json({ error: error.message, field: error.field });
    if (error instanceof ContractEditRefusedError) return res.status(400).json({ error: error.message, field: error.field });
    if (error instanceof ContractAlreadyExistsError) {
      return res.status(409).json({ error: error.message, code: error.code, contractId: error.contractId });
    }
    const message = String(error?.message ?? 'Unexpected error');
    if (message.includes('not found')) return res.status(404).json({ error: message });
    if (error instanceof PermissionDeniedError) return res.status(403).json({ error: message });
    return res.status(400).json({ error: message });
  }

  private async createContract(req: Request, res: Response) {
    try {
      // With a deal: made from the deal (FR-CON-01). Without one it is the manual
      // create of the other workspaces, which a sales-process workspace refuses (FR-CON-02).
      if (req.body && typeof req.body === 'object' && 'dealId' in req.body) {
        const fromDeal = createContractFromDealSchema.parse(req.body);
        const made = await this.createContractFromDealUseCase.execute({
          tenantId: requireTenantId(req),
          dealId: fromDeal.dealId,
          startsAt: fromDeal.startsAt ? new Date(fromDeal.startsAt) : undefined,
          endsAt: fromDeal.endsAt ? new Date(fromDeal.endsAt) : undefined,
          billingPeriod: fromDeal.billingPeriod,
          actingUserId: req.user!.userId,
          access: req.access!,
        });
        return res.status(201).json(presentContract(made.contract, req.access!));
      }
      const data = createContractSchema.parse(req.body);
      const result = await this.createContractUseCase.execute({
        tenantId: requireTenantId(req),
        clientId: data.clientId,
        planName: data.planName,
        amount: data.amount,
        billingPeriod: data.billingPeriod,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        assignedUserId: data.assignedUserId,
        notes: data.notes,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.status(201).json(presentContract(result.contract, req.access!));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async updateContract(req: Request, res: Response) {
    try {
      const data = updateContractSchema.parse(req.body);
      const result = await this.updateContractUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        planName: data.planName,
        amount: data.amount,
        billingPeriod: data.billingPeriod,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
        assignedUserId: data.assignedUserId,
        notes: data.notes,
        renewalDate: data.renewalDate === undefined ? undefined : data.renewalDate === null ? null : new Date(data.renewalDate),
        termsText: data.termsText as any,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json({ contract: presentContract(result.contract, req.access!), scheduleNeedsReview: result.scheduleNeedsReview });
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async refreshFromDeal(req: Request, res: Response) {
    try {
      const result = await this.refreshContractFromDealUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json(presentContract(result.contract, req.access!));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async activateContract(req: Request, res: Response) {
    try {
      const result = await this.activateContractUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json({
        contract: presentContract(result.contract, req.access!),
        ...(req.access!.can('payments.view') ? { generatedPayments: result.generatedPayments } : {}),
      });
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async cancelContract(req: Request, res: Response) {
    try {
      const data = cancelContractSchema.parse(req.body ?? {});
      const result = await this.cancelContractUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        reason: data.reason,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json(presentContract(result.contract, req.access!));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async renewContract(req: Request, res: Response) {
    try {
      const data = renewContractSchema.parse(req.body ?? {});
      const result = await this.renewContractUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        planName: data.planName,
        amount: data.amount,
        billingPeriod: data.billingPeriod,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
        notes: data.notes,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.status(201).json(presentContract(result.contract, req.access!));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async searchContracts(req: Request, res: Response) {
    try {
      const params = searchContractsSchema.parse(req.query);
      const result = await this.searchContractsUseCase.execute({
        tenantId: requireTenantId(req),
        actingUserId: req.user!.userId,
        access: req.access!,
        timezone: req.tenant!.timezone,
        params: {
          ...params,
          endsFrom: params.endsFrom ? new Date(params.endsFrom) : undefined,
          endsTo: params.endsTo ? new Date(params.endsTo) : undefined,
          hasOverdue: params.hasOverdue === undefined ? undefined : params.hasOverdue === 'true',
        },
      });
      res.json({ ...result, data: presentContracts(result.data, req.access!) });
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async getContractDetail(req: Request, res: Response) {
    try {
      const result = await this.getContractDetailUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json(presentContractDetail(result, req.access!));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async getClientContracts(req: Request, res: Response) {
    try {
      const result = await this.getClientContractsUseCase.execute({
        tenantId: requireTenantId(req),
        clientId: req.params.clientId as string,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json(presentClientContracts(result, req.access!));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async recordPayment(req: Request, res: Response) {
    try {
      const data = recordPaymentSchema.parse(req.body);
      const result = await this.recordContractPaymentUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        paymentId: req.params.paymentId as string,
        action: data.action,
        amount: data.amount,
        paidAt: data.paidAt ? new Date(data.paidAt) : undefined,
        method: data.method,
        note: data.note,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json({ payment: result.payment, contract: presentContract(result.contract, req.access!) });
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async addPayment(req: Request, res: Response) {
    try {
      const data = addPaymentSchema.parse(req.body);
      const result = await this.addContractPaymentUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        dueDate: new Date(data.dueDate),
        amount: data.amount,
        method: data.method,
        note: data.note,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.status(201).json({ payment: result.payment, contract: presentContract(result.contract, req.access!) });
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async updatePayment(req: Request, res: Response) {
    try {
      const data = updatePaymentSchema.parse(req.body);
      const result = await this.updateContractPaymentUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        paymentId: req.params.paymentId as string,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        amount: data.amount,
        method: data.method,
        note: data.note,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json({ payment: result.payment, contract: presentContract(result.contract, req.access!) });
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async deletePayment(req: Request, res: Response) {
    try {
      const result = await this.deleteContractPaymentUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        paymentId: req.params.paymentId as string,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json({ contract: presentContract(result.contract, req.access!) });
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async attachDocument(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file was uploaded.' });
      }
      const result = await this.attachContractDocumentUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        file: { originalName: req.file.originalname, buffer: req.file.buffer },
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json(presentContract(result.contract, req.access!));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async clearDocument(req: Request, res: Response) {
    try {
      const result = await this.attachContractDocumentUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.json(presentContract(result.contract, req.access!));
    } catch (error: any) {
      this.fail(res, error);
    }
  }
}

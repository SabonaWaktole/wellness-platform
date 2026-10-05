import { Request, Response, Router } from 'express';
import { ContractValidityBadges } from '../../application/ContractValidityBadges';
import { presentClientContracts, presentContract, presentContractDetail, presentContracts } from '../../application/presentContract';
import { PermissionDeniedError } from '../../../access/domain/errors';
import multer from 'multer';
import { requireTenantId } from '@main/interfaces/http/tenantContext';
import { ZodError } from 'zod';
import { CreateContractFromDealUseCase } from '../../application/use-cases/CreateContractFromDealUseCase';
import { RefreshContractFromDealUseCase } from '../../application/use-cases/RefreshContractFromDealUseCase';
import { ContractAlreadyExistsError, ContractValidationError, RenewalNotAllowedError } from '../../domain/contractErrors';
import { Contract, ContractEditRefusedError } from '../../domain/Contract';
import { CreateContractUseCase } from '../../application/use-cases/CreateContractUseCase';
import { UpdateContractUseCase } from '../../application/use-cases/UpdateContractUseCase';
import { ChangeContractStatusUseCase } from '../../application/use-cases/ChangeContractStatusUseCase';
import { ContractDocumentsUseCases } from '../../application/use-cases/ContractDocumentsUseCases';
import { ContractStatus } from '../../domain/Contract';
import { ContractPayment, PaymentStatus } from '../../domain/ContractPayment';
import { RenewContractUseCase } from '../../application/use-cases/RenewContractUseCase';
import { StartRenewalUseCase } from '../../application/use-cases/StartRenewalUseCase';
import { SearchContractsUseCase } from '../../application/use-cases/SearchContractsUseCase';
import { GetContractDetailUseCase } from '../../application/use-cases/GetContractDetailUseCase';
import { GetClientContractsUseCase } from '../../application/use-cases/GetClientContractsUseCase';
import type * as Instalments from '../../application/use-cases/InstalmentUseCases';
import { GetContractPaymentsUseCase } from '../../application/use-cases/GetContractPaymentsUseCase';
import { presentInstalments, presentPaymentHistory } from '../../application/presentPayments';
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
  startRenewalSchema,
  cancelContractSchema,
  changeContractStatusSchema,
  searchContractsSchema,
  addPaymentSchema,
  updatePaymentSchema,
  deletePaymentSchema,
  recordInvoiceSchema,
  markPendingSchema,
  recordReceiptSchema,
  reverseReceiptSchema,
  correctPaymentStatusSchema,
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
    private changeContractStatusUseCase: ChangeContractStatusUseCase,
    private renewContractUseCase: RenewContractUseCase,
    private startRenewalUseCase: StartRenewalUseCase,
    private searchContractsUseCase: SearchContractsUseCase,
    private getContractDetailUseCase: GetContractDetailUseCase,
    private getClientContractsUseCase: GetClientContractsUseCase,
    /** The instalment actions (M3 Slice 8); every one needs `payments.update`. */
    private instalments: {
      recordInvoice: Instalments.RecordInvoiceUseCase;
      markPending: Instalments.MarkPaymentPendingUseCase;
      recordReceipt: Instalments.RecordReceiptUseCase;
      reverseReceipt: Instalments.ReverseReceiptUseCase;
      correctStatus: Instalments.CorrectPaymentStatusUseCase;
      add: Instalments.AddContractPaymentUseCase;
      update: Instalments.UpdateContractPaymentUseCase;
      remove: Instalments.DeleteContractPaymentUseCase;
    },
    private getContractPaymentsUseCase: GetContractPaymentsUseCase,
    private attachContractDocumentUseCase: AttachContractDocumentUseCase,
    private createContractFromDealUseCase: CreateContractFromDealUseCase,
    private refreshContractFromDealUseCase: RefreshContractFromDealUseCase,
    private contractDocumentsUseCases: ContractDocumentsUseCases,
    private validityBadges: ContractValidityBadges
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
    // Every status change goes through one use case, which checks the transition table and
    // the permission it names (`contracts.manage` or `contracts.terminate`). /activate and
    // /cancel are the same call with the target fixed.
    this.router.post('/:id/status', requirePermission('contracts.manage'), this.changeStatus.bind(this));
    this.router.post('/:id/activate', requirePermission('contracts.manage'), this.activateContract.bind(this));
    this.router.post('/:id/cancel', requirePermission('contracts.manage'), this.cancelContract.bind(this));
    this.router.post('/:id/renew', requirePermission('contracts.manage'), this.renewContract.bind(this));
    // The sales-process renewal: starts a Renewal deal (M3 Slice 10). It also needs deals.edit, which the use case checks.
    this.router.post('/:id/renewal', requirePermission('contracts.manage'), this.startRenewal.bind(this));

    // Instalments (M3 Slice 8). Reads need payments.view, narrowed to the viewer's
    // scope; every write needs payments.update, which no sales role holds (FR-PAY-05,
    // FR-RBAC-24). The use cases check it again.
    this.router.get('/:id/payments', requirePermission('payments.view'), this.listPayments.bind(this));
    this.router.get('/:id/payments/:paymentId/history', requirePermission('payments.view'), this.paymentHistory.bind(this));
    this.router.post('/:id/payments', requirePermission('payments.update'), this.addPayment.bind(this));
    this.router.patch('/:id/payments/:paymentId', requirePermission('payments.update'), this.updatePayment.bind(this));
    this.router.delete('/:id/payments/:paymentId', requirePermission('payments.update'), this.deletePayment.bind(this));
    this.router.post('/:id/payments/:paymentId/invoice', requirePermission('payments.update'), this.recordInvoice.bind(this));
    this.router.post('/:id/payments/:paymentId/pending', requirePermission('payments.update'), this.markPending.bind(this));
    this.router.post('/:id/payments/:paymentId/receipts', requirePermission('payments.update'), this.recordReceipt.bind(this));
    this.router.post('/:id/payments/:paymentId/receipts/reverse', requirePermission('payments.update'), this.reverseReceipt.bind(this));
    this.router.post('/:id/payments/:paymentId/correct', requirePermission('payments.update'), this.correctPaymentStatus.bind(this));

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
    // Viewing and downloading the signed document needs commercial.view and access to the contract (FR-CON-19).
    this.router.get('/:id/documents', requirePermission('commercial.view'), this.listDocuments.bind(this));
    this.router.get('/:id/documents/:documentId/download', requirePermission('commercial.view'), this.downloadDocument.bind(this));
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
    if (error instanceof RenewalNotAllowedError) {
      return res.status(409).json({ error: error.message, code: error.code, dealId: error.dealId });
    }
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

  private async changeStatus(req: Request, res: Response) {
    try {
      const data = changeContractStatusSchema.parse(req.body ?? {});
      const result = await this.moveStatus(req, data.status, data.reason);
      res.json(this.statusBody(req, result));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async activateContract(req: Request, res: Response) {
    try {
      res.json(this.statusBody(req, await this.moveStatus(req, ContractStatus.Active)));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async cancelContract(req: Request, res: Response) {
    try {
      const data = cancelContractSchema.parse(req.body ?? {});
      const result = await this.moveStatus(req, ContractStatus.Cancelled, data.reason);
      res.json(presentContract(result.contract, req.access!));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private moveStatus(req: Request, status: ContractStatus, reason?: string | null) {
    return this.changeContractStatusUseCase.execute({
      tenantId: requireTenantId(req),
      contractId: req.params.id as string,
      status,
      reason,
      actingUserId: req.user!.userId,
      access: req.access!,
    });
  }

  /** The instalment count is a payment figure: it needs `payments.view` (FR-RBAC-21). */
  private statusBody(req: Request, result: { contract: Contract; generatedPayments: number }) {
    return {
      contract: presentContract(result.contract, req.access!),
      ...(req.access!.can('payments.view') ? { generatedPayments: result.generatedPayments } : {}),
    };
  }

  /** Starts a Renewal deal from the contract and returns its id, for the screen to open (FR-REN-06). */
  private async startRenewal(req: Request, res: Response) {
    try {
      const data = startRenewalSchema.parse(req.body ?? {});
      const result = await this.startRenewalUseCase.execute({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        ownerUserId: data.ownerUserId,
        actingUserId: req.user!.userId,
        access: req.access!,
      });
      res.status(201).json(result);
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
      res.json({ ...result, data: presentContracts(result.data, req.access!, await this.validityBadges.clock(requireTenantId(req), req.tenant!.timezone)) });
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
      res.json(presentContractDetail(result, req.access!, await this.validityBadges.clock(requireTenantId(req), req.tenant!.timezone)));
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
      res.json(presentClientContracts(result, req.access!, await this.validityBadges.clock(requireTenantId(req), req.tenant!.timezone)));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  /** The ids every instalment action carries. */
  private target(req: Request) {
    return {
      tenantId: requireTenantId(req),
      contractId: req.params.id as string,
      paymentId: req.params.paymentId as string,
      actingUserId: req.user!.userId,
      access: req.access!,
    };
  }

  /** The instalment and its contract after a write, shaped for this viewer. */
  private async paymentBody(req: Request, result: { payment: ContractPayment; contract: Contract }) {
    const clock = await this.validityBadges.clock(requireTenantId(req), req.tenant!.timezone);
    return {
      payment: presentInstalments([result.payment], req.access!, clock.today).payments[0],
      contract: presentContract(result.contract, req.access!),
    };
  }

  private async listPayments(req: Request, res: Response) {
    try {
      const result = await this.getContractPaymentsUseCase.list({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        access: req.access!,
      });
      res.json(presentInstalments(result.payments, req.access!, result.today));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async paymentHistory(req: Request, res: Response) {
    try {
      const history = await this.getContractPaymentsUseCase.history({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        paymentId: req.params.paymentId as string,
        access: req.access!,
      });
      res.json({ history: presentPaymentHistory(history, req.access!) });
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async addPayment(req: Request, res: Response) {
    try {
      const data = addPaymentSchema.parse(req.body);
      const { paymentId: _unused, ...target } = this.target(req);
      const result = await this.instalments.add.execute({ ...target, ...data });
      res.status(201).json(await this.paymentBody(req, result));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async updatePayment(req: Request, res: Response) {
    try {
      const data = updatePaymentSchema.parse(req.body);
      res.json(await this.paymentBody(req, await this.instalments.update.execute({ ...this.target(req), ...data })));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async deletePayment(req: Request, res: Response) {
    try {
      const data = deletePaymentSchema.parse(req.body ?? {});
      const result = await this.instalments.remove.execute({ ...this.target(req), reason: data.reason });
      res.json({ contract: presentContract(result.contract, req.access!) });
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async recordInvoice(req: Request, res: Response) {
    try {
      const data = recordInvoiceSchema.parse(req.body);
      res.json(await this.paymentBody(req, await this.instalments.recordInvoice.execute({ ...this.target(req), ...data })));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async markPending(req: Request, res: Response) {
    try {
      const data = markPendingSchema.parse(req.body ?? {});
      res.json(await this.paymentBody(req, await this.instalments.markPending.execute({ ...this.target(req), ...data })));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async recordReceipt(req: Request, res: Response) {
    try {
      const data = recordReceiptSchema.parse(req.body);
      res.status(201).json(await this.paymentBody(req, await this.instalments.recordReceipt.execute({ ...this.target(req), ...data })));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async reverseReceipt(req: Request, res: Response) {
    try {
      const data = reverseReceiptSchema.parse(req.body);
      res.json(await this.paymentBody(req, await this.instalments.reverseReceipt.execute({ ...this.target(req), ...data })));
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async correctPaymentStatus(req: Request, res: Response) {
    try {
      const data = correctPaymentStatusSchema.parse(req.body);
      res.json(await this.paymentBody(req, await this.instalments.correctStatus.execute({ ...this.target(req), ...data, status: data.status as PaymentStatus })));
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

  private async listDocuments(req: Request, res: Response) {
    try {
      const documents = await this.contractDocumentsUseCases.list({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        access: req.access!,
      });
      res.json({ documents });
    } catch (error: any) {
      this.fail(res, error);
    }
  }

  private async downloadDocument(req: Request, res: Response) {
    try {
      const file = await this.contractDocumentsUseCases.download({
        tenantId: requireTenantId(req),
        contractId: req.params.id as string,
        documentId: req.params.documentId as string,
        access: req.access!,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName.replace(/"/g, '')}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(file.bytes);
    } catch (error: any) {
      this.fail(res, error);
    }
  }
}

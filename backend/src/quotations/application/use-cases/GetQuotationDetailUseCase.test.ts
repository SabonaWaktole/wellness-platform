import { GetQuotationDetailUseCase } from './GetQuotationDetailUseCase';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { IQuotationLineItemRepository } from '../../domain/IQuotationLineItemRepository';
import { IQuotationStatusHistoryRepository } from '../../domain/IQuotationStatusHistoryRepository';
import { Quotation, QuotationStatus } from '../../domain/Quotation';
import { QuotationLineItem } from '../../domain/QuotationLineItem';
import { QuotationStatusHistory } from '../../domain/QuotationStatusHistory';
import { administrator, salesManager, salesUser, scopeResolver } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('GetQuotationDetailUseCase', () => {
  let useCase: GetQuotationDetailUseCase;
  let quotationRepo: jest.Mocked<IQuotationRepository>;
  let lineItemRepo: jest.Mocked<IQuotationLineItemRepository>;
  let historyRepo: jest.Mocked<IQuotationStatusHistoryRepository>;

  beforeEach(() => {
    quotationRepo = { findById: jest.fn(), findPendingApprovals: jest.fn(), search: jest.fn(), save: jest.fn() };
    lineItemRepo = { findByQuotationId: jest.fn(), save: jest.fn(), saveMany: jest.fn(), deleteManyByQuotationId: jest.fn() };
    historyRepo = { findByQuotationId: jest.fn(), save: jest.fn() };

    useCase = new GetQuotationDetailUseCase(quotationRepo, lineItemRepo, historyRepo, scopeResolver(['user-1', 'user-2']));
  });

  function makeQuotation(createdByUserId: string): Quotation {
    const li = QuotationLineItem.create({ id: 'li1', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10 });
    return Quotation.create({
      id: 'q1', tenantId: 'tenant-1', clientId: 'c1', createdByUserId, clientAssignedUserId: createdByUserId, lineItems: [li], status: QuotationStatus.Draft
    });
  }

  it('should return quotation, line items, and history', async () => {
    const quotation = makeQuotation('user-1');
    const lineItem = QuotationLineItem.create({
      id: 'li1', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10
    });
    const history = QuotationStatusHistory.create({
      id: 'h1', tenantId: 'tenant-1', quotationId: 'q1', fromStatus: 'NONE', toStatus: QuotationStatus.Draft, changedByUserId: 'user-1'
    });

    quotationRepo.findById.mockResolvedValue(quotation);
    lineItemRepo.findByQuotationId.mockResolvedValue([lineItem]);
    historyRepo.findByQuotationId.mockResolvedValue([history]);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      quotationId: 'q1',
      actingUserId: 'owner-1',
      access: administrator({ userId: 'owner-1' })
    });

    expect(result.quotation.id).toBe('q1');
    expect(result.lineItems.length).toBe(1);
    expect(result.history.length).toBe(1);
  });

  it('should reject if quotation not found', async () => {
    quotationRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' })
    })).rejects.toThrow('Quotation not found');
  });

  it('should prevent Staff from viewing another Staffs quotation', async () => {
    const quotation = makeQuotation('user-2');
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' })
    })).rejects.toThrow('Quotation not found');
  });

  it('FR-RBAC-11 lets a TEAM-scoped Sales Manager act on a colleague\'s draft', async () => {
    quotationRepo.findById.mockResolvedValue(makeQuotation('user-2'));
    lineItemRepo.findByQuotationId.mockResolvedValue([]);
    historyRepo.findByQuotationId.mockResolvedValue([]);

    const result = await useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'mgr-1', access: salesManager({ userId: 'mgr-1' })
    });

    expect(result.permittedActions).toEqual(['EDIT', 'SUBMIT']);
  });

  it('FR-RBAC-05 offers APPROVE only to a holder of quotations.approve', async () => {
    const pending = makeQuotation('user-2');
    pending.submit({ requiresApproval: true });
    quotationRepo.findById.mockResolvedValue(pending);
    lineItemRepo.findByQuotationId.mockResolvedValue([]);
    historyRepo.findByQuotationId.mockResolvedValue([]);

    const asManager = await useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'mgr-1', access: salesManager({ userId: 'mgr-1' })
    });
    const asApprover = await useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'mgr-1',
      access: salesManager({ userId: 'mgr-1', grant: { 'quotations.approve': true } })
    });

    expect(asManager.permittedActions).toEqual([]);
    expect(asApprover.permittedActions).toEqual(['APPROVE', 'RETURN_TO_DRAFT']);
  });
});

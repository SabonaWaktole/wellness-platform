import { UpdateQuotationUseCase } from './UpdateQuotationUseCase';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { IQuotationLineItemRepository } from '../../domain/IQuotationLineItemRepository';
import { IProductRepository, IWarehouseRepository, IStockLevelRepository } from '../../../inventory/domain/repositories';
import { Quotation, QuotationStatus } from '../../domain/Quotation';
import { QuotationLineItem } from '../../domain/QuotationLineItem';
import { StockLevel } from '../../../inventory/domain/StockLevel';
import { IQuotationDeliveryService } from '../QuotationDeliveryService';
import { makeQuotationWriteHarness } from '../../../../tests/support/fakeQuotationWriteTransaction';
import { administrator, salesUser, scopeResolver } from '../../../../tests/support/access';
import { PermissionDeniedError } from '../../../access/domain/errors';

describe('UpdateQuotationUseCase', () => {
  let useCase: UpdateQuotationUseCase;
  let quotationRepo: jest.Mocked<IQuotationRepository>;
  let lineItemRepo: jest.Mocked<IQuotationLineItemRepository>;
  let productRepo: jest.Mocked<IProductRepository>;
  let warehouseRepo: jest.Mocked<IWarehouseRepository>;
  let stockLevelRepo: jest.Mocked<IStockLevelRepository>;
  let harness: ReturnType<typeof makeQuotationWriteHarness>;
  let delivery: jest.Mocked<IQuotationDeliveryService>;

  beforeEach(() => {
    quotationRepo = { findById: jest.fn(), findPendingApprovals: jest.fn(), search: jest.fn(), save: jest.fn() };
    lineItemRepo = { findByQuotationId: jest.fn(), save: jest.fn(), saveMany: jest.fn(), deleteManyByQuotationId: jest.fn() };
    productRepo = {
      findById: jest.fn(), findBySku: jest.fn(), findManyByIds: jest.fn(), findWithStock: jest.fn(),
      save: jest.fn(), saveMany: jest.fn(), delete: jest.fn(), search: jest.fn(), summarise: jest.fn(),
      countByCategoryId: jest.fn(), countQuotationReferences: jest.fn(),
      listBrands: jest.fn(), listTags: jest.fn(),
    };
    warehouseRepo = { findById: jest.fn(), findAllByTenantId: jest.fn(), save: jest.fn(), update: jest.fn(), delete: jest.fn() };
    stockLevelRepo = { findById: jest.fn(), findByProductAndWarehouse: jest.fn(), findByProductId: jest.fn(), save: jest.fn(), countByWarehouseId: jest.fn() };
    stockLevelRepo.findByProductAndWarehouse.mockResolvedValue(
      StockLevel.create({ id: 'sl1', tenantId: 'tenant-1', productId: 'p1', productTenantId: 'tenant-1', warehouseId: 'w1', warehouseTenantId: 'tenant-1', quantity: 100 })
    );
    harness = makeQuotationWriteHarness();
    delivery = { deliverToClient: jest.fn().mockResolvedValue(undefined) };

    useCase = new UpdateQuotationUseCase(quotationRepo, lineItemRepo, productRepo, warehouseRepo, stockLevelRepo, harness.writeTx, scopeResolver(), delivery);
  });

  function makeQuotation(status: QuotationStatus, createdByUserId: string, shareToken: string | null = null): Quotation {
    const li = QuotationLineItem.create({
      id: 'old-li', tenantId: 'tenant-1', quotationId: 'q1', productId: 'p-old', warehouseId: 'w-old', quantity: 1, unitPrice: 10
    });
    return Quotation.create({
      id: 'q1', tenantId: 'tenant-1', clientId: 'c1', createdByUserId, clientAssignedUserId: createdByUserId, lineItems: [li], status, shareToken
    });
  }

  it('should update line items while in Draft', async () => {
    const quotation = makeQuotation(QuotationStatus.Draft, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);
    productRepo.findById.mockResolvedValue({ id: 'p1', tenantId: 'tenant-1' } as any);
    warehouseRepo.findById.mockResolvedValue({ id: 'w1', tenantId: 'tenant-1' } as any);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      quotationId: 'q1',
      actingUserId: 'user-1',
      access: salesUser({ userId: 'user-1' }),
      lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 2, unitPrice: 50 }]
    });

    expect(result.quotation.subtotal).toBe(100);
    expect(result.quotation.lineItems.length).toBe(1);
    expect(result.quotation.lineItems[0].productId).toBe('p1');
    expect(lineItemRepo.deleteManyByQuotationId).toHaveBeenCalledWith('tenant-1', 'q1');
    expect(lineItemRepo.saveMany).toHaveBeenCalledTimes(1);
    expect(quotationRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should reject if quotation not found', async () => {
    quotationRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' }), lineItems: []
    })).rejects.toThrow('Quotation not found');
  });

  it('should reject if status is not Draft or Rejected', async () => {
    const quotation = makeQuotation(QuotationStatus.Sent, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' }), lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 2, unitPrice: 50 }]
    })).rejects.toThrow('Only Draft or Rejected quotations can be updated');
  });

  it('should reject if Staff tries to update another Staffs quotation', async () => {
    const quotation = makeQuotation(QuotationStatus.Draft, 'user-2');
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' }), lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 2, unitPrice: 50 }]
    })).rejects.toThrow('Quotation not found');
  });

  it('should allow Business Owner to update any quotation in Draft', async () => {
    const quotation = makeQuotation(QuotationStatus.Draft, 'user-2');
    quotationRepo.findById.mockResolvedValue(quotation);
    productRepo.findById.mockResolvedValue({ id: 'p1', tenantId: 'tenant-1' } as any);
    warehouseRepo.findById.mockResolvedValue({ id: 'w1', tenantId: 'tenant-1' } as any);

    const result = await useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'owner-1', access: administrator({ userId: 'owner-1' }), lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 2, unitPrice: 50 }]
    });
    
    expect(result.quotation.id).toBe('q1');
  });

  it('should reject zero line items on update', async () => {
    const quotation = makeQuotation(QuotationStatus.Draft, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' }), lineItems: []
    })).rejects.toThrow('A quotation must have at least one line item');
  });

  it('should reject if productId or warehouseId belongs to different tenant', async () => {
    const quotation = makeQuotation(QuotationStatus.Draft, 'user-1');
    quotationRepo.findById.mockResolvedValue(quotation);
    productRepo.findById.mockResolvedValue({ id: 'p1', tenantId: 'tenant-1' } as any);
    warehouseRepo.findById.mockResolvedValue({ id: 'w1', tenantId: 'tenant-2' } as any);

    await expect(useCase.execute({
      tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' }), lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 2, unitPrice: 50 }]
    })).rejects.toThrow('Warehouse w1 does not belong to this tenant');
  });

  describe('revising a Rejected quotation', () => {
    it('resends it — transitions to Sent, records history, and emails the client again', async () => {
      const quotation = makeQuotation(QuotationStatus.Rejected, 'user-1', 'share-tok-1');
      quotationRepo.findById.mockResolvedValue(quotation);
      productRepo.findById.mockResolvedValue({ id: 'p1', tenantId: 'tenant-1' } as any);
      warehouseRepo.findById.mockResolvedValue({ id: 'w1', tenantId: 'tenant-1' } as any);

      const result = await useCase.execute({
        tenantId: 'tenant-1',
        quotationId: 'q1',
        actingUserId: 'user-1',
        access: salesUser({ userId: 'user-1' }),
        lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 2, unitPrice: 50 }]
      });

      expect(result.quotation.status).toBe(QuotationStatus.Sent);
      expect(result.quotation.respondedAt).toBeNull();
      expect(harness.quotationRepo.save).toHaveBeenCalledWith(quotation);
      expect(harness.historyRepo.save).toHaveBeenCalledTimes(1);
      const [history] = (harness.historyRepo.save as jest.Mock).mock.calls[0];
      expect(history.fromStatus).toBe(QuotationStatus.Rejected);
      expect(history.toStatus).toBe(QuotationStatus.Sent);
      // Unchanged: `issueShareToken`'s own "never reissued" guard means the
      // customer's original link keeps working, so no new token is minted.
      expect(result.quotation.shareToken).toBe('share-tok-1');
      expect(delivery.deliverToClient).toHaveBeenCalledWith('share-tok-1');
    });

    it('does not touch the Draft-edit path: no history, no email, plain save', async () => {
      const quotation = makeQuotation(QuotationStatus.Draft, 'user-1');
      quotationRepo.findById.mockResolvedValue(quotation);
      productRepo.findById.mockResolvedValue({ id: 'p1', tenantId: 'tenant-1' } as any);
      warehouseRepo.findById.mockResolvedValue({ id: 'w1', tenantId: 'tenant-1' } as any);

      await useCase.execute({
        tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' }),
        lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 2, unitPrice: 50 }]
      });

      expect(quotationRepo.save).toHaveBeenCalledTimes(1);
      expect(harness.historyRepo.save).not.toHaveBeenCalled();
      expect(delivery.deliverToClient).not.toHaveBeenCalled();
    });

    it('refuses to resend — and writes nothing — when a revised line item exceeds on-hand stock', async () => {
      const quotation = makeQuotation(QuotationStatus.Rejected, 'user-1', 'share-tok-1');
      quotationRepo.findById.mockResolvedValue(quotation);
      productRepo.findById.mockResolvedValue({ id: 'p1', tenantId: 'tenant-1' } as any);
      warehouseRepo.findById.mockResolvedValue({ id: 'w1', tenantId: 'tenant-1' } as any);
      stockLevelRepo.findByProductAndWarehouse.mockResolvedValue(
        StockLevel.create({ id: 'sl1', tenantId: 'tenant-1', productId: 'p1', productTenantId: 'tenant-1', warehouseId: 'w1', warehouseTenantId: 'tenant-1', quantity: 0 })
      );

      await expect(useCase.execute({
        tenantId: 'tenant-1', quotationId: 'q1', actingUserId: 'user-1', access: salesUser({ userId: 'user-1' }),
        lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 2, unitPrice: 50 }]
      })).rejects.toThrow('Insufficient stock for product p1 at warehouse w1');

      expect(lineItemRepo.deleteManyByQuotationId).not.toHaveBeenCalled();
      expect(harness.quotationRepo.save).not.toHaveBeenCalled();
      expect(delivery.deliverToClient).not.toHaveBeenCalled();
      expect(quotation.status).toBe(QuotationStatus.Rejected);
    });
  });
});

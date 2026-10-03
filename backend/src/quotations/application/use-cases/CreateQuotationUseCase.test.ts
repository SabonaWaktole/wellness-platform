import { CreateQuotationUseCase } from './CreateQuotationUseCase';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { IQuotationLineItemRepository } from '../../domain/IQuotationLineItemRepository';
import { IQuotationStatusHistoryRepository } from '../../domain/IQuotationStatusHistoryRepository';
import { IClientRepository } from '../../../clients/domain/repositories/IClientRepository';
import { IProductRepository, IWarehouseRepository } from '../../../inventory/domain/repositories';
import { QuotationStatus } from '../../domain/Quotation';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { UseDealOffersError } from '../../domain/offerErrors';
import { administrator, reception, scopeResolver } from '../../../../tests/support/access';

describe('CreateQuotationUseCase', () => {
  let useCase: CreateQuotationUseCase;
  let quotationRepo: jest.Mocked<IQuotationRepository>;
  let lineItemRepo: jest.Mocked<IQuotationLineItemRepository>;
  let historyRepo: jest.Mocked<IQuotationStatusHistoryRepository>;
  let clientRepo: jest.Mocked<IClientRepository>;
  let productRepo: jest.Mocked<IProductRepository>;
  let warehouseRepo: jest.Mocked<IWarehouseRepository>;

  beforeEach(() => {
    quotationRepo = { findById: jest.fn(), findPendingApprovals: jest.fn(), search: jest.fn(), save: jest.fn() };
    lineItemRepo = { findByQuotationId: jest.fn(), save: jest.fn(), saveMany: jest.fn(), deleteManyByQuotationId: jest.fn() };
    historyRepo = { findByQuotationId: jest.fn(), save: jest.fn() };
    clientRepo = { findById: jest.fn(), search: jest.fn(), countByTenant: jest.fn(), findRecentByTenant: jest.fn(), save: jest.fn(), update: jest.fn() } as any;
    productRepo = {
      findById: jest.fn(), findBySku: jest.fn(), findManyByIds: jest.fn(), findWithStock: jest.fn(),
      save: jest.fn(), saveMany: jest.fn(), delete: jest.fn(), search: jest.fn(), summarise: jest.fn(),
      countByCategoryId: jest.fn(), countQuotationReferences: jest.fn(),
      listBrands: jest.fn(), listTags: jest.fn(),
    };
    warehouseRepo = { findById: jest.fn(), findAllByTenantId: jest.fn(), save: jest.fn(), update: jest.fn(), delete: jest.fn() };

    useCase = new CreateQuotationUseCase(quotationRepo, lineItemRepo, historyRepo, clientRepo, productRepo, warehouseRepo, scopeResolver());
  });

  it('should create a quotation in Draft with correct subtotal', async () => {
    clientRepo.findById.mockResolvedValue({ id: 'c1', tenantId: 'tenant-1' } as any);
    productRepo.findById.mockResolvedValue({ id: 'p1', tenantId: 'tenant-1' } as any);
    warehouseRepo.findById.mockResolvedValue({ id: 'w1', tenantId: 'tenant-1' } as any);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      clientId: 'c1',
      createdByUserId: 'user-1',
      lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 5, unitPrice: 100 }],
      access: administrator({ userId: 'user-1' })
    });

    expect(result.quotation.status).toBe(QuotationStatus.Draft);
    expect(result.quotation.subtotal).toBe(500);
    expect(quotationRepo.save).toHaveBeenCalledTimes(1);
    expect(lineItemRepo.saveMany).toHaveBeenCalledTimes(1);
    expect(historyRepo.save).toHaveBeenCalledTimes(1);
  });

  it('FR-OFR-01 a workspace on the sales process makes offers from deals, so the legacy create is refused', async () => {
    const tenants = { findById: jest.fn().mockResolvedValue({ runsSalesProcess: () => true }) };
    useCase = new CreateQuotationUseCase(quotationRepo, lineItemRepo, historyRepo, clientRepo, productRepo, warehouseRepo, scopeResolver(), tenants);

    await expect(useCase.execute({
      tenantId: 'tenant-1',
      clientId: 'c1',
      createdByUserId: 'user-1',
      lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10 }],
      access: administrator({ userId: 'user-1' })
    })).rejects.toThrow(UseDealOffersError);
    expect(quotationRepo.save).not.toHaveBeenCalled();
  });

  it('should reject if clientId not found', async () => {
    clientRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({
      tenantId: 'tenant-1',
      clientId: 'c1',
      createdByUserId: 'user-1',
      lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10 }],
      access: administrator({ userId: 'user-1' })
    })).rejects.toThrow('Client not found');
  });

  it('should reject if clientId belongs to different tenant', async () => {
    clientRepo.findById.mockResolvedValue({ id: 'c1', tenantId: 'tenant-2' } as any);

    await expect(useCase.execute({
      tenantId: 'tenant-1',
      clientId: 'c1',
      createdByUserId: 'user-1',
      lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10 }],
      access: administrator({ userId: 'user-1' })
    })).rejects.toThrow('Client does not belong to this tenant');
  });

  it('should reject if productId not found', async () => {
    clientRepo.findById.mockResolvedValue({ id: 'c1', tenantId: 'tenant-1' } as any);
    productRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute({
      tenantId: 'tenant-1',
      clientId: 'c1',
      createdByUserId: 'user-1',
      lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10 }],
      access: administrator({ userId: 'user-1' })
    })).rejects.toThrow('Product p1 not found');
  });

  it('should reject if warehouseId belongs to different tenant', async () => {
    clientRepo.findById.mockResolvedValue({ id: 'c1', tenantId: 'tenant-1' } as any);
    productRepo.findById.mockResolvedValue({ id: 'p1', tenantId: 'tenant-1' } as any);
    warehouseRepo.findById.mockResolvedValue({ id: 'w1', tenantId: 'tenant-2' } as any);

    await expect(useCase.execute({
      tenantId: 'tenant-1',
      clientId: 'c1',
      createdByUserId: 'user-1',
      lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10 }],
      access: administrator({ userId: 'user-1' })
    })).rejects.toThrow('Warehouse w1 does not belong to this tenant');
  });

  it('should reject zero line items', async () => {
    clientRepo.findById.mockResolvedValue({ id: 'c1', tenantId: 'tenant-1' } as any);

    await expect(useCase.execute({
      tenantId: 'tenant-1',
      clientId: 'c1',
      createdByUserId: 'user-1',
      lineItems: [],
      access: administrator({ userId: 'user-1' })
    })).rejects.toThrow('A quotation must have at least one line item');
  });

  it('FR-RBAC-05 rejects a caller without quotations.manage', async () => {
    await expect(useCase.execute({
      tenantId: 'tenant-1',
      clientId: 'c1',
      createdByUserId: 'user-1',
      lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: 10 }],
      access: reception({ userId: 'user-1' })
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should reject line item with quantity 0', async () => {
    clientRepo.findById.mockResolvedValue({ id: 'c1', tenantId: 'tenant-1' } as any);
    productRepo.findById.mockResolvedValue({ id: 'p1', tenantId: 'tenant-1' } as any);
    warehouseRepo.findById.mockResolvedValue({ id: 'w1', tenantId: 'tenant-1' } as any);

    await expect(useCase.execute({
      tenantId: 'tenant-1',
      clientId: 'c1',
      createdByUserId: 'user-1',
      lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 0, unitPrice: 10 }],
      access: administrator({ userId: 'user-1' })
    })).rejects.toThrow('Quantity must be greater than zero');
  });

  it('should reject line item with negative unitPrice', async () => {
    clientRepo.findById.mockResolvedValue({ id: 'c1', tenantId: 'tenant-1' } as any);
    productRepo.findById.mockResolvedValue({ id: 'p1', tenantId: 'tenant-1' } as any);
    warehouseRepo.findById.mockResolvedValue({ id: 'w1', tenantId: 'tenant-1' } as any);

    await expect(useCase.execute({
      tenantId: 'tenant-1',
      clientId: 'c1',
      createdByUserId: 'user-1',
      lineItems: [{ productId: 'p1', warehouseId: 'w1', quantity: 1, unitPrice: -5 }],
      access: administrator({ userId: 'user-1' })
    })).rejects.toThrow('Unit price cannot be negative');
  });
});

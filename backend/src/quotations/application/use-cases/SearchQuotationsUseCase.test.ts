import { SearchQuotationsUseCase } from './SearchQuotationsUseCase';
import { IQuotationRepository } from '../../domain/IQuotationRepository';
import { Quotation, QuotationStatus } from '../../domain/Quotation';
import { QuotationLineItem } from '../../domain/QuotationLineItem';
import { administrator, salesUser, scopeResolver } from '../../../../tests/support/access';

describe('SearchQuotationsUseCase', () => {
  let useCase: SearchQuotationsUseCase;
  let quotationRepo: jest.Mocked<IQuotationRepository>;

  beforeEach(() => {
    quotationRepo = { findById: jest.fn(), findPendingApprovals: jest.fn(), search: jest.fn(), save: jest.fn() };
    useCase = new SearchQuotationsUseCase(quotationRepo, scopeResolver());
  });

  function makeQuotation(status: QuotationStatus, createdByUserId: string, clientId: string): Quotation {
    return Quotation.create({
      id: 'q1', tenantId: 'tenant-1', clientId, createdByUserId, clientAssignedUserId: createdByUserId, lineItems: [], status
    });
  }

  it('should search with all parameters for Business Owner', async () => {
    quotationRepo.search.mockResolvedValue({ data: [], total: 0 });

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      actingUserId: 'owner-1',
      access: administrator({ userId: 'owner-1' }),
      params: {
        query: 'search term',
        status: QuotationStatus.Sent,
        clientId: 'c1',
        page: 2,
        limit: 15
      }
    });

    expect(quotationRepo.search).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      query: 'search term',
      status: QuotationStatus.Sent,
      clientId: 'c1',
      scope: { kind: 'all' }, // Owner sees all
      page: 2,
      limit: 15
    } as any);
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('should restrict Staff to the quotations of their own companies', async () => {
    quotationRepo.search.mockResolvedValue({ data: [], total: 0 });

    await useCase.execute({
      tenantId: 'tenant-1',
      actingUserId: 'staff-1',
      access: salesUser({ userId: 'staff-1' }),
      params: {}
    });

    expect(quotationRepo.search).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      query: undefined,
      status: undefined,
      clientId: undefined,
      // Staff restricted to their own companies' quotations (FR-RBAC-11)
      scope: { kind: 'owners', userIds: ['staff-1'], includeUnowned: false },
      page: 1, // default
      limit: 10 // default
    } as any);
  });

  it('should provide default pagination', async () => {
    quotationRepo.search.mockResolvedValue({ data: [], total: 0 });

    await useCase.execute({
      tenantId: 'tenant-1',
      actingUserId: 'owner-1',
      access: administrator({ userId: 'owner-1' }),
      params: {}
    });

    expect(quotationRepo.search).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      query: undefined,
      status: undefined,
      clientId: undefined,
      scope: { kind: 'all' },
      page: 1,
      limit: 10
    } as any);
  });
});

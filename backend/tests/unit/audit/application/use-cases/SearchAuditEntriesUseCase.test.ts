import { SearchAuditEntriesUseCase } from '../../../../../src/audit/application/use-cases/SearchAuditEntriesUseCase';
import { AuditAction } from '../../../../../src/audit/domain/AuditAction';
import { administrator, salesUser } from '../../../../support/access';

describe('SearchAuditEntriesUseCase', () => {
  it('FR-AUD-05/06 refuses a caller without audit.view before the reader is ever asked', async () => {
    const search = jest.fn();
    const useCase = new SearchAuditEntriesUseCase({ search, findById: jest.fn(), stream: jest.fn() });

    await expect(
      useCase.execute({ access: salesUser(), tenantId: 't1', query: { page: 1, limit: 25 } })
    ).rejects.toThrow(/permission/i);
    expect(search).not.toHaveBeenCalled();
  });

  it('FR-AUD-06 passes the filter and paging through to the reader', async () => {
    const page = { data: [], total: 0 };
    const search = jest.fn().mockResolvedValue(page);
    const useCase = new SearchAuditEntriesUseCase({ search, findById: jest.fn(), stream: jest.fn() });

    const query = { entityType: 'Contract' as const, action: AuditAction.Update, page: 2, limit: 10 };
    const result = await useCase.execute({ access: administrator(), tenantId: 't1', query });

    expect(search).toHaveBeenCalledWith('t1', query);
    expect(result).toBe(page);
  });
});

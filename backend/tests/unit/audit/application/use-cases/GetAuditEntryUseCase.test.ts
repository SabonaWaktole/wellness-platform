import { GetAuditEntryUseCase } from '../../../../../src/audit/application/use-cases/GetAuditEntryUseCase';
import { AuditEntryNotFoundError } from '../../../../../src/audit/domain/errors';
import { administrator, salesUser } from '../../../../support/access';

describe('GetAuditEntryUseCase', () => {
  it('FR-AUD-05/06 refuses a caller without audit.view', async () => {
    const findById = jest.fn();
    const useCase = new GetAuditEntryUseCase({ search: jest.fn(), findById, stream: jest.fn() });

    await expect(useCase.execute({ access: salesUser(), tenantId: 't1', id: 'e1' })).rejects.toThrow(/permission/i);
    expect(findById).not.toHaveBeenCalled();
  });

  it('answers AuditEntryNotFoundError when the reader finds nothing', async () => {
    const findById = jest.fn().mockResolvedValue(null);
    const useCase = new GetAuditEntryUseCase({ search: jest.fn(), findById, stream: jest.fn() });

    await expect(useCase.execute({ access: administrator(), tenantId: 't1', id: 'missing' })).rejects.toBeInstanceOf(
      AuditEntryNotFoundError
    );
  });

  it('returns the entry the reader finds', async () => {
    const entry = { id: 'e1' } as any;
    const findById = jest.fn().mockResolvedValue(entry);
    const useCase = new GetAuditEntryUseCase({ search: jest.fn(), findById, stream: jest.fn() });

    await expect(useCase.execute({ access: administrator(), tenantId: 't1', id: 'e1' })).resolves.toBe(entry);
  });
});

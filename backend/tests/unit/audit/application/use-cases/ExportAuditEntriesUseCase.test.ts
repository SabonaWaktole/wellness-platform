import { ExportAuditEntriesUseCase } from '../../../../../src/audit/application/use-cases/ExportAuditEntriesUseCase';
import { administrator, salesUser } from '../../../../support/access';

describe('ExportAuditEntriesUseCase', () => {
  it('FR-AUD-05/08 refuses a caller without audit.view, without ever touching the reader', () => {
    const stream = jest.fn();
    const useCase = new ExportAuditEntriesUseCase({ search: jest.fn(), findById: jest.fn(), stream });

    expect(() => useCase.execute({ access: salesUser(), tenantId: 't1', filter: {} })).toThrow(/permission/i);
    expect(stream).not.toHaveBeenCalled();
  });

  it('FR-AUD-08 passes the filter through to the reader and returns its stream', () => {
    const batches = (async function* () {})();
    const stream = jest.fn().mockReturnValue(batches);
    const useCase = new ExportAuditEntriesUseCase({ search: jest.fn(), findById: jest.fn(), stream });

    const filter = { entityType: 'Contract' as const };
    const result = useCase.execute({ access: administrator(), tenantId: 't1', filter });

    expect(stream).toHaveBeenCalledWith('t1', filter);
    expect(result).toBe(batches);
  });
});

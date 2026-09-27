import { SearchClientsUseCase } from '../../../../../src/clients/application/use-cases/SearchClientsUseCase';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { Client } from '../../../../../src/clients/domain/entities/Client';
import { ClientStatus } from '../../../../../src/clients/domain/enums/ClientStatus';
import { administrator, salesUser, scopeResolver } from '../../../../support/access';

describe('SearchClientsUseCase', () => {
  let useCase: SearchClientsUseCase;
  let clientRepo: jest.Mocked<IClientRepository>;

  beforeEach(() => {
    clientRepo = {
      findById: jest.fn(),
      search: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      countByTenant: jest.fn(),
      findRecentByTenant: jest.fn(),
    } as any;
    useCase = new SearchClientsUseCase(clientRepo, scopeResolver());
  });

  it('searches clients with custom field filters', async () => {
    clientRepo.search.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({
      tenantId: 't1',
      access: administrator(),
      filters: { customFields: { industry: 'Tech' } },
      skip: 0,
      take: 10,
    });

    expect(clientRepo.search).toHaveBeenCalledWith(
      't1',
      { customFields: { industry: 'Tech' }, scope: { kind: 'all' } },
      0,
      10
    );
  });

  it('FR-RBAC-13 hands the repository a Sales User\'s own scope, so the count is theirs alone', async () => {
    clientRepo.search.mockResolvedValue({ items: [], total: 0 });

    await useCase.execute({ tenantId: 't1', access: salesUser({ userId: 'me' }), filters: {} });

    expect(clientRepo.search).toHaveBeenCalledWith(
      't1',
      { scope: { kind: 'owners', userIds: ['me'], includeUnowned: false } },
      0,
      50
    );
  });
});

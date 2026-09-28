import { PermissionDeniedError } from '../../../../access/domain/errors';
import { ConnectIntegrationUseCase } from '../ConnectIntegrationUseCase';
import { IIntegrationRepository } from '../../../domain/repositories/IIntegrationRepository';
import { Integration } from '../../../domain/entities/Integration';
import { administrator, salesUser } from '../../../../../tests/support/access';

describe('ConnectIntegrationUseCase', () => {
  let mockRepo: jest.Mocked<IIntegrationRepository>;
  let useCase: ConnectIntegrationUseCase;

  beforeEach(() => {
    mockRepo = {
      findByTenantId: jest.fn(),
      findByProvider: jest.fn(),
      save: jest.fn(),
    };
    useCase = new ConnectIntegrationUseCase(mockRepo);
  });

  it('should throw Unauthorized if user is STAFF', async () => {
    await expect(useCase.execute({
      tenantId: 't1',
      access: salesUser(),
      provider: 'GOOGLE_CALENDAR'
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should create a new integration if none exists', async () => {
    mockRepo.findByProvider.mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 't1',
      access: administrator(),
      provider: 'GOOGLE_CALENDAR',
      config: { token: 'abc' }
    });

    expect(result.provider).toBe('GOOGLE_CALENDAR');
    expect(result.status).toBe('CONNECTED');
    expect(result.config).toEqual({ token: 'abc' });
    expect(mockRepo.save).toHaveBeenCalledWith(result);
  });

  it('should update an existing integration if it exists', async () => {
    const existing = new Integration({
      id: 'i1',
      tenantId: 't1',
      provider: 'GOOGLE_CALENDAR',
      status: 'DISCONNECTED',
      config: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    mockRepo.findByProvider.mockResolvedValue(existing);

    const result = await useCase.execute({
      tenantId: 't1',
      access: administrator(),
      provider: 'GOOGLE_CALENDAR',
      config: { newToken: 'def' }
    });

    expect(result.status).toBe('CONNECTED');
    expect(result.config).toEqual({ newToken: 'def' });
    expect(mockRepo.save).toHaveBeenCalledWith(existing);
  });
});

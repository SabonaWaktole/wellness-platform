import { PermissionDeniedError } from '../../../../access/domain/errors';
import { DisconnectIntegrationUseCase } from '../DisconnectIntegrationUseCase';
import { IIntegrationRepository } from '../../../domain/repositories/IIntegrationRepository';
import { Integration } from '../../../domain/entities/Integration';
import { administrator, salesUser } from '../../../../../tests/support/access';

describe('DisconnectIntegrationUseCase', () => {
  let mockRepo: jest.Mocked<IIntegrationRepository>;
  let useCase: DisconnectIntegrationUseCase;

  beforeEach(() => {
    mockRepo = {
      findByTenantId: jest.fn(),
      findByProvider: jest.fn(),
      save: jest.fn(),
    };
    useCase = new DisconnectIntegrationUseCase(mockRepo);
  });

  it('should throw Unauthorized if user is STAFF', async () => {
    await expect(useCase.execute({
      tenantId: 't1',
      access: salesUser(),
      provider: 'GOOGLE_CALENDAR'
    })).rejects.toThrow(PermissionDeniedError);
  });

  it('should do nothing if integration does not exist', async () => {
    mockRepo.findByProvider.mockResolvedValue(null);

    await useCase.execute({
      tenantId: 't1',
      access: administrator(),
      provider: 'GOOGLE_CALENDAR'
    });

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('should disconnect an existing integration', async () => {
    const existing = new Integration({
      id: 'i1',
      tenantId: 't1',
      provider: 'GOOGLE_CALENDAR',
      status: 'CONNECTED',
      config: { token: 'abc' },
      createdAt: new Date(),
      updatedAt: new Date()
    });

    mockRepo.findByProvider.mockResolvedValue(existing);

    await useCase.execute({
      tenantId: 't1',
      access: administrator(),
      provider: 'GOOGLE_CALENDAR'
    });

    expect(existing.status).toBe('DISCONNECTED');
    expect(existing.config).toBeNull();
    expect(mockRepo.save).toHaveBeenCalledWith(existing);
  });
});

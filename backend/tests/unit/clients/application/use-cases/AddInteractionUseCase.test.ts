import { AddInteractionUseCase } from '../../../../../src/clients/application/use-cases/AddInteractionUseCase';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { IInteractionRepository } from '../../../../../src/clients/domain/repositories/IInteractionRepository';
import { IOutcomeCategoryRepository } from '../../../../../src/clients/domain/repositories/IOutcomeCategoryRepository';
import { Client } from '../../../../../src/clients/domain/entities/Client';
import { ClientStatus } from '../../../../../src/clients/domain/enums/ClientStatus';
import { InteractionChannel } from '../../../../../src/clients/domain/enums/InteractionChannel';
import { OutcomeCategory } from '../../../../../src/clients/domain/entities/OutcomeCategory';
import { administrator, reception, scopeResolver } from '../../../../support/access';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';

describe('AddInteractionUseCase', () => {
  let useCase: AddInteractionUseCase;
  let clientRepo: jest.Mocked<IClientRepository>;
  let interactionRepo: jest.Mocked<IInteractionRepository>;
  let outcomeRepo: jest.Mocked<IOutcomeCategoryRepository>;

  beforeEach(() => {
    clientRepo = { findById: jest.fn(), search: jest.fn(), save: jest.fn(), update: jest.fn(), countByTenant: jest.fn(), findRecentByTenant: jest.fn() } as any;
    interactionRepo = { findByClientId: jest.fn(), save: jest.fn(), findById: jest.fn(), findRecentByTenant: jest.fn() } as any;
    outcomeRepo = { findByTenantId: jest.fn(), findById: jest.fn(), save: jest.fn() } as any;
    useCase = new AddInteractionUseCase(clientRepo, interactionRepo, outcomeRepo, scopeResolver());
  });

  it('adds an interaction successfully', async () => {
    clientRepo.findById.mockResolvedValue(
      Client.create({
        id: 'c1', tenantId: 't1', name: 'Acme', contactInfo: {},
        status: ClientStatus.CLIENT, customFieldValues: {},
        lastUpdatedByUserId: 'u1', createdAt: new Date(), updatedAt: new Date()
      }, [])
    );

    const result = await useCase.execute({
      tenantId: 't1',
      clientId: 'c1',
      authorUserId: 'u1',
      access: administrator(),
      content: 'Good meeting',
      channel: InteractionChannel.MEETING,
    });

    expect(interactionRepo.save).toHaveBeenCalledWith('t1', expect.anything());
    expect(result.content).toBe('Good meeting');
  });

  it('rejects if outcome category does not belong to tenant', async () => {
    clientRepo.findById.mockResolvedValue(
      Client.create({
        id: 'c1', tenantId: 't1', name: 'Acme', contactInfo: {},
        status: ClientStatus.CLIENT, customFieldValues: {},
        lastUpdatedByUserId: 'u1', createdAt: new Date(), updatedAt: new Date()
      }, [])
    );

    // Outcome belongs to tenant 2
    outcomeRepo.findById.mockResolvedValue(
      OutcomeCategory.create({ id: 'out-1', tenantId: 't2', label: 'Won' })
    );

    await expect(useCase.execute({
      tenantId: 't1', // request is for t1
      clientId: 'c1',
      authorUserId: 'u1',
      access: administrator(),
      content: 'Good meeting',
      channel: InteractionChannel.MEETING,
      outcomeCategoryId: 'out-1',
    })).rejects.toThrow('Outcome category not found or access denied');
  });

  describe('D3 notes vs activities', () => {
    beforeEach(() => {
      clientRepo.findById.mockResolvedValue(
        Client.create({
          id: 'c1', tenantId: 't1', name: 'Acme', contactInfo: {},
          status: ClientStatus.CLIENT, customFieldValues: {},
          lastUpdatedByUserId: 'u1', createdAt: new Date(), updatedAt: new Date()
        }, [])
      );
    });

    it('lets Reception add a note (notes.add)', async () => {
      await useCase.execute({
        tenantId: 't1', clientId: 'c1', authorUserId: 'r1', content: 'Called in', channel: InteractionChannel.NOTE,
        access: reception({ userId: 'r1' }),
      });
      expect(interactionRepo.save).toHaveBeenCalled();
    });

    it('refuses Reception a call (activities.add)', async () => {
      await expect(useCase.execute({
        tenantId: 't1', clientId: 'c1', authorUserId: 'r1', content: 'Rang them', channel: InteractionChannel.CALL,
        access: reception({ userId: 'r1' }),
      })).rejects.toThrow(PermissionDeniedError);
      expect(interactionRepo.save).not.toHaveBeenCalled();
    });
  });
});

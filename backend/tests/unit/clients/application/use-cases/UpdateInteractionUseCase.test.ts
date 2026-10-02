import { UpdateInteractionUseCase } from '../../../../../src/clients/application/use-cases/UpdateInteractionUseCase';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { IInteractionRepository } from '../../../../../src/clients/domain/repositories/IInteractionRepository';
import { IInteractionWriteTransaction } from '../../../../../src/clients/application/ports/IInteractionWriteTransaction';
import { Client } from '../../../../../src/clients/domain/entities/Client';
import { Interaction } from '../../../../../src/clients/domain/entities/Interaction';
import { ClientStatus } from '../../../../../src/clients/domain/enums/ClientStatus';
import { InteractionChannel } from '../../../../../src/clients/domain/enums/InteractionChannel';
import { ActivityEditClosedError, ActivityNotFoundError } from '../../../../../src/clients/domain/errors';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';
import { ceo, reception, salesManager, salesUser, scopeResolver } from '../../../../support/access';

const RECORDED = new Date('2026-10-01T10:00:00.000Z');
const hoursLater = (hours: number) => new Date(RECORDED.getTime() + hours * 60 * 60 * 1000);

describe('UpdateInteractionUseCase (FR-ACT-06)', () => {
  let clientRepo: jest.Mocked<IClientRepository>;
  let interactionRepo: jest.Mocked<IInteractionRepository>;
  let now: Date;

  const call = (authorUserId = 'sales-a') =>
    Interaction.record(
      { id: 'i1', tenantId: 't1', clientId: 'c1', authorUserId, channel: InteractionChannel.CALL, content: 'Called', contactPersonId: 'contact-1', resultId: 'result-1' },
      RECORDED
    );
  const edit = { channel: InteractionChannel.CALL, content: 'Called twice', contactPersonId: 'contact-1', resultId: 'result-1', nextAction: 'Send the offer' };

  const useCase = () => {
    const writeTx: IInteractionWriteTransaction = { run: (work) => work({ interactions: interactionRepo, deals: {} as any }) };
    return new UpdateInteractionUseCase(
      clientRepo,
      interactionRepo,
      { contacts: { listByClient: jest.fn() } as any, lookups: { findById: jest.fn() } as any, scopes: scopeResolver(['sales-a', 'sales-b']) },
      writeTx,
      () => now
    );
  };
  const run = (access: ReturnType<typeof salesUser>, overrides: Partial<{ clientId: string }> = {}) =>
    useCase().execute({ tenantId: 't1', clientId: overrides.clientId ?? 'c1', interactionId: 'i1', access, details: edit });

  beforeEach(() => {
    now = hoursLater(1);
    clientRepo = { findById: jest.fn() } as any;
    // The company belongs to Sales User A: every scope that admits A finds it.
    clientRepo.findById.mockImplementation(async (_tenantId, _id, options) => {
      const scope = options?.scope as any;
      const admitsA = !scope || scope.kind === 'all' || (scope.kind === 'owners' && scope.userIds.includes('sales-a'));
      return admitsA
        ? Client.create({ id: 'c1', tenantId: 't1', name: 'Acme', contactInfo: {}, status: ClientStatus.CLIENT, customFieldValues: {}, lastUpdatedByUserId: 'sales-a', assignedUserId: 'sales-a', createdAt: RECORDED, updatedAt: RECORDED } as any, [])
        : null;
    });
    interactionRepo = { findById: jest.fn().mockResolvedValue(call()), update: jest.fn() } as any;
  });

  it('FR-ACT-06 the author edits their own activity within 24 hours, and the edit is recorded', async () => {
    now = hoursLater(23);
    const edited = await run(salesUser({ userId: 'sales-a' }));
    expect(edited).toMatchObject({ content: 'Called twice', nextAction: 'Send the offer', authorUserId: 'sales-a', updatedByUserId: 'sales-a', updatedAt: now });
    expect(interactionRepo.update).toHaveBeenCalledWith(edited);
  });

  it('FR-ACT-06 a Sales User cannot edit their activity from two days ago', async () => {
    now = hoursLater(48);
    await expect(run(salesUser({ userId: 'sales-a' }))).rejects.toBeInstanceOf(ActivityEditClosedError);
    expect(interactionRepo.update).not.toHaveBeenCalled();
  });

  it("FR-ACT-06 a Sales User cannot edit a colleague's activity, even a recent one", async () => {
    await expect(run(salesUser({ userId: 'sales-b' }))).rejects.toBeInstanceOf(ActivityNotFoundError);
    interactionRepo.findById.mockResolvedValue(call('sales-b'));
    await expect(run(salesUser({ userId: 'sales-a' }))).rejects.toBeInstanceOf(ActivityEditClosedError);
  });

  it('FR-ACT-06 the Sales Manager edits any activity of the team, at any age', async () => {
    now = hoursLater(48);
    const edited = await run(salesManager({ userId: 'manager' }));
    expect(edited).toMatchObject({ authorUserId: 'sales-a', updatedByUserId: 'manager' });
  });

  it('FR-ACT-06 roles that cannot record activities cannot edit them', async () => {
    await expect(run(ceo({ userId: 'boss' }))).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(run(reception({ userId: 'desk' }))).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('an activity of another company, or of another workspace, is not found', async () => {
    await expect(run(salesManager(), { clientId: 'c2' })).rejects.toBeInstanceOf(ActivityNotFoundError);
    interactionRepo.findById.mockResolvedValue(null);
    await expect(run(salesManager())).rejects.toBeInstanceOf(ActivityNotFoundError);
  });
});

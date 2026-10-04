import { AddInteractionUseCase } from '../../../../../src/clients/application/use-cases/AddInteractionUseCase';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { IInteractionRepository } from '../../../../../src/clients/domain/repositories/IInteractionRepository';
import { IInteractionWriteTransaction } from '../../../../../src/clients/application/ports/IInteractionWriteTransaction';
import { IDealWrites } from '../../../../../src/deals/application/ports/IDealWriteTransaction';
import { Client } from '../../../../../src/clients/domain/entities/Client';
import { ClientStatus } from '../../../../../src/clients/domain/enums/ClientStatus';
import { InteractionChannel } from '../../../../../src/clients/domain/enums/InteractionChannel';
import { InvalidActivityError } from '../../../../../src/clients/domain/errors';
import { Deal } from '../../../../../src/deals/domain/Deal';
import { DealStage } from '../../../../../src/deals/domain/DealStage';
import { DealType } from '../../../../../src/deals/domain/DealType';
import { administrator, reception, salesUser, scopeResolver } from '../../../../support/access';
import { PermissionDeniedError } from '../../../../../src/access/domain/errors';

const NOW = new Date('2026-10-02T10:00:00.000Z');

function dealIn(stage: DealStage, overrides: { clientId?: string; ownerUserId?: string } = {}) {
  const { deal } = Deal.open({
    id: 'deal-1', tenantId: 't1', clientId: overrides.clientId ?? 'c1', ownerUserId: overrides.ownerUserId ?? 'u1',
    createdByUserId: 'u1', type: DealType.NewContract, title: null, expectedCloseDate: null, notes: null,
    now: new Date('2026-09-01T08:00:00.000Z'), newId: () => 'h0',
  });
  return Deal.rebuild({ ...deal.toProps(), stage, closedAt: stage === DealStage.Won || stage === DealStage.Lost ? NOW : null });
}

describe('AddInteractionUseCase', () => {
  let useCase: AddInteractionUseCase;
  let clientRepo: jest.Mocked<IClientRepository>;
  let interactionRepo: jest.Mocked<IInteractionRepository>;
  let deals: jest.Mocked<IDealWrites>;
  let contacts: { listByClient: jest.Mock };
  let lookups: { findById: jest.Mock; list: jest.Mock };

  const call = {
    tenantId: 't1', clientId: 'c1', authorUserId: 'u1', channel: InteractionChannel.CALL, content: 'Called the office',
    contactPersonId: 'contact-1', resultId: 'result-1',
  };

  beforeEach(() => {
    clientRepo = { findById: jest.fn(), search: jest.fn(), save: jest.fn(), update: jest.fn(), countByTenant: jest.fn(), findRecentByTenant: jest.fn() } as any;
    clientRepo.findById.mockResolvedValue(
      Client.create({
        id: 'c1', tenantId: 't1', name: 'Acme', contactInfo: {},
        status: ClientStatus.CLIENT, customFieldValues: {},
        lastUpdatedByUserId: 'u1', createdAt: new Date(), updatedAt: new Date()
      }, [])
    );
    interactionRepo = { findByClientId: jest.fn(), save: jest.fn(), update: jest.fn(), findById: jest.fn(), findRecentByTenant: jest.fn() } as any;
    deals = { find: jest.fn(), companyName: jest.fn(), insert: jest.fn(), update: jest.fn(), recordChange: jest.fn(), setOfferValue: jest.fn(), hasSentOffer: jest.fn(), isActiveLostReason: jest.fn(), makeClient: jest.fn(), cancelOpenFollowUps: jest.fn() };
    contacts = { listByClient: jest.fn().mockResolvedValue([{ id: 'contact-1' }]) };
    lookups = { findById: jest.fn().mockResolvedValue({ id: 'result-1', active: true }), list: jest.fn() };
    const writeTx: IInteractionWriteTransaction = { run: (work) => work({ interactions: interactionRepo, deals, followUps: {} as any }) };
    useCase = new AddInteractionUseCase(
      clientRepo,
      { contacts: contacts as any, lookups: lookups as any, scopes: scopeResolver() },
      writeTx,
      () => NOW
    );
  });

  it('FR-ACT-02 records a call with its contact and result, by the author, now', async () => {
    const result = await useCase.execute({ ...call, access: administrator() });

    expect(interactionRepo.save).toHaveBeenCalledWith('t1', result);
    expect(result).toMatchObject({ content: 'Called the office', contactPersonId: 'contact-1', resultId: 'result-1', authorUserId: 'u1', occurredAt: NOW });
  });

  it('FR-ACT-02 refuses a contact of another company and an inactive result', async () => {
    contacts.listByClient.mockResolvedValue([{ id: 'someone-else' }]);
    await expect(useCase.execute({ ...call, access: administrator() })).rejects.toMatchObject({ field: 'contactPersonId' });

    contacts.listByClient.mockResolvedValue([{ id: 'contact-1' }]);
    lookups.findById.mockResolvedValue({ id: 'result-1', active: false });
    await expect(useCase.execute({ ...call, access: administrator() })).rejects.toMatchObject({ field: 'resultId' });
    expect(interactionRepo.save).not.toHaveBeenCalled();
  });

  it('FR-ACT-01 refuses a deal of another company, a closed deal and a deal outside the scope', async () => {
    for (const deal of [dealIn(DealStage.Interested, { clientId: 'c2' }), dealIn(DealStage.Won), dealIn(DealStage.Interested, { ownerUserId: 'someone-else' })]) {
      deals.find.mockResolvedValue(deal);
      const attempt = useCase.execute({ ...call, dealId: 'deal-1', access: salesUser({ userId: 'u1' }) });
      await expect(attempt).rejects.toBeInstanceOf(InvalidActivityError);
      await expect(attempt).rejects.toMatchObject({ field: 'dealId' });
    }
    expect(interactionRepo.save).not.toHaveBeenCalled();
  });

  it('FR-DEAL-08 the first activity on a New Lead moves the deal to Contacted, automatically', async () => {
    const deal = dealIn(DealStage.NewLead);
    deals.find.mockResolvedValue(deal);

    await useCase.execute({ ...call, dealId: 'deal-1', access: salesUser({ userId: 'u1' }) });

    expect(deal.stage).toBe(DealStage.Contacted);
    expect(deals.update).toHaveBeenCalledWith(deal);
    expect(deals.recordChange).toHaveBeenCalledWith('t1', expect.objectContaining({ fromStage: DealStage.NewLead, toStage: DealStage.Contacted, changedByUserId: null, at: NOW }));
  });

  it('FR-DEAL-08 a deal past New Lead stays where it is, and a note moves nothing', async () => {
    const negotiating = dealIn(DealStage.Negotiation);
    deals.find.mockResolvedValue(negotiating);
    await useCase.execute({ ...call, dealId: 'deal-1', access: salesUser({ userId: 'u1' }) });
    expect(negotiating.stage).toBe(DealStage.Negotiation);

    const newLead = dealIn(DealStage.NewLead);
    deals.find.mockResolvedValue(newLead);
    await useCase.execute({ ...call, channel: InteractionChannel.NOTE, dealId: 'deal-1', access: salesUser({ userId: 'u1' }) });
    expect(newLead.stage).toBe(DealStage.NewLead);
    expect(deals.update).not.toHaveBeenCalled();
    expect(deals.recordChange).not.toHaveBeenCalled();
  });

  describe('D3 notes vs activities', () => {
    it('lets Reception add a note (notes.add)', async () => {
      await useCase.execute({
        tenantId: 't1', clientId: 'c1', authorUserId: 'r1', content: 'Called in', channel: InteractionChannel.NOTE,
        access: reception({ userId: 'r1' }),
      });
      expect(interactionRepo.save).toHaveBeenCalled();
    });

    it('refuses Reception a call (activities.add)', async () => {
      await expect(useCase.execute({ ...call, authorUserId: 'r1', access: reception({ userId: 'r1' }) })).rejects.toThrow(PermissionDeniedError);
      expect(interactionRepo.save).not.toHaveBeenCalled();
    });
  });
});

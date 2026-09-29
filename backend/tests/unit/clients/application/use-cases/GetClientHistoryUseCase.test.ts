import { GetClientHistoryUseCase } from '../../../../../src/clients/application/use-cases/GetClientHistoryUseCase';
import { IClientRepository } from '../../../../../src/clients/domain/repositories/IClientRepository';
import { Client } from '../../../../../src/clients/domain/entities/Client';
import { ClientStatus } from '../../../../../src/clients/domain/enums/ClientStatus';
import { TimelineSource } from '../../../../../src/shared/application/timeline/TimelineSource';
import { TimelineCategory, TimelineEntry } from '../../../../../src/shared/application/timeline/TimelineEntry';
import { administrator, ceo, reception, salesManager, salesUser, scopeResolver } from '../../../../support/access';

const company = (overrides: { tenantId?: string; assignedUserId?: string | null } = {}) =>
  Client.create(
    {
      id: 'c1',
      tenantId: overrides.tenantId ?? 't1',
      name: 'Acme',
      contactInfo: {},
      status: ClientStatus.CLIENT,
      customFieldValues: {},
      assignedUserId: overrides.assignedUserId === undefined ? 'owner' : overrides.assignedUserId ?? undefined,
      lastUpdatedByUserId: 'u1',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    []
  );

const fakeSource = (
  category: TimelineCategory,
  permission: string,
  entries: Array<Partial<TimelineEntry> & { id: string; timestamp: string }>
): TimelineSource & { load: jest.Mock } => ({
  category,
  permission,
  load: jest.fn().mockResolvedValue(
    entries.map((e) => ({ category, type: `${category}_EVENT`, actorId: null, details: {}, ...e }))
  ),
});

const hasKeyDeep = (value: unknown, key: string): boolean => {
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, key));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => k === key || hasKeyDeep(v, key));
  }
  return false;
};

describe('GetClientHistoryUseCase', () => {
  let clientRepo: jest.Mocked<IClientRepository>;
  let userRepo: { findById: jest.Mock };
  let sources: Record<string, ReturnType<typeof fakeSource>>;

  const useCase = (salesUserIds: string[] = []) =>
    new GetClientHistoryUseCase(clientRepo, scopeResolver(salesUserIds), Object.values(sources), userRepo as any);

  beforeEach(() => {
    clientRepo = { findById: jest.fn().mockResolvedValue(company()) } as any;
    userRepo = {
      findById: jest.fn(async (id: string) =>
        id === 'u-anna' ? { firstName: 'Anna', lastName: 'Hoxha', email: 'anna@example.com' } : null
      ),
    };
    sources = {
      contacts: fakeSource('CONTACT', 'companies.view', [{ id: 'contact-added:1', timestamp: '2026-01-01T00:00:00.000Z' }]),
      notes: fakeSource('NOTE', 'notes.view', [
        { id: 'note:1', timestamp: '2026-01-02T00:00:00.000Z', actorId: 'u-anna' },
      ]),
      activities: fakeSource('ACTIVITY', 'activities.view', [{ id: 'call:1', timestamp: '2026-01-03T00:00:00.000Z' }]),
      quotations: fakeSource('QUOTATION', 'quotations.manage', [
        { id: 'quotation:1', timestamp: '2026-01-04T00:00:00.000Z', details: { total: 500 } },
      ]),
      contracts: fakeSource('CONTRACT', 'contracts.validity.view', [
        { id: 'contract:1', timestamp: '2026-01-05T00:00:00.000Z', details: { planName: 'Gold', amount: 100 } },
      ]),
      payments: fakeSource('PAYMENT', 'payments.view', [
        { id: 'payment:1', timestamp: '2026-01-06T00:00:00.000Z', details: { paidAmount: 100, amount: 100 } },
      ]),
    };
  });

  it('FR-CMP-05 merges every source newest first for the Administrator', async () => {
    const result = await useCase().execute({ tenantId: 't1', clientId: 'c1', access: administrator() });

    expect(result.timeline.map((e) => e.id)).toEqual([
      'payment:1',
      'contract:1',
      'quotation:1',
      'call:1',
      'note:1',
      'contact-added:1',
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it('FR-CMP-05 resolves actor names, and leaves a missing actor as null', async () => {
    const result = await useCase().execute({ tenantId: 't1', clientId: 'c1', access: administrator() });

    const note = result.timeline.find((e) => e.id === 'note:1')!;
    expect(note.actor).toEqual({ id: 'u-anna', name: 'Anna Hoxha' });
    expect(result.timeline.find((e) => e.id === 'contact-added:1')!.actor).toBeNull();
    expect(note).not.toHaveProperty('actorId');
  });

  it('FR-CMP-05 Reception sees contacts, notes and contract validity, with no amounts', async () => {
    const result = await useCase().execute({ tenantId: 't1', clientId: 'c1', access: reception() });

    expect(result.timeline.map((e) => e.category).sort()).toEqual(['CONTACT', 'CONTRACT', 'NOTE']);
    expect(hasKeyDeep(result, 'amount')).toBe(false);
    expect(result.timeline.find((e) => e.id === 'contract:1')!.details).toEqual({ planName: 'Gold' });
    expect(sources.activities.load).not.toHaveBeenCalled();
    expect(sources.quotations.load).not.toHaveBeenCalled();
    expect(sources.payments.load).not.toHaveBeenCalled();
  });

  it('FR-CMP-05 the CEO keeps amounts and payments but has no offers (no quotations.manage)', async () => {
    const result = await useCase().execute({ tenantId: 't1', clientId: 'c1', access: ceo() });

    expect(result.timeline.map((e) => e.category)).not.toContain('QUOTATION');
    expect(result.timeline.find((e) => e.id === 'contract:1')!.details).toEqual({ planName: 'Gold', amount: 100 });
    expect(result.timeline.find((e) => e.id === 'payment:1')!.details).toEqual({ paidAmount: 100, amount: 100 });
  });

  it('FR-CMP-05 a Sales User sees everything on their own company', async () => {
    clientRepo.findById.mockResolvedValue(company({ assignedUserId: 'me' }));

    const result = await useCase().execute({ tenantId: 't1', clientId: 'c1', access: salesUser({ userId: 'me' }) });

    expect(result.timeline).toHaveLength(6);
    expect(hasKeyDeep(result, 'amount')).toBe(true);
  });

  it('FR-RBAC-11 a source is left out when its permission\'s scope does not reach the company owner', async () => {
    // Company-wide view, but commercial data and payments only for their own companies.
    const access = salesManager({ userId: 'mgr', grant: { 'companies.view': 'ALL' as any } });
    clientRepo.findById.mockResolvedValue(company({ assignedUserId: 'someone-else' }));

    const result = await useCase(['rep-1']).execute({ tenantId: 't1', clientId: 'c1', access });

    expect(result.timeline.map((e) => e.category).sort()).toEqual(['CONTACT']);
    expect(sources.notes.load).not.toHaveBeenCalled();
  });

  it('FR-CMP-05 the type filter does not load the other sources', async () => {
    const result = await useCase().execute({
      tenantId: 't1',
      clientId: 'c1',
      access: administrator(),
      types: ['CONTRACT', 'NOTE'],
    });

    expect(result.timeline.map((e) => e.id)).toEqual(['contract:1', 'note:1']);
    expect(sources.contacts.load).not.toHaveBeenCalled();
    expect(sources.payments.load).not.toHaveBeenCalled();
  });

  it('FR-CMP-05 pages with a cursor', async () => {
    const first = await useCase().execute({ tenantId: 't1', clientId: 'c1', access: administrator(), limit: 4 });
    expect(first.timeline).toHaveLength(4);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await useCase().execute({
      tenantId: 't1',
      clientId: 'c1',
      access: administrator(),
      limit: 4,
      cursor: first.nextCursor!,
    });
    expect(second.timeline.map((e) => e.id)).toEqual(['note:1', 'contact-added:1']);
    expect(second.nextCursor).toBeNull();
  });

  it('throws when the company belongs to another tenant', async () => {
    clientRepo.findById.mockResolvedValue(company({ tenantId: 't2' }));

    await expect(useCase().execute({ tenantId: 't1', clientId: 'c1', access: administrator() })).rejects.toThrow(
      'Client not found or access denied'
    );
  });

  it("FR-RBAC-11 asks the repository for the company within the viewer's scope", async () => {
    clientRepo.findById.mockResolvedValue(null);

    await expect(
      useCase().execute({ tenantId: 't1', clientId: 'c1', access: salesUser({ userId: 'me' }) })
    ).rejects.toThrow('not found');
    expect(clientRepo.findById).toHaveBeenCalledWith('t1', 'c1', {
      scope: { kind: 'owners', userIds: ['me'], includeUnowned: false },
    });
  });
});

import { MigrateLegacyClientsUseCase } from '../../../../src/clients/application/use-cases/MigrateLegacyClientsUseCase';
import {
  AppliedClientChange,
  ILegacyClientMigrationStore,
  LegacyMigrationClientRow,
  LegacyMigrationTenantContext,
} from '../../../../src/clients/application/ports/ILegacyClientMigrationStore';
import { LegacyMappingConfig } from '../../../../src/clients/domain/legacy/LegacyMappingConfig';
import { PlannedContact } from '../../../../src/clients/domain/legacy/LegacyClientPlan';
import { CompanyProfileData } from '../../../../src/clients/domain/value-objects/CompanyProfile';

const emptyProfile: CompanyProfileData = {
  businessTypeId: null,
  employeeCount: null,
  areaId: null,
  cityId: null,
  streetAddress: null,
  taxId: null,
  website: null,
};

const context: LegacyMigrationTenantContext = {
  tenantId: 't-1',
  fieldDefs: [],
  businessTypes: [{ id: 'bt-1', nameSq: 'Kafene', nameEn: 'Cafe', order: 0, active: true, riskLevelId: 'rl-1' }],
  areas: [],
  cities: [],
};

const row = (over: Partial<LegacyMigrationClientRow> = {}): LegacyMigrationClientRow => ({
  id: 'c-1',
  name: 'Acme Ltd',
  email: null,
  phone: null,
  customFieldValues: {},
  profile: { ...emptyProfile },
  hasLiveContact: false,
  archived: false,
  assigneeLabel: null,
  ...over,
});

class FakeStore implements ILegacyClientMigrationStore {
  applyCalls: { clientId: string; patch: Partial<CompanyProfileData>; contact: PlannedContact | null }[] = [];
  revertCalls: { clientId: string; patch: Partial<CompanyProfileData>; contactCreatedId: string | null }[] = [];
  clients: LegacyMigrationClientRow[] = [row()];
  applyResult: (clientId: string) => AppliedClientChange = (clientId) => ({
    clientId,
    profilePatch: { businessTypeId: 'bt-1' },
    contactCreatedId: null,
  });
  failOn: Set<string> = new Set();

  async loadTenantContext(): Promise<LegacyMigrationTenantContext> {
    return context;
  }

  async listClients(): Promise<LegacyMigrationClientRow[]> {
    return this.clients;
  }

  async applyClient(tenantId: string, clientId: string, patch: Partial<CompanyProfileData>, contact: PlannedContact | null): Promise<AppliedClientChange> {
    this.applyCalls.push({ clientId, patch, contact });
    if (this.failOn.has(clientId)) throw new Error(`boom-${clientId}`);
    return this.applyResult(clientId);
  }

  async revertClient(tenantId: string, clientId: string, patch: Partial<CompanyProfileData>, contactCreatedId: string | null): Promise<void> {
    this.revertCalls.push({ clientId, patch, contactCreatedId });
  }
}

const config: LegacyMappingConfig = { tenant: 'wellness', fields: { businessType: { from: ['Industry'] } } };

describe('MigrateLegacyClientsUseCase (FR-CMP-08)', () => {
  it('NFR-OPS-01 a dry run reports the plan and writes nothing', async () => {
    const store = new FakeStore();
    store.clients = [row({ customFieldValues: { Industry: 'Kafene' } })];
    const useCase = new MigrateLegacyClientsUseCase(store);

    const result = await useCase.execute({ tenantSlug: 'wellness', config, apply: false });

    expect(store.applyCalls).toHaveLength(0);
    expect(result.manifest).toBeNull();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].missing).not.toContain('business_type');
  });

  it('FR-CMP-08 apply writes only the clients that have work to do', async () => {
    const store = new FakeStore();
    store.clients = [
      row({ id: 'complete', profile: { businessTypeId: 'bt-1', employeeCount: 1, areaId: 'a', cityId: 'c', streetAddress: null, taxId: null, website: null }, hasLiveContact: true }),
      row({ id: 'incomplete', customFieldValues: { Industry: 'Kafene' } }),
    ];
    const useCase = new MigrateLegacyClientsUseCase(store);

    const result = await useCase.execute({ tenantSlug: 'wellness', config, apply: true });

    expect(store.applyCalls.map((c) => c.clientId)).toEqual(['incomplete']);
    expect(result.totals.updated).toBe(1);
    expect(result.manifest?.entries).toHaveLength(1);
    expect(result.manifest?.tenantId).toBe('t-1');
  });

  it('counts complete and needs-completion totals from the plan, not from what was written', async () => {
    const store = new FakeStore();
    store.clients = [
      row({ id: 'complete', profile: { businessTypeId: 'bt-1', employeeCount: 1, areaId: 'a', cityId: 'c', streetAddress: null, taxId: null, website: null }, hasLiveContact: true }),
      row({ id: 'incomplete' }),
    ];
    const useCase = new MigrateLegacyClientsUseCase(store);

    const result = await useCase.execute({ tenantSlug: 'wellness', config, apply: false });

    expect(result.totals.complete).toBe(1);
    expect(result.totals.needsCompletion).toBe(1);
  });

  it('continues past a client whose write fails and reports it', async () => {
    const store = new FakeStore();
    store.clients = [
      row({ id: 'bad', customFieldValues: { Industry: 'Kafene' } }),
      row({ id: 'good', customFieldValues: { Industry: 'Kafene' } }),
    ];
    store.failOn.add('bad');
    const useCase = new MigrateLegacyClientsUseCase(store);

    const result = await useCase.execute({ tenantSlug: 'wellness', config, apply: true });

    expect(result.errors).toEqual([{ clientId: 'bad', message: 'boom-bad' }]);
    expect(result.totals.updated).toBe(1);
    expect(result.manifest?.entries.map((e) => e.clientId)).toEqual(['good']);
  });

  it('reserves a taxId within the run so two clients cannot both claim it', async () => {
    const store = new FakeStore();
    const taxConfig: LegacyMappingConfig = { tenant: 'wellness', fields: { taxId: { from: ['NIPT'] } } };
    store.clients = [
      row({ id: 'first', customFieldValues: { NIPT: 'K1' } }),
      row({ id: 'second', customFieldValues: { NIPT: 'K1' } }),
    ];
    const useCase = new MigrateLegacyClientsUseCase(store);

    const result = await useCase.execute({ tenantSlug: 'wellness', config: taxConfig, apply: false });

    expect(result.rows[0].issues).toEqual([]);
    expect(result.rows[1].issues.some((i) => i.includes('already used'))).toBe(true);
  });

  it('counts a contact-only write toward updated and contactsCreated', async () => {
    const store = new FakeStore();
    store.clients = [row({ email: 'owner@acme.al' })];
    store.applyResult = (clientId) => ({ clientId, profilePatch: {}, contactCreatedId: 'contact-1' });
    const useCase = new MigrateLegacyClientsUseCase(store);

    const result = await useCase.execute({ tenantSlug: 'wellness', config: { tenant: 'wellness', fields: {} }, apply: true });

    expect(result.totals.updated).toBe(1);
    expect(result.totals.contactsCreated).toBe(1);
  });
});

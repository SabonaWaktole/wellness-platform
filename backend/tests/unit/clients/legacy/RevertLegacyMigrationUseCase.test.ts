import { RevertLegacyMigrationUseCase } from '../../../../src/clients/application/use-cases/RevertLegacyMigrationUseCase';
import { LegacyMigrationManifest } from '../../../../src/clients/application/use-cases/MigrateLegacyClientsUseCase';
import {
  AppliedClientChange,
  ILegacyClientMigrationStore,
  LegacyMigrationClientRow,
  LegacyMigrationTenantContext,
} from '../../../../src/clients/application/ports/ILegacyClientMigrationStore';
import { CompanyProfileData } from '../../../../src/clients/domain/value-objects/CompanyProfile';
import { PlannedContact } from '../../../../src/clients/domain/legacy/LegacyClientPlan';

class FakeStore implements ILegacyClientMigrationStore {
  revertCalls: { clientId: string; patch: Partial<CompanyProfileData>; contactCreatedId: string | null }[] = [];
  failOn = new Set<string>();

  async loadTenantContext(): Promise<LegacyMigrationTenantContext> {
    throw new Error('not used');
  }
  async listClients(): Promise<LegacyMigrationClientRow[]> {
    throw new Error('not used');
  }
  async applyClient(): Promise<AppliedClientChange> {
    throw new Error('not used');
  }
  async revertClient(tenantId: string, clientId: string, patch: Partial<CompanyProfileData>, contactCreatedId: string | null): Promise<void> {
    this.revertCalls.push({ clientId, patch, contactCreatedId });
    if (this.failOn.has(clientId)) throw new Error(`revert-failed-${clientId}`);
  }
}

const manifest: LegacyMigrationManifest = {
  tenantId: 't-1',
  tenantSlug: 'wellness',
  generatedAt: new Date().toISOString(),
  entries: [
    { clientId: 'c-1', profilePatch: { businessTypeId: 'bt-1' }, contactCreatedId: null },
    { clientId: 'c-2', profilePatch: {}, contactCreatedId: 'contact-2' },
  ],
};

describe('RevertLegacyMigrationUseCase (FR-CMP-08, NFR-OPS-01)', () => {
  it('reverts every entry in the manifest', async () => {
    const store = new FakeStore();
    const useCase = new RevertLegacyMigrationUseCase(store);

    const result = await useCase.execute(manifest);

    expect(store.revertCalls).toHaveLength(2);
    expect(store.revertCalls[1]).toEqual({ clientId: 'c-2', patch: {}, contactCreatedId: 'contact-2' });
    expect(result.reverted).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it('continues past a client whose revert fails and reports it', async () => {
    const store = new FakeStore();
    store.failOn.add('c-1');
    const useCase = new RevertLegacyMigrationUseCase(store);

    const result = await useCase.execute(manifest);

    expect(result.reverted).toBe(1);
    expect(result.errors).toEqual([{ clientId: 'c-1', message: 'revert-failed-c-1' }]);
  });
});

import { ProvisionWellnessWorkspaceUseCase, WorkspaceOwnerRequiredError } from './ProvisionWellnessWorkspaceUseCase';
import { CreateTenantWithOwnerUseCase } from './CreateTenantWithOwnerUseCase';
import { makeTenantProvisioningHarness } from '../../../../tests/support/fakeTenantProvisioningTransaction';
import { IPlatformSettingsRepository } from '../../../settings/domain/IPlatformSettingsRepository';
import { PlatformSettings, PlatformSettingsPatch } from '../../../settings/domain/PlatformSettings';
import { IPasswordHasher } from '../../../auth/application/ports/IPasswordHasher';
import { Tenant } from '../../domain/entities/Tenant';

const ALBANIA = {
  defaultLanguage: 'sq',
  locale: 'sq-AL',
  timezone: 'Europe/Tirane',
  dateFormat: 'DD.MM.YYYY',
  currency: 'EUR',
};

/** Stores what is saved and serves it back, like the real single-row table. */
function makePlatformSettings(): jest.Mocked<IPlatformSettingsRepository> {
  let current = PlatformSettings.defaults();
  return {
    get: jest.fn(async () => current),
    save: jest.fn(async (patch: PlatformSettingsPatch) => {
      current = current.withPatch(patch);
      return current;
    }),
  };
}

const passwordHasher: IPasswordHasher = { hash: jest.fn().mockResolvedValue('hashed'), compare: jest.fn() };
const owner = { email: 'admin@wellness.al', password: 'Password1' };

function setup() {
  const harness = makeTenantProvisioningHarness();
  const platformSettings = makePlatformSettings();
  const createTenantWithOwner = new CreateTenantWithOwnerUseCase(
    harness.provisioningTx,
    passwordHasher,
    platformSettings
  );
  const useCase = new ProvisionWellnessWorkspaceUseCase(
    platformSettings,
    harness.tenantRepo,
    createTenantWithOwner
  );
  return { ...harness, platformSettings, useCase };
}

const existingTenant = () =>
  Tenant.create({ id: 't-existing', name: 'Wellness Albania', urlSlug: 'wellness-albania', createdAt: new Date() });

describe('ProvisionWellnessWorkspaceUseCase', () => {
  it('FR-LNG-04 creates Wellness Albania in Albanian, on Tirana time, dating day.month.year, in euros', async () => {
    const { useCase, tenantRepo, userRepo } = setup();

    const result = await useCase.execute({ owner });

    expect(result.outcome).toBe('created');
    const created = tenantRepo.create.mock.calls[0][0];
    expect(created).toMatchObject({ name: 'Wellness Albania', urlSlug: 'wellness-albania', ...ALBANIA });
    // The first Administrator, as a legacy BUSINESS_OWNER until roles arrive.
    expect(userRepo.create.mock.calls[0][0]).toMatchObject({ email: owner.email, tenantId: created.id });
  });

  it('FR-LNG-01 makes the same defaults the platform default, for any workspace provisioned later', async () => {
    const { useCase, platformSettings } = setup();

    await useCase.execute({ owner });

    expect(await platformSettings.get()).toMatchObject(ALBANIA);
  });

  it('refuses to create the workspace without its first Administrator, and writes nothing', async () => {
    const { useCase, tenantRepo, platformSettings } = setup();

    await expect(useCase.execute({})).rejects.toThrow(WorkspaceOwnerRequiredError);
    expect(tenantRepo.create).not.toHaveBeenCalled();
    expect(platformSettings.save).not.toHaveBeenCalled();
  });

  it('leaves an existing workspace alone unless asked, so a re-run cannot undo an Administrator’s changes', async () => {
    const { useCase, tenantRepo, platformSettings } = setup();
    tenantRepo.findBySlug.mockResolvedValue(existingTenant());

    const result = await useCase.execute({ owner });

    expect(result).toEqual({ outcome: 'unchanged', tenantId: 't-existing' });
    expect(tenantRepo.create).not.toHaveBeenCalled();
    expect(tenantRepo.updateSettings).not.toHaveBeenCalled();
    expect(platformSettings.save).not.toHaveBeenCalled();
  });

  it('FR-OFR-07 FR-RBAC-18 runs the new Wellness Albania workspace on the sales process (D6)', async () => {
    const { useCase, tenantRepo } = setup();

    const { tenantId } = await useCase.execute({ owner });

    expect(tenantRepo.setSalesWorkflow).toHaveBeenCalledWith(tenantId, 'SALES_PROCESS');
  });

  it('FR-OFR-07 moves an existing workspace still on the legacy quotations onto the sales process, even on a plain re-run', async () => {
    const { useCase, tenantRepo } = setup();
    tenantRepo.findBySlug.mockResolvedValue(existingTenant());

    await useCase.execute({ owner });

    expect(tenantRepo.setSalesWorkflow).toHaveBeenCalledWith('t-existing', 'SALES_PROCESS');
  });

  it('leaves the workflow alone when the workspace already runs the sales process', async () => {
    const { useCase, tenantRepo } = setup();
    tenantRepo.findBySlug.mockResolvedValue(
      Tenant.create({ id: 't-existing', name: 'Wellness Albania', urlSlug: 'wellness-albania', salesWorkflow: 'SALES_PROCESS', createdAt: new Date() })
    );

    await useCase.execute({ updateExisting: true });

    expect(tenantRepo.setSalesWorkflow).not.toHaveBeenCalled();
  });

  it('FR-LNG-04 moves an existing workspace onto the Albanian defaults when asked', async () => {
    const { useCase, tenantRepo } = setup();
    tenantRepo.findBySlug.mockResolvedValue(existingTenant());

    const result = await useCase.execute({ updateExisting: true });

    expect(result).toEqual({ outcome: 'updated', tenantId: 't-existing' });
    expect(tenantRepo.updateSettings).toHaveBeenCalledWith('t-existing', ALBANIA);
    expect(tenantRepo.create).not.toHaveBeenCalled();
  });
});

import { CreateTenantWithOwnerUseCase } from './CreateTenantWithOwnerUseCase';
import { makeTenantProvisioningHarness } from '../../../../tests/support/fakeTenantProvisioningTransaction';
import { IPasswordHasher } from '../../../auth/application/ports/IPasswordHasher';
import { IPlatformSettingsRepository } from '../../../settings/domain/IPlatformSettingsRepository';
import { PlatformSettings } from '../../../settings/domain/PlatformSettings';

const passwordHasher: IPasswordHasher = {
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn(),
};

const validInput = {
  companyName: 'Acme',
  urlSlug: 'acme',
  ownerEmail: 'owner@acme.test',
  ownerPassword: 'Password1',
};

describe('CreateTenantWithOwnerUseCase — platform defaults', () => {
  it('uses Tenant.create()’s own hardcoded defaults when no repository is given', async () => {
    // The optional third constructor argument, omitted — every pre-existing
    // caller of this use case looks like this, and must keep behaving exactly
    // as it did before this feature existed.
    const { provisioningTx, tenantRepo } = makeTenantProvisioningHarness();
    const useCase = new CreateTenantWithOwnerUseCase(provisioningTx, passwordHasher);

    await useCase.execute(validInput);

    const created = tenantRepo.create.mock.calls[0][0];
    expect(created.currency).toBe('USD');
    expect(created.locale).toBe('en-US');
  });

  it('uses the platform’s saved defaults for a newly provisioned tenant', async () => {
    const { provisioningTx, tenantRepo } = makeTenantProvisioningHarness();
    const platformSettingsRepository: jest.Mocked<IPlatformSettingsRepository> = {
      get: jest.fn().mockResolvedValue(
        PlatformSettings.defaults().withPatch({
          currency: 'EUR',
          locale: 'en-GB',
          timezone: 'Europe/London',
          requiresQuotationApproval: false,
        })
      ),
      save: jest.fn(),
    };
    const useCase = new CreateTenantWithOwnerUseCase(
      provisioningTx,
      passwordHasher,
      platformSettingsRepository
    );

    await useCase.execute(validInput);

    const created = tenantRepo.create.mock.calls[0][0];
    expect(created.currency).toBe('EUR');
    expect(created.locale).toBe('en-GB');
    expect(created.timezone).toBe('Europe/London');
    expect(created.requiresQuotationApproval).toBe(false);
  });

  // The defining guarantee of this feature: an EXISTING tenant's own settings
  // are never in this use case's write path at all — only a brand-new Tenant
  // object is ever constructed here. Nothing to assert beyond "this use case
  // never calls updateSettings" would be redundant with the type signature,
  // but the absence is exactly what the schema comment on PlatformSettings
  // promises, so it is worth a caller that would fail loudly if that changed.
  it('never calls updateSettings — it only ever creates', async () => {
    const { provisioningTx, tenantRepo } = makeTenantProvisioningHarness();
    const platformSettingsRepository: jest.Mocked<IPlatformSettingsRepository> = {
      get: jest.fn().mockResolvedValue(PlatformSettings.defaults()),
      save: jest.fn(),
    };
    const useCase = new CreateTenantWithOwnerUseCase(
      provisioningTx,
      passwordHasher,
      platformSettingsRepository
    );

    await useCase.execute(validInput);

    expect(tenantRepo.updateSettings).not.toHaveBeenCalled();
    expect(tenantRepo.updateSettingsForMany).not.toHaveBeenCalled();
  });
});

describe('CreateTenantWithOwnerUseCase — roles (FR-RBAC-01, FR-USR-02)', () => {
  it('FR-RBAC-01 seeds the five system roles for the new workspace', async () => {
    const { provisioningTx, roleSeeder, tenantRepo } = makeTenantProvisioningHarness();
    const useCase = new CreateTenantWithOwnerUseCase(provisioningTx, passwordHasher);

    await useCase.execute(validInput);

    const created = tenantRepo.create.mock.calls[0][0];
    expect(roleSeeder.seed).toHaveBeenCalledWith(created.id);
  });

  it('FR-SET-10 seeds the default risk levels and business types for the new workspace', async () => {
    const { provisioningTx, lookupSeeder, tenantRepo } = makeTenantProvisioningHarness();
    const useCase = new CreateTenantWithOwnerUseCase(provisioningTx, passwordHasher);

    await useCase.execute(validInput);

    const created = tenantRepo.create.mock.calls[0][0];
    expect(lookupSeeder.seed).toHaveBeenCalledWith(created.id);
  });

  it('FR-USR-02 makes the owner an Administrator by role, not only by the legacy string', async () => {
    const { provisioningTx, userRepo } = makeTenantProvisioningHarness();
    const useCase = new CreateTenantWithOwnerUseCase(provisioningTx, passwordHasher);

    await useCase.execute(validInput);

    const owner = userRepo.create.mock.calls[0][0];
    expect(owner.roleId).toBe('role-ADMINISTRATOR');
    expect(owner.role).toBe('BUSINESS_OWNER');
  });
});

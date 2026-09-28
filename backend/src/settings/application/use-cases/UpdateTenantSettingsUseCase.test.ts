import { UpdateTenantSettingsUseCase } from './UpdateTenantSettingsUseCase';
import { PermissionDeniedError } from '../../../access/domain/errors';
import { accessWith, administrator, salesManager } from '../../../../tests/support/access';

describe('UpdateTenantSettingsUseCase', () => {
  const tenantRepository = { findById: jest.fn(), updateSettings: jest.fn() } as any;
  const profileStore = { get: jest.fn(), update: jest.fn() } as any;
  let failAudit = false;
  const audit: any[] = [];
  const writeTx = {
    run: jest.fn(async (work: any) => {
      const auditTrail = {
        record: async (entry: any) => {
          if (failAudit) throw new Error('audit write failed');
          audit.push(entry);
        },
      };
      return work({ tenantRepository, profileStore, auditTrail });
    }),
  } as any;
  const useCase = new UpdateTenantSettingsUseCase(tenantRepository, profileStore, writeTx);

  beforeEach(() => {
    failAudit = false;
    audit.length = 0;
    jest.clearAllMocks();
    tenantRepository.findById.mockResolvedValue({ id: 't1', name: 'Wellness Albania', currency: 'EUR', locale: 'sq-AL', timezone: 'Europe/Tirane', dateFormat: 'DD.MM.YYYY', defaultLanguage: 'sq', requiresQuotationApproval: false });
    profileStore.get.mockResolvedValue({ registrationNumber: null, addressLine: null, addressCity: null, addressState: null, addressPostalCode: null, contactEmail: null, contactPhone: null });
  });

  it('FR-RBAC-05 lets the Administrator (settings.manage) update settings', async () => {
    await useCase.execute({ tenantId: 't1', access: administrator(), patch: { name: 'Wellness Plus' } });
    expect(tenantRepository.updateSettings).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'Wellness Plus' }));
  });

  it('FR-RBAC-05 lets any role holding settings.manage update settings', async () => {
    await useCase.execute({ tenantId: 't1', access: accessWith({ 'settings.manage': true }), patch: { name: 'X' } });
    expect(tenantRepository.updateSettings).toHaveBeenCalled();
  });

  it('FR-RBAC-05 refuses a role without settings.manage', async () => {
    await expect(useCase.execute({ tenantId: 't1', access: salesManager(), patch: { name: 'X' } }))
      .rejects.toThrow(PermissionDeniedError);
    expect(tenantRepository.updateSettings).not.toHaveBeenCalled();
  });

  it('FR-SET-09 changing a setting writes one Workspace audit entry with the old and new value', async () => {
    await useCase.execute({ tenantId: 't1', access: administrator(), patch: { dateFormat: 'MM/DD/YYYY' } });

    expect(audit).toEqual([
      expect.objectContaining({
        tenantId: 't1',
        entityType: 'Workspace',
        entityId: 't1',
        changes: [{ field: 'dateFormat', old: 'DD.MM.YYYY', new: 'MM/DD/YYYY' }],
      }),
    ]);
  });

  it('a no-op update (the same value sent back) writes nothing', async () => {
    await useCase.execute({ tenantId: 't1', access: administrator(), patch: { name: 'Wellness Albania' } });

    expect(audit).toHaveLength(0);
    expect(tenantRepository.updateSettings).not.toHaveBeenCalled();
    expect(profileStore.update).not.toHaveBeenCalled();
  });

  it('FR-AUD-04 a failing audit write rolls back the settings change', async () => {
    failAudit = true;

    await expect(useCase.execute({ tenantId: 't1', access: administrator(), patch: { name: 'Rolled back' } })).rejects.toThrow(
      'audit write failed'
    );
  });
});

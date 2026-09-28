import { ListStatusLabelsUseCase } from '../../../src/statuses/application/use-cases/ListStatusLabelsUseCase';
import { UpdateStatusLabelUseCase } from '../../../src/statuses/application/use-cases/UpdateStatusLabelUseCase';
import { ReorderStatusLabelsUseCase } from '../../../src/statuses/application/use-cases/ReorderStatusLabelsUseCase';
import { catalogueKeys, StatusDomain } from '../../../src/statuses/domain/StatusCatalogue';
import { InvalidStatusLabelError, InvalidStatusOrderError, StatusKeyNotFoundError } from '../../../src/statuses/domain/StatusLabel';
import { PermissionDeniedError } from '../../../src/access/domain/errors';
import { AuditAction } from '../../../src/audit/domain/AuditAction';
import { accessAs } from '../../support/access';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { makeStatusLabelHarness, TENANT } from '../../support/fakeStatusLabels';

const admin = () => accessAs(RoleKey.Administrator);
const salesUser = () => accessAs(RoleKey.SalesUser);

function setup() {
  const h = makeStatusLabelHarness();
  return {
    h,
    list: new ListStatusLabelsUseCase(h.store),
    update: new UpdateStatusLabelUseCase(h.store, h.writeTx),
    reorder: new ReorderStatusLabelsUseCase(h.store, h.writeTx),
  };
}

describe('ListStatusLabelsUseCase', () => {
  it('FR-SET-07 returns the catalogue defaults, in the fixed order, when nothing was edited', async () => {
    const { list } = setup();

    const labels = await list.execute({ tenantId: TENANT, domain: StatusDomain.Contract });
    expect(labels.map((l) => l.key)).toEqual(catalogueKeys(StatusDomain.Contract));
    expect(labels[0]).toMatchObject({ key: 'DRAFT', labelSq: 'Skicë', labelEn: 'Draft' });
  });

  it('FR-SET-08 the payment catalogue has no WAIVED row (D6: legacy key, not configurable)', async () => {
    const { list } = setup();

    const labels = await list.execute({ tenantId: TENANT, domain: StatusDomain.Payment });
    expect(labels.map((l) => l.key)).not.toContain('WAIVED');
  });
});

describe('UpdateStatusLabelUseCase', () => {
  it('FR-SET-07 renaming "Active" changes the label everywhere the key stays ACTIVE, and it is audited', async () => {
    const { h, update, list } = setup();

    const updated = await update.execute({
      access: admin(),
      tenantId: TENANT,
      domain: StatusDomain.Contract,
      key: 'ACTIVE',
      edit: { labelSq: 'Në fuqi', labelEn: 'Live', colour: '#00FF00' },
    });
    expect(updated).toMatchObject({ key: 'ACTIVE', labelSq: 'Në fuqi', labelEn: 'Live', colour: '#00FF00' });

    const labels = await list.execute({ tenantId: TENANT, domain: StatusDomain.Contract });
    expect(labels.find((l) => l.key === 'ACTIVE')).toMatchObject({ labelSq: 'Në fuqi' });

    expect(h.audit).toEqual([
      expect.objectContaining({
        entityType: 'StatusLabel',
        entityId: 'CONTRACT:ACTIVE',
        entityLabel: 'Në fuqi',
        action: AuditAction.Update,
        changes: expect.arrayContaining([{ field: 'labelSq', old: 'Aktive', new: 'Në fuqi' }]),
      }),
    ]);
  });

  it('rejects an unknown status key', async () => {
    const { update } = setup();

    await expect(
      update.execute({ access: admin(), tenantId: TENANT, domain: StatusDomain.Payment, key: 'WAIVED', edit: { labelSq: 'X', colour: '#000000' } })
    ).rejects.toThrow(StatusKeyNotFoundError);
  });

  it('rejects a blank label or an invalid colour', async () => {
    const { update } = setup();
    const base = { access: admin(), tenantId: TENANT, domain: StatusDomain.Contract, key: 'DRAFT' };

    await expect(update.execute({ ...base, edit: { labelSq: '  ', colour: '#000000' } })).rejects.toThrow(InvalidStatusLabelError);
    await expect(update.execute({ ...base, edit: { labelSq: 'Skicë', colour: 'not-a-colour' } })).rejects.toThrow(InvalidStatusLabelError);
  });

  it('FR-SET-07 needs settings.manage', async () => {
    const { update } = setup();

    await expect(
      update.execute({ access: salesUser(), tenantId: TENANT, domain: StatusDomain.Contract, key: 'ACTIVE', edit: { labelSq: 'X', colour: '#000000' } })
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('records nothing when the edit changes nothing', async () => {
    const { h, update } = setup();

    await update.execute({ access: admin(), tenantId: TENANT, domain: StatusDomain.Contract, key: 'DRAFT', edit: { labelSq: 'Skicë', labelEn: 'Draft', colour: '#64748B' } });
    expect(h.audit).toHaveLength(0);
  });

  it('FR-AUD-04 a failing audit write rolls back the label change', async () => {
    const { h, update } = setup();
    h.failAuditWrites();

    await expect(
      update.execute({ access: admin(), tenantId: TENANT, domain: StatusDomain.Contract, key: 'ACTIVE', edit: { labelSq: 'Në fuqi', colour: '#00FF00' } })
    ).rejects.toThrow('audit write failed');
    expect(h.item(StatusDomain.Contract, 'ACTIVE')).toBeUndefined();
  });
});

describe('ReorderStatusLabelsUseCase', () => {
  it('accepts a permutation of the domain\'s full key set and updates order', async () => {
    const { h, reorder, list } = setup();
    const keys = catalogueKeys(StatusDomain.Contract);
    const reversed = [...keys].reverse();

    const reordered = await reorder.execute({ access: admin(), tenantId: TENANT, domain: StatusDomain.Contract, keys: reversed });
    expect(reordered.map((l) => l.key)).toEqual(reversed);

    const labels = await list.execute({ tenantId: TENANT, domain: StatusDomain.Contract });
    expect(labels.map((l) => l.key)).toEqual(reversed);
    expect(h.audit.length).toBeGreaterThan(0);
  });

  it('rejects a list that is missing a key, has a duplicate, or has an unknown key', async () => {
    const { reorder } = setup();
    const keys = catalogueKeys(StatusDomain.Contract);

    await expect(reorder.execute({ access: admin(), tenantId: TENANT, domain: StatusDomain.Contract, keys: keys.slice(1) })).rejects.toThrow(
      InvalidStatusOrderError
    );
    await expect(
      reorder.execute({ access: admin(), tenantId: TENANT, domain: StatusDomain.Contract, keys: [...keys.slice(1), keys[0], keys[0]] })
    ).rejects.toThrow(InvalidStatusOrderError);
    await expect(
      reorder.execute({ access: admin(), tenantId: TENANT, domain: StatusDomain.Contract, keys: [...keys.slice(1), 'NOPE'] })
    ).rejects.toThrow(InvalidStatusOrderError);
  });
});

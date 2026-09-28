import { CreateLookupItemUseCase } from '../../../../src/lookups/application/use-cases/CreateLookupItemUseCase';
import { UpdateLookupItemUseCase } from '../../../../src/lookups/application/use-cases/UpdateLookupItemUseCase';
import { ReorderLookupItemsUseCase } from '../../../../src/lookups/application/use-cases/ReorderLookupItemsUseCase';
import { SetLookupItemActiveUseCase } from '../../../../src/lookups/application/use-cases/SetLookupItemActiveUseCase';
import { DeleteLookupItemUseCase } from '../../../../src/lookups/application/use-cases/DeleteLookupItemUseCase';
import { ListLookupItemsUseCase } from '../../../../src/lookups/application/use-cases/ListLookupItemsUseCase';
import { LookupList } from '../../../../src/lookups/domain/LookupList';
import {
  AreaHasActiveCitiesError,
  InactiveAreaError,
  InactiveRiskLevelError,
  InvalidLookupOrderError,
  InvalidLookupValueError,
  LookupItemInUseError,
  LookupItemNotFoundError,
  LookupValueTakenError,
  RiskLevelStillUsedError,
} from '../../../../src/lookups/domain/errors';
import { PermissionDeniedError } from '../../../../src/access/domain/errors';
import { AuditAction } from '../../../../src/audit/domain/AuditAction';
import { administrator, ceo, salesUser } from '../../../support/access';
import { makeLookupHarness, standardLists, TENANT } from '../../../support/fakeLookups';

const { RiskLevels, BusinessTypes, Areas, Cities } = LookupList;

function setup() {
  const h = makeLookupHarness(standardLists());
  return {
    h,
    create: new CreateLookupItemUseCase(h.store, h.rules, h.writeTx),
    update: new UpdateLookupItemUseCase(h.store, h.rules, h.writeTx),
    reorder: new ReorderLookupItemsUseCase(h.store, h.rules, h.writeTx),
    setActive: new SetLookupItemActiveUseCase(h.store, h.rules, h.writeTx),
    remove: new DeleteLookupItemUseCase(h.store, h.rules, h.inUse, h.writeTx),
    list: new ListLookupItemsUseCase(h.store, h.rules),
  };
}

const admin = () => administrator({ userId: 'admin' });

describe('Lookup lists — permissions', () => {
  it('FR-SET-01 every write needs settings.manage', async () => {
    const { create, update, reorder, setActive, remove } = setup();
    const base = { access: salesUser(), tenantId: TENANT };

    await expect(create.execute({ ...base, list: BusinessTypes, values: { nameSq: 'Bar', riskLevelId: 'rl1' } })).rejects.toThrow(PermissionDeniedError);
    await expect(update.execute({ ...base, list: BusinessTypes, id: 'bt-cafe', values: { nameSq: 'Bar' } })).rejects.toThrow(PermissionDeniedError);
    await expect(reorder.execute({ ...base, list: BusinessTypes, ids: ['bt-factory', 'bt-cafe'] })).rejects.toThrow(PermissionDeniedError);
    await expect(setActive.execute({ ...base, list: BusinessTypes, id: 'bt-cafe', active: false })).rejects.toThrow(PermissionDeniedError);
    await expect(remove.execute({ ...base, list: BusinessTypes, id: 'bt-cafe' })).rejects.toThrow(PermissionDeniedError);
    await expect(create.execute({ access: ceo(), tenantId: TENANT, list: RiskLevels, values: { nameSq: 'Niveli 4', level: 4 } })).rejects.toThrow(PermissionDeniedError);
  });
});

describe('ListLookupItemsUseCase', () => {
  it('FR-SET-01 offers only active values, in order, to everyone', async () => {
    const { list } = setup();

    const types = await list.execute({ access: salesUser(), tenantId: TENANT, list: BusinessTypes, includeInactive: true });

    expect(types.map((t) => t.id)).toEqual(['bt-cafe']);
  });

  it('gives inactive values too to someone who manages the lists, when asked', async () => {
    const { list } = setup();

    const all = await list.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, includeInactive: true });
    const active = await list.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes });

    expect(all.map((t) => t.id)).toEqual(['bt-cafe', 'bt-factory']);
    expect(active.map((t) => t.id)).toEqual(['bt-cafe']);
  });
});

describe('CreateLookupItemUseCase', () => {
  it('FR-SET-01 a new business type is active, last in order, and immediately in the active list', async () => {
    const { h, create, list } = setup();

    const created = await create.execute({
      access: admin(),
      tenantId: TENANT,
      list: BusinessTypes,
      values: { nameSq: ' Bar ', nameEn: '', riskLevelId: 'rl2' },
    });

    expect(created).toMatchObject({ nameSq: 'Bar', nameEn: null, riskLevelId: 'rl2', order: 3, active: true });
    const active = await list.execute({ access: salesUser(), tenantId: TENANT, list: BusinessTypes });
    expect(active.map((t) => t.nameSq)).toEqual(['Kafene', 'Bar']);
    expect(h.audit).toEqual([
      expect.objectContaining({
        tenantId: TENANT,
        userId: 'admin',
        action: AuditAction.Create,
        entityType: 'BusinessType',
        entityId: created.id,
        entityLabel: 'Bar',
        changes: [
          { field: 'nameSq', old: null, new: 'Bar' },
          { field: 'nameEn', old: null, new: null },
          { field: 'riskLevel', old: null, new: 'Niveli 2' },
        ],
      }),
    ]);
  });

  it('FR-SET-01 refuses a business type on an inactive or unknown risk level', async () => {
    const { create } = setup();
    const values = (riskLevelId: string) => ({ nameSq: 'Bar', riskLevelId });

    await expect(create.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, values: values('rl3') })).rejects.toThrow(InactiveRiskLevelError);
    await expect(create.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, values: values('nope') })).rejects.toThrow(InactiveRiskLevelError);
  });

  it('refuses a name another value already has, in either language', async () => {
    const { create } = setup();

    await expect(
      create.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, values: { nameSq: 'Kafeteri', nameEn: 'CAFÉ', riskLevelId: 'rl1' } })
    ).rejects.toThrow(LookupValueTakenError);
  });

  it('FR-SET-02 a risk level needs a level from 1 that no other risk level has', async () => {
    const { h, create } = setup();
    const values = (level: unknown) => ({ nameSq: `Niveli ${level}`, level });

    await expect(create.execute({ access: admin(), tenantId: TENANT, list: RiskLevels, values: values(2) })).rejects.toThrow(LookupValueTakenError);
    await expect(create.execute({ access: admin(), tenantId: TENANT, list: RiskLevels, values: values(0) })).rejects.toThrow(InvalidLookupValueError);
    await expect(create.execute({ access: admin(), tenantId: TENANT, list: RiskLevels, values: values(1.5) })).rejects.toThrow(InvalidLookupValueError);

    const created = await create.execute({
      access: admin(),
      tenantId: TENANT,
      list: RiskLevels,
      values: { nameSq: 'Niveli 4', nameEn: 'Level 4', level: 4, description: 'Rrezik shumë i lartë' },
    });
    expect(created).toMatchObject({ level: 4, description: 'Rrezik shumë i lartë', order: 4 });
    expect(h.audit[0].changes).toEqual([
      { field: 'nameSq', old: null, new: 'Niveli 4' },
      { field: 'nameEn', old: null, new: 'Level 4' },
      { field: 'level', old: null, new: 4 },
      { field: 'description', old: null, new: 'Rrezik shumë i lartë' },
    ]);
  });

  it('FR-AUD-04 nothing is saved when the audit write fails', async () => {
    const { h, create } = setup();
    h.failAuditWrites();

    await expect(create.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, values: { nameSq: 'Bar', riskLevelId: 'rl1' } })).rejects.toThrow(
      'audit write failed'
    );
    expect(h.items(BusinessTypes)).toHaveLength(2);
  });
});

describe('UpdateLookupItemUseCase', () => {
  it('UAT-3 step 1: moving a business type to another risk level is audited with the risk level names', async () => {
    const { h, update } = setup();

    const updated = await update.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, id: 'bt-cafe', values: { riskLevelId: 'rl2' } });

    expect(updated).toMatchObject({ id: 'bt-cafe', nameSq: 'Kafene', nameEn: 'Café', riskLevelId: 'rl2' });
    expect(h.item(BusinessTypes, 'bt-cafe')).toMatchObject({ riskLevelId: 'rl2' });
    expect(h.audit).toEqual([
      expect.objectContaining({
        action: AuditAction.Update,
        entityType: 'BusinessType',
        entityId: 'bt-cafe',
        changes: [{ field: 'riskLevel', old: 'Niveli 1', new: 'Niveli 2' }],
      }),
    ]);
  });

  it('edits the labels, keeping omitted fields, and audits only what changed', async () => {
    const { h, update } = setup();

    await update.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, id: 'bt-cafe', values: { nameEn: 'Coffee bar' } });

    expect(h.item(BusinessTypes, 'bt-cafe')).toMatchObject({ nameSq: 'Kafene', nameEn: 'Coffee bar', riskLevelId: 'rl1' });
    expect(h.audit[0].changes).toEqual([{ field: 'nameEn', old: 'Café', new: 'Coffee bar' }]);
  });

  it('writes nothing when nothing changed', async () => {
    const { h, update } = setup();

    await update.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, id: 'bt-cafe', values: { nameSq: 'Kafene', riskLevelId: 'rl1' } });

    expect(h.audit).toEqual([]);
  });

  it('refuses a move to an inactive risk level, and a value from another workspace', async () => {
    const { update } = setup();

    await expect(update.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, id: 'bt-cafe', values: { riskLevelId: 'rl3' } })).rejects.toThrow(
      InactiveRiskLevelError
    );
    await expect(update.execute({ access: admin(), tenantId: 'other', list: BusinessTypes, id: 'bt-cafe', values: { nameSq: 'X' } })).rejects.toThrow(
      LookupItemNotFoundError
    );
  });

  it('an inactive business type keeps its risk level when only its name changes', async () => {
    const { h, setActive, update } = setup();
    // bt-factory is inactive on rl2; deactivating rl2 is now allowed.
    await setActive.execute({ access: admin(), tenantId: TENANT, list: RiskLevels, id: 'rl2', active: false });

    await update.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, id: 'bt-factory', values: { nameEn: 'Plant' } });

    expect(h.item(BusinessTypes, 'bt-factory')).toMatchObject({ nameEn: 'Plant', riskLevelId: 'rl2' });
  });
});

describe('ReorderLookupItemsUseCase', () => {
  it('reorders the list and audits each value that moved', async () => {
    const { h, reorder, list } = setup();

    await reorder.execute({ access: admin(), tenantId: TENANT, list: RiskLevels, ids: ['rl2', 'rl1', 'rl3'] });

    const levels = await list.execute({ access: admin(), tenantId: TENANT, list: RiskLevels, includeInactive: true });
    expect(levels.map((l) => l.id)).toEqual(['rl2', 'rl1', 'rl3']);
    expect(h.audit.map((e) => [e.entityId, e.changes])).toEqual([
      ['rl2', [{ field: 'order', old: 2, new: 1 }]],
      ['rl1', [{ field: 'order', old: 1, new: 2 }]],
    ]);
  });

  it('refuses an order that misses, repeats or invents a value', async () => {
    const { reorder } = setup();
    const run = (ids: string[]) => reorder.execute({ access: admin(), tenantId: TENANT, list: RiskLevels, ids });

    await expect(run(['rl2', 'rl1'])).rejects.toThrow(InvalidLookupOrderError);
    await expect(run(['rl2', 'rl1', 'rl1'])).rejects.toThrow(InvalidLookupOrderError);
    await expect(run(['rl2', 'rl1', 'rl9'])).rejects.toThrow(InvalidLookupOrderError);
  });
});

describe('SetLookupItemActiveUseCase', () => {
  it('FR-SET-01 a deactivated value leaves the active list but stays readable to the Administrator', async () => {
    const { h, setActive, list } = setup();

    await setActive.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, id: 'bt-cafe', active: false });

    expect(await list.execute({ access: salesUser(), tenantId: TENANT, list: BusinessTypes })).toEqual([]);
    expect(h.item(BusinessTypes, 'bt-cafe')).toMatchObject({ active: false });
    expect(h.audit).toEqual([
      expect.objectContaining({ action: AuditAction.StatusChange, entityId: 'bt-cafe', changes: [{ field: 'active', old: true, new: false }] }),
    ]);
  });

  it('FR-SET-02 refuses to deactivate a risk level that active business types still use', async () => {
    const { setActive } = setup();

    await expect(setActive.execute({ access: admin(), tenantId: TENANT, list: RiskLevels, id: 'rl1', active: false })).rejects.toThrow(RiskLevelStillUsedError);
    // rl2 is only used by an inactive business type.
    await expect(setActive.execute({ access: admin(), tenantId: TENANT, list: RiskLevels, id: 'rl2', active: false })).resolves.toMatchObject({ active: false });
  });

  it('refuses to reactivate a business type whose risk level is inactive', async () => {
    const { setActive } = setup();
    await setActive.execute({ access: admin(), tenantId: TENANT, list: RiskLevels, id: 'rl2', active: false });

    await expect(setActive.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, id: 'bt-factory', active: true })).rejects.toThrow(
      InactiveRiskLevelError
    );
  });

  it('does nothing when the value is already in that state', async () => {
    const { h, setActive } = setup();

    await setActive.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, id: 'bt-cafe', active: true });

    expect(h.audit).toEqual([]);
  });
});

describe('DeleteLookupItemUseCase', () => {
  it('FR-SET-01 a value in use cannot be deleted, only deactivated', async () => {
    const { h, remove } = setup();
    h.setUsages('bt-cafe', 3);

    await expect(remove.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, id: 'bt-cafe' })).rejects.toThrow(LookupItemInUseError);
    expect(h.items(BusinessTypes)).toHaveLength(2);
  });

  it('deletes an unused value and audits what it was', async () => {
    const { h, remove } = setup();

    await remove.execute({ access: admin(), tenantId: TENANT, list: BusinessTypes, id: 'bt-cafe' });

    expect(h.item(BusinessTypes, 'bt-cafe')).toBeUndefined();
    expect(h.audit).toEqual([
      expect.objectContaining({
        action: AuditAction.Delete,
        entityId: 'bt-cafe',
        entityLabel: 'Kafene',
        changes: [
          { field: 'nameSq', old: 'Kafene', new: null },
          { field: 'nameEn', old: 'Café', new: null },
          { field: 'riskLevel', old: 'Niveli 1', new: null },
        ],
      }),
    ]);
  });
});

// Slice 9 (FR-SET-03, 04): areas and cities, built on the same lookup
// framework as Slice 8's risk levels and business types.
describe('Areas and cities', () => {
  it('FR-SET-04 a city needs an active area', async () => {
    const { create } = setup();

    await expect(create.execute({ access: admin(), tenantId: TENANT, list: Cities, values: { nameSq: 'Sarandë', areaId: 'nope' } })).rejects.toThrow(
      InactiveAreaError
    );

    const created = await create.execute({ access: admin(), tenantId: TENANT, list: Cities, values: { nameSq: 'Sarandë', areaId: 'a-vlore' } });
    expect(created).toMatchObject({ areaId: 'a-vlore' });
  });

  it('FR-SET-04 the same city name is refused inside one area, but allowed in another', async () => {
    const { create } = setup();

    await expect(create.execute({ access: admin(), tenantId: TENANT, list: Cities, values: { nameSq: 'Tiranë', areaId: 'a-tirane' } })).rejects.toThrow(
      LookupValueTakenError
    );
    const created = await create.execute({ access: admin(), tenantId: TENANT, list: Cities, values: { nameSq: 'Tiranë', areaId: 'a-vlore' } });
    expect(created).toMatchObject({ nameSq: 'Tiranë', areaId: 'a-vlore' });
  });

  it('a new city is last in order within its own area, not the whole list', async () => {
    const { h, create } = setup();

    const created = await create.execute({ access: admin(), tenantId: TENANT, list: Cities, values: { nameSq: 'Sarandë', areaId: 'a-vlore' } });

    // a-vlore already has one city at order 1; a-tirane's two do not count.
    expect(created.order).toBe(2);
    expect(h.audit[0].changes).toEqual([
      { field: 'nameSq', old: null, new: 'Sarandë' },
      { field: 'nameEn', old: null, new: null },
      { field: 'area', old: null, new: 'Vlorë' },
    ]);
  });

  it('moving a city to another area re-checks its name against the new area, not the old one', async () => {
    const { update } = setup();

    // a-tirane already has a "Tiranë"; moving c-vlore there under that same
    // name clashes with the TARGET area, even though "Tiranë" never clashed
    // with c-vlore's old area (a-vlore).
    await expect(
      update.execute({ access: admin(), tenantId: TENANT, list: Cities, id: 'c-vlore', values: { areaId: 'a-tirane', nameSq: 'Tiranë' } })
    ).rejects.toThrow(LookupValueTakenError);

    const moved = await update.execute({ access: admin(), tenantId: TENANT, list: Cities, id: 'c-vlore', values: { areaId: 'a-tirane' } });
    expect(moved).toMatchObject({ areaId: 'a-tirane', nameSq: 'Vlorë' });
  });

  it('lists and reorders cities scoped to one area', async () => {
    const { list, reorder } = setup();

    const tiraneCities = await list.execute({ access: salesUser(), tenantId: TENANT, list: Cities, filter: { areaId: 'a-tirane' } });
    expect(tiraneCities.map((c) => c.id)).toEqual(['c-tirane']); // c-kamez is inactive

    const allTirane = await list.execute({ access: admin(), tenantId: TENANT, list: Cities, includeInactive: true, filter: { areaId: 'a-tirane' } });
    expect(allTirane.map((c) => c.id).sort()).toEqual(['c-kamez', 'c-tirane']);

    const reordered = await reorder.execute({
      access: admin(),
      tenantId: TENANT,
      list: Cities,
      ids: ['c-kamez', 'c-tirane'],
      filter: { areaId: 'a-tirane' },
    });
    expect(reordered.map((c) => c.id)).toEqual(['c-kamez', 'c-tirane']);
    // a-vlore's own city is untouched and still at order 1.
    await expect(
      reorder.execute({ access: admin(), tenantId: TENANT, list: Cities, ids: ['c-kamez', 'c-tirane', 'c-vlore'], filter: { areaId: 'a-tirane' } })
    ).rejects.toThrow(InvalidLookupOrderError);
  });

  it('FR-SET-04 an area with active cities cannot be deactivated without cascading, and can with it', async () => {
    const { h, setActive } = setup();

    await expect(setActive.execute({ access: admin(), tenantId: TENANT, list: Areas, id: 'a-tirane', active: false })).rejects.toThrow(
      AreaHasActiveCitiesError
    );
    expect(h.item(Areas, 'a-tirane')).toMatchObject({ active: true });

    await setActive.execute({ access: admin(), tenantId: TENANT, list: Areas, id: 'a-tirane', active: false, cascade: true });

    expect(h.item(Areas, 'a-tirane')).toMatchObject({ active: false });
    expect(h.item(Cities, 'c-tirane')).toMatchObject({ active: false });
    expect(h.item(Cities, 'c-kamez')).toMatchObject({ active: false }); // was already inactive
    expect(h.audit.filter((e) => e.action === AuditAction.StatusChange)).toEqual([
      expect.objectContaining({ entityType: 'Area', entityId: 'a-tirane', changes: [{ field: 'active', old: true, new: false }] }),
      expect.objectContaining({ entityType: 'City', entityId: 'c-tirane', changes: [{ field: 'active', old: true, new: false }] }),
    ]);
  });

  it('an area with no active cities deactivates on its own, no cascade needed', async () => {
    const { h, setActive } = setup();

    // Once its one city is already inactive, a-vlore has none left to cascade.
    await setActive.execute({ access: admin(), tenantId: TENANT, list: Cities, id: 'c-vlore', active: false });
    await setActive.execute({ access: admin(), tenantId: TENANT, list: Areas, id: 'a-vlore', active: false });

    expect(h.item(Areas, 'a-vlore')).toMatchObject({ active: false });
    expect(h.item(Cities, 'c-vlore')).toMatchObject({ active: false });
  });

  it('FR-AUD-04 a failing audit write rolls back the area and every cascaded city', async () => {
    const { h, setActive } = setup();
    h.failAuditWrites();

    await expect(
      setActive.execute({ access: admin(), tenantId: TENANT, list: Areas, id: 'a-tirane', active: false, cascade: true })
    ).rejects.toThrow('audit write failed');
    expect(h.item(Areas, 'a-tirane')).toMatchObject({ active: true });
    expect(h.item(Cities, 'c-tirane')).toMatchObject({ active: true });
  });

  it('reactivating a city needs an active area', async () => {
    const { setActive } = setup();
    await setActive.execute({ access: admin(), tenantId: TENANT, list: Areas, id: 'a-tirane', active: false, cascade: true });

    await expect(setActive.execute({ access: admin(), tenantId: TENANT, list: Cities, id: 'c-tirane', active: true })).rejects.toThrow(
      InactiveAreaError
    );
  });

  it('deleting an area that has cities is refused, like any value in use', async () => {
    const { h, remove } = setup();
    h.setUsages('a-tirane', 2);

    await expect(remove.execute({ access: admin(), tenantId: TENANT, list: Areas, id: 'a-tirane' })).rejects.toThrow(LookupItemInUseError);
    expect(h.items(Areas)).toHaveLength(2);
  });
});

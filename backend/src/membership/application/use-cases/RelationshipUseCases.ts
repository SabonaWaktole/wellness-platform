import type { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { checkNames, checkOrder, InvalidRelationshipError } from '../../domain/BenefitTable';
import { MANAGE_WELLNESS_SETTINGS } from '../membershipPermissions';
import type { IRelationshipStore, RelationshipRecord } from '../ports/IMembershipSettingsStore';
import type { IMembershipWriteTransaction } from '../ports/IMembershipWriteTransaction';

export class RelationshipNotFoundError extends Error {
  readonly code = 'RELATIONSHIP_NOT_FOUND';
  constructor() {
    super('Relationship not found.');
  }
}

const refuseName = (field: 'nameSq' | 'nameEn') => new InvalidRelationshipError(field, 'The name is required in Albanian and English.');
const refuseOrder = () => new InvalidRelationshipError('order', 'The order must be a whole number from 0 to 10000.');

export interface RelationshipInput {
  nameSq?: unknown;
  nameEn?: unknown;
  order?: unknown;
  active?: boolean;
}

/** The relationship list. `onlyActive` is what a new family link offers (FR-FAM-02). */
export class ListRelationshipsUseCase {
  constructor(private readonly store: IRelationshipStore) {}

  async execute(input: { access: AccessContext; tenantId: string; onlyActive?: boolean }): Promise<RelationshipRecord[]> {
    input.access.ensure(MANAGE_WELLNESS_SETTINGS);
    const all = await this.store.list(input.tenantId);
    return input.onlyActive ? all.filter((r) => r.active) : all;
  }
}

/** FR-FAM-02, FR-AUD-14. */
export class CreateRelationshipUseCase {
  constructor(
    private readonly store: IRelationshipStore,
    private readonly writeTx: IMembershipWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; body: RelationshipInput }): Promise<RelationshipRecord> {
    input.access.ensure(MANAGE_WELLNESS_SETTINGS);
    const names = checkNames({ nameSq: input.body.nameSq, nameEn: input.body.nameEn }, refuseName);
    const existing = await this.store.list(input.tenantId);
    const order = input.body.order === undefined ? existing.reduce((max, r) => Math.max(max, r.order), 0) + 1 : checkOrder(input.body.order);
    if (order === null) throw refuseOrder();
    const active = input.body.active ?? true;

    return this.writeTx.run(async ({ relationshipStore, auditTrail }) => {
      const record = await relationshipStore.create(input.tenantId, { ...names, order, active });
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Create,
        entityType: 'MembershipSettings',
        entityId: record.id,
        entityLabel: `Relationship ${record.nameEn}`,
        changes: [
          { field: 'nameSq', old: null, new: record.nameSq },
          { field: 'nameEn', old: null, new: record.nameEn },
          { field: 'order', old: null, new: record.order },
          { field: 'active', old: null, new: record.active },
        ],
      });
      return record;
    });
  }
}

/** FR-FAM-02: rename, reorder, deactivate or reactivate. A deactivated relationship stays on existing links. */
export class UpdateRelationshipUseCase {
  constructor(
    private readonly store: IRelationshipStore,
    private readonly writeTx: IMembershipWriteTransaction
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; id: string; body: RelationshipInput }): Promise<RelationshipRecord> {
    input.access.ensure(MANAGE_WELLNESS_SETTINGS);
    const current = await this.store.find(input.tenantId, input.id);
    if (!current) throw new RelationshipNotFoundError();

    const names = checkNames(
      { nameSq: input.body.nameSq ?? current.nameSq, nameEn: input.body.nameEn ?? current.nameEn },
      refuseName
    );
    const order = input.body.order === undefined ? current.order : checkOrder(input.body.order);
    if (order === null) throw refuseOrder();
    const next: RelationshipRecord = { id: current.id, ...names, order, active: input.body.active ?? current.active };

    const changes = (['nameSq', 'nameEn', 'order', 'active'] as const)
      .filter((field) => current[field] !== next[field])
      .map((field) => ({ field, old: current[field], new: next[field] }));
    if (changes.length === 0) return current;

    await this.writeTx.run(async ({ relationshipStore, auditTrail }) => {
      await relationshipStore.update(input.tenantId, next);
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'MembershipSettings',
        entityId: current.id,
        entityLabel: `Relationship ${current.nameEn}`,
        changes,
      });
    });
    return next;
  }
}

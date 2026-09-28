import { LookupList } from '../domain/LookupList';
import { Area, BusinessType, City, LookupRecord, RiskLevel } from '../domain/LookupItem';
import {
  InactiveAreaError,
  InactiveRiskLevelError,
  InvalidLookupValueError,
  AreaHasActiveCitiesError,
  LookupValueTakenError,
  RiskLevelStillUsedError,
} from '../domain/errors';
import { ILookupStore } from './ports/ILookupStore';

/**
 * What makes one list different from another. The generic use cases handle
 * labels, order, active and auditing; this adds the list's own fields and
 * rules. Slice 10 adds one implementation per new list.
 */
export interface LookupListRules {
  readonly list: LookupList;
  /** Fields beyond the labels that a create or update may set. */
  readonly fields: string[];
  /** Fields `describe` returns, in the order the audit entry lists them. */
  readonly auditFields: string[];
  /** Fields a read or reorder may filter by (City's `areaId`, FR-SET-04). Unfiltered lists omit this. */
  readonly filterFields?: string[];
  /** The list whose values are deactivated alongside this one, if any (Area → City). */
  readonly cascadesTo?: LookupList;
  /** Checks a new (`current` null) or edited value against the rest of the list (`siblings`). */
  validate(tenantId: string, candidate: LookupRecord, current: LookupRecord | null, siblings: LookupRecord[]): Promise<void>;
  /**
   * The siblings a name must stay unique among. Defaults to every sibling;
   * City narrows this to the values of the same area, so "Tiranë" may exist
   * once per area.
   */
  namePeers(candidate: LookupRecord, siblings: LookupRecord[]): LookupRecord[];
  /**
   * Checks whether `item` may be deactivated. Returns the values of
   * `cascadesTo` that must be deactivated alongside it (empty when there are
   * none). With `cascade` false, a non-empty result is refused instead
   * (Area with active cities, FR-SET-04); RiskLevel keeps refusing outright,
   * cascade or not, since it has no `cascadesTo`.
   */
  checkDeactivate(tenantId: string, item: LookupRecord, options?: { cascade?: boolean }): Promise<LookupRecord[]>;
  checkReactivate(tenantId: string, item: LookupRecord): Promise<void>;
  /** The list's own fields as the audit log should show them, e.g. a risk level's name, not its id. */
  describe(tenantId: string, item: LookupRecord): Promise<Record<string, unknown>>;
}

const MAX_RISK_LEVEL = 99;

const defaultNamePeers = (_candidate: LookupRecord, siblings: LookupRecord[]) => siblings;

/** Risk levels (FR-SET-02): a level number unique in the workspace, and an optional description. */
export class RiskLevelRules implements LookupListRules {
  readonly list = LookupList.RiskLevels;
  readonly fields = ['level', 'description'];
  readonly auditFields = ['level', 'description'];
  readonly namePeers = defaultNamePeers;

  constructor(private readonly store: ILookupStore) {}

  async validate(_tenantId: string, candidate: LookupRecord, _current: LookupRecord | null, siblings: LookupRecord[]) {
    const { level } = candidate as RiskLevel;
    if (!Number.isInteger(level) || level < 1 || level > MAX_RISK_LEVEL) {
      throw new InvalidLookupValueError('level', `The level must be a whole number from 1 to ${MAX_RISK_LEVEL}.`);
    }
    if (siblings.some((other) => other.id !== candidate.id && (other as RiskLevel).level === level)) {
      throw new LookupValueTakenError('level');
    }
  }

  /** Active business types would otherwise offer a risk level that nobody may choose. */
  async checkDeactivate(tenantId: string, item: LookupRecord): Promise<LookupRecord[]> {
    const types = (await this.store.list(tenantId, LookupList.BusinessTypes)) as BusinessType[];
    const stillUsing = types.filter((type) => type.active && type.riskLevelId === item.id).length;
    if (stillUsing > 0) {
      throw new RiskLevelStillUsedError(stillUsing);
    }
    return [];
  }

  async checkReactivate() {}

  async describe(_tenantId: string, item: LookupRecord) {
    const { level, description } = item as RiskLevel;
    return { level, description };
  }
}

/** Business types (FR-SET-01): each linked to one active risk level. */
export class BusinessTypeRules implements LookupListRules {
  readonly list = LookupList.BusinessTypes;
  readonly fields = ['riskLevelId'];
  readonly auditFields = ['riskLevel'];
  readonly namePeers = defaultNamePeers;

  constructor(private readonly store: ILookupStore) {}

  async validate(tenantId: string, candidate: LookupRecord, current: LookupRecord | null) {
    const { riskLevelId } = candidate as BusinessType;
    // An edit that keeps the risk level is not re-checked: that risk level
    // cannot have been deactivated while this type was active (see
    // RiskLevelRules.checkDeactivate), and an inactive type keeps its value.
    if (current && (current as BusinessType).riskLevelId === riskLevelId) {
      return;
    }
    await this.ensureActiveRiskLevel(tenantId, riskLevelId);
  }

  async checkDeactivate(): Promise<LookupRecord[]> {
    return [];
  }

  async checkReactivate(tenantId: string, item: LookupRecord) {
    await this.ensureActiveRiskLevel(tenantId, (item as BusinessType).riskLevelId);
  }

  /** The risk level by name, so the audit log reads "Niveli 1 → Niveli 3" (UAT-3 step 1). */
  async describe(tenantId: string, item: LookupRecord) {
    const riskLevel = await this.store.findById(tenantId, LookupList.RiskLevels, (item as BusinessType).riskLevelId);
    return { riskLevel: riskLevel ? riskLevel.nameSq : null };
  }

  private async ensureActiveRiskLevel(tenantId: string, riskLevelId: string) {
    const riskLevel = typeof riskLevelId === 'string' ? await this.store.findById(tenantId, LookupList.RiskLevels, riskLevelId) : null;
    if (!riskLevel || !riskLevel.active) {
      throw new InactiveRiskLevelError();
    }
  }
}

/**
 * Areas (FR-SET-03): predefined regions (Q1: Area = qark). Deactivating one
 * that still has active cities is refused unless the caller cascades
 * (FR-SET-04).
 */
export class AreaRules implements LookupListRules {
  readonly list = LookupList.Areas;
  readonly fields: string[] = [];
  readonly auditFields: string[] = [];
  readonly cascadesTo = LookupList.Cities;
  readonly namePeers = defaultNamePeers;

  constructor(private readonly store: ILookupStore) {}

  async validate() {}

  async checkDeactivate(tenantId: string, item: LookupRecord, options?: { cascade?: boolean }): Promise<LookupRecord[]> {
    const cities = (await this.store.list(tenantId, LookupList.Cities, { areaId: item.id })) as City[];
    const activeCities = cities.filter((city) => city.active);
    if (activeCities.length === 0) {
      return [];
    }
    if (!options?.cascade) {
      throw new AreaHasActiveCitiesError(activeCities.length);
    }
    return activeCities;
  }

  async checkReactivate() {}

  async describe(): Promise<Record<string, unknown>> {
    return {};
  }
}

/** Cities (FR-SET-04): each tied to one active area; a name is unique within its area. */
export class CityRules implements LookupListRules {
  readonly list = LookupList.Cities;
  readonly fields = ['areaId'];
  readonly auditFields = ['area'];
  readonly filterFields = ['areaId'];

  constructor(private readonly store: ILookupStore) {}

  namePeers(candidate: LookupRecord, siblings: LookupRecord[]): LookupRecord[] {
    return siblings.filter((sibling) => (sibling as City).areaId === (candidate as City).areaId);
  }

  async validate(tenantId: string, candidate: LookupRecord, current: LookupRecord | null) {
    const { areaId } = candidate as City;
    // An edit that keeps the area is not re-checked, same reasoning as
    // BusinessTypeRules keeping its risk level.
    if (current && (current as City).areaId === areaId) {
      return;
    }
    await this.ensureActiveArea(tenantId, areaId);
  }

  async checkDeactivate(): Promise<LookupRecord[]> {
    return [];
  }

  async checkReactivate(tenantId: string, item: LookupRecord) {
    await this.ensureActiveArea(tenantId, (item as City).areaId);
  }

  /** The area by name, so the audit log reads the area, not its id. */
  async describe(tenantId: string, item: LookupRecord) {
    const area = await this.store.findById(tenantId, LookupList.Areas, (item as City).areaId);
    return { area: area ? area.nameSq : null };
  }

  private async ensureActiveArea(tenantId: string, areaId: string) {
    const area = typeof areaId === 'string' ? await this.store.findById(tenantId, LookupList.Areas, areaId) : null;
    if (!area || !area.active) {
      throw new InactiveAreaError();
    }
  }
}

export type LookupRulesRegistry = Record<LookupList, LookupListRules>;

export function createLookupRules(store: ILookupStore): LookupRulesRegistry {
  return {
    [LookupList.RiskLevels]: new RiskLevelRules(store),
    [LookupList.BusinessTypes]: new BusinessTypeRules(store),
    [LookupList.Areas]: new AreaRules(store),
    [LookupList.Cities]: new CityRules(store),
  };
}

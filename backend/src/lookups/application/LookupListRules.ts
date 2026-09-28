import { LookupList } from '../domain/LookupList';
import { BusinessType, LookupRecord, RiskLevel } from '../domain/LookupItem';
import {
  InactiveRiskLevelError,
  InvalidLookupValueError,
  LookupValueTakenError,
  RiskLevelStillUsedError,
} from '../domain/errors';
import { ILookupStore } from './ports/ILookupStore';

/**
 * What makes one list different from another. The generic use cases handle
 * labels, order, active and auditing; this adds the list's own fields and
 * rules. Slices 9 and 10 add one implementation per new list.
 */
export interface LookupListRules {
  readonly list: LookupList;
  /** Fields beyond the labels that a create or update may set. */
  readonly fields: string[];
  /** Fields `describe` returns, in the order the audit entry lists them. */
  readonly auditFields: string[];
  /** Checks a new (`current` null) or edited value against the rest of the list (`siblings`). */
  validate(tenantId: string, candidate: LookupRecord, current: LookupRecord | null, siblings: LookupRecord[]): Promise<void>;
  checkDeactivate(tenantId: string, item: LookupRecord): Promise<void>;
  checkReactivate(tenantId: string, item: LookupRecord): Promise<void>;
  /** The list's own fields as the audit log should show them, e.g. a risk level's name, not its id. */
  describe(tenantId: string, item: LookupRecord): Promise<Record<string, unknown>>;
}

const MAX_RISK_LEVEL = 99;

/** Risk levels (FR-SET-02): a level number unique in the workspace, and an optional description. */
export class RiskLevelRules implements LookupListRules {
  readonly list = LookupList.RiskLevels;
  readonly fields = ['level', 'description'];
  readonly auditFields = ['level', 'description'];

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
  async checkDeactivate(tenantId: string, item: LookupRecord) {
    const types = (await this.store.list(tenantId, LookupList.BusinessTypes)) as BusinessType[];
    const stillUsing = types.filter((type) => type.active && type.riskLevelId === item.id).length;
    if (stillUsing > 0) {
      throw new RiskLevelStillUsedError(stillUsing);
    }
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

  async checkDeactivate() {}

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

export type LookupRulesRegistry = Record<LookupList, LookupListRules>;

export function createLookupRules(store: ILookupStore): LookupRulesRegistry {
  return {
    [LookupList.RiskLevels]: new RiskLevelRules(store),
    [LookupList.BusinessTypes]: new BusinessTypeRules(store),
  };
}

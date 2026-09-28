import { ILookupInUsePolicy } from '../../src/lookups/application/ports/ILookupInUsePolicy';
import { ILookupStore } from '../../src/lookups/application/ports/ILookupStore';
import { ILookupWriteTransaction, ILookupWrites, LookupWriteRepos } from '../../src/lookups/application/ports/ILookupWriteTransaction';
import { createLookupRules } from '../../src/lookups/application/LookupListRules';
import { LookupList } from '../../src/lookups/domain/LookupList';
import { BusinessType, LookupRecord, RiskLevel } from '../../src/lookups/domain/LookupItem';
import { IAuditTrail } from '../../src/audit/application/ports/IAuditTrail';
import { AuditEntry } from '../../src/audit/domain/AuditEntry';

export const TENANT = 't1';

export const riskLevel = (overrides: Partial<RiskLevel> & { id: string; level: number }): RiskLevel => ({
  nameSq: `Niveli ${overrides.level}`,
  nameEn: `Level ${overrides.level}`,
  description: null,
  order: overrides.level,
  active: true,
  ...overrides,
});

export const businessType = (overrides: Partial<BusinessType> & { id: string; nameSq: string; riskLevelId: string }): BusinessType => ({
  nameEn: null,
  order: 1,
  active: true,
  ...overrides,
});

/**
 * An in-memory workspace of list values behind the lookup ports, for use-case
 * tests. Writes land in the same map reads come from, so a test can assert on
 * the resulting state rather than on mock calls. `failAudit` makes the audit
 * write throw after the list write, and the transaction then discards both.
 */
export function makeLookupHarness(seed: Partial<Record<LookupList, LookupRecord[]>> = {}) {
  let data = new Map<LookupList, LookupRecord[]>(
    Object.values(LookupList).map((list) => [list, (seed[list] ?? []).map((item) => ({ ...item }))])
  );
  const audit: AuditEntry[] = [];
  const usages = new Map<string, number>();
  let failAudit = false;

  const store: ILookupStore = {
    list: async (tenantId, list) => (tenantId === TENANT ? data.get(list)!.map((item) => ({ ...item })) : []),
    findById: async (tenantId, list, id) => {
      const item = tenantId === TENANT ? data.get(list)!.find((row) => row.id === id) : undefined;
      return item ? { ...item } : null;
    },
  };

  const writesOn = (working: Map<LookupList, LookupRecord[]>): ILookupWrites => ({
    create: async (_tenantId, list, item) => {
      working.get(list)!.push({ ...item });
    },
    update: async (_tenantId, list, item) => {
      working.set(list, working.get(list)!.map((row) => (row.id === item.id ? { ...item } : row)));
    },
    delete: async (_tenantId, list, id) => {
      working.set(list, working.get(list)!.filter((row) => row.id !== id));
    },
  });

  const writeTx: ILookupWriteTransaction = {
    run: async <T>(work: (repos: LookupWriteRepos) => Promise<T>): Promise<T> => {
      const working = new Map([...data].map(([list, rows]) => [list, rows.map((row) => ({ ...row }))]));
      const pending: AuditEntry[] = [];
      const auditTrail: IAuditTrail = {
        record: async (entry) => {
          if (failAudit) {
            throw new Error('audit write failed');
          }
          pending.push(entry);
        },
      };
      const result = await work({ lookups: writesOn(working), auditTrail });
      data = working;
      audit.push(...pending);
      return result;
    },
  };

  const inUse: ILookupInUsePolicy = { usages: async (_tenantId, _list, id) => usages.get(id) ?? 0 };

  return {
    store,
    writeTx,
    inUse,
    rules: createLookupRules(store),
    audit,
    items: (list: LookupList) => data.get(list)!,
    item: (list: LookupList, id: string) => data.get(list)!.find((row) => row.id === id),
    setUsages: (id: string, count: number) => usages.set(id, count),
    failAuditWrites: () => {
      failAudit = true;
    },
  };
}

/** Three risk levels and two business types, one of them inactive. */
export const standardLists = () => ({
  [LookupList.RiskLevels]: [
    riskLevel({ id: 'rl1', level: 1 }),
    riskLevel({ id: 'rl2', level: 2 }),
    riskLevel({ id: 'rl3', level: 3, active: false }),
  ],
  [LookupList.BusinessTypes]: [
    businessType({ id: 'bt-cafe', nameSq: 'Kafene', nameEn: 'Café', riskLevelId: 'rl1', order: 1 }),
    businessType({ id: 'bt-factory', nameSq: 'Fabrikë', nameEn: 'Factory', riskLevelId: 'rl2', order: 2, active: false }),
  ],
});

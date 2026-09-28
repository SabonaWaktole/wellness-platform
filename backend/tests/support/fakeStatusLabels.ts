import { IStatusLabelStore } from '../../src/statuses/application/ports/IStatusLabelStore';
import { IStatusLabelWriteTransaction, IStatusLabelWrites, StatusLabelWriteRepos } from '../../src/statuses/application/ports/IStatusLabelWriteTransaction';
import { StatusDomain } from '../../src/statuses/domain/StatusCatalogue';
import { StatusLabel } from '../../src/statuses/domain/StatusLabel';
import { IAuditTrail } from '../../src/audit/application/ports/IAuditTrail';
import { AuditEntry } from '../../src/audit/domain/AuditEntry';

export const TENANT = 't1';

/**
 * An in-memory workspace of status label overrides behind the status ports,
 * for use-case tests. Mirrors `fakeLookups.makeLookupHarness`.
 */
export function makeStatusLabelHarness(seed: StatusLabel[] = []) {
  let data = seed.map((item) => ({ ...item }));
  const audit: AuditEntry[] = [];
  let failAudit = false;

  const store: IStatusLabelStore = {
    list: async (tenantId, domain) => (tenantId === TENANT ? data.filter((item) => item.domain === domain).map((item) => ({ ...item })) : []),
    find: async (tenantId, domain, key) => {
      const item = tenantId === TENANT ? data.find((row) => row.domain === domain && row.key === key) : undefined;
      return item ? { ...item } : null;
    },
  };

  const writesOn = (working: StatusLabel[]): IStatusLabelWrites => ({
    upsert: async (_tenantId, _domain, item) => {
      const index = working.findIndex((row) => row.domain === item.domain && row.key === item.key);
      if (index === -1) working.push({ ...item });
      else working[index] = { ...item };
    },
  });

  const writeTx: IStatusLabelWriteTransaction = {
    run: async <T>(work: (repos: StatusLabelWriteRepos) => Promise<T>): Promise<T> => {
      const working = data.map((row) => ({ ...row }));
      const pending: AuditEntry[] = [];
      const auditTrail: IAuditTrail = {
        record: async (entry) => {
          if (failAudit) throw new Error('audit write failed');
          pending.push(entry);
        },
      };
      const result = await work({ statusLabels: writesOn(working), auditTrail });
      data = working;
      audit.push(...pending);
      return result;
    },
  };

  return {
    store,
    writeTx,
    audit,
    items: (domain: StatusDomain) => data.filter((row) => row.domain === domain),
    item: (domain: StatusDomain, key: string) => data.find((row) => row.domain === domain && row.key === key),
    failAuditWrites: () => {
      failAudit = true;
    },
  };
}

import { StatusDomain } from '../../domain/StatusCatalogue';
import { StatusLabel } from '../../domain/StatusLabel';

/** Reads a workspace's status label overrides. Every method takes `tenantId` first, so no read can cross tenants. */
export interface IStatusLabelStore {
  list(tenantId: string, domain: StatusDomain): Promise<StatusLabel[]>;
  find(tenantId: string, domain: StatusDomain, key: string): Promise<StatusLabel | null>;
}

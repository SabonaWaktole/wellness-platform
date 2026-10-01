import { SalesScriptVersion } from '../../domain/SalesScript';

/** Reads of a workspace's sales script. Every method takes `tenantId` first, so no read can cross tenants. */
export interface ISalesScriptStore {
  published(tenantId: string): Promise<SalesScriptVersion | null>;
  draft(tenantId: string): Promise<SalesScriptVersion | null>;
  version(tenantId: string, version: number): Promise<SalesScriptVersion | null>;
  /** Every version that was published (PUBLISHED and SUPERSEDED), newest first. */
  publishedVersions(tenantId: string): Promise<SalesScriptVersion[]>;
  /** The highest version number in use, 0 for none. */
  latestVersion(tenantId: string): Promise<number>;
}

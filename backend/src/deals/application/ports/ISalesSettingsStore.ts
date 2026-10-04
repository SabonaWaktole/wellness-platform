import { SalesSettings } from '../../domain/SalesSettings';

/** The workspace's sales settings; the defaults until a row is saved. */
export interface ISalesSettingsStore {
  get(tenantId: string): Promise<SalesSettings>;
  save(settings: SalesSettings): Promise<void>;
}

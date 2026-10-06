import { dayKeyInZone } from '../../shared/domain/time/tenantDay';
import { IContractSettingsStore } from './ports/IContractSettingsStore';
import { IContractValidityReader } from './ports/IContractValidityReader';
import { ValidityBadge, validityBadge } from './validityBadge';

export interface ValidityClock {
  today: Date;
  expiringSoonDays: number;
}

/**
 * Badges for a page of companies: one contract query and one settings read,
 * however many companies (FR-CON-21). "Today" is the workspace day (M3 D4).
 */
export class ContractValidityBadges {
  constructor(
    private reader: IContractValidityReader,
    private settings: IContractSettingsStore,
    private now: () => Date = () => new Date()
  ) {}

  async clock(tenantId: string, timezone: string): Promise<ValidityClock> {
    const settings = await this.settings.get(tenantId);
    return {
      today: new Date(`${dayKeyInZone(this.now(), timezone)}T00:00:00.000Z`),
      expiringSoonDays: settings.expiringSoonDays,
    };
  }

  async forClients(tenantId: string, timezone: string, clientIds: string[]): Promise<Map<string, ValidityBadge>> {
    const [clock, contracts] = await Promise.all([this.clock(tenantId, timezone), this.reader.forClients(tenantId, clientIds)]);
    return new Map(clientIds.map((id) => [id, validityBadge(contracts.get(id) ?? [], clock.today, clock.expiringSoonDays)]));
  }
}

import { ChangeRecord } from '../../../domain/ExecutiveDefinitions';

/** The pricing configuration as it stands now (FR-DSH-11). No fee or price is in it: those are not for this dashboard. */
export interface PricingConfigurationSummary {
  /** The discount cap, a percentage with two decimals. */
  discountCapPercent: string;
  activeEmployeeBands: number;
  riskSurcharges: number;
  activeVisitFrequencies: number;
  activePriceZones: number;
}

export interface RoleUsage {
  roleId: string;
  key: string;
  nameSq: string;
  nameEn: string | null;
  activeUsers: number;
  inactiveUsers: number;
}

/**
 * The reads behind the Administrator dashboard (FR-DSH-11): configuration, users and what needs attention.
 * None of them touches a deal, an offer's value, a contract or a payment.
 */
export interface IAdministratorDashboardReader {
  pricing(tenantId: string): Promise<PricingConfigurationSummary>;
  /** The most recent audit entries of each entity type, with the fields each changed, newest first. */
  changeRecords(tenantId: string, entityTypes: readonly string[]): Promise<Map<string, ChangeRecord[]>>;
  /** Every role of the workspace with its users, so a role nobody holds is a row of zeros. Deleted users are not counted. */
  roleUsage(tenantId: string): Promise<RoleUsage[]>;
  /** Active cities that no active price zone covers. */
  citiesInNoZone(tenantId: string): Promise<Array<{ id: string; name: string }>>;
}

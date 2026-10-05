import { OpenDeal } from '../../../domain/DashboardDefinitions';
import { Money } from '../../../../pricing/domain/Money';
import { DayRange, InstantRange } from '../../../domain/PerformancePeriod';

export interface ContractGroup {
  count: number;
  /** The sum of the agreed annual value; a contract without one adds nothing. */
  annualValue: Money;
}

export interface ContractFigures {
  /** Status Active and valid today. */
  active: ContractGroup;
  expired: ContractGroup;
  /** Valid and ending within the expiring-soon window. */
  expiringSoon: ContractGroup;
}

export interface CompanyStatusCount {
  status: string | null;
  count: number;
}

/**
 * The reads behind the CEO dashboard (FR-DSH-12) that the Performance indicators and the payments overview
 * do not already give. Everything is the whole workspace, as the CEO's All scope is (FR-DSH-02), and money
 * is summed by the database as `Decimal` (NFR-ACC-03).
 */
export interface ICeoDashboardReader {
  /** Every open deal of the workspace, with the annual value of its latest offer. */
  openDeals(tenantId: string): Promise<OpenDeal[]>;
  /**
   * Money received in the period (Q10): receipts by the date received, and a reversal, which carries no date
   * received, by the day it was made, so a reversal nets out the receipt it takes back.
   */
  revenue(query: { tenantId: string; days: DayRange; window: InstantRange }): Promise<Money>;
  /** The agreed monthly price of the contracts valid today. */
  monthlyRecurringValue(query: { tenantId: string; today: Date }): Promise<Money>;
  /** Counted with the same conditions as the contract list's status and validity filters, so the two agree. */
  contracts(query: { tenantId: string; today: Date; expiringSoonDays: number }): Promise<ContractFigures>;
  /** Open follow-ups past their due time, whoever they are assigned to. */
  overdueFollowUps(query: { tenantId: string; now: Date }): Promise<number>;
  pendingDiscountApprovals(tenantId: string): Promise<number>;
  /** Offers marked as sent that no one has answered yet. */
  offersWaiting(tenantId: string): Promise<number>;
  companiesPerStatus(tenantId: string): Promise<CompanyStatusCount[]>;
}

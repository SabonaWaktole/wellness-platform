import { ContractStatus } from './Contract';
import { startOfDay } from './calendarDay';

/** What the company's standing reads of a contract: its state and its term. */
export interface StandingContract {
  status: ContractStatus;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Is this contract valid today or still to come (FR-CON-17)?
 *
 * Valid: Active with the end date not yet passed. Upcoming: Pending Signature
 * or Draft whose term starts after today. Expired, Cancelled and Suspended
 * contracts, and a Draft that was meant to have started already, do not count.
 */
export const isValidOrUpcoming = (contract: StandingContract, today: Date): boolean => {
  const day = startOfDay(today);
  switch (contract.status) {
    case ContractStatus.Active:
      return startOfDay(contract.endsAt) >= day;
    case ContractStatus.PendingSignature:
    case ContractStatus.Draft:
      return startOfDay(contract.startsAt) > day;
    default:
      return false;
  }
};

/**
 * A client becomes a Former client when nothing valid or upcoming is left and
 * no renewal deal is open (FR-CON-17, Q16). An open renewal deal keeps the
 * company a Client while the team negotiates.
 */
export const shouldBecomeFormerClient = (
  contracts: StandingContract[],
  today: Date,
  hasOpenRenewalDeal: boolean
): boolean => !hasOpenRenewalDeal && !contracts.some((contract) => isValidOrUpcoming(contract, today));

import type { IContractValidityEvents } from '../../contracts/application/ports/IContractValidityEvents';
import type { SyncEmployerMembersUseCase } from './use-cases/EmployerUseCases';

/**
 * The membership side of the contract-change hook (M4 Slice 10, D8): registered
 * at the composition root and handed to the contracts use cases, which only know
 * the port. It never throws, so a Wellness+ failure cannot reach the contract
 * change; the daily member job repairs whatever it missed.
 */
export class ContractValidityListener implements IContractValidityEvents {
  constructor(private readonly sync: SyncEmployerMembersUseCase) {}

  async contractValidityChanged(event: { tenantId: string; clientId: string; today: Date }): Promise<void> {
    try {
      await this.sync.execute(event);
    } catch (error) {
      console.error(`Wellness+: could not sync the employees of company ${event.clientId} after a contract change; the daily job will repair it`, error);
    }
  }
}

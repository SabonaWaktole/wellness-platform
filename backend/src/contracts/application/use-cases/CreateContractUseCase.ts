import { randomUUID } from 'crypto';
import { BillingPeriod, Contract, ContractStatus } from '../../domain/Contract';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { IClientRepository } from '../../../clients/domain/repositories/IClientRepository';

/**
 * Draws up a new contract term.
 *
 * Created as DRAFT and NOT activated here, even though a one-step "sell it and
 * start it" would be fewer clicks. Activation generates the payment schedule,
 * and a schedule built from dates somebody is still editing is worse than no
 * schedule: they would have to spot and delete the wrong rows. Draft is the
 * state where the term is still being negotiated.
 */
export class CreateContractUseCase {
  constructor(
    private writeTx: IContractWriteTransaction,
    private clientRepo: IClientRepository
  ) {}

  async execute(input: {
    tenantId: string;
    clientId: string;
    planName: string;
    amount: number;
    billingPeriod: BillingPeriod;
    startsAt: Date;
    endsAt: Date;
    assignedUserId?: string | null;
    notes?: string | null;
    actingUserId: string;
  }) {
    // The client is checked through its own repository, which already filters
    // soft-deleted rows — a raw FK insert would happily attach a contract to a
    // deleted client and it would then be invisible everywhere it mattered.
    const client = await this.clientRepo.findById(input.tenantId, input.clientId);
    if (!client) {
      throw new Error('Client not found');
    }

    return this.writeTx.run(async (repos) => {
      const contract = Contract.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        clientId: input.clientId,
        planName: input.planName,
        amount: input.amount,
        billingPeriod: input.billingPeriod,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        // Defaults to the person selling it. A contract with no owner is a
        // contract nobody gets the expiry warning for.
        assignedUserId: input.assignedUserId ?? input.actingUserId,
        notes: input.notes ?? null,
        createdByUserId: input.actingUserId,
      });

      await repos.contractRepo.save(contract);

      await repos.historyRepo.save(
        ContractStatusHistory.create({
          id: randomUUID(),
          tenantId: input.tenantId,
          contractId: contract.id,
          // The row is created in one step, so there is no prior status to
          // record. '' would be a lie about a transition that never happened;
          // naming the target twice says "this is where it began".
          fromStatus: ContractStatus.Draft,
          toStatus: ContractStatus.Draft,
          changedByUserId: input.actingUserId,
          note: 'Contract created',
        })
      );

      // Re-read so the caller gets the same hydrated shape every other
      // endpoint returns — `clientName` and the payment rollup come from the
      // repository's joins, and a freshly constructed entity has neither.
      const saved = await repos.contractRepo.findById(input.tenantId, contract.id);
      return { contract: saved ?? contract };
    });
  }
}

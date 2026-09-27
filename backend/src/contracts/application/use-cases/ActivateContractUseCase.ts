import { AccessContext } from '../../../access/domain/AccessContext';
import { randomUUID } from 'crypto';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { ContractPayment } from '../../domain/ContractPayment';
import { buildPaymentSchedule } from '../../domain/paymentSchedule';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { assertCanAccessContract } from './contractAccess';

/**
 * Puts a contract in force and lays out what the client is expected to pay.
 *
 * The schedule is generated HERE rather than at creation because this is the
 * moment the dates and the price stop moving. Rows are written only if the
 * contract has none: activation is not a generator someone can re-run, and a
 * contract that was cancelled and somehow reactivated must not end up billed
 * twice for the same months.
 */
export class ActivateContractUseCase {
  constructor(private writeTx: IContractWriteTransaction) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    actingUserId: string;
    access: AccessContext;
  }) {
    return this.writeTx.run(async (repos) => {
      const contract = await repos.contractRepo.findById(input.tenantId, input.contractId);
      if (!contract) {
        throw new Error('Contract not found');
      }

      assertCanAccessContract(contract, input.access);

      const fromStatus = contract.status;
      contract.activate();

      const existing = await repos.paymentRepo.findByContractId(input.tenantId, input.contractId);
      let generated: ContractPayment[] = [];

      if (existing.length === 0) {
        generated = buildPaymentSchedule({
          billingPeriod: contract.billingPeriod,
          amount: contract.amount,
          startsAt: contract.startsAt,
          endsAt: contract.endsAt,
        }).map((instalment) =>
          ContractPayment.create({
            id: randomUUID(),
            tenantId: input.tenantId,
            contractId: contract.id,
            periodIndex: instalment.periodIndex,
            dueDate: instalment.dueDate,
            amount: instalment.amount,
          })
        );

        await repos.paymentRepo.saveMany(generated);
      }

      await repos.contractRepo.save(contract);
      await repos.historyRepo.save(
        ContractStatusHistory.create({
          id: randomUUID(),
          tenantId: input.tenantId,
          contractId: contract.id,
          fromStatus,
          toStatus: contract.status,
          changedByUserId: input.actingUserId,
          note:
            generated.length > 0
              ? `Activated; ${generated.length} scheduled payment(s) created`
              : 'Activated',
        })
      );

      return { contract, generatedPayments: generated.length };
    });
  }
}

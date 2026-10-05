import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { IContractRepository } from '../../domain/IContractRepository';
import { IContractPaymentRepository } from '../../domain/IContractPaymentRepository';
import { IContractPaymentHistoryRepository } from '../../domain/IContractPaymentHistoryRepository';
import { reachableContract } from './contractAccess';

/**
 * The instalments of one contract, their summary and the history of one of
 * them (FR-PAY-03, 08, 10, 12). Needs `payments.view`, narrowed to the
 * viewer's own, team's or every company (FR-RBAC-22); a contract out of that
 * scope reads as not found.
 */
export class GetContractPaymentsUseCase {
  constructor(
    private contractRepo: IContractRepository,
    private paymentRepo: IContractPaymentRepository,
    private historyRepo: IContractPaymentHistoryRepository,
    private scopes: RecordScopeResolver,
    private tenants: ITenantRepository,
    private now: () => Date = () => new Date()
  ) {}

  private async reachable(input: { tenantId: string; contractId: string; access: AccessContext }) {
    const scope = await this.scopes.resolve(input.access, 'payments.view');
    return reachableContract(await this.contractRepo.findById(input.tenantId, input.contractId), scope);
  }

  async list(input: { tenantId: string; contractId: string; access: AccessContext }) {
    const contract = await this.reachable(input);
    const tenant = await this.tenants.findById(input.tenantId);
    const today = new Date(`${dayKeyInZone(this.now(), tenant?.timezone ?? 'UTC')}T00:00:00.000Z`);
    const payments = await this.paymentRepo.findByContractId(input.tenantId, input.contractId);
    return { contract, payments, today };
  }

  async history(input: { tenantId: string; contractId: string; paymentId: string; access: AccessContext }) {
    await this.reachable(input);
    const payment = await this.paymentRepo.findById(input.tenantId, input.paymentId);
    if (!payment || payment.contractId !== input.contractId) throw new Error('Payment not found');
    return this.historyRepo.findByPaymentId(input.tenantId, input.paymentId);
  }
}

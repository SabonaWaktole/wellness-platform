import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { Deal } from '../../../deals/domain/Deal';
import { dealLabel } from '../../../deals/domain/dealLabel';
import { DealType } from '../../../deals/domain/DealType';
import { EDIT_DEALS, REASSIGN_DEALS } from '../../../deals/application/dealAccess';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { ContractStatus } from '../../domain/Contract';
import { ContractValidationError, RenewalNotAllowedError } from '../../domain/contractErrors';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { reachableContract } from './contractAccess';
import { contractLabel } from './contractAudit';

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string } | null)?.code === 'P2002';

/** The terms a renewal can be started from: not a Draft, not waiting for a signature, not Cancelled (FR-REN-06). */
const RENEWABLE: readonly ContractStatus[] = [ContractStatus.Active, ContractStatus.Suspended, ContractStatus.Expired];

/**
 * Starts a Renewal deal from a contract (FR-REN-06). Nothing renews by itself:
 * this makes the deal, the salesperson works it like any other, and winning it
 * lets "Create contract" make the next term (FR-REN-07, FR-REN-10).
 *
 * It takes `contracts.manage` and `deals.edit`, both at a scope that admits the
 * contract's company (D17), so a Sales User cannot start one for a colleague's
 * contract (that reads as "not found", FR-RBAC-05).
 *
 * The contract's row is locked first, then the checks run, so two parallel calls
 * take turns and the second finds the first one's deal. PostgreSQL also has a
 * partial unique index behind it; a violation of it reads as the same refusal.
 * The deal, its first stage-history row (Interested, with the owner as actor) and
 * both audit entries are written in the one transaction.
 */
export class StartRenewalUseCase {
  constructor(
    private readonly writeTx: IContractWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly tenants: ITenantRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    tenantId: string;
    contractId: string;
    /** Defaults to the contract's salesperson. Naming someone else takes `companies.reassign`. */
    ownerUserId?: string;
    actingUserId: string;
    access: AccessContext;
  }): Promise<{ dealId: string }> {
    const { access, tenantId } = input;
    access.ensure('contracts.manage');
    access.ensure(EDIT_DEALS);
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant?.runsSalesProcess()) {
      throw new ContractValidationError('contractId', 'A renewal deal is started only in a workspace that runs the sales process.');
    }
    const [manageScope, dealScope] = await Promise.all([
      this.scopes.resolve(access, 'contracts.manage'),
      this.scopes.resolve(access, EDIT_DEALS),
    ]);

    try {
      return await this.writeTx.run(async (repos) => {
        // First statement: the lock the one-open-deal rule rests on.
        if (!(await repos.renewals.lock(tenantId, input.contractId))) throw new Error('Contract not found');
        const contract = reachableContract(await repos.contractRepo.findById(tenantId, input.contractId), manageScope);
        // The company's salesperson decides reach for the deal too, as for the contract.
        if (!admits(dealScope, contract.clientAssignedUserId)) throw new Error('Contract not found');

        const links = await repos.renewals.links(tenantId, contract.id);
        if (!RENEWABLE.includes(contract.status)) {
          throw new RenewalNotAllowedError('NOT_RENEWABLE_STATUS', `A ${contract.status} contract cannot be renewed.`);
        }
        if (links.renewedInto) {
          throw new RenewalNotAllowedError('ALREADY_RENEWED', `This contract was already renewed by ${links.renewedInto.number}.`);
        }
        if (contract.notRenewingReasonId) {
          throw new RenewalNotAllowedError('NOT_RENEWING', 'This contract is marked as not renewing.');
        }
        if (links.openDealId) {
          throw new RenewalNotAllowedError('RENEWAL_OPEN', 'A renewal deal is already open for this contract.', links.openDealId);
        }

        const ownerUserId = await this.owner(repos.renewals, input, contract.assignedUserId, dealScope);
        const now = this.now();
        const { deal, change } = Deal.openRenewal({
          id: randomUUID(),
          tenantId,
          clientId: contract.clientId,
          ownerUserId,
          createdByUserId: input.actingUserId,
          expectedCloseDate: contract.renewalDate ?? contract.endsAt,
          notes: null,
          now,
          newId: randomUUID,
          renewalOfContractId: contract.id,
          note: `Renewal of ${contract.number ?? contract.id}`,
        });
        await repos.dealWrites.insert(deal);
        await repos.dealWrites.recordChange(tenantId, change);

        const companyName = contract.clientName ?? (await repos.dealWrites.companyName(tenantId, contract.clientId));
        const props = deal.toProps();
        await repos.auditTrail.record({
          tenantId,
          userId: input.actingUserId,
          userRole: access.auditRole,
          action: AuditAction.Create,
          entityType: 'Deal',
          entityId: deal.id,
          entityLabel: dealLabel(null, companyName, DealType.Renewal),
          changes: diff(
            {} as Record<string, unknown>,
            { type: props.type, stage: props.stage, ownerUserId: props.ownerUserId, expectedCloseDate: props.expectedCloseDate, renewalOfContractId: props.renewalOfContractId },
            ['type', 'stage', 'ownerUserId', 'expectedCloseDate', 'renewalOfContractId']
          ),
        });
        // The renewal link on the contract's own trail (FR-AUD-11).
        await repos.auditTrail.record({
          tenantId,
          userId: input.actingUserId,
          userRole: access.auditRole,
          action: AuditAction.Update,
          entityType: 'Contract',
          entityId: contract.id,
          entityLabel: contractLabel(contract),
          changes: [{ field: 'renewalDealId', old: null, new: deal.id }],
        });
        return { dealId: deal.id };
      });
    } catch (error) {
      // The partial unique index won a race this transaction's own check missed.
      if (isUniqueViolation(error)) throw new RenewalNotAllowedError('RENEWAL_OPEN', 'A renewal deal is already open for this contract.');
      throw error;
    }
  }

  /** The contract's salesperson if they are still active, else the person starting it; anyone else needs `companies.reassign`. */
  private async owner(
    renewals: { isActiveUser(tenantId: string, userId: string): Promise<boolean> },
    input: { tenantId: string; ownerUserId?: string; actingUserId: string; access: AccessContext },
    contractSalesperson: string | null,
    dealScope: Parameters<typeof admits>[0]
  ): Promise<string> {
    const fallback = contractSalesperson && (await renewals.isActiveUser(input.tenantId, contractSalesperson)) ? contractSalesperson : input.actingUserId;
    const chosen = input.ownerUserId ?? fallback;
    if (chosen === fallback && input.ownerUserId === undefined) return chosen;
    if (chosen !== fallback) input.access.ensure(REASSIGN_DEALS);
    if (!(await renewals.isActiveUser(input.tenantId, chosen))) {
      throw new ContractValidationError('ownerUserId', 'Choose an active user of this workspace.');
    }
    if (!admits(dealScope, chosen)) throw new ContractValidationError('ownerUserId', 'You cannot hand a deal to that user.');
    return chosen;
  }
}

import { randomUUID } from 'crypto';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { diff } from '../../../audit/domain/diff';
import { ITenantRepository } from '../../../tenant/domain/repositories/ITenantRepository';
import { DealStage } from '../../../deals/domain/DealStage';
import { DealType } from '../../../deals/domain/DealType';
import { BillingPeriod, Contract, ContractStatus } from '../../domain/Contract';
import { ContractStatusHistory } from '../../domain/ContractStatusHistory';
import { startOfDay } from '../../domain/calendarDay';
import { defaultEndDate, defaultRenewalDate } from '../../domain/contractTerm';
import { ContractAlreadyExistsError, ContractValidationError } from '../../domain/contractErrors';
import { IContractWriteTransaction } from '../ports/IContractWriteTransaction';
import { CONTRACT_AUDIT_FIELDS, contractLabel, contractSnapshot } from './contractAudit';

/** One day, for stepping a renewal's term off the end of the previous one (FR-REN-07). */
const DAY_MS = 24 * 60 * 60 * 1000;

const isUniqueViolation = (error: unknown): boolean => (error as { code?: string } | null)?.code === 'P2002';

/**
 * Makes a contract from a Won deal (FR-CON-01..05, NFR-DAT-01).
 *
 * The contract is filled from the deal and the offer that won it: company,
 * deal, offer, salesperson, package, services, agreed monthly price, annual
 * value, discount and terms. None of those can be sent in the request
 * (FR-CON-04). The start date defaults to the deal's closing date, the end
 * date to the start plus the offer's contract months minus a day (D4), the
 * billing period to monthly, the renewal date to the end date minus the largest
 * reminder lead time (FR-CON-07).
 *
 * A won Renewal deal makes the next term of the contract it renews (FR-REN-07):
 * the start date defaults to the day after the previous end date, the new
 * contract links back to it, and the previous contract keeps its status, dates
 * and history, gaining only a history row and an audit entry that say it was
 * renewed. Nothing here is automatic: it runs when a user asks for it.
 *
 * One contract per deal is the database's rule, not only this check: the
 * unique index on the deal makes a parallel second create fail, and that is
 * reported as the same refusal. The number is taken in the same transaction,
 * so a refused create does not burn one. A deal for extra services gets its
 * own contract (Q9).
 */
export class CreateContractFromDealUseCase {
  constructor(
    private readonly writeTx: IContractWriteTransaction,
    private readonly scopes: RecordScopeResolver,
    private readonly tenants: ITenantRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: {
    tenantId: string;
    dealId: string;
    startsAt?: Date;
    endsAt?: Date;
    billingPeriod?: BillingPeriod;
    actingUserId: string;
    access: AccessContext;
  }) {
    const tenant = await this.tenants.findById(input.tenantId);
    if (!tenant?.runsSalesProcess()) {
      throw new ContractValidationError('dealId', 'Contracts are made from a won deal only in a workspace that runs the sales process.');
    }

    try {
      return await this.writeTx.run((repos) => this.create(repos, input));
    } catch (error) {
      // A parallel create won the race on the deal's unique index (NFR-DAT-01).
      if (isUniqueViolation(error)) throw new ContractAlreadyExistsError();
      throw error;
    }
  }

  private async create(
    repos: Parameters<Parameters<IContractWriteTransaction['run']>[0]>[0],
    input: {
      tenantId: string;
      dealId: string;
      startsAt?: Date;
      endsAt?: Date;
      billingPeriod?: BillingPeriod;
      actingUserId: string;
      access: AccessContext;
    }
  ) {
    const scope = await this.scopes.resolve(input.access, 'contracts.manage');
    const deal = await repos.deals.find(input.tenantId, input.dealId);
    // Outside the viewer's reach a deal is "not found", as the company is (FR-RBAC-05, 22).
    if (!deal || !deal.clientActive || !admits(scope, deal.clientAssignedUserId)) throw new Error('Deal not found');

    if (deal.stageKey !== DealStage.Won) {
      throw new ContractValidationError('dealId', 'A contract can only be made from a won deal.');
    }
    if (!deal.source) {
      throw new ContractValidationError('dealId', 'The deal has no won offer with a price to make a contract from.');
    }
    const existing = await repos.contractRepo.findByDealId(input.tenantId, deal.dealId);
    if (existing) throw new ContractAlreadyExistsError(existing.id);

    // A Renewal deal renews one contract, once (FR-REN-06, 07).
    const previous =
      deal.type === DealType.Renewal && deal.renewalOfContractId
        ? await repos.contractRepo.findById(input.tenantId, deal.renewalOfContractId)
        : null;
    if (deal.type === DealType.Renewal && deal.renewalOfContractId) {
      if (!previous) throw new ContractValidationError('dealId', 'The contract this deal renews was not found.');
      const links = await repos.renewals.links(input.tenantId, previous.id);
      if (links.renewedInto) {
        throw new ContractValidationError('dealId', `The contract this deal renews was already renewed by ${links.renewedInto.number}.`);
      }
    }

    const settings = await repos.settingsStore.get(input.tenantId);
    const now = this.now();
    const start = new Date(
      startOfDay(input.startsAt ?? (previous ? new Date(previous.endsAt.getTime() + DAY_MS) : (deal.closedAt ?? now)))
    );
    const end = input.endsAt ?? defaultEndDate(start, deal.contractMonths);
    const number = await repos.numbers.next(input.tenantId, now);

    const contract = Contract.create({
      id: randomUUID(),
      tenantId: input.tenantId,
      clientId: deal.clientId,
      planName: deal.packageName ?? number,
      amount: Number(deal.source.amount),
      billingPeriod: input.billingPeriod ?? BillingPeriod.Monthly,
      startsAt: start,
      endsAt: end,
      assignedUserId: deal.ownerUserId,
      createdByUserId: input.actingUserId,
      dealId: deal.dealId,
      quotationId: deal.source.quotationId,
      packageId: deal.source.packageId,
      servicesSnapshot: deal.source.servicesSnapshot,
      termsText: deal.source.termsText,
      agreedAnnualValue: deal.source.agreedAnnualValue,
      discountPercent: deal.source.discountPercent,
      number,
      renewedFromContractId: previous?.id ?? null,
      renewalDate: defaultRenewalDate(end, settings.reminderLeadDays),
    });

    await repos.contractRepo.save(contract);
    await repos.historyRepo.save(
      ContractStatusHistory.create({
        id: randomUUID(),
        tenantId: input.tenantId,
        contractId: contract.id,
        fromStatus: ContractStatus.Draft,
        toStatus: ContractStatus.Draft,
        changedByUserId: input.actingUserId,
        note: 'Contract created from a won deal',
      })
    );

    // Re-read so the caller gets the hydrated shape: company, package, deal and offer joins.
    const saved = (await repos.contractRepo.findById(input.tenantId, contract.id)) ?? contract;
    await repos.auditTrail.record({
      tenantId: input.tenantId,
      userId: input.actingUserId,
      userRole: input.access.auditRole,
      action: AuditAction.Create,
      entityType: 'Contract',
      entityId: contract.id,
      entityLabel: contractLabel(saved),
      changes: diff({} as Record<string, unknown>, contractSnapshot(saved), [...CONTRACT_AUDIT_FIELDS]),
    });

    if (previous) {
      // Recorded against the old term as well, so opening it shows it was renewed (FR-REN-07, FR-AUD-11).
      await repos.historyRepo.save(
        ContractStatusHistory.create({
          id: randomUUID(),
          tenantId: input.tenantId,
          contractId: previous.id,
          fromStatus: previous.status,
          toStatus: previous.status,
          changedByUserId: input.actingUserId,
          note: `Renewed into contract ${saved.number ?? saved.id}`,
        })
      );
      await repos.auditTrail.record({
        tenantId: input.tenantId,
        userId: input.actingUserId,
        userRole: input.access.auditRole,
        action: AuditAction.Update,
        entityType: 'Contract',
        entityId: previous.id,
        entityLabel: contractLabel(previous),
        changes: [{ field: 'renewedIntoContractId', old: null, new: saved.id }],
      });
    }

    return { contract: saved };
  }
}

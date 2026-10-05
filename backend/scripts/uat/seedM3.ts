import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaContractNumbers } from '../../src/contracts/infrastructure/PrismaContractNumbers';
import { ContractDocumentStore } from '../../src/contracts/infrastructure/ContractDocumentStore';
import { dayKeyInZone } from '../../src/shared/domain/time/tenantDay';

/**
 * The Milestone 3 staging data (SRS §9.1, plan Slice 15): won deals, contracts
 * in every status, instalments in every payment status, and the volumes the
 * NFR-PERF-04 measurement needs. Straight to the database, like the other
 * bulk and history data in `seedUat.ts`: the API refuses what a UAT needs here
 * (an instalment due yesterday, a contract ending in 25 days, a company with a
 * history already behind it), and 6,000 round trips would take longer than the
 * measurement. Idempotent: each part is skipped when its marker already exists.
 */

/** Marks the named Milestone 3 contracts, so a re-run adds nothing. */
export const M3_PLAN_PREFIX = 'UAT M3 ';
export const M3_COMPANY_NAMES = { A: 'UAT M3 Company A', B: 'UAT M3 Company B' } as const;
export const BULK_CONTRACT_PLAN = 'UAT Bulk Contract';
export const EXAMPLE_PREFIX = 'UAT M3 example ';
export const EXAMPLE_COMPANY = 'UAT M3 Example Company C';
const BULK_INSTALMENT_NOTE = 'UAT bulk instalment';
const BULK_ACTIVITY_PREFIX = 'UAT bulk activity ';
/** The sample signed contract of SRS §9.3, kept as a file so the upload can be tried with a real PDF. */
export const SAMPLE_CONTRACT_PDF = join(__dirname, 'fixtures', 'sample-signed-contract.pdf');

const DAY = 24 * 60 * 60 * 1000;
/** The price of the UAT-1 example: €49.40 a month, €592.80 a year. */
const MONTHLY = '49.40';
const ANNUAL = '592.80';

type Status = 'DRAFT' | 'PENDING_SIGNATURE' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';
type PaymentStatus = 'NOT_INVOICED' | 'INVOICE_ISSUED' | 'PAYMENT_PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';

interface InstalmentSpec {
  /** Days from today; negative is in the past. */
  due: number;
  status: PaymentStatus;
}

interface ContractSpec {
  key: string;
  company: 'A' | 'B';
  status: Status;
  billingPeriod: 'MONTHLY' | 'ANNUAL';
  /** Days from today to the start and to the end date (the last day covered). */
  start: number;
  end: number;
  amount: string;
  instalments: InstalmentSpec[];
  note: string;
}

/** Twelve monthly instalments, one of every payment status, one Payment Pending due yesterday (UAT-3). */
const ACTIVE_LONG_INSTALMENTS: InstalmentSpec[] = [
  { due: -120, status: 'PAID' },
  { due: -90, status: 'PAID' },
  { due: -60, status: 'PARTIALLY_PAID' },
  { due: -45, status: 'OVERDUE' },
  { due: -1, status: 'PAYMENT_PENDING' },
  { due: 20, status: 'INVOICE_ISSUED' },
  ...[50, 80, 110, 140, 170, 200].map((due): InstalmentSpec => ({ due, status: 'NOT_INVOICED' })),
];

/** Ten paid, then one Not Invoiced due yesterday (UAT-3) and one still to come. */
const ENDING_SOON_INSTALMENTS: InstalmentSpec[] = [
  ...Array.from({ length: 10 }, (_, k): InstalmentSpec => ({ due: -340 + 30 * k, status: 'PAID' })),
  { due: -1, status: 'NOT_INVOICED' },
  { due: 24, status: 'NOT_INVOICED' },
];

export const M3_CONTRACTS: ContractSpec[] = [
  { key: 'draft', company: 'A', status: 'DRAFT', billingPeriod: 'MONTHLY', start: 10, end: 374, amount: MONTHLY, instalments: [], note: 'draft' },
  { key: 'pending', company: 'B', status: 'PENDING_SIGNATURE', billingPeriod: 'MONTHLY', start: 5, end: 369, amount: MONTHLY, instalments: [], note: 'pending signature' },
  { key: 'active', company: 'A', status: 'ACTIVE', billingPeriod: 'MONTHLY', start: -150, end: 214, amount: MONTHLY, instalments: ACTIVE_LONG_INSTALMENTS, note: 'active, every payment status' },
  // UAT-7: ends in 25 days, so the 30-day reminder is due and the 7-day one is not.
  { key: 'ending', company: 'B', status: 'ACTIVE', billingPeriod: 'MONTHLY', start: -340, end: 25, amount: MONTHLY, instalments: ENDING_SOON_INSTALMENTS, note: 'ends in 25 days' },
  { key: 'suspended', company: 'A', status: 'SUSPENDED', billingPeriod: 'MONTHLY', start: -90, end: 274, amount: MONTHLY, instalments: [{ due: -60, status: 'PAID' }, { due: -30, status: 'INVOICE_ISSUED' }], note: 'suspended' },
  { key: 'expired', company: 'B', status: 'EXPIRED', billingPeriod: 'ANNUAL', start: -375, end: -10, amount: ANNUAL, instalments: [{ due: -375, status: 'PAID' }], note: 'expired' },
  { key: 'cancelled', company: 'A', status: 'CANCELLED', billingPeriod: 'MONTHLY', start: -60, end: 304, amount: MONTHLY, instalments: [{ due: -60, status: 'PAID' }], note: 'cancelled' },
];

/** The status path a contract took, so its history reads like a real one. */
const PATH: Record<Status, Status[]> = {
  DRAFT: ['DRAFT'],
  PENDING_SIGNATURE: ['DRAFT', 'PENDING_SIGNATURE'],
  ACTIVE: ['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE'],
  SUSPENDED: ['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'SUSPENDED'],
  EXPIRED: ['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'EXPIRED'],
  CANCELLED: ['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'CANCELLED'],
};

export interface SeedM3Options {
  prisma: PrismaClient;
  tenantId: string;
  adminId: string;
  salesA: string;
  salesB: string;
  /** Sales User C, whose only activity is the SRS §5.3 example month: 4 won deals and 6 lost, last month. */
  salesC: string;
  /** Total bulk contracts / instalments / activities wanted for the NFR-PERF-04 measurement; 0 for none. */
  bulkContracts: number;
  bulkInstalments: number;
  bulkActivities: number;
  /** Ids of the bulk companies the bulk rows hang on (empty when none were seeded). */
  bulkCompanyIds: string[];
  log: (line: string) => void;
}

export interface SeedM3Result {
  exampleDealsCreated: number;
  contractsCreated: number;
  instalmentsCreated: number;
  wonDealsCreated: number;
  bulkContractsCreated: number;
  bulkInstalmentsCreated: number;
  bulkActivitiesCreated: number;
}

const utcMidnight = (todayKey: string, days: number) => {
  const [y, m, d] = todayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY);
};

const half = (amount: string) => (Number(amount) / 2).toFixed(2);

/** The receipt a PAID or PARTIALLY_PAID instalment carries, as the history row the receipt use case writes. */
function receiptFor(status: PaymentStatus, amount: string) {
  if (status === 'PAID') return { received: amount, from: 'PAYMENT_PENDING' };
  if (status === 'PARTIALLY_PAID') return { received: half(amount), from: 'PAYMENT_PENDING' };
  return null;
}

/**
 * The Milestone 1 UAT contract of a named company: Active for the calendar year, one annual instalment
 * already paid in full (UAT-1: Reception must not see the amounts). Written to the database because the
 * Wellness Albania workspace runs the sales process, where `POST /contracts` refuses a contract that is
 * not made from a won deal (M3 Slice 4). It has no deal, so it is a Legacy contract, with a number from
 * the same sequence and the sample signed PDF as its document.
 */
export async function seedActiveContract(options: { prisma: PrismaClient; tenantId: string; adminId: string; clientId: string; ownerId: string | null; today: Date }): Promise<string> {
  const { prisma, tenantId, adminId, clientId, ownerId, today } = options;
  const year = today.getUTCFullYear();
  const startsAt = new Date(Date.UTC(year, 0, 1));
  const endsAt = new Date(Date.UTC(year, 11, 31));
  const paidOn = new Date(Date.UTC(year, today.getUTCMonth(), today.getUTCDate()));
  const stored = await new ContractDocumentStore().store(tenantId, 'sample-signed-contract.pdf', readFileSync(SAMPLE_CONTRACT_PDF));
  const contractId = randomUUID();
  await prisma.contract.create({
    data: {
      id: contractId, tenantId, clientId, assignedUserId: ownerId, planName: 'Paketa Wellness UAT', status: 'ACTIVE', amount: '2400.00', billingPeriod: 'ANNUAL',
      startsAt, endsAt, number: await new PrismaContractNumbers(prisma).next(tenantId, today), activatedAt: startsAt, lockedAt: startsAt,
      documentUrl: stored.url, documentName: stored.name, createdByUserId: adminId,
    } as any,
  });
  await prisma.contractDocument.create({ data: { id: randomUUID(), tenantId, contractId, fileName: stored.name, url: stored.url, uploadedByUserId: adminId, isCurrent: true } });
  await prisma.contractStatusHistory.createMany({
    data: [['NONE', 'DRAFT'], ['DRAFT', 'PENDING_SIGNATURE'], ['PENDING_SIGNATURE', 'ACTIVE']].map(([fromStatus, toStatus]) => ({
      id: randomUUID(), tenantId, contractId, fromStatus, toStatus, changedByUserId: adminId, note: 'UAT seed',
    })),
  });
  const paymentId = randomUUID();
  await prisma.contractPayment.create({
    data: {
      id: paymentId, tenantId, contractId, periodIndex: 1, dueDate: new Date(Date.UTC(year, 0, 15)), amount: '2400.00', status: 'PAID', paidAmount: '2400.00',
      paidAt: paidOn, method: 'BANK_TRANSFER', invoiceNumber: `INV-UAT-M1-${contractId.slice(0, 4)}`, invoiceDate: startsAt,
    } as any,
  });
  await prisma.contractPaymentHistory.create({
    data: { id: randomUUID(), tenantId, paymentId, fromStatus: 'PAYMENT_PENDING', toStatus: 'PAID', amountReceived: '2400.00', receivedOn: paidOn, method: 'BANK_TRANSFER', changedByUserId: adminId, comment: 'UAT seed' },
  });
  return contractId;
}

export async function seedM3(options: SeedM3Options): Promise<SeedM3Result> {
  const { prisma, tenantId, adminId, log } = options;
  const result: SeedM3Result = { exampleDealsCreated: 0, contractsCreated: 0, instalmentsCreated: 0, wonDealsCreated: 0, bulkContractsCreated: 0, bulkInstalmentsCreated: 0, bulkActivitiesCreated: 0 };

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true } });
  const todayKey = dayKeyInZone(new Date(), tenant.timezone ?? 'UTC');
  const now = new Date();
  const owners = { A: options.salesA, B: options.salesB };

  // --- The named contracts and their deals, instalments and history -----
  const named = await prisma.contract.count({ where: { tenantId, planName: { startsWith: M3_PLAN_PREFIX } } });
  if (named === 0) {
    const companies = {} as Record<'A' | 'B', string>;
    for (const side of ['A', 'B'] as const) {
      const name = M3_COMPANY_NAMES[side];
      const existing = await prisma.client.findFirst({ where: { tenantId, name, deletedAt: null }, select: { id: true } });
      if (existing) {
        companies[side] = existing.id;
        continue;
      }
      companies[side] = randomUUID();
      await prisma.client.create({
        data: { id: companies[side], tenantId, name, status: 'CLIENT', customFieldValues: {}, lastUpdatedByUserId: adminId, assignedUserId: owners[side] } as any,
      });
    }

    const numbers = new PrismaContractNumbers(prisma);
    const documents = new ContractDocumentStore();
    const pdf = readFileSync(SAMPLE_CONTRACT_PDF);

    for (const spec of M3_CONTRACTS) {
      const owner = owners[spec.company];
      const startsAt = utcMidnight(todayKey, spec.start);
      const endsAt = utcMidnight(todayKey, spec.end);
      const signed = spec.status !== 'DRAFT' && spec.status !== 'PENDING_SIGNATURE';

      // The won deal the contract was made from (FR-CON-01): one per contract, with its history rows.
      const dealId = randomUUID();
      const wonOn = new Date(startsAt.getTime() - 14 * DAY);
      await prisma.deal.create({
        data: {
          id: dealId, tenantId, clientId: companies[spec.company], ownerUserId: owner, createdByUserId: owner, type: 'NEW_CONTRACT', stageKey: 'WON',
          title: `${M3_PLAN_PREFIX}deal (${spec.note})`, createdAt: new Date(wonOn.getTime() - 20 * DAY), updatedAt: wonOn, closedAt: wonOn, wonAt: wonOn,
          agreedMonthlyPrice: MONTHLY, agreedAnnualValue: ANNUAL,
        } as any,
      });
      await prisma.dealStageHistory.create({
        data: { id: randomUUID(), tenantId, dealId, fromStage: 'NEGOTIATION', toStage: 'WON', changedByUserId: owner, ownerUserId: owner, at: wonOn },
      });
      result.wonDealsCreated += 1;

      const contractId = randomUUID();
      const stored = signed ? await documents.store(tenantId, 'sample-signed-contract.pdf', pdf) : null;
      await prisma.contract.create({
        data: {
          id: contractId, tenantId, clientId: companies[spec.company], assignedUserId: owner, planName: `${M3_PLAN_PREFIX}Wellness package (${spec.note})`,
          status: spec.status, amount: spec.amount, billingPeriod: spec.billingPeriod, startsAt, endsAt, dealId,
          number: await numbers.next(tenantId, now), agreedAnnualValue: ANNUAL, renewalDate: endsAt,
          activatedAt: signed ? startsAt : null, lockedAt: spec.status === 'DRAFT' ? null : startsAt,
          suspendedAt: spec.status === 'SUSPENDED' ? utcMidnight(todayKey, -5) : null,
          suspensionReason: spec.status === 'SUSPENDED' ? 'UAT: instalments not settled' : null,
          cancelledAt: spec.status === 'CANCELLED' ? utcMidnight(todayKey, -20) : null,
          cancelReason: spec.status === 'CANCELLED' ? 'UAT: the client withdrew' : null,
          documentUrl: stored?.url ?? null, documentName: stored?.name ?? null,
          notes: `UAT fixture: ${spec.note}.`, createdByUserId: owner,
        } as any,
      });
      if (stored) {
        await prisma.contractDocument.create({ data: { id: randomUUID(), tenantId, contractId, fileName: stored.name, url: stored.url, uploadedByUserId: owner, isCurrent: true } });
      }
      const path = PATH[spec.status];
      await prisma.contractStatusHistory.createMany({
        data: path.map((to, i) => ({
          id: randomUUID(), tenantId, contractId, fromStatus: i === 0 ? 'NONE' : path[i - 1], toStatus: to, changedByUserId: owner,
          note: 'UAT seed', createdAt: new Date(startsAt.getTime() - (path.length - i) * DAY),
        })),
      });
      result.contractsCreated += 1;

      for (const [k, spec2] of spec.instalments.entries()) {
        const paymentId = randomUUID();
        const receipt = receiptFor(spec2.status, spec.amount);
        const dueDate = utcMidnight(todayKey, spec2.due);
        const invoiced = spec2.status !== 'NOT_INVOICED';
        await prisma.contractPayment.create({
          data: {
            id: paymentId, tenantId, contractId, periodIndex: k + 1, dueDate, amount: spec.amount, status: spec2.status,
            paidAmount: receipt?.received ?? '0.00', paidAt: receipt ? dueDate : null, method: receipt ? 'BANK_TRANSFER' : null,
            invoiceNumber: invoiced ? `INV-UAT-${result.contractsCreated}-${k + 1}` : null, invoiceDate: invoiced ? dueDate : null,
            overdueNotifiedAt: spec2.status === 'OVERDUE' ? utcMidnight(todayKey, spec2.due + 1) : null,
          } as any,
        });
        if (receipt) {
          await prisma.contractPaymentHistory.create({
            data: { id: randomUUID(), tenantId, paymentId, fromStatus: receipt.from, toStatus: spec2.status, amountReceived: receipt.received, receivedOn: dueDate, method: 'BANK_TRANSFER', changedByUserId: adminId, comment: 'UAT seed' },
          });
        }
        result.instalmentsCreated += 1;
      }
    }
    log(`m3 + ${result.contractsCreated} contracts (every status), ${result.instalmentsCreated} instalments, ${result.wonDealsCreated} won deals`);
  }

  // --- The conversion-rate example (SRS §5.3, NFR-ACC-04; UAT-5, UAT-6) --
  // Sales User C wins 4 deals worth €592.80, €600.00, €1,200.00 and €480.00 a year and loses 6, all
  // last month: a conversion rate of 40% and a sales value of €2,872.80, on the Performance screen
  // (Last month, filtered to this user) and on the Sales Manager dashboard. Nobody else's deals are
  // in the figure, which is why the example has its own salesperson.
  const exampleDeals = await prisma.deal.count({ where: { tenantId, title: { startsWith: EXAMPLE_PREFIX } } });
  if (exampleDeals === 0) {
    const [year, month] = todayKey.split('-').map(Number);
    const company = randomUUID();
    await prisma.client.create({
      data: { id: company, tenantId, name: EXAMPLE_COMPANY, status: 'CLIENT', customFieldValues: {}, lastUpdatedByUserId: adminId, assignedUserId: options.salesC } as any,
    });
    const closed = [
      ...['592.80', '600.00', '1200.00', '480.00'].map((annual, k) => ({ result: 'WON' as const, annual, n: k, day: 4 + k * 5 })),
      ...Array.from({ length: 6 }, (_, k) => ({ result: 'LOST' as const, annual: null, n: k, day: 3 + k * 4 })),
    ];
    for (const { result: outcome, annual, n, day } of closed) {
      const id = randomUUID();
      const closedOn = new Date(Date.UTC(year, month - 2, day));
      await prisma.deal.create({
        data: {
          id, tenantId, clientId: company, ownerUserId: options.salesC, createdByUserId: options.salesC, type: 'NEW_CONTRACT', stageKey: outcome,
          title: `${EXAMPLE_PREFIX}${outcome.toLowerCase()} ${n + 1}`, createdAt: new Date(closedOn.getTime() - (8 + n) * DAY), updatedAt: closedOn, closedAt: closedOn,
          ...(outcome === 'WON' ? { wonAt: closedOn, agreedAnnualValue: annual, agreedMonthlyPrice: (Number(annual) / 12).toFixed(2) } : { lostAt: closedOn }),
        } as any,
      });
      await prisma.dealStageHistory.create({
        data: { id: randomUUID(), tenantId, dealId: id, fromStage: 'NEGOTIATION', toStage: outcome, changedByUserId: options.salesC, ownerUserId: options.salesC, at: closedOn },
      });
      result.exampleDealsCreated += 1;
    }
    log(`m3 + the 4 won / 6 lost example month for Sales User C (last month)`);
  }

  // --- Bulk contracts and instalments for NFR-PERF-04 --------------------
  const wantedContracts = options.bulkContracts;
  if (wantedContracts > 0) {
    if (options.bulkCompanyIds.length === 0) throw new Error('Bulk contracts need bulk companies: pass --companies as well.');
    const have = await prisma.contract.count({ where: { tenantId, planName: BULK_CONTRACT_PLAN } });
    const missing = wantedContracts - have;
    if (missing > 0) {
      const year = Number(todayKey.slice(0, 4));
      const statuses: Status[] = ['ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'DRAFT', 'CANCELLED'];
      const rows = Array.from({ length: missing }, (_, i) => {
        const n = have + i;
        const status = statuses[n % statuses.length];
        const startsAt = utcMidnight(todayKey, -(n % 330));
        return {
          id: randomUUID(), tenantId, clientId: options.bulkCompanyIds[n % options.bulkCompanyIds.length],
          assignedUserId: n % 2 === 0 ? options.salesA : options.salesB, planName: BULK_CONTRACT_PLAN, status, amount: MONTHLY,
          billingPeriod: 'MONTHLY', startsAt, endsAt: new Date(startsAt.getTime() + 364 * DAY), number: `BLK-${year}-${String(n).padStart(5, '0')}`,
          createdByUserId: adminId, createdAt: now, updatedAt: now,
        };
      });
      for (let i = 0; i < rows.length; i += 1_000) await prisma.contract.createMany({ data: rows.slice(i, i + 1_000) as any });
      result.bulkContractsCreated = missing;
      log(`bulk + ${missing} contracts (now ${wantedContracts})`);
    }
  }

  const wantedInstalments = options.bulkInstalments;
  if (wantedInstalments > 0) {
    const have = await prisma.contractPayment.count({ where: { tenantId, note: BULK_INSTALMENT_NOTE } });
    const missing = wantedInstalments - have;
    // Drafts and cancelled contracts carry no instalments, as in real life.
    const contracts = await prisma.contract.findMany({
      where: { tenantId, planName: BULK_CONTRACT_PLAN, status: { in: ['ACTIVE', 'EXPIRED', 'SUSPENDED'] } },
      select: { id: true, startsAt: true },
      orderBy: { number: 'asc' },
    });
    if (missing > 0 && contracts.length === 0) throw new Error('Bulk instalments need bulk contracts: pass --contracts as well.');
    if (missing > 0) {
      const statusFor = (n: number, due: Date): PaymentStatus => {
        if (due.getTime() > Date.now() + 14 * DAY) return 'NOT_INVOICED';
        if (due.getTime() > Date.now()) return 'INVOICE_ISSUED';
        return (['PAID', 'PAID', 'PAID', 'PAID', 'PAID', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'OVERDUE', 'PAYMENT_PENDING'] as PaymentStatus[])[n % 10];
      };
      const payments = Array.from({ length: missing }, (_, i) => {
        const n = have + i;
        const contract = contracts[n % contracts.length];
        const periodIndex = Math.floor(n / contracts.length) + 1;
        const dueDate = new Date(contract.startsAt.getTime() + 30 * (periodIndex - 1) * DAY);
        const status = statusFor(n, dueDate);
        const receipt = receiptFor(status, MONTHLY);
        return {
          payment: {
            id: randomUUID(), tenantId, contractId: contract.id, periodIndex, dueDate, amount: MONTHLY, status, paidAmount: receipt?.received ?? '0.00',
            paidAt: receipt ? dueDate : null, method: receipt ? 'BANK_TRANSFER' : null, note: BULK_INSTALMENT_NOTE,
            invoiceNumber: status === 'NOT_INVOICED' ? null : `INV-BLK-${n}`, invoiceDate: status === 'NOT_INVOICED' ? null : dueDate,
            createdAt: now, updatedAt: now,
          },
          history: receipt ? { id: randomUUID(), tenantId, fromStatus: receipt.from, toStatus: status, amountReceived: receipt.received, receivedOn: dueDate, method: 'BANK_TRANSFER', changedByUserId: adminId, comment: 'UAT bulk' } : null,
        };
      });
      for (let i = 0; i < payments.length; i += 1_000) {
        const batch = payments.slice(i, i + 1_000);
        await prisma.contractPayment.createMany({ data: batch.map((p) => p.payment) as any });
        const histories = batch.filter((p) => p.history).map((p) => ({ ...p.history!, paymentId: p.payment.id }));
        if (histories.length > 0) await prisma.contractPaymentHistory.createMany({ data: histories as any });
      }
      result.bulkInstalmentsCreated = missing;
      log(`bulk + ${missing} instalments (now ${wantedInstalments})`);
    }
  }

  // --- Bulk activities for NFR-PERF-04 ----------------------------------
  const wantedActivities = options.bulkActivities;
  if (wantedActivities > 0) {
    const have = await prisma.interaction.count({ where: { tenantId, content: { startsWith: BULK_ACTIVITY_PREFIX } } });
    const missing = wantedActivities - have;
    if (missing > 0 && options.bulkCompanyIds.length === 0) throw new Error('Bulk activities need bulk companies: pass --companies as well.');
    if (missing > 0) {
      const channels = ['CALL', 'CALL', 'EMAIL', 'VISIT', 'MEETING', 'ONLINE_MEETING', 'NOTE'];
      const rows = Array.from({ length: missing }, (_, i) => {
        const n = have + i;
        const at = new Date(Date.now() - (n % 90) * DAY - (n % 9) * 60 * 60 * 1000);
        return {
          id: randomUUID(), tenantId, clientId: options.bulkCompanyIds[n % options.bulkCompanyIds.length],
          authorUserId: n % 2 === 0 ? options.salesA : options.salesB, channel: channels[n % channels.length],
          content: `${BULK_ACTIVITY_PREFIX}${n}`, occurredAt: at, createdAt: at,
        };
      });
      for (let i = 0; i < rows.length; i += 2_000) await prisma.interaction.createMany({ data: rows.slice(i, i + 2_000) });
      result.bulkActivitiesCreated = missing;
      log(`bulk + ${missing} activities (now ${wantedActivities})`);
    }
  }

  return result;
}

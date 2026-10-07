import { randomUUID, timingSafeEqual } from 'crypto';
import type { AccessContext } from '../../../access/domain/AccessContext';
import { AuditAction } from '../../../audit/domain/AuditAction';
import { dayKeyInZone } from '../../../shared/domain/time/tenantDay';
import {
  classifyOne,
  classifyRows,
  PREVIEW_LIFETIME_HOURS,
  previewCounts,
  type ImportRow,
  type ImportRowResult,
  type KnownMember,
} from '../../domain/employeeImport';
import { effectiveTierOn } from '../../domain/MemberTerm';
import { EmployeeImportNotFoundError, EmployeeImportRefusedError } from '../employeeImportErrors';
import { termValues } from '../memberPaymentQuote';
import { MEMBERS_IMPORT, MEMBERS_VIEW } from '../membershipPermissions';
import type { EmployeeImportRecord, IEmployeeImportStore, IEmployeeSheetReader, IEmployeeSheetWriter } from '../ports/IEmployeeImportStore';
import type { CardTokenGenerator, IMemberStore, MemberRecord } from '../ports/IMemberStore';
import type { IMemberPaymentStore } from '../ports/IMemberPaymentStore';
import type { IMembershipWriteTransaction } from '../ports/IMembershipWriteTransaction';

/** Writing a thousand members, their terms and history takes longer than the database's default 5 s (NFR-PERF-05: 30 s). */
const CONFIRM_TIMEOUT_MS = 60_000;

const knownFrom = (members: readonly MemberRecord[]): KnownMember[] =>
  members.map((m) => ({ id: m.id, employerClientId: m.employerClientId, status: m.status }));

/** What the screen shows of one row: the person's name and the class, never the identifiers. */
export interface PreviewRow {
  row: number;
  outcome: ImportRow['outcome'];
  reason: string | null;
  name: string | null;
}

export interface EmployeeImportPreview {
  id: string;
  fileName: string;
  confirmToken: string;
  counts: ReturnType<typeof previewCounts>;
  rows: PreviewRow[];
}

export interface EmployeeImportSummary {
  id: string;
  clientId: string;
  fileName: string;
  status: string;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
  confirmedAt: string | null;
  created: number;
  linked: number;
  skipped: number;
  refused: number;
  errors: number;
}

const summary = (record: EmployeeImportRecord, names: Record<string, string>): EmployeeImportSummary => ({
  id: record.id,
  clientId: record.clientId,
  fileName: record.fileName,
  status: record.status,
  uploadedBy: record.uploadedBy,
  uploadedByName: names[record.uploadedBy] ?? null,
  createdAt: record.createdAt.toISOString(),
  confirmedAt: record.confirmedAt?.toISOString() ?? null,
  created: record.created,
  linked: record.linked,
  skipped: record.skipped,
  refused: record.refused,
  errors: record.errors,
});

const NO_VALID_CONTRACT = 'No valid contract: the company needs a valid contract today before its employees can be uploaded.';

/** FR-EMP-02: the template to download. */
export class GetEmployeeTemplateUseCase {
  constructor(private readonly writer: IEmployeeSheetWriter) {}

  async execute(input: { access: AccessContext; language: unknown }): Promise<Buffer> {
    input.access.ensure(MEMBERS_IMPORT);
    return this.writer.template(input.language === 'sq' ? 'sq' : 'en');
  }
}

/**
 * FR-EMP-01..04, FR-EMP-14, D10: reads the file, checks the company and
 * classifies every row. Nothing is created; the parsed rows wait in the upload
 * record until the user confirms or 24 hours pass.
 */
export class PreviewEmployeeImportUseCase {
  constructor(
    private readonly imports: IEmployeeImportStore,
    private readonly members: IMemberStore,
    private readonly payments: IMemberPaymentStore,
    private readonly reader: IEmployeeSheetReader,
    private readonly newToken: CardTokenGenerator,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; timezone: string; clientId: string; fileName: string; file: Buffer | undefined }): Promise<EmployeeImportPreview> {
    input.access.ensure(MEMBERS_IMPORT);
    const today = dayKeyInZone(this.now(), input.timezone);
    if (!input.file) throw new EmployeeImportRefusedError('NO_FILE', 'Choose an Excel .xlsx file.');
    const company = await this.imports.findCompany(input.tenantId, input.clientId);
    if (!company) throw new EmployeeImportRefusedError('COMPANY_NOT_FOUND', 'The company was not found.');
    if (!(await this.payments.employerContractValid(input.tenantId, company.id, today))) {
      throw new EmployeeImportRefusedError('NO_VALID_CONTRACT', NO_VALID_CONTRACT);
    }

    const sheet = await this.reader.read(input.file);
    const rows = await classifyRows(sheet.rows, company.id, today, async (details) => knownFrom(await this.members.findDuplicates(input.tenantId, details)));
    const counts = previewCounts(rows);
    const record = await this.imports.create({
      id: randomUUID(),
      tenantId: input.tenantId,
      clientId: company.id,
      fileName: input.fileName.slice(0, 191) || 'employees.xlsx',
      uploadedBy: input.access.userId,
      rows,
      confirmToken: this.newToken(),
      ...counts,
    });
    return {
      id: record.id,
      fileName: record.fileName,
      confirmToken: record.confirmToken,
      counts,
      rows: rows.map((r) => ({
        row: r.row,
        outcome: r.outcome,
        reason: r.reason,
        name: r.details ? `${r.details.firstName} ${r.details.lastName}` : null,
      })),
    };
  }
}

export interface EmployeeImportOutcome {
  id: string;
  counts: ReturnType<typeof previewCounts>;
  /** The skipped, refused and error rows, with the reason and no personal value (FR-EMP-06). */
  rows: ImportRowResult[];
}

const SKIPPED_OUTCOMES: ReadonlySet<ImportRow['outcome']> = new Set(['SKIPPED', 'REFUSED', 'ERROR']);

/**
 * FR-EMP-05, FR-EMP-14, FR-MPAY-09, FR-TIR-08, FR-AUD-14, D10: creates the new
 * members and links the existing ones in ONE transaction. The upload is claimed
 * first (a second confirmation finds it taken), every row is classified again
 * against the database as it is now, each new member gets a number, a card
 * token, the employer and a sponsored Silver term from today, and each existing
 * member gets the same term, keeping the higher of the tiers they hold (Q10).
 * No payment is created. The parsed rows are cleared and one audit entry holds
 * the company, the file and the counts, with no personal value.
 */
export class ConfirmEmployeeImportUseCase {
  constructor(
    private readonly writeTx: IMembershipWriteTransaction,
    private readonly imports: IEmployeeImportStore,
    private readonly newCardToken: CardTokenGenerator,
    private readonly now: () => Date = () => new Date()
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; timezone: string; importId: string; confirmToken: unknown }): Promise<EmployeeImportOutcome> {
    input.access.ensure(MEMBERS_IMPORT);
    const now = this.now();
    const today = dayKeyInZone(now, input.timezone);

    const upload = await this.imports.find(input.tenantId, input.importId);
    if (!upload) throw new EmployeeImportNotFoundError();
    if (upload.status === 'CONFIRMED') throw new EmployeeImportRefusedError('ALREADY_CONFIRMED', 'This upload was already confirmed.');
    if (upload.status === 'EXPIRED' || now.getTime() - upload.createdAt.getTime() > PREVIEW_LIFETIME_HOURS * 3_600_000) {
      await this.imports.expire(upload.id);
      throw new EmployeeImportRefusedError('EXPIRED', `The preview expired after ${PREVIEW_LIFETIME_HOURS} hours. Upload the file again.`);
    }
    if (!sameToken(upload.confirmToken, input.confirmToken)) throw new EmployeeImportRefusedError('BAD_TOKEN', 'This confirmation does not match the preview.');

    return this.writeTx.run(async ({ importStore, memberStore, memberNumbers, paymentStore, settingsStore, auditTrail }) => {
      if (!(await importStore.claim(input.tenantId, upload.id, now))) {
        throw new EmployeeImportRefusedError('ALREADY_CONFIRMED', 'This upload was already confirmed.');
      }
      const company = await importStore.findCompany(input.tenantId, upload.clientId);
      if (!company) throw new EmployeeImportRefusedError('COMPANY_NOT_FOUND', 'The company was not found.');
      if (!(await paymentStore.employerContractValid(input.tenantId, company.id, today))) {
        throw new EmployeeImportRefusedError('NO_VALID_CONTRACT', NO_VALID_CONTRACT);
      }
      const { graceDays } = (await settingsStore.getSettings(input.tenantId)).toJSON();
      const find = async (details: Parameters<typeof memberStore.findDuplicates>[1]) => knownFrom(await memberStore.findDuplicates(input.tenantId, details));

      const final: ImportRow[] = [];
      for (const row of upload.rows ?? []) {
        if (row.outcome !== 'NEW' && row.outcome !== 'EXISTING') {
          final.push(row);
          continue;
        }
        // A member linked since the preview must not be changed under another transaction.
        if (row.memberId) await paymentStore.lockMember(input.tenantId, row.memberId);
        const again = { row: row.row, ...(await classifyOne(row.details!, company.id, find)) };
        if (again.outcome === 'NEW') {
          const created = await memberStore.create({
            id: randomUUID(),
            tenantId: input.tenantId,
            memberNumber: await memberNumbers.next(input.tenantId),
            cardToken: this.newCardToken(),
            createdBy: input.access.userId,
            startsOn: today,
            details: again.details!,
            employerClientId: company.id,
          });
          await memberStore.addStatusHistory({ memberId: created.id, fromStatus: null, toStatus: 'ACTIVE', reason: null, changedByUserId: input.access.userId });
          await this.sponsor(paymentStore, { tenantId: input.tenantId, userId: input.access.userId, memberId: created.id, tierBefore: 'BRONZE', today, graceDays });
        } else if (again.outcome === 'EXISTING') {
          const member = (await memberStore.find(input.tenantId, again.memberId!)) as MemberRecord;
          await memberStore.setEmployer(input.tenantId, member.id, company.id);
          await this.sponsor(paymentStore, { tenantId: input.tenantId, userId: input.access.userId, memberId: member.id, tierBefore: member.currentTier, today, graceDays });
        }
        final.push(again);
      }

      const counts = previewCounts(final);
      const result: ImportRowResult[] = final
        .filter((r) => SKIPPED_OUTCOMES.has(r.outcome))
        .map((r) => ({ row: r.row, outcome: r.outcome as ImportRowResult['outcome'], reason: r.reason }));
      await importStore.finish(upload.id, { ...counts, result, confirmedAt: now });
      await auditTrail.record({
        tenantId: input.tenantId,
        userId: input.access.userId,
        userRole: input.access.auditRole,
        action: AuditAction.Create,
        entityType: 'Member',
        entityId: upload.id,
        entityLabel: `Employee upload ${upload.fileName}`,
        changes: [
          { field: 'company', old: null, new: company.name },
          { field: 'fileName', old: null, new: upload.fileName },
          { field: 'created', old: null, new: counts.created },
          { field: 'linked', old: null, new: counts.linked },
          { field: 'skipped', old: null, new: counts.skipped },
          { field: 'refused', old: null, new: counts.refused },
          { field: 'errors', old: null, new: counts.errors },
        ],
      });
      return { id: upload.id, counts, rows: result };
    }, { timeoutMs: CONFIRM_TIMEOUT_MS });
  }

  /** A sponsored Silver term from today, no payment, and the tier history when the tier changed (FR-EMP-05, FR-TIR-08). */
  private async sponsor(
    paymentStore: IMemberPaymentStore,
    m: { tenantId: string; userId: string; memberId: string; tierBefore: MemberRecord['currentTier']; today: string; graceDays: number }
  ): Promise<void> {
    await paymentStore.insertTerm({ id: randomUUID(), memberId: m.memberId, tier: 'SILVER', source: 'SPONSORED', startsOn: m.today, endsOn: null, paymentId: null });
    const terms = await paymentStore.listTerms(m.memberId);
    // The contract is valid (checked above), so the sponsored term counts (D8).
    const tier = effectiveTierOn(termValues(terms), true, m.graceDays, new Date(`${m.today}T00:00:00.000Z`));
    if (tier !== m.tierBefore) {
      await paymentStore.setCurrentTier(m.tenantId, m.memberId, tier);
      await paymentStore.addTierHistory({ memberId: m.memberId, fromTier: m.tierBefore, toTier: tier, reason: 'Import', comment: null, changedByUserId: m.userId });
    }
  }
}

const sameToken = (expected: string, given: unknown): boolean => {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** FR-EMP-06: a company's uploads with who, when, file name and counts; the parsed rows are never read. */
export class ListEmployeeImportsUseCase {
  constructor(
    private readonly imports: IEmployeeImportStore,
    private readonly members: IMemberStore
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; clientId: string }): Promise<EmployeeImportSummary[]> {
    if (!input.access.can(MEMBERS_IMPORT) && !input.access.can(MEMBERS_VIEW)) input.access.ensure(MEMBERS_IMPORT);
    const records = await this.imports.listForCompany(input.tenantId, input.clientId);
    const names = await this.members.userNames(input.tenantId, [...new Set(records.map((r) => r.uploadedBy))]);
    return records.map((r) => summary(r, names));
  }
}

/** FR-EMP-06: the Excel file of the skipped, refused and error rows of a confirmed upload. */
export class GetEmployeeImportResultUseCase {
  constructor(
    private readonly imports: IEmployeeImportStore,
    private readonly writer: IEmployeeSheetWriter
  ) {}

  async execute(input: { access: AccessContext; tenantId: string; importId: string }): Promise<{ fileName: string; file: Buffer }> {
    input.access.ensure(MEMBERS_IMPORT);
    const upload = await this.imports.find(input.tenantId, input.importId);
    if (!upload || upload.status !== 'CONFIRMED') throw new EmployeeImportNotFoundError();
    return { fileName: `${upload.fileName.replace(/\.xlsx$/i, '')}-result.xlsx`, file: await this.writer.result(upload.result ?? []) };
  }
}

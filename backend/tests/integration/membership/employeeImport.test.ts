import request from 'supertest';
import express from 'express';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../../src/main/app';
import { JwtTokenService } from '../../../src/auth/infrastructure/JwtTokenService';
import { RoleKey } from '../../../src/access/domain/RoleKey';
import { addDays } from '../../../src/contracts/domain/calendarDay';
import { PrismaTenantDeletionTransaction } from '../../../src/tenant/infrastructure/PrismaTenantDeletionTransaction';
import { PrismaMembershipSeeder } from '../../../src/membership/infrastructure/PrismaMembershipSeeder';
import { PrismaMemberStore } from '../../../src/membership/infrastructure/PrismaMemberStore';
import { PrismaMemberTermJobStore } from '../../../src/membership/infrastructure/PrismaMemberTermJobStore';
import { PrismaMembershipSettingsStore } from '../../../src/membership/infrastructure/PrismaMembershipSettingsStore';
import { PrismaMembershipWriteTransaction } from '../../../src/membership/infrastructure/PrismaMembershipWriteTransaction';
import { ExpireMemberTermsUseCase } from '../../../src/membership/application/use-cases/MemberTermUseCases';
import { PrismaSchedulerQueries } from '../../../src/scheduler/PrismaSchedulerQueries';
import { MemberTermJob } from '../../../src/scheduler/jobs/MemberTermJob';
import { NotificationService } from '../../../src/notifications/application/NotificationService';
import { PrismaNotificationRepository } from '../../../src/notifications/infrastructure/PrismaNotificationRepository';
import { PrismaUserRepository } from '../../../src/auth/infrastructure/repositories/PrismaUserRepository';
import { seedSystemRoles } from '../../support/seedRoles';

const prisma = new PrismaClient();
const tokenService = new JwtTokenService();

const day = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = () => day(new Date());
const plusDays = (iso: string, n: number) => day(addDays(asDate(iso), n));

type Cells = Array<string | { formula: string; result?: string } | null>;
const HEADERS = ['First name*', 'Last name*', 'Date of birth', 'Phone', 'Email', 'Language'];

/** An .xlsx in memory: the header row and one array of cells per data row. */
const workbook = async (rows: Cells[], headers: string[] = HEADERS): Promise<Buffer> => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Employees');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row.map((cell) => (cell === null ? null : typeof cell === 'string' ? cell : { formula: cell.formula, result: cell.result })));
  return Buffer.from(await book.xlsx.writeBuffer());
};

/**
 * M4 Slice 9: corporate employees, upload, preview and confirm (FR-EMP-01..07,
 * FR-EMP-14, FR-MPAY-09, FR-TIR-08, NFR-SEC-09, NFR-PERF-05, D10).
 */
describe('Corporate employee upload (M4 Slice 9)', () => {
  const tenantId = `t-wp-emp-${randomUUID()}`;
  const uid = (label: string) => `u-wpe-${label}-${randomUUID()}`;
  const users = { admin: uid('admin'), importer: uid('importer'), agent: uid('agent'), sales: uid('sales'), reception: uid('reception') };
  type Who = keyof typeof users;
  let app: express.Express;
  const tokens = {} as Record<Who, string>;
  let validCompany: string;
  let expiredCompany: string;
  let otherCompany: string;

  const authed = (who: Who) => (req: request.Test) => req.set('Authorization', `Bearer ${tokens[who]}`);
  const base = `/api/${tenantId}/membership`;
  const preview = (who: Who, clientId: string, file: Buffer, name = 'employees.xlsx') =>
    authed(who)(request(app).post(`${base}/employee-imports`)).field('clientId', clientId).attach('file', file, name);
  const confirm = (who: Who, id: string, confirmToken: string) => authed(who)(request(app).post(`${base}/employee-imports/${id}/confirm`)).send({ confirmToken });
  const uniq = () => randomUUID().slice(0, 8);

  let counter = 0;
  const company = async (name: string, contract: { startsAt: string; endsAt: string; status?: string }[]) => {
    const id = randomUUID();
    const area = await prisma.area.findFirstOrThrow({ where: { tenantId } });
    const city = await prisma.city.findFirstOrThrow({ where: { tenantId } });
    await prisma.client.create({ data: { id, tenantId, name, status: 'CLIENT', areaId: area.id, cityId: city.id, customFieldValues: {}, lastUpdatedByUserId: users.admin } as any });
    for (const c of contract) {
      await prisma.contract.create({
        data: { id: randomUUID(), tenantId, clientId: id, planName: 'Plan', status: c.status ?? 'ACTIVE', amount: '1000.00', billingPeriod: 'ANNUAL', startsAt: asDate(c.startsAt), endsAt: asDate(c.endsAt), createdByUserId: users.admin },
      });
    }
    return id;
  };
  const validContract = [{ startsAt: plusDays(today(), -60), endsAt: plusDays(today(), 300) }];

  const seedMember = async (data: { employerClientId?: string | null; currentTier?: string; email?: string; firstName?: string; lastName?: string } = {}) => {
    counter += 1;
    const id = randomUUID();
    await prisma.member.create({
      data: {
        id, tenantId, memberNumber: `WP-E${String(counter).padStart(5, '0')}-${uniq()}`, firstName: data.firstName ?? 'Seed', lastName: data.lastName ?? `Member${counter}`,
        email: data.email ?? `seed-${uniq()}@example.com`, startsOn: asDate(today()), cardToken: randomUUID(), createdBy: users.admin,
        currentTier: data.currentTier ?? 'BRONZE', employerClientId: data.employerClientId ?? null,
      },
    });
    return id;
  };
  const rowOf = (id: string) => prisma.member.findUniqueOrThrow({ where: { id } });
  const termsOf = (id: string) => prisma.memberTerm.findMany({ where: { memberId: id }, orderBy: { createdAt: 'asc' } });
  const historyOf = (id: string) => prisma.memberTierHistory.findMany({ where: { memberId: id } });
  const memberCount = () => prisma.member.count({ where: { tenantId } });
  const importRow = (id: string) => prisma.employeeImport.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    app = createApp();
    await prisma.tenant.create({ data: { id: tenantId, name: 'Wellness Employee Test', urlSlug: tenantId, timezone: 'UTC' } });
    const roles = await seedSystemRoles(prisma, tenantId);
    const customRole = async (keys: string[]) => {
      const id = `r-${randomUUID()}`;
      await prisma.role.create({
        data: { id, tenantId, key: `k-${randomUUID()}`, nameSq: 'r', nameEn: 'r', isSystem: false, baseKey: RoleKey.Reception, permissions: { create: keys.map((permissionKey) => ({ permissionKey, scope: 'ALL' })) } },
      });
      return id;
    };
    const importerRole = await customRole(['members.view', 'members.import']);
    const agentRole = await customRole(['members.view', 'members.manage']);
    const user = (id: string, roleId: string, firstName: string) => ({ id, email: `${id}@example.com`, hashedPassword: 'x', role: 'STAFF', roleId, tenantId, firstName, lastName: 'Test' });
    await prisma.user.createMany({
      data: [
        user(users.admin, roles[RoleKey.Administrator], 'Ana'),
        user(users.importer, importerRole, 'Ira'),
        user(users.agent, agentRole, 'Mira'),
        user(users.sales, roles[RoleKey.SalesUser], 'Besa'),
        user(users.reception, roles[RoleKey.Reception], 'Gent'),
      ],
    });
    for (const who of Object.keys(users) as Who[]) tokens[who] = tokenService.sign({ userId: users[who], role: 'STAFF', tenantId, tenantSlug: tenantId } as any);
    await new PrismaMembershipSeeder(prisma).seed(tenantId);
    const area = await prisma.area.create({ data: { id: randomUUID(), tenantId, nameSq: 'T', nameEn: 'T', order: 1 } });
    await prisma.city.create({ data: { id: randomUUID(), tenantId, areaId: area.id, nameSq: 'T', nameEn: 'T', order: 1 } });
    validCompany = await company('Valid Co', validContract);
    expiredCompany = await company('Expired Co', [{ startsAt: plusDays(today(), -400), endsAt: plusDays(today(), -35) }]);
    otherCompany = await company('Other Co', validContract);
  });

  afterAll(async () => {
    await new PrismaTenantDeletionTransaction(prisma).run(tenantId);
    await prisma.$disconnect();
  });

  describe('permission and company (FR-EMP-01)', () => {
    it('FR-EMP-01 only a user with "Members: import employees" can use the template, upload, confirm or read the result', async () => {
      const file = await workbook([['Ana', 'One', '', '', `a-${uniq()}@x.al`, '']]);
      for (const who of ['sales', 'reception', 'agent'] as Who[]) {
        await authed(who)(request(app).get(`${base}/employee-template.xlsx`)).expect(403);
        await preview(who, validCompany, file).expect(403);
        await confirm(who, randomUUID(), 'x').expect(403);
        await authed(who)(request(app).get(`${base}/employee-imports/${randomUUID()}/result.xlsx`)).expect(403);
      }
      await authed('importer')(request(app).get(`${base}/employee-template.xlsx`)).expect(200);
    });

    it('FR-EMP-01 a company whose only contract has expired is refused with "No valid contract", and nothing is stored', async () => {
      const before = await prisma.employeeImport.count({ where: { tenantId } });
      const res = await preview('importer', expiredCompany, await workbook([['Ana', 'One', '', '', `a-${uniq()}@x.al`, '']])).expect(409);
      expect(res.body).toMatchObject({ code: 'EMPLOYEE_IMPORT_REFUSED', reason: 'NO_VALID_CONTRACT' });
      expect(res.body.error).toMatch(/No valid contract/);
      expect(await prisma.employeeImport.count({ where: { tenantId } })).toBe(before);
    });

    it('FR-EMP-01 a company with one expired and one valid contract is valid, and an unknown company is not found', async () => {
      const mixed = await company('Mixed Co', [{ startsAt: plusDays(today(), -400), endsAt: plusDays(today(), -35) }, ...validContract]);
      await preview('importer', mixed, await workbook([['Ana', 'One', '', '', `a-${uniq()}@x.al`, '']])).expect(201);
      expect((await preview('importer', randomUUID(), await workbook([['Ana', 'One', '', '', `a-${uniq()}@x.al`, '']])).expect(404)).body.reason).toBe('COMPANY_NOT_FOUND');
    });
  });

  describe('the file (FR-EMP-02, FR-EMP-03, NFR-SEC-09)', () => {
    it('FR-EMP-02 the template has the six columns in English or Albanian', async () => {
      for (const [lang, first] of [['en', 'First name*'], ['sq', 'Emri*']] as const) {
        const res = await authed('importer')(request(app).get(`${base}/employee-template.xlsx?lang=${lang}`)).buffer(true).parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        }).expect(200);
        expect(res.headers['content-type']).toMatch(/spreadsheetml/);
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(res.body);
        const header = book.worksheets[0]!.getRow(1);
        expect(header.getCell(1).value).toBe(first);
        expect(header.cellCount).toBe(6);
      }
    });

    it('FR-EMP-02 Albanian headers are accepted, an empty language is Albanian, and a row without a last name or an identifier is an error with its row number', async () => {
      const email = `sq-${uniq()}@x.al`;
      const file = await workbook(
        [['Ana', 'Hoxha', '14.05.1990', '', email, ''], ['Besa', '', '', '', `b-${uniq()}@x.al`, ''], ['Gent', 'Leka', '', '', '', '']],
        ['Emri*', 'Mbiemri*', 'Data e lindjes', 'Telefoni', 'Email', 'Gjuha']
      );
      const { data } = (await preview('importer', validCompany, file).expect(201)).body;
      expect(data.rows.map((r: any) => [r.row, r.outcome])).toEqual([[2, 'NEW'], [3, 'ERROR'], [4, 'ERROR']]);
      expect(data.rows[1].reason).toMatch(/last name|name is required/i);
      const stored = (await importRow(data.id)).rows as any[];
      expect(stored[0].details).toMatchObject({ dateOfBirth: '1990-05-14', language: 'sq', email });
    });

    it('FR-EMP-03 a renamed .exe, a CSV and a .xlsm are refused by content, whatever the name', async () => {
      const exe = Buffer.from('MZ\x90\x00 not a workbook');
      expect((await preview('importer', validCompany, exe, 'employees.xlsx').expect(400)).body.reason).toBe('NOT_XLSX');
      expect((await preview('importer', validCompany, Buffer.from('First name*,Last name*\nAna,One\n'), 'employees.xlsx').expect(400)).body.reason).toBe('NOT_XLSX');

      const zip = await JSZip.loadAsync(await workbook([['Ana', 'One', '', '', `a-${uniq()}@x.al`, '']]));
      zip.file('xl/vbaProject.bin', Buffer.from('macro'));
      const macro = await zip.generateAsync({ type: 'nodebuffer' });
      expect((await preview('importer', validCompany, macro, 'employees.xlsx').expect(400)).body.reason).toBe('HAS_MACROS');
    });

    it('FR-EMP-03 a file with 1,001 rows is refused with the limit stated, and one over 2 MB is refused', async () => {
      const rows: Cells[] = Array.from({ length: 1001 }, (_, i) => ['Ana', `Row${i}`, '', '', `r${i}-${uniq()}@x.al`, '']);
      const res = await preview('importer', validCompany, await workbook(rows)).expect(400);
      expect(res.body.reason).toBe('TOO_MANY_ROWS');
      expect(res.body.error).toMatch(/1000/);
      const big = await preview('importer', validCompany, Buffer.alloc(2 * 1024 * 1024 + 10, 1)).expect(413);
      expect(big.body.reason).toBe('TOO_LARGE');
    });

    it('FR-EMP-03, NFR-SEC-09 a missing name column is refused, blank rows are ignored and a =HYPERLINK cell is read as plain text, never followed', async () => {
      const noName = await workbook([['Ana', '', '', `a-${uniq()}@x.al`]], ['First name*', 'Date of birth', 'Phone', 'Email']);
      expect((await preview('importer', validCompany, noName).expect(400)).body.reason).toBe('MISSING_COLUMNS');

      const email = `h-${uniq()}@x.al`;
      const file = await workbook([
        [null, null, null, null, null, null],
        ['Ana', { formula: 'HYPERLINK("http://evil.example/x","Hoxha")', result: 'Hoxha' }, '', '', email, ''],
        ['Besa', { formula: 'HYPERLINK("http://evil.example/x","never")' }, '', '', `b-${uniq()}@x.al`, ''],
      ]);
      const { data } = (await preview('importer', validCompany, file).expect(201)).body;
      expect(data.rows).toHaveLength(2);
      expect(data.rows[0]).toMatchObject({ row: 3, outcome: 'NEW', name: 'Ana Hoxha' });
      expect(data.rows[1]).toMatchObject({ row: 4, outcome: 'ERROR' });
    });
  });

  describe('preview and confirm (FR-EMP-04, FR-EMP-05, FR-EMP-07, FR-EMP-14, FR-MPAY-09)', () => {
    it('FR-EMP-04, FR-EMP-05, FR-EMP-06, FR-EMP-07 UAT-1: 2 New, 1 Existing, 1 Skipped, 1 Error; nothing created before confirming; then 2 Silver members, a link, a result file, history, no payment; the second upload is all Skipped', async () => {
      const company1 = await company('Uat Co', validContract);
      const existing = await seedMember({ email: `ex-${uniq()}@x.al`, firstName: 'Eva', lastName: 'Existing' });
      const exEmail = (await rowOf(existing)).email!;
      const a = `a-${uniq()}@x.al`;
      const b = `b-${uniq()}@x.al`;
      const file = await workbook([
        ['Ana', 'Alpha', '', '', a, 'en'],
        ['Besa', 'Beta', '', '', b, ''],
        ['Besa', 'Beta', '', '', b.toUpperCase(), ''],
        ['Eva', 'Existing', '', '', exEmail, ''],
        ['Gent', 'Gamma', '', '', '', ''],
      ]);
      const membersBefore = await memberCount();
      const termsBefore = await prisma.memberTerm.count({ where: { member: { tenantId } } });

      const { data } = (await preview('importer', company1, file, 'uat.xlsx').expect(201)).body;
      expect(data.counts).toEqual({ created: 2, linked: 1, skipped: 1, refused: 0, errors: 1 });
      expect(data.rows.map((r: any) => r.outcome)).toEqual(['NEW', 'NEW', 'SKIPPED', 'EXISTING', 'ERROR']);
      expect(JSON.stringify(data)).not.toContain(exEmail);
      expect(await memberCount()).toBe(membersBefore);
      expect(await prisma.memberTerm.count({ where: { member: { tenantId } } })).toBe(termsBefore);
      expect((await rowOf(existing)).employerClientId).toBeNull();

      const confirmed = (await confirm('importer', data.id, data.confirmToken).expect(200)).body.data;
      expect(confirmed.counts).toEqual({ created: 2, linked: 1, skipped: 1, refused: 0, errors: 1 });
      expect(confirmed.rows.map((r: any) => [r.row, r.outcome])).toEqual([[4, 'SKIPPED'], [6, 'ERROR']]);

      const created = await prisma.member.findMany({ where: { tenantId, email: { in: [a, b] } }, orderBy: { email: 'asc' } });
      expect(created).toHaveLength(2);
      for (const member of created) {
        expect(member).toMatchObject({ currentTier: 'SILVER', employerClientId: company1, status: 'ACTIVE', language: member.email === a ? 'en' : 'sq' });
        expect(member.memberNumber).toMatch(/^WP-\d{6}$/);
        expect(member.cardToken.length).toBeGreaterThanOrEqual(32);
        const [term] = await termsOf(member.id);
        expect(term).toMatchObject({ tier: 'SILVER', source: 'SPONSORED', endsOn: null, paymentId: null });
        expect(day(term!.startsOn)).toBe(today());
        expect((await historyOf(member.id)).map((h) => [h.fromTier, h.toTier, h.reason, h.changedByUserId])).toEqual([['BRONZE', 'SILVER', 'Import', users.importer]]);
      }
      expect(new Set(created.map((m) => m.memberNumber)).size).toBe(2);
      expect(await rowOf(existing)).toMatchObject({ employerClientId: company1, currentTier: 'SILVER' });
      expect((await termsOf(existing)).map((t) => t.source)).toEqual(['SPONSORED']);

      // FR-MPAY-09: members and terms, and no payment.
      expect(await prisma.memberPayment.count({ where: { tenantId, memberId: { in: [...created.map((m) => m.id), existing] } } })).toBe(0);

      // D10: the parsed rows are gone, the counts stay. FR-AUD-14: one audit entry, no personal value.
      const stored = await importRow(data.id);
      expect(stored).toMatchObject({ status: 'CONFIRMED', rows: null, created: 2, linked: 1, skipped: 1, errors: 1, fileName: 'uat.xlsx', uploadedBy: users.importer });
      expect(JSON.stringify(stored.result)).not.toMatch(/@x\.al|Alpha|Beta|Existing/);
      const audit = await prisma.auditEntry.findMany({ where: { tenantId, entityType: 'Member', entityId: data.id } });
      expect(audit).toHaveLength(1);
      expect(JSON.stringify(audit[0])).not.toMatch(/@x\.al|Alpha|Beta|Existing|Gamma/);
      expect(JSON.stringify(audit[0])).toContain('uat.xlsx');

      // FR-EMP-06: the result file and the history with counts.
      const result = await authed('importer')(request(app).get(`${base}/employee-imports/${data.id}/result.xlsx`)).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(result.body);
      const lines = book.worksheets[0]!.getSheetValues().slice(2).map((v: any) => [v[1], v[2], v[3]]);
      expect(lines).toEqual([[4, 'Skipped', 'Repeated in the file'], [6, 'Error', expect.stringMatching(/date of birth, a phone number or an email/)]]);
      const history = (await authed('importer')(request(app).get(`${base}/employee-imports?clientId=${company1}`)).expect(200)).body.data;
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ fileName: 'uat.xlsx', status: 'CONFIRMED', created: 2, linked: 1, skipped: 1, errors: 1, uploadedByName: 'Ira Test' });
      expect(history[0].rows).toBeUndefined();

      // FR-EMP-07: the same file again creates nothing; every row that was valid is Already linked.
      const again = (await preview('importer', company1, file, 'uat.xlsx').expect(201)).body.data;
      expect(again.rows.map((r: any) => [r.outcome, r.reason])).toEqual([
        ['SKIPPED', 'Already linked to this company'],
        ['SKIPPED', 'Already linked to this company'],
        ['SKIPPED', 'Repeated in the file'],
        ['SKIPPED', 'Already linked to this company'],
        ['ERROR', expect.any(String)],
      ]);
      expect(again.counts).toMatchObject({ created: 0, linked: 0 });
      await confirm('importer', again.id, again.confirmToken).expect(200);
      expect(await memberCount()).toBe(membersBefore + 2);
    });

    it('FR-EMP-14, FR-EMP-06 a member linked to another company is refused with "Linked to another company", listed in the result file, and not changed', async () => {
      const elsewhere = await seedMember({ employerClientId: otherCompany, currentTier: 'SILVER' });
      const email = (await rowOf(elsewhere)).email!;
      const { data } = (await preview('importer', validCompany, await workbook([['Seed', 'Elsewhere', '', '', email, '']])).expect(201)).body;
      expect(data.rows[0]).toMatchObject({ outcome: 'REFUSED', reason: 'Linked to another company' });
      expect(data.counts).toMatchObject({ refused: 1, created: 0, linked: 0 });
      const confirmed = (await confirm('importer', data.id, data.confirmToken).expect(200)).body.data;
      expect(confirmed.rows).toEqual([{ row: 2, outcome: 'REFUSED', reason: 'Linked to another company' }]);
      expect((await rowOf(elsewhere)).employerClientId).toBe(otherCompany);
      expect(await termsOf(elsewhere)).toHaveLength(0);
    });

    it('FR-EMP-05 an existing Gold member keeps Gold, with the sponsored Silver term added and no history row (Q10)', async () => {
      const goldId = await seedMember({ currentTier: 'GOLD' });
      await prisma.memberTerm.create({ data: { id: randomUUID(), memberId: goldId, tier: 'GOLD', source: 'PAID', startsOn: asDate(plusDays(today(), -10)), endsOn: asDate(plusDays(today(), 300)) } });
      const email = (await rowOf(goldId)).email!;
      const { data } = (await preview('importer', validCompany, await workbook([['Seed', 'Gold', '', '', email, '']])).expect(201)).body;
      await confirm('importer', data.id, data.confirmToken).expect(200);
      expect(await rowOf(goldId)).toMatchObject({ currentTier: 'GOLD', employerClientId: validCompany });
      expect((await termsOf(goldId)).map((t) => t.source).sort()).toEqual(['PAID', 'SPONSORED']);
      expect(await historyOf(goldId)).toHaveLength(0);
    });

    it('FR-EMP-05 a forced failure on row 3 leaves no member, no term, and the upload still waiting to be confirmed', async () => {
      const company2 = await company('Rollback Co', validContract);
      const file = await workbook(Array.from({ length: 4 }, (_, i) => ['Ana', `Roll${i}`, '', '', `roll${i}-${uniq()}@x.al`, '']));
      const { data } = (await preview('importer', company2, file).expect(201)).body;
      const membersBefore = await memberCount();
      const termsBefore = await prisma.memberTerm.count({ where: { member: { tenantId } } });

      const original = PrismaMemberStore.prototype.create;
      let calls = 0;
      const spy = jest.spyOn(PrismaMemberStore.prototype, 'create').mockImplementation(function (this: PrismaMemberStore, ...args) {
        calls += 1;
        if (calls === 3) throw new Error('forced failure on row 3');
        return original.apply(this, args);
      });
      try {
        await confirm('importer', data.id, data.confirmToken).expect(500);
      } finally {
        spy.mockRestore();
      }
      expect(calls).toBe(3);
      expect(await memberCount()).toBe(membersBefore);
      expect(await prisma.memberTerm.count({ where: { member: { tenantId } } })).toBe(termsBefore);
      expect(await importRow(data.id)).toMatchObject({ status: 'PREVIEWED', confirmedAt: null });
      expect(await prisma.documentSequence.findFirst({ where: { tenantId, kind: 'MEMBER' } })).not.toBeNull();

      // The upload is still valid: confirming again, now that nothing fails, creates all four.
      await confirm('importer', data.id, data.confirmToken).expect(200);
      expect(await memberCount()).toBe(membersBefore + 4);
    });

    it('FR-EMP-05 a row that became refused between preview and confirmation is reported, not created, and the rest are created', async () => {
      const company3 = await company('Race Co', validContract);
      const racer = `race-${uniq()}@x.al`;
      const fine = `fine-${uniq()}@x.al`;
      const { data } = (await preview('importer', company3, await workbook([['Rae', 'Racer', '', '', racer, ''], ['Fin', 'Fine', '', '', fine, '']])).expect(201)).body;
      expect(data.counts.created).toBe(2);
      await seedMember({ email: racer, firstName: 'Rae', lastName: 'Racer', employerClientId: otherCompany });

      const confirmed = (await confirm('importer', data.id, data.confirmToken).expect(200)).body.data;
      expect(confirmed.counts).toMatchObject({ created: 1, linked: 0, refused: 1 });
      expect(confirmed.rows).toEqual([{ row: 2, outcome: 'REFUSED', reason: 'Linked to another company' }]);
      expect(await prisma.member.count({ where: { tenantId, email: fine, employerClientId: company3 } })).toBe(1);
      expect(await prisma.member.count({ where: { tenantId, email: racer } })).toBe(1);
    });

    it('FR-EMP-05 an upload is confirmed once, needs its own token, and refuses a contract that ended since the preview', async () => {
      const company4 = await company('Token Co', validContract);
      const { data } = (await preview('importer', company4, await workbook([['Tia', 'Token', '', '', `t-${uniq()}@x.al`, '']])).expect(201)).body;
      expect((await confirm('importer', data.id, 'wrong-token').expect(400)).body.reason).toBe('BAD_TOKEN');
      await authed('importer')(request(app).post(`${base}/employee-imports/${data.id}/confirm`)).send({}).expect(400);
      await authed('importer')(request(app).post(`${base}/employee-imports/${data.id}/confirm`)).send({ confirmToken: data.confirmToken, extra: 1 }).expect(400);
      await confirm('importer', randomUUID(), data.confirmToken).expect(404);

      const results = await Promise.all([confirm('importer', data.id, data.confirmToken), confirm('importer', data.id, data.confirmToken)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await confirm('importer', data.id, data.confirmToken).expect(409)).body.reason).toBe('ALREADY_CONFIRMED');

      const company5 = await company('Ended Co', validContract);
      const second = (await preview('importer', company5, await workbook([['Una', 'Ended', '', '', `u-${uniq()}@x.al`, '']])).expect(201)).body.data;
      await prisma.contract.updateMany({ where: { clientId: company5 }, data: { endsAt: asDate(plusDays(today(), -1)) } });
      expect((await confirm('importer', second.id, second.confirmToken).expect(409)).body.reason).toBe('NO_VALID_CONTRACT');
      expect(await prisma.member.count({ where: { tenantId, lastName: 'Ended' } })).toBe(0);
    });
  });

  describe('personal data is not kept (D10, FR-DPR-03)', () => {
    class ThisTenantQueries extends PrismaSchedulerQueries {
      async listTenants() {
        return (await super.listTenants()).filter((tenant) => tenant.id === tenantId);
      }
    }
    const job = () =>
      new MemberTermJob(
        new ThisTenantQueries(prisma),
        new PrismaMemberTermJobStore(prisma),
        new PrismaMembershipSettingsStore(prisma),
        new ExpireMemberTermsUseCase(new PrismaMembershipWriteTransaction(prisma)),
        new NotificationService(new PrismaNotificationRepository(prisma), new PrismaUserRepository(prisma))
      );

    it('D10 the daily job clears the rows of an upload nobody confirmed in 24 hours, once, and the upload can no longer be confirmed', async () => {
      const company6 = await company('Stale Co', validContract);
      const stale = (await preview('importer', company6, await workbook([['Sam', 'Stale', '', '', `s-${uniq()}@x.al`, '']])).expect(201)).body.data;
      const fresh = (await preview('importer', company6, await workbook([['Fay', 'Fresh', '', '', `f-${uniq()}@x.al`, '']])).expect(201)).body.data;
      await prisma.employeeImport.update({ where: { id: stale.id }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } });

      await job().run(new Date());
      expect(await importRow(stale.id)).toMatchObject({ status: 'EXPIRED', rows: null });
      expect((await importRow(fresh.id)).rows).not.toBeNull();
      const second = await job().run(new Date());
      expect(second).toMatch(/0 member/);

      expect((await confirm('importer', stale.id, stale.confirmToken).expect(410)).body.reason).toBe('EXPIRED');
      expect(await prisma.member.count({ where: { tenantId, lastName: 'Stale' } })).toBe(0);
    });

    it('D10 confirming an upload older than 24 hours is refused and clears its rows even before the job runs', async () => {
      const company7 = await company('Late Co', validContract);
      const late = (await preview('importer', company7, await workbook([['Lia', 'Late', '', '', `l-${uniq()}@x.al`, '']])).expect(201)).body.data;
      await prisma.employeeImport.update({ where: { id: late.id }, data: { createdAt: new Date(Date.now() - 25 * 3_600_000) } });
      expect((await confirm('importer', late.id, late.confirmToken).expect(410)).body.reason).toBe('EXPIRED');
      expect(await importRow(late.id)).toMatchObject({ status: 'EXPIRED', rows: null });
    });
  });

  describe('speed (NFR-PERF-05)', () => {
    it('NFR-PERF-05 a 1,000-row preview takes under 15 s and its confirmation under 30 s', async () => {
      const company8 = await company('Big Co', validContract);
      const rows: Cells[] = Array.from({ length: 1000 }, (_, i) => ['Big', `Employee${i}`, '', '', `big${i}-${uniq()}@x.al`, '']);
      const file = await workbook(rows);

      const t0 = Date.now();
      const { data } = (await preview('importer', company8, file).expect(201)).body;
      const previewMs = Date.now() - t0;
      expect(data.counts.created).toBe(1000);
      expect(previewMs).toBeLessThan(15_000);

      const t1 = Date.now();
      await confirm('importer', data.id, data.confirmToken).expect(200);
      const confirmMs = Date.now() - t1;
      expect(confirmMs).toBeLessThan(30_000);
      expect(await prisma.member.count({ where: { tenantId, employerClientId: company8, currentTier: 'SILVER' } })).toBe(1000);
      // eslint-disable-next-line no-console
      console.log(`NFR-PERF-05: preview ${previewMs} ms, confirm ${confirmMs} ms`);
    }, 120_000);
  });
});

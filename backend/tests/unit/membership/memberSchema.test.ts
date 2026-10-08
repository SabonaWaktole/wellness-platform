import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '@prisma/client';
import { addFamilySchema, correctTierSchema, recordPaymentSchema, vipDecisionSchema, vipEndSchema, vipRequestSchema, registerSchema, statusSchema, updateSchema } from '../../../src/membership/interfaces/http/memberRoutes';

const prismaDir = path.join(__dirname, '../../../prisma');
const read = (...parts: string[]) => fs.readFileSync(path.join(prismaDir, ...parts), 'utf8');

/**
 * The Member columns of FR-MEM-02, plus the keys the later slices link through
 * (employer, family, card) and the audit columns. Anything else fails the test:
 * a medical, address, photograph or national-ID column cannot be added without
 * changing this list in a reviewed commit (FR-DPR-01, FR-DPR-03, plan rule 9).
 */
const ALLOWED_MEMBER_COLUMNS = [
  'id', 'tenantId', 'memberNumber', 'firstName', 'lastName', 'dateOfBirth', 'phone', 'email', 'language', 'cityId', 'status', 'currentTier',
  'startsOn', 'employerClientId', 'formerEmployerClientId', 'leftCompanyAt', 'principalMemberId', 'relationshipId', 'relationshipConfirmedBy',
  'relationshipConfirmedAt', 'cardToken', 'note', 'createdBy', 'createdAt', 'closedAt', 'anonymisedAt',
];
const FORBIDDEN = /diagnos|medical|health|result|allerg|address|street|photo|image|avatar|nationalid|passport|idnumber|personalnumber|nid/i;

const modelBlock = (schema: string, name: string): string => {
  const start = schema.indexOf(`model ${name} {`);
  return schema.slice(start, schema.indexOf('\n}\n', start) + 3);
};
const MEMBER_MODELS = ['Member', 'MemberTerm', 'MemberTierHistory', 'MemberStatusHistory'];

describe('the member tables', () => {
  const model = (name: string) => Prisma.dmmf.datamodel.models.find((m) => m.name === name)!;
  const columns = (name: string) => model(name).fields.filter((f) => f.kind !== 'object').map((f) => f.name);

  it('FR-DPR-01, FR-DPR-03 the Member columns are exactly the FR-MEM-02 list, and none looks medical, an address, a photograph or a national ID', () => {
    expect(columns('Member').sort()).toEqual([...ALLOWED_MEMBER_COLUMNS].sort());
    for (const name of MEMBER_MODELS) {
      for (const column of columns(name)) expect([name, column, FORBIDDEN.test(column)]).toEqual([name, column, false]);
    }
  });

  it('FR-MEM-02 the Member columns include every field the SRS names', () => {
    for (const field of ['memberNumber', 'firstName', 'lastName', 'dateOfBirth', 'phone', 'email', 'language', 'cityId', 'currentTier', 'status', 'startsOn', 'employerClientId', 'note', 'createdBy', 'createdAt']) {
      expect(columns('Member')).toContain(field);
    }
  });

  it('NFR-DAT-02 one member number per workspace, one card token and one downgrade term per ended term', () => {
    const member = model('Member');
    expect(member.uniqueIndexes.map((i) => i.fields.join('+')).sort()).toEqual(['tenantId+memberNumber']);
    expect(member.fields.find((f) => f.name === 'cardToken')!.isUnique).toBe(true);
    expect(model('MemberTerm').fields.find((f) => f.name === 'followsTermId')!.isUnique).toBe(true);
  });

  it('NFR-PERF-05 the list indexes of the plan exist', () => {
    const postgres = read('schema.prisma');
    for (const index of ['lastName, firstName', 'currentTier, status', 'employerClientId', 'email', 'phone', 'dateOfBirth']) {
      expect(modelBlock(postgres, 'Member')).toContain(`@@index([tenantId, ${index}])`);
    }
  });

  it('NFR-OPS-04 the two Prisma schemas hold the same four models, apart from the @db.Text annotations', () => {
    const normal = (block: string) => block.replace(/\s+/g, ' ');
    for (const name of MEMBER_MODELS) {
      expect(normal(modelBlock(read('schema.mysql.prisma'), name))).toEqual(normal(modelBlock(read('schema.prisma'), name)));
    }
  });

  it('NFR-OPS-04 the Postgres migration, the MySQL script and the combined upgrade each create the four tables, guarded and empty', () => {
    const postgres = read('migrations', '20261019100000_m4_members', 'migration.sql');
    const mysql = read('mysql_migration_m4_members.sql');
    const upgrade = read('mysql_upgrade_to_current.sql');
    for (const name of MEMBER_MODELS) {
      expect(postgres).toContain(`CREATE TABLE "${name}"`);
      expect(mysql).toContain(`CREATE TABLE IF NOT EXISTS \`${name}\``);
      expect(upgrade).toContain(`CREATE TABLE IF NOT EXISTS \`${name}\``);
    }
    for (const sql of [postgres, mysql]) {
      expect(sql).not.toMatch(/INSERT INTO "?`?(Member|MemberTerm|MemberTierHistory|MemberStatusHistory)/);
    }
    // Every foreign key of the MySQL script is guarded by information_schema, so a second run changes nothing.
    expect((mysql.match(/ADD CONSTRAINT/g) ?? []).length).toBe((mysql.match(/information_schema\.TABLE_CONSTRAINTS/g) ?? []).length);
    expect(upgrade).toContain("'20261019100000_m4_members'");
  });
});

describe('the daily member job column (M4 Slice 8)', () => {
  const column = Prisma.dmmf.datamodel.models.find((m) => m.name === 'MemberTerm')!.fields.find((f) => f.name === 'expiringNotifiedAt');

  it('FR-TIR-11 MemberTerm.expiringNotifiedAt is an optional date in both schemas, so existing rows keep NULL', () => {
    expect(column).toMatchObject({ type: 'DateTime', isRequired: false });
    expect(modelBlock(read('schema.mysql.prisma'), 'MemberTerm')).toContain('expiringNotifiedAt     DateTime?');
  });

  it('NFR-OPS-04 the Postgres migration, the MySQL script and the combined upgrade add it, guarded and without touching a row', () => {
    const postgres = read('migrations', '20261023100000_m4_member_term_job', 'migration.sql');
    const mysql = read('mysql_migration_m4_member_term_job.sql');
    const upgrade = read('mysql_upgrade_to_current.sql');
    expect(postgres).toContain('ALTER TABLE "MemberTerm" ADD COLUMN "expiringNotifiedAt" TIMESTAMP(3);');
    for (const sql of [mysql, upgrade]) {
      expect(sql).toContain('ALTER TABLE `MemberTerm` ADD COLUMN `expiringNotifiedAt` DATETIME(3) NULL');
      expect(sql).toContain("COLUMN_NAME = 'expiringNotifiedAt'");
      expect(sql).toContain("'20261023100000_m4_member_term_job'");
    }
    for (const sql of [postgres, mysql]) expect(sql).not.toMatch(/\b(UPDATE|DELETE|INSERT INTO "?`?Member)/);
  });
});

describe('the member request schemas', () => {
  const keysOf = (schema: { shape: Record<string, unknown> }) => Object.keys(schema.shape);
  const FORBIDDEN_KEYS = ['tier', 'currentTier', 'expiresOn', 'endsOn', 'startsOn', 'memberNumber', 'status', 'cardToken', 'createdBy', 'id', 'tenantId', 'principalMemberId', 'employerClientId'];

  it('FR-MEM-09, NFR-SEC-07 no request schema has a key for the tier, an expiry date, the member ID, the status or the token', () => {
    for (const schema of [registerSchema, updateSchema]) {
      for (const key of FORBIDDEN_KEYS) expect(keysOf(schema)).not.toContain(key);
    }
    // The status route takes an action and a reason, never a status.
    expect(keysOf(statusSchema).sort()).toEqual(['action', 'reason']);
  });

  it('FR-TIR-09 the one request that carries a tier is the Administrator correction, and it carries only the tier, the end date and the reason', () => {
    expect(keysOf(correctTierSchema).sort()).toEqual(['endsOn', 'reason', 'tier']);
    expect(correctTierSchema.safeParse({ tier: 'GOLD', endsOn: '2999-01-01', reason: 'x', memberNumber: 'WP-1' }).success).toBe(false);
  });

  it('FR-MEM-09 the schemas are strict, so an unknown key is refused rather than dropped', () => {
    expect(registerSchema.safeParse({ firstName: 'A', lastName: 'B', tier: 'GOLD' }).success).toBe(false);
    expect(updateSchema.safeParse({ firstName: 'A', memberNumber: 'WP-1' }).success).toBe(false);
    expect(registerSchema.safeParse({ firstName: 'A', lastName: 'B' }).success).toBe(true);
  });
});

describe('the payment table (M4 Slice 5)', () => {
  const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'MemberPayment')!;
  const field = (name: string) => model.fields.find((f) => f.name === name)!;

  it('NFR-ACC-05 money is Decimal and the discount is Decimal, never a float', () => {
    for (const name of ['listFee', 'amount', 'discountPercent']) expect(field(name).type).toBe('Decimal');
    const postgres = read('schema.prisma');
    expect(modelBlock(postgres, 'MemberPayment')).toMatch(/listFee\s+Decimal\s+@db\.Decimal\(12, 2\)/);
    expect(modelBlock(postgres, 'MemberPayment')).toMatch(/amount\s+Decimal\s+@db\.Decimal\(12, 2\)/);
    expect(modelBlock(postgres, 'MemberPayment')).toMatch(/discountPercent\s+Decimal\s+@db\.Decimal\(7, 2\)/);
  });

  it('FR-MPAY-10 a payment stores the list fee, the discount and the amount, and is voided by three columns only', () => {
    const columns = model.fields.filter((f) => f.kind !== 'object').map((f) => f.name);
    for (const name of ['listFee', 'discountPercent', 'amount', 'receiptNumber', 'voidedAt', 'voidedBy', 'voidReason']) expect(columns).toContain(name);
  });

  it('NFR-DAT-02 one receipt number per workspace', () => {
    expect(model.uniqueIndexes.map((i) => i.fields.join('+'))).toEqual(['tenantId+receiptNumber']);
  });

  it('NFR-OPS-04 the two Prisma schemas hold the same model, apart from the @db.Text annotations', () => {
    const normal = (block: string) => block.replace(/\s+/g, ' ');
    expect(normal(modelBlock(read('schema.mysql.prisma'), 'MemberPayment'))).toEqual(normal(modelBlock(read('schema.prisma'), 'MemberPayment')));
  });

  it('NFR-OPS-04 the Postgres migration, the MySQL script and the combined upgrade each create the table, guarded and empty', () => {
    const postgres = read('migrations', '20261020100000_m4_member_payments', 'migration.sql');
    const mysql = read('mysql_migration_m4_member_payments.sql');
    const upgrade = read('mysql_upgrade_to_current.sql');
    expect(postgres).toContain('CREATE TABLE "MemberPayment"');
    expect(postgres).toContain('"amount" DECIMAL(12,2) NOT NULL');
    expect(mysql).toContain('CREATE TABLE IF NOT EXISTS `MemberPayment`');
    expect(upgrade).toContain('CREATE TABLE IF NOT EXISTS `MemberPayment`');
    for (const sql of [postgres, mysql]) expect(sql).not.toMatch(/INSERT INTO "?`?MemberPayment/);
    expect((mysql.match(/ADD CONSTRAINT/g) ?? []).length).toBe((mysql.match(/information_schema\.TABLE_CONSTRAINTS/g) ?? []).length);
    expect(upgrade).toContain("'20261020100000_m4_member_payments'");
    expect(upgrade).toContain("'MemberPayment table'");
  });
});

describe('the payment request schema', () => {
  it('FR-MPAY-01, NFR-SEC-07 has no key for an amount, a fee, a discount, a receipt number, a term date or a from-tier', () => {
    const keys = Object.keys(recordPaymentSchema.shape);
    for (const forbidden of ['amount', 'listFee', 'discountPercent', 'receiptNumber', 'startsOn', 'endsOn', 'fromTier', 'recordedBy', 'memberId']) {
      expect(keys).not.toContain(forbidden);
    }
    expect(recordPaymentSchema.safeParse({ kind: 'NEW', targetTier: 'SILVER', method: 'CASH', receivedOn: '2027-03-15', amount: '1' }).success).toBe(false);
  });
});

describe('the family request schema', () => {
  it('FR-FAM-01, FR-MEM-09 carries no tier, term date, status, number or token, not even inside the new member', () => {
    const ok = { relationshipId: 'r', confirmed: true, member: { firstName: 'A', lastName: 'B' } };
    expect(addFamilySchema.safeParse(ok).success).toBe(true);
    for (const extra of ['tier', 'currentTier', 'endsOn', 'status', 'memberNumber', 'cardToken']) {
      expect(addFamilySchema.safeParse({ ...ok, [extra]: 'x' }).success).toBe(false);
      expect(addFamilySchema.safeParse({ ...ok, member: { ...ok.member, [extra]: 'x' } }).success).toBe(false);
    }
  });
});

describe('the VIP request schemas', () => {
  it('FR-VIP-01, FR-VIP-03, FR-MEM-09 carry no tier, term date, status, amount or requester', () => {
    for (const [schema, ok] of [
      [vipRequestSchema, { reason: 'key partner' }],
      [vipDecisionSchema, { decision: 'APPROVE', note: 'ok' }],
      [vipEndSchema, { reason: 'left' }],
    ] as const) {
      expect(schema.safeParse(ok).success).toBe(true);
      for (const extra of ['tier', 'currentTier', 'endsOn', 'startsOn', 'status', 'amount', 'requestedBy', 'decidedBy']) {
        expect(schema.safeParse({ ...ok, [extra]: 'x' }).success).toBe(false);
      }
    }
  });
});

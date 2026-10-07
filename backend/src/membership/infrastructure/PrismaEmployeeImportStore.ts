import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import type { ImportRow, ImportRowResult } from '../domain/employeeImport';
import type { ConfirmedImport, EmployeeImportRecord, IEmployeeImportStore, ImportStatus, NewEmployeeImport } from '../application/ports/IEmployeeImportStore';

type Row = Prisma.EmployeeImportGetPayload<object>;

const toRecord = (row: Row): EmployeeImportRecord => ({
  id: row.id,
  clientId: row.clientId,
  fileName: row.fileName,
  uploadedBy: row.uploadedBy,
  status: row.status as ImportStatus,
  rows: (row.rows as unknown as ImportRow[] | null) ?? null,
  result: (row.result as unknown as ImportRowResult[] | null) ?? null,
  confirmToken: row.confirmToken,
  created: row.created,
  linked: row.linked,
  skipped: row.skipped,
  refused: row.refused,
  errors: row.errors,
  createdAt: row.createdAt,
  confirmedAt: row.confirmedAt,
});

export class PrismaEmployeeImportStore implements IEmployeeImportStore {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findCompany(tenantId: string, clientId: string): Promise<{ id: string; name: string; employeeCount: number | null } | null> {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId, deletedAt: null }, select: { id: true, name: true, employeeCount: true } });
    return client ? { id: client.id, name: client.name ?? '', employeeCount: client.employeeCount } : null;
  }

  async create(data: NewEmployeeImport): Promise<EmployeeImportRecord> {
    const { rows, ...rest } = data;
    return toRecord(await this.prisma.employeeImport.create({ data: { ...rest, rows: rows as unknown as Prisma.InputJsonValue, status: 'PREVIEWED' } }));
  }

  async find(tenantId: string, id: string): Promise<EmployeeImportRecord | null> {
    const row = await this.prisma.employeeImport.findFirst({ where: { id, tenantId } });
    return row ? toRecord(row) : null;
  }

  async listForCompany(tenantId: string, clientId: string): Promise<EmployeeImportRecord[]> {
    // The rows are personal data: the history never reads them.
    const rows = await this.prisma.employeeImport.findMany({
      where: { tenantId, clientId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        id: true, tenantId: true, clientId: true, fileName: true, uploadedBy: true, status: true, confirmToken: false, result: false,
        created: true, linked: true, skipped: true, refused: true, errors: true, createdAt: true, confirmedAt: true,
      },
    });
    return rows.map((row) => toRecord({ ...row, rows: null, result: null, confirmToken: '' } as Row));
  }

  async claim(tenantId: string, id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.employeeImport.updateMany({ where: { id, tenantId, status: 'PREVIEWED' }, data: { status: 'CONFIRMED', confirmedAt: at } });
    return count === 1;
  }

  async finish(id: string, data: ConfirmedImport): Promise<void> {
    const { result, ...counts } = data;
    await this.prisma.employeeImport.update({
      where: { id },
      data: { ...counts, result: result as unknown as Prisma.InputJsonValue, rows: Prisma.DbNull },
    });
  }

  async expire(id: string): Promise<void> {
    await this.prisma.employeeImport.updateMany({ where: { id, status: 'PREVIEWED' }, data: { status: 'EXPIRED', rows: Prisma.DbNull } });
  }
}

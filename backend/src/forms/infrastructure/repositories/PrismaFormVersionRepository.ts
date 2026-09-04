import { PrismaClient, Prisma } from '@prisma/client';
import { IFormVersionRepository } from '../../domain/repositories/IFormVersionRepository';
import { FormVersion } from '../../domain/entities/FormVersion';
import { FormDocument } from '../../domain/value-objects/FormDocument';

/**
 * Unlike `ClientForm.layout`, a `FormVersion.document` was already v3 the
 * moment it was frozen (it is copied straight from a draft that had already
 * passed through `PrismaClientFormRepository`'s migration boundary) — so
 * this is a plain cast, never `migrateDocumentToV3`. Running the migrator
 * here would be worse than redundant: it could silently reinterpret a
 * historical document under today's migration rules instead of preserving
 * exactly what a submission was filled against.
 */
export class PrismaFormVersionRepository implements IFormVersionRepository {
  constructor(private prisma: PrismaClient) {}

  private toDomain(r: {
    id: string;
    tenantId: string;
    formId: string;
    versionNumber: number;
    document: Prisma.JsonValue;
    publishedAt: Date;
    publishedByUserId: string | null;
  }): FormVersion {
    return FormVersion.reconstitute({
      id: r.id,
      tenantId: r.tenantId,
      formId: r.formId,
      versionNumber: r.versionNumber,
      document: r.document as unknown as FormDocument,
      publishedAt: r.publishedAt,
      publishedByUserId: r.publishedByUserId,
    });
  }

  async save(version: FormVersion): Promise<void> {
    await this.prisma.formVersion.create({
      data: {
        id: version.id,
        tenantId: version.tenantId,
        formId: version.formId,
        versionNumber: version.versionNumber,
        document: version.document as unknown as Prisma.InputJsonValue,
        publishedAt: version.publishedAt,
        publishedByUserId: version.publishedByUserId,
      },
    });
  }

  async findById(id: string): Promise<FormVersion | null> {
    const record = await this.prisma.formVersion.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByFormAndVersionNumber(
    tenantId: string,
    formId: string,
    versionNumber: number
  ): Promise<FormVersion | null> {
    const record = await this.prisma.formVersion.findUnique({
      where: { formId_versionNumber: { formId, versionNumber } },
    });
    if (!record || record.tenantId !== tenantId) return null;
    return this.toDomain(record);
  }

  async listByForm(tenantId: string, formId: string): Promise<FormVersion[]> {
    const records = await this.prisma.formVersion.findMany({
      where: { tenantId, formId },
      orderBy: { versionNumber: 'desc' },
    });
    return records.map((r) => this.toDomain(r));
  }

  async findLatestVersionNumber(tenantId: string, formId: string): Promise<number> {
    const latest = await this.prisma.formVersion.findFirst({
      where: { tenantId, formId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    return latest?.versionNumber ?? 0;
  }
}

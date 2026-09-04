import { PrismaClient, Prisma } from '@prisma/client';
import { IClientFormRepository } from '../../domain/repositories/IClientFormRepository';
import { ClientForm, FormSettings } from '../../domain/entities/ClientForm';
import { FormStatus } from '../../domain/enums/FormStatus';
import { FormDocument, migrateDocumentToV3 } from '../../domain/value-objects/FormDocument';

const toSettings = (value: Prisma.JsonValue): FormSettings =>
  (value && typeof value === 'object' && !Array.isArray(value) ? (value as FormSettings) : {});

/**
 * Every consumer of `ClientForm.layout` sees v3, unconditionally — the
 * migration boundary lives HERE rather than in each use case, so nothing
 * downstream has to know a v1 (grid) or v2 (elastic single-page canvas)
 * document can even exist. Tolerant of a malformed value the same way the
 * rest of this module is tolerant of a deleted field definition: a form the
 * owner cannot open is worse than one that falls back to empty.
 */
const toDocument = (value: Prisma.JsonValue): FormDocument => migrateDocumentToV3(value);

export class PrismaClientFormRepository implements IClientFormRepository {
  constructor(private prisma: PrismaClient) {}

  private toDomain(r: {
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    status: string;
    layout: Prisma.JsonValue;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    shareToken: string | null;
    isTemplate: boolean;
    publishedVersionId: string | null;
    publishedAtDraftVersion: number | null;
    settings: Prisma.JsonValue;
  }): ClientForm {
    return ClientForm.reconstitute({
      id: r.id,
      tenantId: r.tenantId,
      name: r.name,
      description: r.description,
      isDefault: r.isDefault,
      status: r.status as FormStatus,
      layout: toDocument(r.layout),
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      deletedAt: r.deletedAt,
      shareToken: r.shareToken,
      isTemplate: r.isTemplate,
      publishedVersionId: r.publishedVersionId,
      publishedAtDraftVersion: r.publishedAtDraftVersion,
      settings: toSettings(r.settings),
    });
  }

  async findByTenantId(tenantId: string): Promise<ClientForm[]> {
    const records = await this.prisma.clientForm.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    return records.map(r => this.toDomain(r));
  }

  async findByShareToken(shareToken: string): Promise<ClientForm | null> {
    const record = await this.prisma.clientForm.findUnique({ where: { shareToken } });
    if (!record || record.deletedAt) return null;
    return this.toDomain(record);
  }

  async findById(tenantId: string, id: string): Promise<ClientForm | null> {
    const record = await this.prisma.clientForm.findUnique({ where: { id } });
    if (!record || record.tenantId !== tenantId || record.deletedAt) return null;
    return this.toDomain(record);
  }

  async findDefault(tenantId: string): Promise<ClientForm | null> {
    const record = await this.prisma.clientForm.findFirst({
      where: { tenantId, isDefault: true, deletedAt: null },
    });
    return record ? this.toDomain(record) : null;
  }

  async save(form: ClientForm): Promise<void> {
    await this.prisma.clientForm.create({
      data: {
        id: form.id,
        tenantId: form.tenantId,
        name: form.name,
        description: form.description,
        isDefault: form.isDefault,
        status: form.status,
        layout: form.layout as unknown as Prisma.InputJsonValue,
        // NOT NULL with no database default, exactly like `layout` above:
        // MySQL cannot take a literal default on a JSON column, so the
        // application is what guarantees the column is always populated.
        settings: form.settings as unknown as Prisma.InputJsonValue,
        shareToken: form.shareToken,
        isTemplate: form.isTemplate,
        publishedVersionId: form.publishedVersionId,
        publishedAtDraftVersion: form.publishedAtDraftVersion,
        version: form.version,
        createdAt: form.createdAt,
        updatedAt: form.updatedAt,
        deletedAt: form.deletedAt,
      },
    });
  }

  /**
   * Compare-and-set on `version`, in one statement.
   *
   * `updateMany` with the expected version in the WHERE clause is what makes
   * this atomic — a read-then-write would leave a window in which the other
   * owner's save lands between the check and the write, which is exactly the
   * lost update this exists to prevent. A count of 0 means someone else saved
   * first.
   */
  async updateWithVersionCheck(form: ClientForm, expectedVersion: number): Promise<boolean> {
    const result = await this.prisma.clientForm.updateMany({
      where: { id: form.id, tenantId: form.tenantId, version: expectedVersion, deletedAt: null },
      data: {
        name: form.name,
        description: form.description,
        isDefault: form.isDefault,
        status: form.status,
        layout: form.layout as unknown as Prisma.InputJsonValue,
        settings: form.settings as unknown as Prisma.InputJsonValue,
        shareToken: form.shareToken,
        isTemplate: form.isTemplate,
        publishedVersionId: form.publishedVersionId,
        publishedAtDraftVersion: form.publishedAtDraftVersion,
        version: form.version,
        updatedAt: form.updatedAt,
      },
    });
    return result.count > 0;
  }

  async hasSeededDefaultForm(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { clientFormSeededAt: true },
    });
    return tenant?.clientFormSeededAt != null;
  }

  async markDefaultFormSeeded(tenantId: string): Promise<void> {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { clientFormSeededAt: new Date() },
    });
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    // updateMany, not update: tenantId lives in the WHERE clause, so a form
    // belonging to another workspace matches zero rows instead of being
    // deleted.
    await this.prisma.clientForm.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}

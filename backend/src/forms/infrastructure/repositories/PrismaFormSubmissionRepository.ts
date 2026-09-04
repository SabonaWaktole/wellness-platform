import { PrismaClient, Prisma } from '@prisma/client';
import { IFormSubmissionRepository } from '../../domain/repositories/IFormSubmissionRepository';
import { FormSubmission, SubmissionSource } from '../../domain/entities/FormSubmission';

const DEFAULT_LIST_LIMIT = 500;

export class PrismaFormSubmissionRepository implements IFormSubmissionRepository {
  constructor(private prisma: PrismaClient) {}

  private toDomain(r: {
    id: string;
    tenantId: string;
    formId: string;
    formVersionId: string;
    data: Prisma.JsonValue;
    submittedAt: Date;
    submittedByUserId: string | null;
    clientId: string | null;
    source: string;
    ipHash: string | null;
    userAgent: string | null;
  }): FormSubmission {
    return FormSubmission.reconstitute({
      id: r.id,
      tenantId: r.tenantId,
      formId: r.formId,
      formVersionId: r.formVersionId,
      data: r.data as Record<string, unknown>,
      submittedAt: r.submittedAt,
      submittedByUserId: r.submittedByUserId,
      clientId: r.clientId,
      source: r.source as SubmissionSource,
      ipHash: r.ipHash,
      userAgent: r.userAgent,
    });
  }

  async save(submission: FormSubmission): Promise<void> {
    await this.prisma.formSubmission.create({
      data: {
        id: submission.id,
        tenantId: submission.tenantId,
        formId: submission.formId,
        formVersionId: submission.formVersionId,
        data: submission.data as unknown as Prisma.InputJsonValue,
        submittedAt: submission.submittedAt,
        submittedByUserId: submission.submittedByUserId,
        clientId: submission.clientId,
        source: submission.source,
        ipHash: submission.ipHash,
        userAgent: submission.userAgent,
      },
    });
  }

  async findById(tenantId: string, id: string): Promise<FormSubmission | null> {
    const record = await this.prisma.formSubmission.findUnique({ where: { id } });
    if (!record || record.tenantId !== tenantId) return null;
    return this.toDomain(record);
  }

  async listByForm(tenantId: string, formId: string, limit = DEFAULT_LIST_LIMIT): Promise<FormSubmission[]> {
    const records = await this.prisma.formSubmission.findMany({
      where: { tenantId, formId },
      orderBy: { submittedAt: 'desc' },
      take: limit,
    });
    return records.map((r) => this.toDomain(r));
  }
}

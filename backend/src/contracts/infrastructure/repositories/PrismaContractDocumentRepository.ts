import { PrismaClient } from '@prisma/client';
import { ContractDocument } from '../../domain/ContractDocument';
import { IContractDocumentRepository } from '../../domain/IContractDocumentRepository';

export class PrismaContractDocumentRepository implements IContractDocumentRepository {
  constructor(private prisma: PrismaClient) {}

  private toDomain(raw: any): ContractDocument {
    return ContractDocument.create({
      id: raw.id,
      tenantId: raw.tenantId,
      contractId: raw.contractId,
      fileName: raw.fileName,
      url: raw.url,
      uploadedByUserId: raw.uploadedByUserId,
      uploadedAt: raw.uploadedAt,
      isCurrent: raw.isCurrent,
    });
  }

  async findByContractId(tenantId: string, contractId: string): Promise<ContractDocument[]> {
    const rows = await this.prisma.contractDocument.findMany({
      where: { tenantId, contractId },
      orderBy: { uploadedAt: 'desc' },
    });
    return rows.map((raw) => this.toDomain(raw));
  }

  async findById(tenantId: string, contractId: string, id: string): Promise<ContractDocument | null> {
    const raw = await this.prisma.contractDocument.findFirst({ where: { id, tenantId, contractId } });
    return raw ? this.toDomain(raw) : null;
  }

  async findCurrent(tenantId: string, contractId: string): Promise<ContractDocument | null> {
    const raw = await this.prisma.contractDocument.findFirst({ where: { tenantId, contractId, isCurrent: true } });
    return raw ? this.toDomain(raw) : null;
  }

  async addCurrent(document: ContractDocument): Promise<void> {
    await this.prisma.contractDocument.updateMany({
      where: { tenantId: document.tenantId, contractId: document.contractId, isCurrent: true },
      data: { isCurrent: false },
    });
    await this.prisma.contractDocument.create({
      data: {
        id: document.id,
        tenantId: document.tenantId,
        contractId: document.contractId,
        fileName: document.fileName,
        url: document.url,
        uploadedByUserId: document.uploadedByUserId,
        uploadedAt: document.uploadedAt,
        isCurrent: true,
      },
    });
  }
}

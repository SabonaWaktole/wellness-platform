import { PrismaClient } from '@prisma/client';
import { IContactPersonRepository } from '../../domain/repositories/IContactPersonRepository';
import { ContactPerson } from '../../domain/entities/ContactPerson';

export class PrismaContactPersonRepository implements IContactPersonRepository {
  constructor(private prisma: PrismaClient) {}

  private mapToDomain(record: any): ContactPerson {
    return ContactPerson.reconstitute({
      id: record.id,
      tenantId: record.tenantId,
      clientId: record.clientId,
      name: record.name,
      position: record.position,
      phone: record.phone,
      email: record.email,
      isPrimary: record.isPrimary,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt,
    });
  }

  async listByClient(tenantId: string, clientId: string): Promise<ContactPerson[]> {
    const records = await this.prisma.contactPerson.findMany({
      where: { tenantId, clientId, deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async listByClients(tenantId: string, clientIds: string[]): Promise<Map<string, ContactPerson[]>> {
    if (clientIds.length === 0) return new Map();
    const records = await this.prisma.contactPerson.findMany({
      where: { tenantId, clientId: { in: clientIds }, deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
    const byClient = new Map<string, ContactPerson[]>();
    for (const record of records) {
      const contact = this.mapToDomain(record);
      const list = byClient.get(contact.clientId) ?? [];
      list.push(contact);
      byClient.set(contact.clientId, list);
    }
    return byClient;
  }

  async saveMany(tenantId: string, contacts: ContactPerson[]): Promise<void> {
    for (const contact of contacts) {
      await this.prisma.contactPerson.upsert({
        where: { id: contact.id },
        create: {
          id: contact.id,
          tenantId,
          clientId: contact.clientId,
          name: contact.name,
          position: contact.position,
          phone: contact.phone,
          email: contact.email,
          isPrimary: contact.isPrimary,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        },
        update: {
          name: contact.name,
          position: contact.position,
          phone: contact.phone,
          email: contact.email,
          isPrimary: contact.isPrimary,
          updatedAt: contact.updatedAt,
        },
      });
    }
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    // updateMany, not update: tenantId lives in the WHERE clause, so a
    // contact belonging to another workspace matches zero rows.
    await this.prisma.contactPerson.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}

import { PrismaClient, Prisma } from '@prisma/client';
import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { FieldType } from '../../domain/enums/FieldType';
import { FieldRole } from '../../domain/enums/FieldRole';
import { jsonToStringArray } from '../../../shared/infrastructure/prisma/jsonArray';

export class PrismaCustomFieldDefinitionRepository implements ICustomFieldDefinitionRepository {
  constructor(private prisma: PrismaClient) {}

  private toDomain(r: {
    id: string;
    tenantId: string;
    fieldName: string;
    fieldType: string;
    options: Prisma.JsonValue;
    order: number;
    role: string | null;
    required: boolean;
  }): CustomFieldDefinition {
    return CustomFieldDefinition.create({
      id: r.id,
      tenantId: r.tenantId,
      fieldName: r.fieldName,
      fieldType: r.fieldType as FieldType,
      options: jsonToStringArray(r.options),
      order: r.order,
      role: (r.role as FieldRole | null) ?? null,
      required: r.required,
    });
  }

  async findByTenantId(tenantId: string): Promise<CustomFieldDefinition[]> {
    const records = await this.prisma.customFieldDefinition.findMany({
      where: { tenantId },
      orderBy: { order: 'asc' },
    });
    return records.map(r => this.toDomain(r));
  }

  async findById(tenantId: string, id: string): Promise<CustomFieldDefinition | null> {
    const record = await this.prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!record || record.tenantId !== tenantId) return null;
    return this.toDomain(record);
  }

  async findByTenantIdAndRole(tenantId: string, role: FieldRole): Promise<CustomFieldDefinition | null> {
    const record = await this.prisma.customFieldDefinition.findUnique({
      where: { tenantId_role: { tenantId, role } },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async save(tenantId: string, definition: CustomFieldDefinition): Promise<void> {
    await this.prisma.customFieldDefinition.create({
      data: {
        id: definition.id,
        tenantId: definition.tenantId,
        fieldName: definition.fieldName,
        fieldType: definition.fieldType,
        options: definition.options || [],
        order: definition.order,
        role: definition.role,
        required: definition.required,
      },
    });
  }

  async update(tenantId: string, definition: CustomFieldDefinition): Promise<void> {
    await this.prisma.customFieldDefinition.update({
      where: { id: definition.id },
      data: {
        fieldName: definition.fieldName,
        fieldType: definition.fieldType,
        options: definition.options || [],
        order: definition.order,
        role: definition.role,
        required: definition.required,
      },
    });
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.prisma.customFieldDefinition.deleteMany({ where: { id, tenantId } });
  }

  async reorder(tenantId: string, orderedIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.customFieldDefinition.updateMany({
          where: { id, tenantId },
          data: { order: index },
        })
      )
    );
  }
}

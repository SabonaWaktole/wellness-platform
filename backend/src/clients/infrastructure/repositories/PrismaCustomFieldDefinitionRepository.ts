import { PrismaClient } from '@prisma/client';
import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { FieldType } from '../../domain/enums/FieldType';
import { jsonToStringArray } from '../../../shared/infrastructure/prisma/jsonArray';

export class PrismaCustomFieldDefinitionRepository implements ICustomFieldDefinitionRepository {
  constructor(private prisma: PrismaClient) {}

  async findByTenantId(tenantId: string): Promise<CustomFieldDefinition[]> {
    const records = await this.prisma.customFieldDefinition.findMany({
      where: { tenantId },
    });
    return records.map(r => CustomFieldDefinition.create({
      id: r.id,
      tenantId: r.tenantId,
      fieldName: r.fieldName,
      fieldType: r.fieldType as FieldType,
      options: jsonToStringArray(r.options),
    }));
  }

  async save(tenantId: string, definition: CustomFieldDefinition): Promise<void> {
    await this.prisma.customFieldDefinition.create({
      data: {
        id: definition.id,
        tenantId: definition.tenantId,
        fieldName: definition.fieldName,
        fieldType: definition.fieldType,
        options: definition.options || [],
      },
    });
  }
}

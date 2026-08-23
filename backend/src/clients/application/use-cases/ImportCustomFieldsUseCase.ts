import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { FieldType } from '../../domain/enums/FieldType';
import { UserRole } from '../../../auth/domain/enums/UserRole';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { defineCustomFieldSchema } from '../../interfaces/http/schemas/clientSchemas';
import { ParsedSheet } from '../../infrastructure/excel/sheet';
import { randomUUID } from 'crypto';

export const CUSTOM_FIELD_TEMPLATE_HEADERS = ['fieldName', 'fieldType', 'options'];

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportCustomFieldsResult {
  created: number;
  skipped: number;
  errors: ImportRowError[];
}

interface ImportCustomFieldsDTO {
  tenantId: string;
  requestingUserRole: string;
  sheet: ParsedSheet;
}

/** Header lookup is case- and space-insensitive so hand-edited files still work. */
const readCell = (row: Record<string, string>, name: string): string => {
  const wanted = name.toLowerCase().replace(/[\s_]/g, '');
  const key = Object.keys(row).find(k => k.toLowerCase().replace(/[\s_]/g, '') === wanted);
  return key ? (row[key] ?? '').trim() : '';
};

export class ImportCustomFieldsUseCase {
  constructor(private customFieldRepo: ICustomFieldDefinitionRepository) {}

  async execute(dto: ImportCustomFieldsDTO): Promise<ImportCustomFieldsResult> {
    if (
      dto.requestingUserRole !== UserRole.BUSINESS_OWNER &&
      dto.requestingUserRole !== UserRole.SUPER_ADMIN
    ) {
      throw new DomainError('Only Business Owners can define custom fields');
    }

    const existing = await this.customFieldRepo.findByTenantId(dto.tenantId);
    // Names already taken this run are tracked alongside the stored ones, since
    // the repository writes with create() and a duplicate would throw P2002.
    const takenNames = new Set(existing.map(d => d.fieldName.toLowerCase()));

    const result: ImportCustomFieldsResult = { created: 0, skipped: 0, errors: [] };

    for (const [index, row] of dto.sheet.rows.entries()) {
      // +2: row 1 is the header, and spreadsheet rows are 1-based.
      const rowNumber = index + 2;
      const rawOptions = readCell(row, 'options');

      const parsed = defineCustomFieldSchema.safeParse({
        fieldName: readCell(row, 'fieldName'),
        fieldType: readCell(row, 'fieldType').toUpperCase().replace(/[\s-]/g, '_'),
        options: rawOptions
          ? rawOptions.split(/[;|]/).map(o => o.trim()).filter(Boolean)
          : undefined,
      });

      if (!parsed.success) {
        result.errors.push({
          row: rowNumber,
          message: parsed.error.issues.map(i => i.message).join('; '),
        });
        continue;
      }

      if (takenNames.has(parsed.data.fieldName.toLowerCase())) {
        result.skipped += 1;
        continue;
      }

      try {
        const definition = CustomFieldDefinition.create({
          id: randomUUID(),
          tenantId: dto.tenantId,
          fieldName: parsed.data.fieldName,
          fieldType: parsed.data.fieldType as FieldType,
          options: parsed.data.options,
        });
        await this.customFieldRepo.save(dto.tenantId, definition);
        takenNames.add(definition.fieldName.toLowerCase());
        result.created += 1;
      } catch (error: any) {
        result.errors.push({ row: rowNumber, message: error.message });
      }
    }

    return result;
  }
}

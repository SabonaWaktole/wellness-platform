import { ICustomFieldDefinitionRepository } from '../../domain/repositories/ICustomFieldDefinitionRepository';
import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { FieldType } from '../../domain/enums/FieldType';
import { ClientStatus } from '../../domain/enums/ClientStatus';
import { CreateClientUseCase } from './CreateClientUseCase';
import { createClientSchema } from '../../interfaces/http/schemas/clientSchemas';
import { ParsedSheet } from '../../infrastructure/excel/sheet';
import { ImportRowError } from './ImportCustomFieldsUseCase';

/** Built-in columns; every other header is matched against a custom field. */
export const CLIENT_TEMPLATE_HEADERS = ['name', 'email', 'phone', 'status'];

export interface ImportClientsResult {
  created: number;
  errors: ImportRowError[];
}

interface ImportClientsDTO {
  tenantId: string;
  authorUserId: string;
  sheet: ParsedSheet;
}

const normalise = (value: string) => value.toLowerCase().replace(/[\s_]/g, '');

const TRUTHY = ['true', 'yes', 'y', '1'];
const FALSY = ['false', 'no', 'n', '0'];

/**
 * Spreadsheet cells are always strings; the declared field type decides what
 * they become before the domain sees them. Anything unparseable is reported as
 * a row error rather than silently stored as text.
 */
const coerce = (definition: CustomFieldDefinition, raw: string): any => {
  switch (definition.fieldType) {
    case FieldType.NUMBER: {
      const num = Number(raw);
      if (Number.isNaN(num)) throw new Error(`"${raw}" is not a valid number for "${definition.fieldName}".`);
      return num;
    }
    case FieldType.BOOLEAN: {
      const lower = raw.toLowerCase();
      if (TRUTHY.includes(lower)) return true;
      if (FALSY.includes(lower)) return false;
      throw new Error(`"${raw}" is not a valid yes/no value for "${definition.fieldName}".`);
    }
    case FieldType.DATE: {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) throw new Error(`"${raw}" is not a valid date for "${definition.fieldName}".`);
      return date.toISOString();
    }
    default:
      return raw;
  }
};

export class ImportClientsUseCase {
  constructor(
    private createClientUseCase: CreateClientUseCase,
    private customFieldRepo: ICustomFieldDefinitionRepository
  ) {}

  async execute(dto: ImportClientsDTO): Promise<ImportClientsResult> {
    const definitions = await this.customFieldRepo.findByTenantId(dto.tenantId);
    const definitionsByHeader = new Map(definitions.map(d => [normalise(d.fieldName), d]));
    const builtIn = new Set(CLIENT_TEMPLATE_HEADERS.map(normalise));

    const result: ImportClientsResult = { created: 0, errors: [] };

    for (const [index, row] of dto.sheet.rows.entries()) {
      // +2: row 1 is the header, and spreadsheet rows are 1-based.
      const rowNumber = index + 2;

      try {
        const values: Record<string, string> = {};
        const customFieldValues: Record<string, any> = {};

        for (const [header, raw] of Object.entries(row)) {
          const key = normalise(header);
          if (builtIn.has(key)) {
            values[key] = raw;
            continue;
          }
          const definition = definitionsByHeader.get(key);
          if (!definition) {
            throw new Error(`Column "${header}" does not match any custom field.`);
          }
          if (raw !== '') {
            customFieldValues[definition.fieldName] = coerce(definition, raw);
          }
        }

        const parsed = createClientSchema.safeParse({
          name: values.name ?? '',
          email: values.email ?? '',
          phone: values.phone || undefined,
          status: (values.status || ClientStatus.PROSPECT).toUpperCase(),
          customFieldValues,
        });

        if (!parsed.success) {
          throw new Error(parsed.error.issues.map(i => `${i.path.join('.') || 'row'}: ${i.message}`).join('; '));
        }

        // Delegated so imported clients go through the same domain validation
        // and assignment notifications as ones created through the form.
        await this.createClientUseCase.execute({
          ...parsed.data,
          tenantId: dto.tenantId,
          authorUserId: dto.authorUserId,
        });
        result.created += 1;
      } catch (error: any) {
        // One bad row must not abort the rest of the batch.
        result.errors.push({ row: rowNumber, message: error.message });
      }
    }

    return result;
  }
}

import { CustomFieldDefinition } from '../../domain/entities/CustomFieldDefinition';
import { FieldType } from '../../domain/enums/FieldType';
import { FieldRole } from '../../domain/enums/FieldRole';
import { ClientFieldResolver } from '../../domain/services/ClientFieldResolver';
import { EnsureDefaultClientFieldsUseCase } from './EnsureDefaultClientFieldsUseCase';
import { CreateClientUseCase } from './CreateClientUseCase';
import { createClientSchema } from '../../interfaces/http/schemas/clientSchemas';
import { ParsedSheet } from '../../infrastructure/excel/sheet';
import { ImportRowError } from './ImportCustomFieldsUseCase';

/** Built-in columns; every other header is matched against a custom field. */
export const CLIENT_TEMPLATE_HEADERS = ['name', 'email', 'phone', 'status'];

const BUILT_IN_ROLE_BY_HEADER: Record<string, FieldRole> = {
  name: FieldRole.PRIMARY_NAME,
  email: FieldRole.PRIMARY_EMAIL,
  phone: FieldRole.PRIMARY_PHONE,
  status: FieldRole.STATUS,
};

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
    case FieldType.MULTI_SELECT:
      // Same `;` / `|` separator the custom-field options column uses, so one
      // convention covers both templates. Whether each entry is actually a
      // configured option is the domain's call, not this function's.
      return raw
        .split(/[;|]/)
        .map(v => v.trim())
        .filter(Boolean);
    default:
      return raw;
  }
};

export class ImportClientsUseCase {
  constructor(
    private createClientUseCase: CreateClientUseCase,
    private ensureDefaultFields: EnsureDefaultClientFieldsUseCase
  ) {}

  async execute(dto: ImportClientsDTO): Promise<ImportClientsResult> {
    const definitions = await this.ensureDefaultFields.execute(dto.tenantId);
    const definitionsByHeader = new Map(definitions.map(d => [normalise(d.fieldName), d]));
    const builtIn = new Set(Object.keys(BUILT_IN_ROLE_BY_HEADER));

    const result: ImportClientsResult = { created: 0, errors: [] };

    for (const [index, row] of dto.sheet.rows.entries()) {
      // +2: row 1 is the header, and spreadsheet rows are 1-based.
      const rowNumber = index + 2;

      try {
        const customFieldValues: Record<string, any> = {};

        for (const [header, raw] of Object.entries(row)) {
          const key = normalise(header);

          if (builtIn.has(key)) {
            if (raw === '') continue;
            const role = BUILT_IN_ROLE_BY_HEADER[key];
            const fieldName = ClientFieldResolver.findFieldNameForRole(definitions, role);
            // Tenant deleted the field holding this role — the column has
            // nowhere to go, so the cell is silently dropped rather than
            // failing the whole row.
            if (!fieldName) continue;
            const definition = definitionsByHeader.get(normalise(fieldName));
            customFieldValues[fieldName] = definition
              ? coerce(definition, key === 'status' ? raw.toUpperCase() : raw)
              : raw;
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

        const statusFieldName = ClientFieldResolver.findFieldNameForRole(definitions, FieldRole.STATUS);
        if (statusFieldName && customFieldValues[statusFieldName] === undefined) {
          customFieldValues[statusFieldName] = 'PROSPECT';
        }

        const parsed = createClientSchema.safeParse({ customFieldValues });

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

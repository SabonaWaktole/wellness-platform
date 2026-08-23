import { ClientStatus } from '../enums/ClientStatus';
import { CustomFieldDefinition } from './CustomFieldDefinition';
import { FieldType } from '../enums/FieldType';
import { DomainError } from '../../../shared/domain/errors/DomainError';

const ALPHANUMERIC_PATTERN = /^[a-zA-Z0-9 ]+$/;

export interface ClientProps {
  id: string;
  tenantId: string;
  name: string;
  contactInfo: { email?: string; phone?: string };
  status: ClientStatus;
  assignedUserId?: string | null;
  customFieldValues: Record<string, any>;
  lastUpdatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Client {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly name: string;
  public readonly contactInfo: { email?: string; phone?: string };
  public readonly status: ClientStatus;
  public readonly assignedUserId?: string | null;
  public readonly customFieldValues: Record<string, any>;
  public readonly lastUpdatedByUserId: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: ClientProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.contactInfo = props.contactInfo;
    this.status = props.status;
    this.assignedUserId = props.assignedUserId;
    this.customFieldValues = props.customFieldValues;
    this.lastUpdatedByUserId = props.lastUpdatedByUserId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: ClientProps, fieldDefinitions: CustomFieldDefinition[]): Client {
    // Validate custom field values against definitions
    if (props.customFieldValues) {
      for (const key of Object.keys(props.customFieldValues)) {
        const def = fieldDefinitions.find(d => d.fieldName === key);
        if (!def) {
          throw new DomainError(`Field "${key}" is not defined for this tenant.`);
        }

        const value = props.customFieldValues[key];

        switch (def.fieldType) {
          case FieldType.SINGLE_SELECT:
            if (!def.options?.includes(value)) {
              throw new DomainError(`Value "${value}" is not a valid option for field "${key}".`);
            }
            break;

          case FieldType.ALPHANUMERIC:
            // Blank is how the form reports "left empty"; only a filled-in value
            // has to satisfy the letters/digits/spaces rule.
            if (value !== null && value !== undefined && value !== '') {
              if (typeof value !== 'string' || !ALPHANUMERIC_PATTERN.test(value)) {
                throw new DomainError(
                  `Value for field "${key}" must contain only letters, numbers and spaces.`
                );
              }
            }
            break;

          // TEXT, NUMBER, DATE and BOOLEAN are stored as given — TEXT in
          // particular is free-form and accepts spaces and punctuation.
          default:
            break;
        }
      }
    }

    return new Client(props);
  }

  /**
   * Reconstitutes an existing client from persistence. Bypasses domain validation.
   */
  public static reconstitute(props: ClientProps): Client {
    return new Client(props);
  }
}

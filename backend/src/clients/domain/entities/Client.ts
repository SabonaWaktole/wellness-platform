import { CustomFieldDefinition } from './CustomFieldDefinition';
import { FieldType } from '../enums/FieldType';
import { DomainError } from '../../../shared/domain/errors/DomainError';

const ALPHANUMERIC_PATTERN = /^[a-zA-Z0-9 ]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ClientProps {
  id: string;
  tenantId: string;
  name: string;
  contactInfo: { email?: string; phone?: string };
  /**
   * No longer a fixed ClientStatus enum: the "Status" field is an ordinary
   * tenant-editable SINGLE_SELECT custom field (see FieldRole.STATUS), so
   * its valid values are whatever options the tenant currently has
   * configured, not a fixed three-value enum.
   */
  status: string;
  assignedUserId?: string | null;
  customFieldValues: Record<string, any>;
  /** Free-text internal notes, private to the workspace. */
  notes?: string | null;
  lastUpdatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  /** Set when the client is archived; null/undefined means active. */
  deletedAt?: Date | null;
}

export class Client {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly name: string;
  public readonly contactInfo: { email?: string; phone?: string };
  public readonly status: string;
  public readonly assignedUserId?: string | null;
  public readonly customFieldValues: Record<string, any>;
  public readonly notes?: string | null;
  public readonly lastUpdatedByUserId: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly deletedAt?: Date | null;

  private constructor(props: ClientProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.contactInfo = props.contactInfo;
    this.status = props.status;
    this.assignedUserId = props.assignedUserId;
    this.customFieldValues = props.customFieldValues;
    this.notes = props.notes ?? null;
    this.lastUpdatedByUserId = props.lastUpdatedByUserId;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.deletedAt = props.deletedAt ?? null;
  }

  /** Archived clients stay readable (invoices still reference them) but are
   *  hidden from client lists, search and dashboard counts. */
  public isArchived(): boolean {
    return this.deletedAt != null;
  }

  public static create(props: ClientProps, fieldDefinitions: CustomFieldDefinition[]): Client {
    const values = props.customFieldValues || {};

    // A required field that is entirely absent from customFieldValues (not
    // just present-and-blank) must still be caught — the loop below only
    // visits keys that were actually supplied.
    for (const def of fieldDefinitions) {
      if (def.required && !(def.fieldName in values)) {
        throw new DomainError(`Field "${def.fieldName}" is required.`);
      }
    }

    // Validate custom field values against definitions
    if (props.customFieldValues) {
      for (const key of Object.keys(props.customFieldValues)) {
        const def = fieldDefinitions.find(d => d.fieldName === key);
        if (!def) {
          throw new DomainError(`Field "${key}" is not defined for this tenant.`);
        }

        const value = props.customFieldValues[key];
        // An empty array counts as blank: it is how a MULTI_SELECT reports
        // "nothing chosen", and a required one must reject it just as a
        // required text field rejects ''.
        const isBlank =
          value === null ||
          value === undefined ||
          value === '' ||
          (Array.isArray(value) && value.length === 0);

        if (def.required && isBlank) {
          throw new DomainError(`Field "${key}" is required.`);
        }

        switch (def.fieldType) {
          case FieldType.SINGLE_SELECT:
            if (!isBlank && !def.options?.includes(value)) {
              throw new DomainError(`Value "${value}" is not a valid option for field "${key}".`);
            }
            break;

          case FieldType.MULTI_SELECT: {
            // The value is a list of chosen options. An empty array is how the
            // form reports "nothing selected", so it counts as blank for the
            // required check above — which has already run by this point.
            if (isBlank) break;
            if (!Array.isArray(value)) {
              throw new DomainError(`Value for field "${key}" must be a list of options.`);
            }
            for (const entry of value) {
              if (!def.options?.includes(entry)) {
                throw new DomainError(`Value "${entry}" is not a valid option for field "${key}".`);
              }
            }
            // Duplicates would make "how many chose X" wrong downstream and
            // cannot be produced by the UI, so treat them as malformed input.
            if (new Set(value).size !== value.length) {
              throw new DomainError(`Field "${key}" contains duplicate options.`);
            }
            break;
          }

          case FieldType.EMAIL:
            if (!isBlank && (typeof value !== 'string' || !EMAIL_PATTERN.test(value))) {
              throw new DomainError(`Value for field "${key}" must be a valid email address.`);
            }
            break;

          case FieldType.USER_REFERENCE:
            // Value must be a User.id in this tenant — the domain layer has
            // no DB access, so tenant-membership is checked by the use case
            // (which already loads the tenant's staff list) before this
            // runs; here we only guard the shape.
            if (!isBlank && typeof value !== 'string') {
              throw new DomainError(`Value for field "${key}" must be a user id.`);
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

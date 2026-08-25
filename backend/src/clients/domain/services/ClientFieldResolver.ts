import { CustomFieldDefinition } from '../entities/CustomFieldDefinition';
import { FieldRole } from '../enums/FieldRole';

/**
 * name/email/phone/status/assignedUserId used to be fixed Client columns.
 * They are now ordinary tenant-editable custom fields, tagged with a
 * FieldRole so the rest of the system can still find "the" name/email/etc.
 * even after a business owner renames, retypes, or deletes the field that
 * currently holds that role. This is the single place that lookup happens.
 */
export class ClientFieldResolver {
  static findFieldNameForRole(defs: CustomFieldDefinition[], role: FieldRole): string | undefined {
    return defs.find(d => d.role === role)?.fieldName;
  }

  static resolveValue(
    customFieldValues: Record<string, any>,
    defs: CustomFieldDefinition[],
    role: FieldRole
  ): any | undefined {
    const fieldName = this.findFieldNameForRole(defs, role);
    if (!fieldName) return undefined;
    const value = customFieldValues?.[fieldName];
    return value === '' || value === null ? undefined : value;
  }

  /** Never undefined — falls back to a generic label so PDFs/emails/lists never print "undefined". */
  static resolveName(customFieldValues: Record<string, any>, defs: CustomFieldDefinition[]): string {
    const value = this.resolveValue(customFieldValues, defs, FieldRole.PRIMARY_NAME);
    return typeof value === 'string' && value.trim() ? value : 'Client';
  }

  static resolveEmail(customFieldValues: Record<string, any>, defs: CustomFieldDefinition[]): string | undefined {
    const value = this.resolveValue(customFieldValues, defs, FieldRole.PRIMARY_EMAIL);
    return typeof value === 'string' ? value : undefined;
  }

  static resolvePhone(customFieldValues: Record<string, any>, defs: CustomFieldDefinition[]): string | undefined {
    const value = this.resolveValue(customFieldValues, defs, FieldRole.PRIMARY_PHONE);
    return typeof value === 'string' ? value : undefined;
  }

  static resolveStatus(customFieldValues: Record<string, any>, defs: CustomFieldDefinition[]): string | undefined {
    const value = this.resolveValue(customFieldValues, defs, FieldRole.STATUS);
    return typeof value === 'string' ? value : undefined;
  }

  static resolveAssignedUserId(customFieldValues: Record<string, any>, defs: CustomFieldDefinition[]): string | undefined {
    const value = this.resolveValue(customFieldValues, defs, FieldRole.ASSIGNEE);
    return typeof value === 'string' ? value : undefined;
  }
}

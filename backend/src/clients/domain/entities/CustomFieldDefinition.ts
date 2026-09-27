import { FieldType } from '../enums/FieldType';
import { FieldRole } from '../enums/FieldRole';
import { DomainError } from '../../../shared/domain/errors/DomainError';

const ROLE_REQUIRED_TYPE: Partial<Record<FieldRole, FieldType>> = {
  [FieldRole.STATUS]: FieldType.SINGLE_SELECT,
  [FieldRole.ASSIGNEE]: FieldType.USER_REFERENCE,
  [FieldRole.PRIMARY_EMAIL]: FieldType.EMAIL,
};

export interface CustomFieldDefinitionProps {
  id: string;
  tenantId: string;
  fieldName: string;
  fieldType: FieldType;
  options?: string[];
  order?: number;
  role?: FieldRole | null;
  required?: boolean;
}

export class CustomFieldDefinition {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly fieldName: string;
  public readonly fieldType: FieldType;
  public readonly options?: string[];
  public readonly order: number;
  public readonly role: FieldRole | null;
  public readonly required: boolean;

  private constructor(props: CustomFieldDefinitionProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.fieldName = props.fieldName;
    this.fieldType = props.fieldType;
    this.options = props.options;
    this.order = props.order ?? 0;
    this.role = props.role ?? null;
    this.required = props.required ?? false;
  }

  private static validate(props: CustomFieldDefinitionProps): void {
    if (props.fieldType === FieldType.SINGLE_SELECT || props.fieldType === FieldType.MULTI_SELECT) {
      if (!props.options || props.options.length === 0) {
        throw new DomainError(`${props.fieldType} fields must have at least one option.`);
      }
    }

    if (props.role) {
      const requiredType = ROLE_REQUIRED_TYPE[props.role];
      if (requiredType && props.fieldType !== requiredType) {
        throw new DomainError(
          `Field with role "${props.role}" must have type "${requiredType}".`
        );
      }
    }
  }

  public static create(props: CustomFieldDefinitionProps): CustomFieldDefinition {
    this.validate(props);
    return new CustomFieldDefinition(props);
  }

  /**
   * Applies a partial edit to an existing definition and re-validates the
   * result. Used by UpdateCustomFieldUseCase — never mutates `this`.
   */
  public update(changes: Partial<Omit<CustomFieldDefinitionProps, 'id' | 'tenantId'>>): CustomFieldDefinition {
    if (this.isLocked) {
      const losesRole = changes.role !== undefined && changes.role !== this.role;
      const changesType = changes.fieldType !== undefined && changes.fieldType !== this.fieldType;
      if (losesRole || changesType) {
        throw new DomainError(`Field "${this.fieldName}" is locked: its role and type cannot change.`);
      }
    }
    const merged: CustomFieldDefinitionProps = {
      id: this.id,
      tenantId: this.tenantId,
      fieldName: changes.fieldName ?? this.fieldName,
      fieldType: changes.fieldType ?? this.fieldType,
      options: changes.options ?? this.options,
      order: changes.order ?? this.order,
      role: changes.role !== undefined ? changes.role : this.role,
      required: changes.required ?? this.required,
    };
    CustomFieldDefinition.validate(merged);
    return new CustomFieldDefinition(merged);
  }

  /**
   * D7: the responsible-salesperson field is a system field. Data scope
   * (FR-RBAC-11..13) reads `Client.assignedUserId`, which is mirrored from
   * this field on every write — so it may be renamed and reordered, but
   * never deleted, retyped or stripped of its role.
   */
  public get isLocked(): boolean {
    return this.role === FieldRole.ASSIGNEE;
  }
}

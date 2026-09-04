import { FieldType } from '../../../clients/domain/enums/FieldType';
import { ComponentType } from '../enums/ComponentType';
import { FormFieldType } from '../enums/FormFieldType';

/**
 * The one place that maps a tenant CustomFieldDefinition's `fieldType` onto a
 * form-owned FieldSpec's `dataType` and a default ComponentType — used both
 * when seeding the default client-intake form (EnsureDefaultClientFormUseCase)
 * and when reconciling a bound field against its live definition on every
 * read (GetClientFormUseCase). Keeping this in one function is what keeps
 * "seed a field from a definition" and "refresh a field from its definition"
 * from silently drifting into two different answers.
 *
 * ALPHANUMERIC has no first-class form dataType — its letters-and-digits rule
 * is enforced by Client.create on submit, and a plain text box is the right
 * control for it — so it maps to TEXT/INPUT. USER_REFERENCE does have one:
 * the tenant's own "Assigned To" field is a USER_REFERENCE and has rendered
 * as a people picker since before v3, so flattening it to text here would
 * silently break assignment on every existing workspace.
 */
export const formFieldTypeFor = (fieldType: FieldType): FormFieldType => {
  switch (fieldType) {
    case FieldType.LONG_TEXT:
      return FormFieldType.LONG_TEXT;
    case FieldType.NUMBER:
      return FormFieldType.NUMBER;
    case FieldType.DATE:
      return FormFieldType.DATE;
    case FieldType.BOOLEAN:
      return FormFieldType.BOOLEAN;
    case FieldType.SINGLE_SELECT:
      return FormFieldType.SINGLE_SELECT;
    case FieldType.MULTI_SELECT:
      return FormFieldType.MULTI_SELECT;
    case FieldType.EMAIL:
      return FormFieldType.EMAIL;
    case FieldType.USER_REFERENCE:
      return FormFieldType.USER_REFERENCE;
    case FieldType.TEXT:
    case FieldType.ALPHANUMERIC:
    default:
      return FormFieldType.TEXT;
  }
};

export const defaultComponentTypeFor = (fieldType: FieldType): ComponentType => {
  switch (fieldType) {
    case FieldType.LONG_TEXT:
      return ComponentType.TEXTAREA;
    case FieldType.SINGLE_SELECT:
      return ComponentType.DROPDOWN;
    case FieldType.MULTI_SELECT:
      return ComponentType.CHECKBOX_GROUP;
    case FieldType.DATE:
      return ComponentType.DATE;
    case FieldType.USER_REFERENCE:
      return ComponentType.USER_SELECT;
    default:
      return ComponentType.INPUT;
  }
};

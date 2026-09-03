import type { ComponentType, FieldSpec, FormFieldType } from '../../../types/form';
import type { CustomFieldInputProps } from '../../ui/CustomFieldInput/CustomFieldInput';

type InputVariant = CustomFieldInputProps['fieldType'];

/**
 * v3 ComponentType -> the CustomFieldInput variant that draws it.
 *
 * In v2 this mapped a CustomFieldDefinition's type plus an optional override.
 * In v3 the COMPONENT TYPE IS the presentation choice — that is exactly the
 * visual/data split (see FormDocument.ts): `field.dataType` says what is
 * stored, `element.type` says how it is drawn, and the backend's
 * FormDocumentValidator refuses any pairing where the drawing cannot represent
 * what is stored.
 */
const COMPONENT_TO_INPUT: Partial<Record<ComponentType, InputVariant>> = {
  INPUT: 'text',
  TEXTAREA: 'multiline',
  DROPDOWN: 'dropdown',
  RADIO_GROUP: 'radio',
  CHECKBOX_GROUP: 'multi-select',
  DATE: 'date',
  USER_SELECT: 'user-select',
};

/**
 * The variant a dataType falls back to when the component type does not pin
 * one — and the safety net if an unknown component type ever reaches the
 * renderer. A field the UI does not recognise must still be readable and
 * editable, never blank.
 */
const DATA_TYPE_TO_INPUT: Record<FormFieldType, InputVariant> = {
  TEXT: 'text',
  LONG_TEXT: 'multiline',
  NUMBER: 'number',
  DATE: 'date',
  BOOLEAN: 'checkbox',
  SINGLE_SELECT: 'dropdown',
  MULTI_SELECT: 'multi-select',
  EMAIL: 'email',
  // Signature is drawn by its own component, never by CustomFieldInput; this
  // entry exists only so the record is exhaustive.
  SIGNATURE: 'text',
  USER_REFERENCE: 'user-select',
};

export const inputVariantFor = (type: ComponentType, field: FieldSpec): InputVariant => {
  // EMAIL and NUMBER are dataType-driven: both draw as a plain INPUT, but the
  // control needs the narrower keyboard/validation affordance.
  if (type === 'INPUT' && (field.dataType === 'EMAIL' || field.dataType === 'NUMBER')) {
    return DATA_TYPE_TO_INPUT[field.dataType];
  }
  return COMPONENT_TO_INPUT[type] ?? DATA_TYPE_TO_INPUT[field.dataType] ?? 'text';
};

/** Which component types the properties panel may offer for a dataType.
 *  Mirrors ALLOWED_COMPONENTS in the backend FormDocumentValidator — a change
 *  here without the matching backend change produces a save the server
 *  refuses, so the two lists are deliberately identical. */
export const componentOptionsFor = (dataType: FormFieldType): ComponentType[] => {
  switch (dataType) {
    case 'SINGLE_SELECT':
      return ['DROPDOWN', 'RADIO_GROUP'];
    case 'MULTI_SELECT':
      return ['CHECKBOX_GROUP'];
    case 'TEXT':
      return ['INPUT', 'TEXTAREA'];
    case 'LONG_TEXT':
      return ['TEXTAREA', 'INPUT'];
    case 'EMAIL':
    case 'NUMBER':
      return ['INPUT'];
    case 'DATE':
      return ['DATE'];
    case 'BOOLEAN':
      return ['CHECKBOX_GROUP'];
    case 'SIGNATURE':
      return ['SIGNATURE'];
    case 'USER_REFERENCE':
      return ['USER_SELECT'];
    default:
      return [];
  }
};

/** Option labels for CustomFieldInput, which takes plain strings. The stable
 *  `value` is what gets submitted; `label` is only ever display text (§15). */
export const optionLabels = (field: FieldSpec): string[] =>
  (field.options ?? []).map((o) => o.label);

/** A value the user has not filled in, matching the backend's blank rule. */
export const isBlank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

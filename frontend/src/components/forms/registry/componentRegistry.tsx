import {
  AlignLeft,
  Calendar,
  CheckSquare,
  ChevronDownSquare,
  CircleDot,
  Image as ImageIcon,
  Minus,
  PenLine,
  TextCursorInput,
  Type,
  UserSquare,
} from 'lucide-react';
import {
  DividerRender,
  ImageRender,
  SignatureRender,
  TextRender,
  inputRenderer,
} from './renderers';
import { wrapText } from './content';
import type { ComponentDefinition } from './types';
import type { ComponentType } from '../../../types/form';

export { wrapText };

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const COMPONENT_REGISTRY: Record<ComponentType, ComponentDefinition> = {
  TEXT: {
    type: 'TEXT',
    labelKey: 'components.TEXT',
    icon: Type,
    defaultSize: { width: 320, height: 40 },
    defaultContent: () => wrapText(''),
    Render: TextRender,
    addable: true,
  },

  IMAGE: {
    type: 'IMAGE',
    labelKey: 'components.IMAGE',
    icon: ImageIcon,
    defaultSize: { width: 200, height: 120 },
    // No defaultContent: an image element only exists once an upload
    // succeeded, so the url is supplied at creation (see FormBuilder).
    Render: ImageRender,
    addable: true,
  },

  DIVIDER: {
    type: 'DIVIDER',
    labelKey: 'components.DIVIDER',
    icon: Minus,
    defaultSize: { width: 320, height: 20 },
    defaultContent: () => ({ orientation: 'horizontal', thickness: 2 }),
    Render: DividerRender,
    addable: true,
  },

  INPUT: {
    type: 'INPUT',
    labelKey: 'components.INPUT',
    icon: TextCursorInput,
    defaultSize: { width: 260, height: 56 },
    defaultField: () => ({ label: 'Untitled field', dataType: 'TEXT', required: false }),
    Render: inputRenderer('text'),
    addable: true,
  },

  TEXTAREA: {
    type: 'TEXTAREA',
    labelKey: 'components.TEXTAREA',
    icon: AlignLeft,
    defaultSize: { width: 320, height: 96 },
    defaultField: () => ({ label: 'Untitled field', dataType: 'LONG_TEXT', required: false }),
    Render: inputRenderer('multiline'),
    addable: true,
  },

  CHECKBOX_GROUP: {
    type: 'CHECKBOX_GROUP',
    labelKey: 'components.CHECKBOX_GROUP',
    icon: CheckSquare,
    defaultSize: { width: 300, height: 96 },
    defaultField: () => ({
      label: 'Untitled field',
      dataType: 'MULTI_SELECT',
      required: false,
      // A choice field with no options cannot be saved (the validator refuses
      // it), so a new one arrives usable rather than immediately invalid.
      options: [
        { value: 'option_1', label: 'Option 1' },
        { value: 'option_2', label: 'Option 2' },
      ],
    }),
    Render: inputRenderer('multi-select'),
    addable: true,
  },

  RADIO_GROUP: {
    type: 'RADIO_GROUP',
    labelKey: 'components.RADIO_GROUP',
    icon: CircleDot,
    defaultSize: { width: 300, height: 96 },
    defaultField: () => ({
      label: 'Untitled field',
      dataType: 'SINGLE_SELECT',
      required: false,
      options: [
        { value: 'option_1', label: 'Option 1' },
        { value: 'option_2', label: 'Option 2' },
      ],
    }),
    Render: inputRenderer('radio'),
    addable: true,
  },

  DROPDOWN: {
    type: 'DROPDOWN',
    labelKey: 'components.DROPDOWN',
    icon: ChevronDownSquare,
    defaultSize: { width: 260, height: 56 },
    defaultField: () => ({
      label: 'Untitled field',
      dataType: 'SINGLE_SELECT',
      required: false,
      options: [
        { value: 'option_1', label: 'Option 1' },
        { value: 'option_2', label: 'Option 2' },
      ],
    }),
    Render: inputRenderer('dropdown'),
    addable: true,
  },

  DATE: {
    type: 'DATE',
    labelKey: 'components.DATE',
    icon: Calendar,
    defaultSize: { width: 220, height: 56 },
    defaultField: () => ({ label: 'Untitled date', dataType: 'DATE', required: false }),
    Render: inputRenderer('date'),
    addable: true,
  },

  SIGNATURE: {
    type: 'SIGNATURE',
    labelKey: 'components.SIGNATURE',
    icon: PenLine,
    defaultSize: { width: 280, height: 90 },
    defaultField: () => ({ label: 'Signature', dataType: 'SIGNATURE', required: false }),
    Render: SignatureRender,
    addable: true,
  },

  USER_SELECT: {
    type: 'USER_SELECT',
    labelKey: 'components.USER_SELECT',
    icon: UserSquare,
    defaultSize: { width: 260, height: 56 },
    defaultField: () => ({ label: 'Assigned to', dataType: 'USER_REFERENCE', required: false }),
    Render: inputRenderer('user-select'),
    // Only meaningful bound to a tenant USER_REFERENCE field, which is a
    // client-record concern rather than a document one — so it is reachable
    // by migration and by changing a field's type, but is not offered as a
    // thing to drop onto a blank page.
    addable: false,
  },
};

export const ADDABLE_COMPONENTS: ComponentDefinition[] = Object.values(COMPONENT_REGISTRY).filter(
  (c) => c.addable
);

export const componentFor = (type: ComponentType): ComponentDefinition | undefined =>
  COMPONENT_REGISTRY[type];

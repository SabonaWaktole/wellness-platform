import type React from 'react';
import type { Control, FieldValues } from 'react-hook-form';
import type {
  ComponentType,
  ElementContent,
  FieldSpec,
  FormElement,
} from '../../../types/form';

export type RenderMode = 'edit' | 'fill' | 'print';

export interface ComponentRenderProps {
  element: FormElement;
  mode: RenderMode;
  /** Absent in `print`. */
  control?: Control<FieldValues>;
  /** react-hook-form path for this element's value: `${namePrefix}.${key}`. */
  name: string;
  error?: string;
  /** Stored value, used by `print`. */
  value?: unknown;
  /** Options for USER_SELECT. Supplied at render time, never stored. */
  userOptions: { id: string; label: string }[];
  /** Uploads a data URL (a drawn signature) and returns its stored path. */
  onUploadAsset?: (dataUrl: string) => Promise<string>;
}

export interface ComponentPropertiesProps {
  element: FormElement;
  onChange: (changes: Partial<FormElement>) => void;
}

/**
 * One entry per component type. Adding a future type (table, file upload,
 * rating, currency — spec §36) means adding an entry here and nothing else:
 * the Add menu, the renderer and the properties panel are all driven off this
 * map rather than off switch statements scattered through the tree.
 *
 * This is the "open component registry, not a closed switch statement" the
 * brief §4 explicitly requires.
 */
export interface ComponentDefinition {
  type: ComponentType;
  /** i18n key under the `forms` namespace, e.g. `components.INPUT`. */
  labelKey: string;
  icon: React.ComponentType<{ size?: number }>;
  /** Size a freshly added component gets. */
  defaultSize: { width: number; height: number };
  /**
   * Present iff the component collects data. Returns the FieldSpec minus its
   * `key`, which is minted by the caller against the whole document so it is
   * unique (§11).
   */
  defaultField?: () => Omit<FieldSpec, 'key'>;
  /** Presentation payload for a freshly added component. */
  defaultContent?: () => ElementContent;
  /** Draws the component in every mode — one path for builder, fill, print. */
  Render: React.FC<ComponentRenderProps>;
  /** Type-specific controls, shown above the shared Appearance/Layout groups. */
  Properties?: React.FC<ComponentPropertiesProps>;
  /** Offered in the Add menu. False for types only reachable by migration. */
  addable: boolean;
}

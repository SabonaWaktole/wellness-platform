import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { COMPONENT_REGISTRY, ADDABLE_COMPONENTS, componentFor } from './componentRegistry';
import { PRESENTATION_ONLY_TYPES, isDataBearing, type ComponentType, type FormElement } from '../../../types/form';
import enForms from '../../../locales/en/forms.json';

const ALL_TYPES = Object.keys(COMPONENT_REGISTRY) as ComponentType[];

describe('component registry — structural invariants', () => {
  /*
   * The registry is the extension point (brief §4). These invariants are what
   * make "add one entry and nothing else" actually true — each one is a way a
   * future component could be added half-wired and fail only at runtime.
   */
  it('keys every entry by its own type', () => {
    for (const [key, def] of Object.entries(COMPONENT_REGISTRY)) {
      expect(def.type).toBe(key);
    }
  });

  it('gives every data-bearing type a defaultField, and no presentation type one', () => {
    for (const type of ALL_TYPES) {
      const def = COMPONENT_REGISTRY[type];
      if (isDataBearing(type)) {
        expect(def.defaultField, `${type} must supply a defaultField`).toBeDefined();
      } else {
        expect(def.defaultField, `${type} must NOT supply a defaultField`).toBeUndefined();
      }
    }
  });

  it('gives every presentation-only type a renderable default, except IMAGE', () => {
    for (const type of PRESENTATION_ONLY_TYPES) {
      const def = COMPONENT_REGISTRY[type];
      if (type === 'IMAGE') {
        // An image cannot exist before its upload succeeds, so it has no
        // placeholder content — the Add menu opens a file picker instead.
        expect(def.defaultContent).toBeUndefined();
      } else {
        expect(def.defaultContent, `${type} needs defaultContent`).toBeDefined();
      }
    }
  });

  it('gives every entry a usable default size', () => {
    for (const type of ALL_TYPES) {
      const { width, height } = COMPONENT_REGISTRY[type].defaultSize;
      // Must clear the document's MIN_SIZE_PX or the element is born invalid.
      expect(width, `${type} width`).toBeGreaterThanOrEqual(20);
      expect(height, `${type} height`).toBeGreaterThanOrEqual(20);
    }
  });

  /*
   * A choice field with no options is refused by the server-side validator,
   * so one dropped from the Add menu must arrive already usable rather than
   * immediately unsaveable.
   */
  it('gives every choice component starter options', () => {
    for (const type of ALL_TYPES) {
      const field = COMPONENT_REGISTRY[type].defaultField?.();
      if (field && (field.dataType === 'SINGLE_SELECT' || field.dataType === 'MULTI_SELECT')) {
        expect(field.options?.length, `${type} needs starter options`).toBeGreaterThan(0);
      }
    }
  });

  it('has a translated label for every entry in the base locale', () => {
    for (const type of ALL_TYPES) {
      const key = COMPONENT_REGISTRY[type].labelKey.replace('components.', '');
      expect((enForms.components as Record<string, string>)[key], `missing en label for ${type}`).toBeTruthy();
    }
  });

  it('offers every type in the Add menu except USER_SELECT', () => {
    const addable = ADDABLE_COMPONENTS.map((c) => c.type);
    expect(addable).not.toContain('USER_SELECT');
    expect(addable.length).toBe(ALL_TYPES.length - 1);
  });

  it('returns undefined for an unknown type rather than throwing', () => {
    expect(componentFor('NOT_A_TYPE' as ComponentType)).toBeUndefined();
  });
});

describe('component registry — rendering', () => {
  const el = (type: ComponentType): FormElement => {
    const def = COMPONENT_REGISTRY[type];
    const field = def.defaultField?.();
    return {
      id: 'e1',
      type,
      x: 0,
      y: 0,
      ...def.defaultSize,
      content: type === 'IMAGE' ? { url: '/uploads/x.webp' } : def.defaultContent?.(),
      field: field ? { ...field, key: 'k' } : undefined,
    };
  };

  const Harness: React.FC<{ type: ComponentType; mode?: 'edit' | 'fill' | 'print' }> = ({ type, mode = 'fill' }) => {
    const { control } = useForm({ defaultValues: { data: {} } });
    const def = COMPONENT_REGISTRY[type];
    return (
      <def.Render
        element={el(type)}
        mode={mode}
        control={control as never}
        name="data.k"
        userOptions={[]}
        value={undefined}
      />
    );
  };

  it.each(ALL_TYPES)('renders %s in fill mode without throwing', (type) => {
    expect(() => render(<Harness type={type} />)).not.toThrow();
  });

  it.each(ALL_TYPES)('renders %s in print mode without throwing', (type) => {
    expect(() => render(<Harness type={type} mode="print" />)).not.toThrow();
  });

  it('renders a data-bearing component with its label', () => {
    render(<Harness type="INPUT" />);
    expect(screen.getByLabelText(/Untitled field/)).toBeInTheDocument();
  });

  it('renders starter options for a checkbox group', () => {
    render(<Harness type="CHECKBOX_GROUP" />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('renders a signature as a read-only ruled block outside fill mode', () => {
    render(<Harness type="SIGNATURE" mode="edit" />);
    // The builder is a design surface: the pad must not be drawable there.
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('renders a drawable canvas for a signature in fill mode', () => {
    render(<Harness type="SIGNATURE" mode="fill" />);
    expect(document.querySelector('canvas')).toBeTruthy();
  });
});

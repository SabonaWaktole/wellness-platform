import {
  migrateLayoutToV2,
  fieldElementsOf,
  emptyLayout,
  FORM_LAYOUT_VERSION,
} from '../../../../../src/forms/domain/value-objects/FormLayout';
import { FormItemKind } from '../../../../../src/forms/domain/enums/FormItemKind';

/*
 * v1 → v2 forward migration. Forms saved before the canvas rewrite must keep
 * opening — a blank canvas where a business owner's form used to be is a
 * worse failure than an imperfectly reflowed one.
 */
describe('migrateLayoutToV2', () => {
  const v1Layout = (sections: any[]) => ({ version: 1, sections });

  it('passes a v2 document straight through unchanged', () => {
    const v2 = {
      version: FORM_LAYOUT_VERSION,
      page: { width: 900, height: 1200 },
      sections: [{ id: 's1', title: 'X', x: 0, y: 0, width: 400, height: 200, elements: [] }],
    };
    expect(migrateLayoutToV2(v2)).toEqual(v2);
  });

  it('gives every v1 field element real x/y/width/height', () => {
    const raw = v1Layout([
      {
        id: 's1',
        title: 'Company Information',
        columns: 2,
        items: [
          { id: 'i1', kind: 'FIELD', fieldId: 'f1' },
          { id: 'i2', kind: 'FIELD', fieldId: 'f2' },
        ],
      },
    ]);

    const migrated = migrateLayoutToV2(raw);

    expect(migrated.version).toBe(FORM_LAYOUT_VERSION);
    expect(migrated.sections).toHaveLength(1);
    const elements = fieldElementsOf(migrated);
    expect(elements).toHaveLength(2);
    for (const el of elements) {
      expect(Number.isFinite(el.x)).toBe(true);
      expect(Number.isFinite(el.y)).toBe(true);
      expect(el.width).toBeGreaterThan(0);
      expect(el.height).toBeGreaterThan(0);
    }
    // Side-by-side items in a 2-column section land on the same row.
    expect(elements[0].y).toBe(elements[1].y);
    expect(elements[0].x).not.toBe(elements[1].x);
  });

  it('gives a colSpan-2 item its own full-width row', () => {
    const raw = v1Layout([
      {
        id: 's1',
        title: 'S',
        columns: 2,
        items: [
          { id: 'i1', kind: 'FIELD', fieldId: 'f1' },
          { id: 'i2', kind: 'FIELD', fieldId: 'f2', colSpan: 2 },
          { id: 'i3', kind: 'FIELD', fieldId: 'f3' },
        ],
      },
    ]);

    const migrated = migrateLayoutToV2(raw);
    const elements = fieldElementsOf(migrated);
    const byId = new Map(elements.map((e) => [e.fieldId, e]));

    // f2 (colSpan 2) sits on its own row, below f1 and above f3.
    expect(byId.get('f2')!.y).toBeGreaterThan(byId.get('f1')!.y);
    expect(byId.get('f3')!.y).toBeGreaterThan(byId.get('f2')!.y);
  });

  it('migrates HEADING and PARAGRAPH to TEXT elements, preserving the text', () => {
    const raw = v1Layout([
      {
        id: 's1',
        title: 'S',
        columns: 1,
        items: [
          { id: 'i1', kind: 'HEADING', text: 'Workforce', level: 2 },
          { id: 'i2', kind: 'PARAGRAPH', text: 'Explain here.' },
        ],
      },
    ]);

    const migrated = migrateLayoutToV2(raw);
    const texts = migrated.sections[0].elements.filter((e) => e.kind === FormItemKind.TEXT) as any[];
    expect(texts.map((t) => t.text)).toEqual(['Workforce', 'Explain here.']);
  });

  it('drops SPACER items — absolute position already encodes the gap', () => {
    const raw = v1Layout([
      {
        id: 's1',
        title: 'S',
        columns: 1,
        items: [
          { id: 'i1', kind: 'FIELD', fieldId: 'f1' },
          { id: 'i2', kind: 'SPACER', heightPx: 40 },
          { id: 'i3', kind: 'FIELD', fieldId: 'f2' },
        ],
      },
    ]);

    const migrated = migrateLayoutToV2(raw);
    expect(migrated.sections[0].elements.map((e) => e.id)).toEqual(['i1', 'i3']);
  });

  it('carries a v1 accentHex forward as a border colour', () => {
    const raw = v1Layout([
      { id: 's1', title: 'S', columns: 1, items: [{ id: 'i1', kind: 'FIELD', fieldId: 'f1', accentHex: '#2563eb' }] },
    ]);
    const migrated = migrateLayoutToV2(raw);
    const el = fieldElementsOf(migrated)[0] as any;
    expect(el.styles?.borderColor).toBe('#2563eb');
  });

  it('lays out multiple sections stacked vertically on one page', () => {
    const raw = v1Layout([
      { id: 's1', title: 'A', columns: 1, items: [{ id: 'i1', kind: 'FIELD', fieldId: 'f1' }] },
      { id: 's2', title: 'B', columns: 1, items: [{ id: 'i2', kind: 'FIELD', fieldId: 'f2' }] },
    ]);
    const migrated = migrateLayoutToV2(raw);
    expect(migrated.sections).toHaveLength(2);
    expect(migrated.sections[1].y).toBeGreaterThan(migrated.sections[0].y + migrated.sections[0].height - 1);
  });

  it('falls back to an empty layout for garbage input', () => {
    expect(migrateLayoutToV2(null)).toEqual(emptyLayout());
    expect(migrateLayoutToV2('not an object')).toEqual(emptyLayout());
    expect(migrateLayoutToV2({ version: 2 })).toEqual(emptyLayout());
  });

  it('produces an empty-but-valid layout when sections is missing on a v1-ish document', () => {
    const migrated = migrateLayoutToV2({ version: 1 });
    expect(migrated.version).toBe(FORM_LAYOUT_VERSION);
    expect(migrated.sections).toEqual([]);
  });
});

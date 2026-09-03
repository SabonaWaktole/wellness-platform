import {
  FORM_DOCUMENT_VERSION,
  A4_PORTRAIT,
  DEFAULT_MARGIN,
  emptyDocument,
  migrateDocumentToV3,
  fieldSpecsOf,
} from '../../../../../src/forms/domain/value-objects/FormDocument';
import { ComponentType } from '../../../../../src/forms/domain/enums/ComponentType';
import { FormItemKind } from '../../../../../src/forms/domain/enums/FormItemKind';
import { FormControlVariant } from '../../../../../src/forms/domain/enums/FormControlVariant';
import type { FormLayout } from '../../../../../src/forms/domain/value-objects/FormLayout';

describe('migrateDocumentToV3', () => {
  it('returns an empty single-page A4 document for null/malformed input', () => {
    const doc = migrateDocumentToV3(null);
    expect(doc.version).toBe(FORM_DOCUMENT_VERSION);
    expect(doc.page.width).toBe(A4_PORTRAIT.width);
    expect(doc.page.height).toBe(A4_PORTRAIT.height);
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].sections).toEqual([]);
  });

  it('passes an already-v3 document through unchanged', () => {
    const doc = emptyDocument();
    const result = migrateDocumentToV3(doc as unknown);
    expect(result).toEqual(doc);
  });

  it('slices a v2 elastic-page layout into A4 pages by section y, rebasing coordinates', () => {
    const v2: FormLayout = {
      version: 2,
      page: { width: 900, height: 2400 },
      sections: [
        {
          id: 's1',
          title: 'Top of page 1',
          x: 24, y: 24, width: 400, height: 200,
          elements: [],
        },
        {
          id: 's2',
          // y=1300 falls past one A4 page (1123px) -> page index 1
          title: 'Should land on page 2',
          x: 24, y: 1300, width: 400, height: 200,
          elements: [],
        },
      ],
    };

    const doc = migrateDocumentToV3(v2 as unknown);

    expect(doc.pages.length).toBeGreaterThanOrEqual(2);
    const page0Ids = doc.pages[0].sections.map((s) => s.id);
    const page1Ids = doc.pages[1].sections.map((s) => s.id);
    expect(page0Ids).toContain('s1');
    expect(page1Ids).toContain('s2');

    // Rebased to page-local y: s2 was at absolute y=1300 on a 1123px page grid,
    // so its page-local y should be 1300 - 1123 = 177, not the original 1300.
    const s2 = doc.pages[1].sections.find((s) => s.id === 's2')!;
    expect(s2.y).toBe(1300 - A4_PORTRAIT.height);
  });

  it('maps a v2 FIELD element to a data-bearing component with a stable field.key and clientFieldId binding', () => {
    const v2: FormLayout = {
      version: 2,
      page: { width: 900, height: 1200 },
      sections: [
        {
          id: 's1',
          title: 'Section',
          x: 0, y: 0, width: 400, height: 200,
          elements: [
            {
              id: 'el1',
              kind: FormItemKind.FIELD,
              fieldId: 'cfd_123',
              control: FormControlVariant.CHECKBOX_GROUP,
              label: 'Preferred Contact',
              requiredOverride: true,
              x: 10, y: 10, width: 200, height: 40,
            },
          ],
        },
      ],
    };

    const doc = migrateDocumentToV3(v2 as unknown);
    const el = doc.pages[0].sections[0].elements[0];

    expect(el.type).toBe(ComponentType.CHECKBOX_GROUP);
    expect(el.field).toBeDefined();
    expect(el.field!.clientFieldId).toBe('cfd_123');
    expect(el.field!.label).toBe('Preferred Contact');
    expect(el.field!.key).toMatch(/^[a-z0-9_]+$/);
    expect(el.field!.required).toBe(true);
  });

  it('generates unique field keys even when two elements share a label', () => {
    const v2: FormLayout = {
      version: 2,
      page: { width: 900, height: 1200 },
      sections: [
        {
          id: 's1', title: 'S', x: 0, y: 0, width: 400, height: 300,
          elements: [
            { id: 'el1', kind: FormItemKind.FIELD, fieldId: 'a', label: 'Name', x: 0, y: 0, width: 100, height: 40 },
            { id: 'el2', kind: FormItemKind.FIELD, fieldId: 'b', label: 'Name', x: 0, y: 50, width: 100, height: 40 },
          ],
        },
      ],
    };

    const doc = migrateDocumentToV3(v2 as unknown);
    const keys = fieldSpecsOf(doc).map((f) => f.key);
    expect(new Set(keys).size).toBe(2);
  });

  it('wraps a v2 TEXT element string into a rich-text document', () => {
    const v2: FormLayout = {
      version: 2,
      page: { width: 900, height: 1200 },
      sections: [
        {
          id: 's1', title: 'S', x: 0, y: 0, width: 400, height: 100,
          elements: [
            { id: 'el1', kind: FormItemKind.TEXT, text: 'Hello world', x: 0, y: 0, width: 200, height: 30 },
          ],
        },
      ],
    };

    const doc = migrateDocumentToV3(v2 as unknown);
    const el = doc.pages[0].sections[0].elements[0];
    expect(el.type).toBe(ComponentType.TEXT);
    expect(el.content).toBeDefined();
  });

  it('clamps a section taller than one usable A4 page to the usable page height', () => {
    const usable = A4_PORTRAIT.height - DEFAULT_MARGIN.top - DEFAULT_MARGIN.bottom;
    const v2: FormLayout = {
      version: 2,
      page: { width: 900, height: 5000 },
      sections: [
        { id: 'tall', title: 'Tall', x: 0, y: 0, width: 400, height: usable + 900, elements: [] },
      ],
    };

    const doc = migrateDocumentToV3(v2 as unknown);
    const tall = doc.pages.flatMap((p) => p.sections).find((s) => s.id === 'tall')!;
    expect(tall.height).toBeLessThanOrEqual(usable);
  });
});

describe('fieldSpecsOf', () => {
  it('flattens every field across every page and section', () => {
    const doc = emptyDocument();
    expect(fieldSpecsOf(doc)).toEqual([]);
  });
});

/*
 * Found by running a real migrated tenant form through the API: v2 pages were
 * up to 900px wide, so sections legitimately reached 832px — wider than an A4
 * page's 698px usable area. The document read back fine but was UNSAVEABLE,
 * because FormDocumentValidator.assertSectionFitsPage refuses it. Migration
 * must land inside the same bounds live editing is held to.
 */
describe('migrateDocumentToV3 — fits the A4 usable area', () => {
  const usableW = A4_PORTRAIT.width - DEFAULT_MARGIN.left - DEFAULT_MARGIN.right;
  const usableH = A4_PORTRAIT.height - DEFAULT_MARGIN.top - DEFAULT_MARGIN.bottom;

  it('clamps a section wider than the usable page width', () => {
    const v2: FormLayout = {
      version: 2,
      page: { width: 900, height: 1200 },
      sections: [{ id: 'wide', title: 'Wide', x: 32, y: 32, width: 832, height: 200, elements: [] }],
    };

    const doc = migrateDocumentToV3(v2 as unknown);
    const s = doc.pages[0].sections[0];

    expect(s.width).toBeLessThanOrEqual(usableW);
    expect(s.x + s.width).toBeLessThanOrEqual(A4_PORTRAIT.width - DEFAULT_MARGIN.right);
  });

  it('pulls a section positioned outside the left/top margin back inside it', () => {
    const v2: FormLayout = {
      version: 2,
      page: { width: 900, height: 1200 },
      sections: [{ id: 'off', title: 'Off', x: 0, y: 0, width: 300, height: 100, elements: [] }],
    };

    const doc = migrateDocumentToV3(v2 as unknown);
    const s = doc.pages[0].sections[0];

    expect(s.x).toBeGreaterThanOrEqual(DEFAULT_MARGIN.left);
    expect(s.y).toBeGreaterThanOrEqual(DEFAULT_MARGIN.top);
  });

  it('keeps every element inside its clamped section', () => {
    const v2: FormLayout = {
      version: 2,
      page: { width: 900, height: 1200 },
      sections: [
        {
          id: 'wide',
          title: 'Wide',
          x: 32, y: 32, width: 832, height: 300,
          elements: [
            { id: 'e1', kind: FormItemKind.TEXT, text: 'far right', x: 700, y: 10, width: 120, height: 40 },
          ],
        },
      ],
    };

    const doc = migrateDocumentToV3(v2 as unknown);
    const s = doc.pages[0].sections[0];
    const e = s.elements[0];

    expect(e.x + e.width).toBeLessThanOrEqual(s.width);
  });

  // The "passes the save-time validator" case lives in
  // FormDocumentValidator.test.ts, added alongside FormDocumentValidator
  // itself — this file only depends on FormDocument/FormLayout.
});

import { formDocumentSchema } from '../../../../../../src/forms/interfaces/http/schemas/formSchemas';
import { FORM_DOCUMENT_VERSION, emptyPageGeometry } from '../../../../../../src/forms/domain/value-objects/FormDocument';

/**
 * `updateFormLayoutSchema.parse()`'s OUTPUT is what gets persisted
 * (`FormController.ts`), and zod's `z.object` strips any key it does not
 * recognise by default. A property added to the frontend/domain types but
 * missed here is not rejected — it is silently dropped: the author sets it,
 * the save reports success, and it is gone on reload. Nothing else in this
 * suite would catch that, because a stripped-but-otherwise-valid document
 * still parses successfully. This test exists solely to fail loudly the
 * moment a new styles/titleStyles property is added to the domain type
 * without a matching zod field — see FormDocument.ts's module doc on the
 * properties this currently guards: `titleStyles.background`,
 * `styles.fieldLayout`, `styles.optionColumns`, `styles.density`.
 */
describe('formDocumentSchema round-trip', () => {
  it('keeps every new styles/titleStyles property through parse()', () => {
    const input = {
      version: FORM_DOCUMENT_VERSION,
      page: emptyPageGeometry(),
      pages: [
        {
          id: 'p1',
          sections: [
            {
              id: 's1',
              title: '1. COMPANY DATA',
              x: 10,
              y: 10,
              width: 300,
              height: 200,
              titleStyles: { background: '#1d4ed8', color: '#ffffff', align: 'left' },
              elements: [
                {
                  id: 'el1',
                  type: 'INPUT',
                  x: 5,
                  y: 5,
                  width: 100,
                  height: 30,
                  styles: { fieldLayout: 'inline', optionColumns: 4, density: 'compact' },
                  field: {
                    key: 'company_name',
                    label: 'Company Name',
                    dataType: 'TEXT',
                    required: false,
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const parsed = formDocumentSchema.parse(input);
    const section = parsed.pages[0].sections[0];
    const element = section.elements[0];

    expect(section.titleStyles?.background).toBe('#1d4ed8');
    expect(section.titleStyles?.color).toBe('#ffffff');
    expect(element.styles?.fieldLayout).toBe('inline');
    expect(element.styles?.optionColumns).toBe(4);
    expect(element.styles?.density).toBe('compact');
  });

  it('still rejects a non-hex title band colour', () => {
    const input = {
      version: FORM_DOCUMENT_VERSION,
      page: emptyPageGeometry(),
      pages: [
        {
          id: 'p1',
          sections: [
            {
              id: 's1',
              x: 10,
              y: 10,
              width: 300,
              height: 200,
              titleStyles: { background: 'blue' },
              elements: [],
            },
          ],
        },
      ],
    };

    expect(formDocumentSchema.safeParse(input).success).toBe(false);
  });
});

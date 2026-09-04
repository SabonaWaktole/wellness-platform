import {
  cloneDocumentWithFreshIds,
  emptyPageGeometry,
} from '../../../../../src/forms/domain/value-objects/FormDocument';
import { ComponentType } from '../../../../../src/forms/domain/enums/ComponentType';
import { FormFieldType } from '../../../../../src/forms/domain/enums/FormFieldType';
import type { FormDocument } from '../../../../../src/forms/domain/value-objects/FormDocument';

const fixture = (): FormDocument => ({
  version: 3,
  page: emptyPageGeometry(),
  pages: [
    {
      id: 'page-1',
      sections: [
        {
          id: 'section-1',
          x: 0,
          y: 0,
          width: 400,
          height: 200,
          elements: [
            {
              id: 'element-1',
              type: ComponentType.INPUT,
              x: 0,
              y: 0,
              width: 200,
              height: 40,
              field: {
                key: 'company_name',
                label: 'Company Name',
                dataType: FormFieldType.TEXT,
                required: true,
              },
            },
          ],
        },
      ],
    },
  ],
});

describe('cloneDocumentWithFreshIds', () => {
  it('mints a new id for every page, section and element', () => {
    const source = fixture();
    const clone = cloneDocumentWithFreshIds(source);

    expect(clone.pages[0].id).not.toBe('page-1');
    expect(clone.pages[0].sections[0].id).not.toBe('section-1');
    expect(clone.pages[0].sections[0].elements[0].id).not.toBe('element-1');
  });

  it('preserves field.key — a key is only unique per-form, not globally', () => {
    const clone = cloneDocumentWithFreshIds(fixture());
    expect(clone.pages[0].sections[0].elements[0].field?.key).toBe('company_name');
  });

  it('is structurally independent of the source — editing one never touches the other', () => {
    const source = fixture();
    const clone = cloneDocumentWithFreshIds(source);

    clone.pages[0].sections[0].elements[0].field!.label = 'Renamed';
    clone.pages[0].sections[0].width = 999;

    expect(source.pages[0].sections[0].elements[0].field?.label).toBe('Company Name');
    expect(source.pages[0].sections[0].width).toBe(400);
  });
});

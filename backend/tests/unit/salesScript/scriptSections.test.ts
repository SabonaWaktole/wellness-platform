import { scriptSections } from '../../../src/salesScript/domain/scriptSections';

const heading = (level: number, ...texts: string[]) => ({
  type: 'heading',
  attrs: { level },
  content: texts.map((text) => ({ type: 'text', text })),
});
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('scriptSections', () => {
  it('FR-SCR-03 lists the section headings (H2) in order, with an anchor per section', () => {
    const doc = {
      type: 'doc' as const,
      content: [
        heading(2, 'Hapja'),
        paragraph('Prezantohuni.'),
        heading(3, 'Nën-temë'),
        heading(2, 'Pyetje për ', 'çmimin'),
        heading(1, 'Not a section'),
        heading(2, 'Hapja'),
      ],
    };

    expect(scriptSections(doc)).toEqual([
      { anchor: 'section-1', title: 'Hapja' },
      { anchor: 'section-2', title: 'Pyetje për çmimin' },
      { anchor: 'section-3', title: 'Hapja' },
    ]);
  });

  it('FR-SCR-03 skips an empty heading but keeps counting it, so anchors match the rendered headings', () => {
    const doc = { type: 'doc' as const, content: [heading(2), heading(2, 'Mbyllja')] };

    expect(scriptSections(doc)).toEqual([{ anchor: 'section-2', title: 'Mbyllja' }]);
  });

  it('returns no sections for no document', () => {
    expect(scriptSections(null)).toEqual([]);
  });
});

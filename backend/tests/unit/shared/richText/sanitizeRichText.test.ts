import {
  InvalidRichTextError,
  RichTextDoc,
  richTextPlainText,
  sanitizeRichText,
} from '../../../../src/shared/application/richText/sanitizeRichText';
import { richTextDocSchema as formRichTextDocSchema } from '../../../../src/forms/interfaces/http/schemas/formSchemas';

const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string, marks?: unknown[]) => (marks ? { type: 'text', text: value, marks } : { type: 'text', text: value });
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const link = (href: string) => ({ type: 'link', attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow', class: null } });

describe('Rich text sanitiser (NFR-SEC-05)', () => {
  it('NFR-SEC-05 HTML containing a <script> tag is stored as its text, without the script', () => {
    const stored = sanitizeRichText('<p>VAT not included.<script>alert(1)</script></p><p>Payment within <b>15 days</b>.</p>');

    expect(stored).toEqual(doc(paragraph(text('VAT not included.')), paragraph(text('Payment within 15 days.'))));
    expect(JSON.stringify(stored)).not.toMatch(/script|alert/);
  });

  it('NFR-SEC-05 a javascript: link in HTML is dropped, its text kept', () => {
    const stored = sanitizeRichText('<p><a href="javascript:alert(1)">Click here</a> for the terms.</p>');

    expect(stored).toEqual(doc(paragraph(text('Click here for the terms.'))));
  });

  it('NFR-SEC-05 plain text becomes one paragraph per line', () => {
    expect(sanitizeRichText('First line\n\nSecond line')).toEqual(doc(paragraph(text('First line')), paragraph(text('Second line'))));
  });

  it('NFR-SEC-05 a javascript: or data: link in a document loses the link and keeps its text', () => {
    for (const href of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>', '/relative', 'ftp://x']) {
      const stored = sanitizeRichText(doc(paragraph(text('Terms', [{ type: 'bold' }, link(href)]))));
      expect(stored).toEqual(doc(paragraph(text('Terms', [{ type: 'bold' }]))));
    }
  });

  it('NFR-SEC-05 https, http and mailto links are kept, with only their href', () => {
    for (const href of ['https://wellness.al/terms', 'http://wellness.al', 'mailto:info@wellness.al']) {
      expect(sanitizeRichText(doc(paragraph(text('Terms', [link(href)]))))).toEqual(
        doc(paragraph(text('Terms', [{ type: 'link', attrs: { href } }])))
      );
    }
  });

  it('NFR-SEC-05 keeps headings, lists, bold, italic and line breaks', () => {
    const input = doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('Terms')] },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [paragraph(text('Monthly', [{ type: 'italic' }]), { type: 'hardBreak' }, text('in EUR'))] }],
      },
      { type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [paragraph(text('One'))] }] }
    );

    expect(sanitizeRichText(input)).toEqual(input);
  });

  it.each([
    ['an unknown node', doc({ type: 'table', content: [] })],
    ['an unknown mark', doc(paragraph(text('x', [{ type: 'textStyle', attrs: { color: '#ff0000' } }])))],
    ['raw html in a node', doc({ type: 'html', html: '<script>alert(1)</script>' })],
    ['an extra attribute', doc({ type: 'paragraph', attrs: { onclick: 'alert(1)' }, content: [] })],
    ['a non-document', { type: 'paragraph', content: [] }],
    ['a number', 42],
  ])('NFR-SEC-05 refuses %s', (_label, input) => {
    expect(() => sanitizeRichText(input)).toThrow(InvalidRichTextError);
  });

  it('NFR-SEC-05 an empty document or empty text is stored as nothing', () => {
    expect(sanitizeRichText(null)).toBeNull();
    expect(sanitizeRichText('')).toBeNull();
    expect(sanitizeRichText('  <p> </p> ')).toBeNull();
    expect(sanitizeRichText(doc())).toBeNull();
    expect(sanitizeRichText(doc(paragraph()))).toBeNull();
  });

  it('refuses a document nested deeper than any editor produces', () => {
    let node: unknown = text('deep');
    for (let i = 0; i < 60; i++) node = { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph(node)] }] };
    expect(() => sanitizeRichText(doc(node))).toThrow(InvalidRichTextError);
  });

  it('gives the plain text of a document, one line per block, for the audit log', () => {
    const value = sanitizeRichText('<p>Prices are monthly.</p><ul><li>VAT not included.</li></ul>') as RichTextDoc;
    expect(richTextPlainText(value)).toBe('Prices are monthly.\nVAT not included.');
    expect(richTextPlainText(null)).toBeNull();
  });

  it('NFR-SEC-05 the form TEXT component still refuses links: the offer whitelist does not widen the forms one', () => {
    expect(formRichTextDocSchema.safeParse(doc(paragraph(text('x', [link('https://wellness.al')])))).success).toBe(false);
  });
});

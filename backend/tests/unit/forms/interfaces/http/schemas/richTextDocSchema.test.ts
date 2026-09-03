import { richTextDocSchema } from '../../../../../../src/forms/interfaces/http/schemas/formSchemas';

/**
 * The rich-text document is the one place in the whole document schema that
 * is recursive and reader-supplied HTML-adjacent content — the highest-risk
 * surface for something to sneak past validation. This whitelists exactly
 * the node/mark set the TipTap editor (registry/RichTextEditor.tsx) can
 * produce, never raw HTML, per spec §10 and the Phase 4 "never store raw
 * HTML" rule.
 */
describe('richTextDocSchema', () => {
  const doc = (content: unknown[]) => ({ type: 'doc', content });

  it('accepts an empty paragraph', () => {
    expect(richTextDocSchema.safeParse(doc([{ type: 'paragraph', content: [] }])).success).toBe(true);
  });

  it('accepts plain text inside a paragraph', () => {
    const result = richTextDocSchema.safeParse(
      doc([{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }])
    );
    expect(result.success).toBe(true);
  });

  it('accepts every whitelisted mark on a text node', () => {
    const marks = [
      { type: 'bold' },
      { type: 'italic' },
      { type: 'strike' },
      { type: 'underline' },
      { type: 'textStyle', attrs: { color: '#1d4ed8', fontFamily: 'Georgia', fontSize: '18px', backgroundColor: '#fef3c7' } },
    ];
    const result = richTextDocSchema.safeParse(
      doc([{ type: 'paragraph', content: [{ type: 'text', text: 'Styled', marks }] }])
    );
    expect(result.success).toBe(true);
  });

  it('rejects a mark type outside the whitelist', () => {
    const result = richTextDocSchema.safeParse(
      doc([{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }])
    );
    expect(result.success).toBe(false);
  });

  it('accepts headings at levels 1-3 with paragraph-style attrs', () => {
    const result = richTextDocSchema.safeParse(
      doc([{ type: 'heading', attrs: { level: 2, textAlign: 'center', lineHeight: '1.4' }, content: [{ type: 'text', text: 'Title' }] }])
    );
    expect(result.success).toBe(true);
  });

  it('rejects a heading level outside 1-3', () => {
    const result = richTextDocSchema.safeParse(
      doc([{ type: 'heading', attrs: { level: 6 }, content: [{ type: 'text', text: 'Title' }] }])
    );
    expect(result.success).toBe(false);
  });

  it('accepts bullet and ordered lists nested correctly', () => {
    const result = richTextDocSchema.safeParse(
      doc([
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }] }],
        },
        {
          type: 'orderedList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item' }] }] }],
        },
      ])
    );
    expect(result.success).toBe(true);
  });

  it('rejects a node type outside the whitelist (e.g. a table or raw html block)', () => {
    expect(richTextDocSchema.safeParse(doc([{ type: 'table', content: [] }])).success).toBe(false);
    expect(richTextDocSchema.safeParse(doc([{ type: 'html', html: '<script>alert(1)</script>' }])).success).toBe(false);
  });

  it('rejects an invalid colour on textStyle', () => {
    const result = richTextDocSchema.safeParse(
      doc([{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { color: 'red' } }] }] }])
    );
    expect(result.success).toBe(false);
  });

  it('rejects a textAlign value outside the whitelist', () => {
    const result = richTextDocSchema.safeParse(
      doc([{ type: 'paragraph', attrs: { textAlign: 'diagonal' }, content: [] }])
    );
    expect(result.success).toBe(false);
  });

  it('accepts a hard break', () => {
    const result = richTextDocSchema.safeParse(
      doc([{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] }])
    );
    expect(result.success).toBe(true);
  });

  it('rejects excessive nesting depth (a denial-of-service guard, not a UI limit)', () => {
    let node: unknown = { type: 'text', text: 'x' };
    for (let i = 0; i < 60; i += 1) {
      node = { type: 'bulletList', content: [{ type: 'listItem', content: [node] }] };
    }
    const result = richTextDocSchema.safeParse(doc([node]));
    expect(result.success).toBe(false);
  });

  it('accepts explicit null attrs — TipTap serialises every registered global attribute with its default (null) when unset, never omits the key', () => {
    // getJSON() from a real editor never produces `attrs: {}` for a node with
    // registered global attributes; it always includes every one of them,
    // `null` when unset. A schema built with plain `.optional()` (which
    // permits an absent key but not an explicit null) rejects this — the
    // exact document any real edit produces — and every autosave fails.
    const result = richTextDocSchema.safeParse(
      doc([{ type: 'paragraph', attrs: { textAlign: null, lineHeight: null }, content: [{ type: 'text', text: 'x' }] }])
    );
    expect(result.success).toBe(true);
  });

  it('accepts a textStyle mark with only one attribute set and the rest explicit null', () => {
    const result = richTextDocSchema.safeParse(
      doc([
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'textStyle', attrs: { color: '#dc2626', backgroundColor: null, fontFamily: null, fontSize: null } }],
            },
          ],
        },
      ])
    );
    expect(result.success).toBe(true);
  });

  it('rejects a document missing the required doc/content shape', () => {
    expect(richTextDocSchema.safeParse({ type: 'paragraph' }).success).toBe(false);
    expect(richTextDocSchema.safeParse(null).success).toBe(false);
  });
});

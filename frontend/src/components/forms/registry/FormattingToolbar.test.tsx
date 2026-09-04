import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useEditor, EditorContent } from '@tiptap/react';
import { FormattingToolbar } from './FormattingToolbar';
import { RICH_TEXT_EXTENSIONS } from './richTextExtensions';

/**
 * A real TipTap editor instance, mounted so the toolbar drives something
 * genuine rather than a mock — the whole point of this component is to stay
 * in sync with live editor state.
 *
 * Selection is set through the EDITOR's own command API
 * (`selectAll`/`setTextSelection`), not the DOM `Selection`/`Range` API —
 * ProseMirror keeps its own selection model and does not read it back from
 * `window.getSelection()`, so a DOM-level "select all" never reaches the
 * editor's actual state under jsdom (confirmed: the first cut of this test
 * used DOM Range/Selection and every command silently no-opped).
 */
const Harness: React.FC<{ initialText?: string; onEditor?: (editor: ReturnType<typeof useEditor>) => void }> = ({
  initialText = 'Hello',
  onEditor,
}) => {
  const editor = useEditor({
    extensions: RICH_TEXT_EXTENSIONS,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: initialText }] }] },
  });
  onEditor?.(editor);
  return (
    <div>
      <FormattingToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
};

describe('FormattingToolbar', () => {
  it('renders nothing while the editor is not yet ready', () => {
    const { container } = render(<FormattingToolbar editor={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles bold on the current selection and reflects the active state', async () => {
    let editorRef: ReturnType<typeof useEditor> = null;
    render(<Harness onEditor={(e) => { editorRef = e; }} />);
    await act(async () => {
      editorRef?.commands.selectAll();
    });

    const boldBtn = screen.getByRole('button', { name: 'Bold' });
    await act(async () => {
      boldBtn.click();
    });

    expect(document.querySelector('strong')).toBeTruthy();
    expect(boldBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies a font size via the select', async () => {
    let editorRef: ReturnType<typeof useEditor> = null;
    render(<Harness onEditor={(e) => { editorRef = e; }} />);
    await act(async () => {
      editorRef?.commands.selectAll();
    });

    const select = screen.getByLabelText('Font size') as HTMLSelectElement;
    await act(async () => {
      select.value = '24px';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(document.querySelector('span[style*="font-size: 24px"]')).toBeTruthy();
  });

  it('sets a heading level from the paragraph-style select', async () => {
    render(<Harness />);
    const select = screen.getByLabelText('Paragraph style') as HTMLSelectElement;

    await act(async () => {
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(document.querySelector('h2')).toBeTruthy();
  });

  it('applies a line height to the paragraph via the select', async () => {
    let editorRef: ReturnType<typeof useEditor> = null;
    render(<Harness onEditor={(e) => { editorRef = e; }} />);
    await act(async () => {
      editorRef?.commands.selectAll();
    });

    const select = screen.getByLabelText('Line height') as HTMLSelectElement;
    await act(async () => {
      select.value = '1.5';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(document.querySelector('p')).toHaveStyle({ lineHeight: '1.5' });
    expect(select.value).toBe('1.5');
  });

  it('applies a line height to a heading, not a paragraph, when a heading is active', async () => {
    let editorRef: ReturnType<typeof useEditor> = null;
    render(<Harness onEditor={(e) => { editorRef = e; }} />);
    await act(async () => {
      editorRef?.commands.selectAll();
    });

    const paragraphSelect = screen.getByLabelText('Paragraph style') as HTMLSelectElement;
    await act(async () => {
      paragraphSelect.value = '2';
      paragraphSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // StarterKit's TrailingNode extension appends an empty paragraph after a
    // heading (a doc can't end on a heading), so a plain "select all" at this
    // point would span the heading AND that trailing paragraph — exactly the
    // ambiguous case this component resolves via `isActive('heading')`.
    // Reselect just the heading's own text, as a user clicking inside the
    // heading would, before exercising the line-height select.
    await act(async () => {
      editorRef?.commands.setTextSelection({ from: 1, to: 6 });
    });

    const select = screen.getByLabelText('Line height') as HTMLSelectElement;
    await act(async () => {
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(document.querySelector('h2')).toHaveStyle({ lineHeight: '2' });
    expect(document.querySelector('p')).not.toHaveStyle({ lineHeight: '2' });
  });

  it('lists exactly the whitelisted paragraph styles', () => {
    render(<Harness />);
    const select = screen.getByLabelText('Paragraph style') as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values.sort()).toEqual(['', '1', '2', '3']);
  });
});

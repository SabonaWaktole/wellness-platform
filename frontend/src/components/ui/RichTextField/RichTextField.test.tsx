import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { RichTextField } from './RichTextField';
import type { RichTextDoc } from '../../../types/form';
import '../../../i18n';

const doc = (text: string): RichTextDoc => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }) as RichTextDoc;

/** The live editor TipTap attaches to its DOM node; selection goes through its commands, as in FormattingToolbar.test. */
const liveEditor = () => (document.querySelector('.ProseMirror') as HTMLElement & { editor: Editor }).editor;

const renderField = (value: RichTextDoc | null = doc('VAT not included')) => {
  const onChange = vi.fn();
  render(<RichTextField label="Terms (English)" value={value} onChange={onChange} />);
  return onChange;
};

describe('RichTextField', () => {
  it('FR-PCF-08 shows the stored text in a labelled text box', () => {
    renderField();
    expect(screen.getByRole('textbox', { name: 'Terms (English)' }).textContent).toBe('VAT not included');
    expect(screen.getByRole('toolbar', { name: 'Formatting: Terms (English)' })).toBeDefined();
  });

  it('FR-PCF-08 makes the selection bold and reports the document as TipTap JSON', async () => {
    const onChange = renderField();
    await act(async () => {
      liveEditor().commands.selectAll();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
    });

    expect(screen.getByRole('button', { name: 'Bold' }).getAttribute('aria-pressed')).toBe('true');
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'VAT not included', marks: [{ type: 'bold' }] }] }],
    });
  });

  it('NFR-SEC-05 links the selection to a web address, read as https when typed bare', async () => {
    const onChange = renderField(doc('our site'));
    await act(async () => {
      liveEditor().commands.selectAll();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add a link' }));
    fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'wellness.al' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    });

    const last = onChange.mock.lastCall![0] as RichTextDoc;
    const text = (last.content[0] as any).content[0];
    expect(text.text).toBe('our site');
    expect(text.marks).toEqual([expect.objectContaining({ type: 'link', attrs: expect.objectContaining({ href: 'https://wellness.al' }) })]);
    expect(screen.getByRole('button', { name: 'Remove the link' })).toBeDefined();
  });

  it('NFR-SEC-05 refuses a javascript: link and leaves the text unlinked', async () => {
    const onChange = renderField(doc('click'));
    await act(async () => {
      liveEditor().commands.selectAll();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add a link' }));
    fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'javascript:alert(1)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    expect(screen.getByRole('alert').textContent).toBe('Enter a web address (https://…) or an email address.');
    expect(onChange).not.toHaveBeenCalled();
    expect(document.querySelector('.ProseMirror a')).toBeNull();
  });

  it('reports an emptied text as null', async () => {
    const onChange = renderField();
    await act(async () => {
      liveEditor().commands.clearContent(true);
    });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('FR-SCR-04 offers section headings and subheadings only when asked to, as H2 and H3', async () => {
    const onChange = vi.fn();
    const { unmount } = render(<RichTextField label="Offer" value={doc('Intro')} onChange={onChange} />);
    expect(screen.queryByRole('button', { name: 'Section heading' })).toBeNull();
    unmount();

    render(<RichTextField label="Script (Albanian)" value={doc('Hapja')} onChange={onChange} headings />);
    await act(async () => {
      liveEditor().commands.setTextSelection(2);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Section heading' }));
    });
    expect(screen.getByRole('button', { name: 'Section heading' }).getAttribute('aria-pressed')).toBe('true');
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'doc',
      // After a heading, StarterKit keeps an empty paragraph to type on in.
      content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hapja' }] }, { type: 'paragraph' }],
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Subheading' }));
    });
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Hapja' }] }, { type: 'paragraph' }],
    });
  });
});

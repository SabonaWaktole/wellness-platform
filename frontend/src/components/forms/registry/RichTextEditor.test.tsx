import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act, fireEvent, cleanup } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { RichTextEditor } from './RichTextEditor';
import type { ComponentType, RichTextDoc } from '../../../types/form';

/*
 * SLASH-COMMAND INSERT (Stage 4).
 *
 * jsdom cannot simulate a real keystroke landing in a contenteditable the
 * way a browser does — FormattingToolbar.test.tsx notes the same thing about
 * ProseMirror's own selection model — so content changes here are driven
 * through the editor's own command API, exposed via `onEditorReady` exactly
 * as the builder itself consumes it, while the slash menu's own behaviour
 * (open/filter/navigate/choose/close) is exercised through the real DOM it
 * renders.
 */

const emptyDoc: RichTextDoc = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };

interface HarnessHandle {
  editor: Editor | null;
  content: RichTextDoc;
}

const Harness = React.forwardRef<HarnessHandle, { onInsertComponent?: (type: ComponentType) => void }>(
  ({ onInsertComponent }, ref) => {
    const [content, setContent] = React.useState<RichTextDoc>(emptyDoc);
    const handle = React.useRef<HarnessHandle>({ editor: null, content });
    handle.current.content = content;
    React.useImperativeHandle(ref, () => handle.current, []);

    return (
      <RichTextEditor
        content={content}
        onChange={setContent}
        onEditorReady={(e) => {
          handle.current.editor = e;
        }}
        onInsertComponent={onInsertComponent}
        autoFocus
      />
    );
  }
);

/**
 * Types text at the caret via the editor's own command API, after giving
 * THIS editor's own DOM node real focus first — `document.querySelector` is
 * deliberately avoided here in favour of the editor's own `view.dom`, since
 * more than one editor instance can be attached to the document across a
 * test run and only the one this test is holding a reference to may matter.
 */
const typeAtCaret = async (handle: React.RefObject<HarnessHandle>, text: string) => {
  const dom = handle.current?.editor?.view.dom;
  if (dom) fireEvent.focus(dom);
  await act(async () => {
    handle.current?.editor?.commands.insertContent(text);
  });
};

/*
 * `@tiptap/react`'s `useEditor` does not destroy an unmounted editor
 * synchronously — it defers to a real `setTimeout(..., 1)` (its own guard
 * against tearing an editor down across a StrictMode double-mount). Without
 * waiting that out, the NEXT test's editor mounts while the PREVIOUS one is
 * still alive underneath, and two live ProseMirror views sharing one jsdom
 * document fight over selection/focus state — confirmed by instrumenting
 * both editors: the second one's content was found reverted to empty
 * mid-test by a resync effect racing the first editor's still-pending
 * teardown.
 */
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 10));
});

describe('RichTextEditor — slash-command insert', () => {
  it('does nothing when the caller has not opted in', async () => {
    const handle = React.createRef<HarnessHandle>();
    render(<Harness ref={handle} />);

    await typeAtCaret(handle, '/date');

    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('opens the menu on "/" and lists every addable component except TEXT and IMAGE', async () => {
    const handle = React.createRef<HarnessHandle>();
    render(<Harness ref={handle} onInsertComponent={vi.fn()} />);

    await typeAtCaret(handle, '/');

    const menu = document.querySelector('[role="listbox"]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent?.toLowerCase()).toContain('date');
    expect(menu?.textContent?.toLowerCase()).not.toContain('image');
  });

  it('filters the list as the query grows', async () => {
    const handle = React.createRef<HarnessHandle>();
    render(<Harness ref={handle} onInsertComponent={vi.fn()} />);

    await typeAtCaret(handle, '/dat');

    const options = document.querySelectorAll('[role="option"]');
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.textContent?.toLowerCase()).toContain('dat');
    }
  });

  it('closes the menu once the query no longer matches anything', async () => {
    const handle = React.createRef<HarnessHandle>();
    render(<Harness ref={handle} onInsertComponent={vi.fn()} />);

    await typeAtCaret(handle, '/zzzznotathing');

    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('closes the menu on Escape without changing the document', async () => {
    const handle = React.createRef<HarnessHandle>();
    render(<Harness ref={handle} onInsertComponent={vi.fn()} />);

    await typeAtCaret(handle, '/da');
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();

    const host = handle.current?.editor?.view.dom as HTMLElement;
    fireEvent.keyDown(host, { key: 'Escape' });

    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(handle.current?.editor?.getText()).toBe('/da');
  });

  it('navigates the highlighted option with the arrow keys', async () => {
    const handle = React.createRef<HarnessHandle>();
    render(<Harness ref={handle} onInsertComponent={vi.fn()} />);

    await typeAtCaret(handle, '/');
    const host = handle.current?.editor?.view.dom as HTMLElement;

    const activeLabel = () => document.querySelector('[role="option"][aria-selected="true"]')?.textContent;
    const first = activeLabel();

    fireEvent.keyDown(host, { key: 'ArrowDown' });
    const second = activeLabel();
    expect(second).not.toBe(first);

    fireEvent.keyDown(host, { key: 'ArrowUp' });
    expect(activeLabel()).toBe(first);
  });

  /*
   * THE COMBINED COMMIT'S OWN HALF: what RichTextEditor is responsible for.
   * `onInsertComponent` must fire, and the "/query" text must be gone from
   * the document, BEFORE `onChange` reports the stripped content — mirroring
   * FormBuilder's `handleChangeElementContent`, which relies on exactly that
   * ordering to fold both changes into one `apply()` call (see its own
   * comment on why two separate calls would silently lose one of them).
   */
  it('strips the slash text and reports the chosen type on Enter, in that order', async () => {
    const order: string[] = [];
    const onInsertComponent = vi.fn((type: ComponentType) => order.push(`insert:${type}`));
    const handle = React.createRef<HarnessHandle>();
    render(<Harness ref={handle} onInsertComponent={onInsertComponent} />);

    await typeAtCaret(handle, '/dat');
    const host = handle.current?.editor?.view.dom as HTMLElement;

    await act(async () => {
      fireEvent.keyDown(host, { key: 'Enter' });
    });

    expect(onInsertComponent).toHaveBeenCalledWith('DATE');
    expect(handle.current?.editor?.getText()).toBe('');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('chooses an option by click, via mousedown so the editor never blurs first', async () => {
    const onInsertComponent = vi.fn();
    const handle = React.createRef<HarnessHandle>();
    render(<Harness ref={handle} onInsertComponent={onInsertComponent} />);

    await typeAtCaret(handle, '/dat');
    const option = [...document.querySelectorAll('[role="option"]')].find((el) =>
      el.textContent?.toLowerCase().includes('date')
    ) as HTMLElement;
    expect(option).toBeTruthy();

    await act(async () => {
      fireEvent.mouseDown(option);
    });

    expect(onInsertComponent).toHaveBeenCalledWith('DATE');
    expect(handle.current?.editor?.getText()).toBe('');
  });

  it('keeps text typed before the slash, only removing the "/query" itself', async () => {
    const onInsertComponent = vi.fn();
    const handle = React.createRef<HarnessHandle>();
    render(<Harness ref={handle} onInsertComponent={onInsertComponent} />);

    await typeAtCaret(handle, 'Company Name: /dat');
    const host = handle.current?.editor?.view.dom as HTMLElement;

    await act(async () => {
      fireEvent.keyDown(host, { key: 'Enter' });
    });

    expect(onInsertComponent).toHaveBeenCalledWith('DATE');
    expect(handle.current?.editor?.getText()).toBe('Company Name: ');
  });
});

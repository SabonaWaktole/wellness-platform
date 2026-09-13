import type { MutableRefObject } from 'react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, Color, FontFamily, FontSize, BackgroundColor, LineHeight } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';

/**
 * The extension set for the TEXT component's editor (spec §10).
 *
 * MUST produce exactly the node/mark set `richTextDocSchema` whitelists on
 * the backend (`formSchemas.ts`) — nothing more, nothing less. StarterKit
 * ships far more than the spec asks for (code, codeBlock, blockquote,
 * horizontalRule...), so every node the whitelist does not name is
 * explicitly disabled here rather than left for the server to silently
 * reject after the owner has already typed it.
 *
 * `Color`, `FontFamily`, `FontSize`, `BackgroundColor` and `LineHeight` are
 * all now bundled by `@tiptap/extension-text-style` v3 itself (each adds one
 * attribute — `color`/`fontFamily`/`fontSize`/`backgroundColor` — to the
 * `textStyle` mark it also ships, or `lineHeight` to the node types passed
 * via `types`) — no hand-rolled `Extension.create({ addGlobalAttributes })`
 * needed, which an earlier pass here did before noticing these existed.
 * `@tiptap/extension-text-style` has NO default export (only named ones,
 * unlike its sibling packages) — importing it as a default silently resolves
 * to `undefined` and the schema ends up with no `textStyle` mark at all,
 * failing every command that touches it with "no mark type named
 * 'textStyle'". Caught by `FormattingToolbar.test.tsx` actually mounting a
 * live editor rather than a mock.
 */
export const RICH_TEXT_EXTENSIONS = [
  StarterKit.configure({
    // Disabled: outside the spec §10 feature set and outside the backend
    // whitelist. Left enabled, any of these would type-check on the client
    // and be refused the moment the owner tried to save.
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    // StarterKit's own history/undo-redo is turned off: the CANVAS's
    // useHistory already owns undo/redo for the whole document (spec §21),
    // and two independent undo stacks fighting over Ctrl+Z is worse than
    // the text editor having none of its own.
    undoRedo: false,
    heading: { levels: [1, 2, 3] },
    // StarterKit v3 now bundles its own Underline extension; the explicit
    // one below is configured for the toolbar and would otherwise collide
    // with it ("Duplicate extension names found: ['underline']"), leaving
    // the editor uninitialized.
    underline: false,
  }),
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  // Block-level, matching FormDocumentValidator's `blockAttrs` on
  // paragraph/heading — a document-wide "highlight" is a text-style concern
  // (spec §10's "background/highlight"), so this one stays on `textStyle`
  // (its own default) rather than being reconfigured onto block nodes.
  BackgroundColor,
  LineHeight.configure({ types: ['paragraph', 'heading'] }),
  Underline,
  TextAlign.configure({
    types: ['paragraph', 'heading'],
    alignments: ['left', 'center', 'right', 'justify'],
  }),
];

/** What the slash-menu extension needs from RichTextEditor on every
 *  keystroke it might intercept. Read through a ref (see below), never
 *  captured at extension-creation time, so a single editor instance can stay
 *  in sync with menu state that changes on every render. */
export interface SlashMenuControl {
  isOpen: () => boolean;
  moveSelection: (delta: number) => void;
  choose: () => void;
  close: () => void;
}

/**
 * Intercepts ArrowUp/ArrowDown/Enter/Escape ONLY while RichTextEditor's own
 * slash-menu popup is open (`control.current.isOpen()`) — every other
 * keystroke, and all four of these the rest of the time, fall through to
 * ProseMirror's own keymap untouched. No node, no mark, no `@tiptap/suggestion`
 * dependency: this extension changes nothing about the document schema, only
 * which component gets first refusal on four keys.
 *
 * `control` is a REF, not a plain object, because `useEditor` only builds its
 * extensions once per editor instance — the ref is what lets RichTextEditor
 * hand this extension fresh closures (over its latest state) on every render
 * without tearing down and recreating the whole editor.
 */
export const createSlashMenuExtension = (control: MutableRefObject<SlashMenuControl>) =>
  Extension.create({
    name: 'slashMenu',
    addKeyboardShortcuts() {
      return {
        ArrowDown: () => {
          if (!control.current.isOpen()) return false;
          control.current.moveSelection(1);
          return true;
        },
        ArrowUp: () => {
          if (!control.current.isOpen()) return false;
          control.current.moveSelection(-1);
          return true;
        },
        Enter: () => {
          if (!control.current.isOpen()) return false;
          control.current.choose();
          return true;
        },
        Escape: () => {
          if (!control.current.isOpen()) return false;
          control.current.close();
          return true;
        },
      };
    },
  });

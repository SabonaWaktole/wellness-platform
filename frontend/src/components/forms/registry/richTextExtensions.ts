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

import { beforeAll, afterEach, afterAll } from 'vitest';
import '@testing-library/jest-dom';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';
/**
 * Initialises i18next for every test, matching production where App.tsx imports
 * it at the root.
 *
 * Without this, a component using `useTranslation` renders raw keys — but only
 * in tests whose import graph happens not to reach the i18n module, so the
 * failure looks arbitrary and file-specific rather than like a missing global.
 * Importing it here means tests assert on real English text, as a user sees it.
 */
import './i18n';

/**
 * jsdom doesn't implement the pointer-capture trio of the Pointer Events API,
 * so any component calling element.setPointerCapture (drag/resize handles)
 * throws "is not a function" the instant a pointerdown fires in a test.
 */
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
}

/**
 * jsdom has no layout engine, and — unlike Element — neither Range nor Text
 * carry a getClientRects()/getBoundingClientRect() at all. ProseMirror's
 * scrollIntoView calls these on essentially every state update (via Range for
 * a text offset, or straight on a Text node for a boundary) to compute the
 * caret's position — a transaction fires `scrollIntoView`, which calls
 * `coordsAtPos`, which needs a real rect — so any test that mounts a
 * `RichTextEditor`/`useEditor` throws "target.getClientRects is not a
 * function" (or the BoundingClientRect equivalent) the moment the user (or a
 * command like `.focus()`) causes the first transaction, as an unhandled
 * exception outside any assertion — which fails the whole `vitest run` exit
 * code even though every test using a live TipTap editor still passes.
 */
const emptyClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
const zeroRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() { return this; } }) as DOMRect;
const textProto = Text.prototype as unknown as { getClientRects?: () => DOMRectList; getBoundingClientRect?: () => DOMRect };
if (!Range.prototype.getClientRects) Range.prototype.getClientRects = emptyClientRects;
if (!textProto.getClientRects) textProto.getClientRects = emptyClientRects;
if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = zeroRect;
if (!textProto.getBoundingClientRect) textProto.getBoundingClientRect = zeroRect;

/** jsdom has no layout engine and so never implements ResizeObserver. */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/**
 * jsdom has no layout engine and so never implements ResizeObserver. Real
 * browsers do, and code that measures a container (ScaledPage, for instance)
 * is written against that assumption — without this stub, every such
 * component throws in every test that renders it, not just the ones actually
 * asserting on measurement.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

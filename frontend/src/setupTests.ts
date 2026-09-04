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

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

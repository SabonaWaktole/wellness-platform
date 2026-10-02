import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from './index';
import { useLanguageSync } from './useLanguage';
import { AuthLayout } from '../components/layout/AuthLayout/AuthLayout';
import { useAuthStore } from '../store/useAuthStore';
import { useVisitorLanguageStore, VISITOR_LANGUAGE_STORAGE_KEY } from '../store/useVisitorLanguageStore';

/** The app root's language sync, around a signed-out screen. */
const SignInScreen = () => {
  useLanguageSync();
  return (
    <AuthLayout title="Sign in">
      {null}
    </AuthLayout>
  );
};

const renderSignIn = () =>
  render(
    <MemoryRouter>
      <SignInScreen />
    </MemoryRouter>
  );

const signIn = (userLanguage: string | null, tenantDefaultLanguage: string | null) =>
  useAuthStore.setState({
    user: {
      userId: 'u1',
      email: 'admin@example.com',
      role: 'BUSINESS_OWNER',
      tenantId: 't1',
      tenantSlug: 'acme',
      tenantCurrency: 'EUR',
      tenantLocale: 'sq-AL',
      userLanguage,
      tenantDefaultLanguage,
    } as any,
    isAuthenticated: true,
  });

/** An in-memory Storage: under Node 26, Node's own `localStorage` global shadows jsdom's and is unusable without a file. */
const memoryStorage = (): Storage => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  };
};

describe('language before sign-in (FR-LNG-01)', () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    useVisitorLanguageStore.setState({ language: null });
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('FR-LNG-01 a visitor who has not chosen sees the sign-in screen in Albanian, with the switch on Shqip', () => {
    renderSignIn();

    expect(i18n.language).toBe('sq');
    const switcher = screen.getByRole('group', { name: 'Gjuha' });
    expect(screen.getByRole('button', { name: 'Shqip' }).getAttribute('aria-pressed')).toBe('true');
    expect(switcher.textContent).toBe('ShqipEnglish');
  });

  it('FR-LNG-01 switching to English changes the sign-in screen at once and is remembered in this browser', async () => {
    renderSignIn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'English' }));
    });

    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('group', { name: 'Language' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem(VISITOR_LANGUAGE_STORAGE_KEY)).toBe('en');
  });

  it('FR-LNG-01 once signed in, the user preference and then the workspace default win over the visitor choice', async () => {
    useVisitorLanguageStore.setState({ language: 'en' });
    renderSignIn();
    expect(i18n.language).toBe('en');

    await act(async () => signIn(null, 'sq'));
    expect(i18n.language).toBe('sq');

    await act(async () => signIn('en', 'sq'));
    expect(i18n.language).toBe('en');
  });
});

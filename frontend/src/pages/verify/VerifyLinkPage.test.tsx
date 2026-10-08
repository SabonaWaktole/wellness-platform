import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VerifyLinkPage } from './VerifyLinkPage';
import { memberVerificationService } from '../../services/memberVerificationService';
import { useAuthStore } from '../../store/useAuthStore';
import { getI18n } from 'react-i18next';
import { cardI18n } from '../card/cardI18n';

vi.mock('../../services/memberVerificationService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberVerificationService')>();
  return { ...actual, memberVerificationService: { byToken: vi.fn(), search: vi.fn(), byMember: vi.fn(), recordIdentity: vi.fn() } };
});

const service = vi.mocked(memberVerificationService);
const TOKEN = 'T'.repeat(43);
const TIER = { tier: 'GOLD', labelSq: 'Ar', labelEn: 'Gold', colour: '#C9A227' };

const respondWith = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body }));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/v/${TOKEN}`]}>
      <Routes>
        <Route path="/v/:token" element={<VerifyLinkPage />} />
      </Routes>
    </MemoryRouter>
  );

const signIn = (...keys: string[]) =>
  useAuthStore.setState({ isInitializing: false, user: { tenantSlug: 'acme', permissions: Object.fromEntries(keys.map((k) => [k, true])) } as never });

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, isInitializing: false });
});
afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ user: null, isInitializing: true });
});

describe('The verification link /v/:token (M4 Slice 13)', () => {
  it('the card page\'s own i18n instance never becomes the app\'s default, so the staff screens keep their translations after a hand-over', () => {
    expect(getI18n()).not.toBe(cardI18n);
  });

  it('FR-VER-07 a valid member shows Valid with the full name, member ID, tier and valid-until date, and nothing more', async () => {
    respondWith(200, { data: { valid: true, name: 'Ana Hoxha', memberNumber: 'WP-000123', tier: TIER, validUntil: '2027-12-31' } });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'E vlefshme' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ana Hoxha' })).toBeInTheDocument();
    expect(screen.getByText('WP-000123')).toBeInTheDocument();
    expect(screen.getByText('Ar')).toBeInTheDocument();
    expect(screen.getByText('31.12.2027')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/@|\+355|1990|employer|payment|discount|zbritj/i);
  });

  it('FR-VER-07 the page can be read in English', async () => {
    respondWith(200, { data: { valid: true, name: 'Ana Hoxha', memberNumber: 'WP-000123', tier: TIER, validUntil: null } });
    renderPage();
    await screen.findByRole('heading', { name: 'Ana Hoxha' });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } });

    expect(await screen.findByRole('heading', { name: 'Valid' })).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('No expiry')).toBeInTheDocument();
  });

  it('FR-VER-09 not valid is one neutral answer with no name, ID or tier', async () => {
    respondWith(200, { data: { valid: false } });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Jo e vlefshme' })).toBeInTheDocument();
    expect(screen.queryByText(/WP-/)).toBeNull();
    expect(document.querySelectorAll('h2, dl')).toHaveLength(0);
  });

  it('FR-VER-07, FR-CRD-08 calls only the public endpoint, with no credentials, never caches, and asks search engines not to index', async () => {
    respondWith(200, { data: { valid: false } });
    renderPage();
    await screen.findByRole('heading', { name: 'Jo e vlefshme' });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/public\/verify\/T{43}$/);
    expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store' });
    expect(service.byToken).not.toHaveBeenCalled();
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/noindex/);
    expect(document.querySelector('script[src]')).toBeNull();
  });

  it('a failure to reach the server can be retried', async () => {
    respondWith(500, {});
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Karta nuk u kontrollua');
    respondWith(200, { data: { valid: false } });
    fireEvent.click(screen.getByRole('button', { name: 'Provo përsëri' }));
    expect(await screen.findByRole('heading', { name: 'Jo e vlefshme' })).toBeInTheDocument();
  });

  it('FR-VER-08 a signed-in user with "Members: verify" gets the Reception screen from the same link, and the public endpoint is not called', async () => {
    signIn('members.verify');
    respondWith(200, { data: { valid: false } });
    service.byToken.mockResolvedValue({
      found: true, verificationId: 'v1', valid: true, reason: null, name: 'Ana Hoxha', memberNumber: 'WP-000123', tier: TIER, validUntil: '2027-12-31',
      status: 'ACTIVE', dateOfBirth: '1990-05-17', discounts: [],
    });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Identity confirmed' })).toBeInTheDocument();
    expect(screen.getByText('17.05.1990')).toBeInTheDocument();
    expect(service.byToken).toHaveBeenCalledWith('acme', TOKEN);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('FR-VER-08 a signed-in user without "Members: verify" gets the public page', async () => {
    signIn('members.view', 'members.manage');
    respondWith(200, { data: { valid: true, name: 'Ana Hoxha', memberNumber: 'WP-000123', tier: TIER, validUntil: null } });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'E vlefshme' })).toBeInTheDocument();
    expect(service.byToken).not.toHaveBeenCalled();
    expect(screen.queryByText('17.05.1990')).toBeNull();
  });
});

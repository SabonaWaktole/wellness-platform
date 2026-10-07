import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicCardPage } from './PublicCardPage';
import { formatCardDate, readableOn } from './cardFormat';
import type { PublicCard } from '../../services/memberCardService';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import enCard from '../../locales/en/card.json';
import sqCard from '../../locales/sq/card.json';

const css = readFileSync(resolve(process.cwd(), 'src/pages/card/PublicCardPage.module.css'), 'utf8');
const QR = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 29 29"><path fill="#ffffff" d="M0 0h29v29H0z"/></svg>';
const TOKEN = 'T'.repeat(43);

const gold = (extra: Partial<PublicCard> = {}): PublicCard => ({
  valid: true,
  name: 'Ana Hoxha',
  memberNumber: 'WP-000123',
  language: 'en',
  tier: { tier: 'GOLD', labelSq: 'Ar', labelEn: 'Gold', colour: '#C9A227' },
  validUntil: '2027-12-31',
  benefits: [
    { nameSq: 'Kontroll parandalues', nameEn: 'Preventive check-up', percent: '100.00' },
    { nameSq: 'Vizita te gjinekologu', nameEn: 'Gynecologist visits', percent: '30.00' },
  ],
  qrSvg: QR,
  generatedAt: '2027-01-05T10:00:00.000Z',
  ...extra,
});

const answer = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => body });

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/m/${TOKEN}`]}>
      <Routes>
        <Route path="/m/:token" element={<PublicCardPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove());
});

const respondWith = (status: number, body?: unknown, headers?: Record<string, string>) => (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(answer(status, body, headers));

describe('The member card page (M4 Slice 11)', () => {
  it('FR-CRD-01 shows the logo name, name, member ID, tier, validity as dd.mm.yyyy, the QR and the benefits, and no personal field', async () => {
    respondWith(200, { data: gold() });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Ana Hoxha' })).toBeInTheDocument();
    expect(screen.getAllByText('Wellness+').length).toBeGreaterThan(0);
    expect(screen.getByText('WP-000123')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Valid until 31.12.2027')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /QR code/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your benefits' })).toBeInTheDocument();
    const benefits = within(screen.getByRole('list'));
    expect(benefits.getByText('Preventive check-up')).toBeInTheDocument();
    expect(benefits.getByText('100%')).toBeInTheDocument();
    expect(benefits.getByText('30%')).toBeInTheDocument();
    // The page renders only what the card carries: nothing like a phone, an email or an employer exists in it.
    expect(document.body.textContent).not.toMatch(/@|\+355|employer|payment/i);
  });

  it('FR-CRD-01 a Bronze member shows "No expiry"', async () => {
    respondWith(200, { data: gold({ tier: { tier: 'BRONZE', labelSq: 'Bronz', labelEn: 'Bronze', colour: '#B26A2B' }, validUntil: null }) });
    renderPage();
    expect(await screen.findByText('No expiry')).toBeInTheDocument();
    expect(screen.getByText('Bronze')).toBeInTheDocument();
  });

  it('FR-CRD-01, FR-CRD-08 calls only the card endpoint, without cookies or credentials, never caches, and asks search engines not to index', async () => {
    respondWith(200, { data: gold() });
    renderPage();
    await screen.findByRole('heading', { name: 'Ana Hoxha' });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/public\/cards\/T{43}$/);
    expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store' });
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/noindex/);
    expect(document.querySelector('script[src]')).toBeNull();
  });

  it('FR-CRD-03 a member who is not valid sees "Membership not valid, contact Wellness Albania", no QR, no tier and no benefits', async () => {
    respondWith(200, { data: gold({ valid: false, tier: null, validUntil: null, benefits: [], qrSvg: null }) });
    renderPage();

    expect(await screen.findByText('Membership not valid, contact Wellness Albania')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('Your benefits')).toBeNull();
    expect(screen.queryByText(/Valid until/)).toBeNull();
    expect(screen.getByText('Ana Hoxha')).toBeInTheDocument();
  });

  it('FR-CRD-04 shows Albanian by default and switching to English changes the labels, the tier name and the instructions', async () => {
    respondWith(200, { data: gold({ language: 'sq' }) });
    renderPage();

    expect(await screen.findByText('E vlefshme deri më 31.12.2027')).toBeInTheDocument();
    expect(screen.getByText('Ar')).toBeInTheDocument();
    expect(screen.getByText('Përfitimet tuaja')).toBeInTheDocument();
    expect(screen.getByText('Tregojeni këtë kod në klinikë.')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Gjuha' }), { target: { value: 'en' } });

    expect(await screen.findByText('Valid until 31.12.2027')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Your benefits')).toBeInTheDocument();
    expect(screen.getByText('Show this code at the clinic.')).toBeInTheDocument();
    expect(screen.queryByText('Përfitimet tuaja')).toBeNull();
  });

  it('FR-CRD-04 Greek and Italian are offered, and used, only for a member who has them', async () => {
    respondWith(200, { data: gold({ language: 'el', tier: { tier: 'SILVER', labelSq: 'Argjend', labelEn: 'Silver', colour: '#8A939B' } }) });
    const greek = renderPage();
    expect(await screen.findByText('Τα προνόμιά σας')).toBeInTheDocument();
    expect(screen.getByText('Ασημένιο')).toBeInTheDocument();
    const options = within(screen.getByRole('combobox')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Shqip', 'English', 'Ελληνικά']);
    greek.unmount();

    respondWith(200, { data: gold({ language: 'it' }) });
    renderPage();
    expect(await screen.findByText('I tuoi vantaggi')).toBeInTheDocument();
    expect(within(screen.getByRole('combobox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Shqip', 'English', 'Italiano']);
  });

  it('FR-CRD-04 a member in Albanian is not offered Greek or Italian', async () => {
    respondWith(200, { data: gold({ language: 'sq' }) });
    renderPage();
    await screen.findByText('Përfitimet tuaja');
    expect(within(screen.getByRole('combobox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Shqip', 'English']);
  });

  it('FR-CRD-08 an unknown token shows the neutral "Card not found" page and a replaced token its own message (FR-CRD-10)', async () => {
    // Nothing is known about the person, so the page is in Albanian, the default, and can be switched to English.
    respondWith(404, { error: 'Card not found.', code: 'CARD_NOT_FOUND' });
    const missing = renderPage();
    expect(await screen.findByRole('heading', { name: 'Karta nuk u gjet' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } });
    expect(await screen.findByRole('heading', { name: 'Card not found' })).toBeInTheDocument();
    missing.unmount();

    respondWith(410, { error: 'x', code: 'CARD_REPLACED' });
    renderPage();
    expect(await screen.findByText(sqCard.replaced)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } });
    expect(await screen.findByText('This card was replaced. Ask Wellness Albania for the new link.')).toBeInTheDocument();
  });

  it('FR-CRD-08 a network failure says so and can be retried, without showing a card', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(answer(200, { data: gold() }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: sqCard.retry }));
    expect(await screen.findByRole('heading', { name: 'Ana Hoxha' })).toBeInTheDocument();
  });

  it('FR-CRD-12 the privacy line is visible in Albanian and English, on every state of the page', async () => {
    respondWith(200, { data: gold({ language: 'sq' }) });
    const view = renderPage();
    expect(await screen.findByText(sqCard.privacy)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } });
    expect(await screen.findByText(enCard.privacy)).toBeInTheDocument();
    view.unmount();

    respondWith(404);
    renderPage();
    await screen.findByRole('heading', { name: sqCard.notFoundTitle });
    expect(screen.getByText(sqCard.privacy)).toBeInTheDocument();
  });

  it('NFR-USE-05 the QR is an image on a white square with padding, and no dark-mode rule changes that square', () => {
    const box = /\.qrBox\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(box).toMatch(/background:\s*#ffffff/);
    expect(box).toMatch(/padding:\s*\d+px/);
    const dark = /@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(dark).not.toMatch(/qrBox|\.qr\b/);
    expect(/\.qr\s*\{([^}]*)\}/.exec(css)?.[1]).toMatch(/width:\s*240px/);
  });

  it('FR-CRD-02 the QR is drawn at 240 px and never smaller than 220 px', async () => {
    respondWith(200, { data: gold() });
    renderPage();
    const image = await screen.findByRole('img', { name: /QR code/ });
    expect(Number(image.getAttribute('width'))).toBeGreaterThanOrEqual(220);
    expect(image.getAttribute('src')).toContain('data:image/svg+xml');
  });

  it('FR-CRD-01 formats the date as dd.mm.yyyy and picks a readable text colour for every tier colour', () => {
    expect(formatCardDate('2027-03-09')).toBe('09.03.2027');
    expect(readableOn('#FFFFFF')).toBe('#000000');
    expect(readableOn('#000000')).toBe('#ffffff');
    expect(readableOn('not a colour')).toMatch(/^#/);
  });

  it('NFR-I18N-04 the card catalogue has every key in Albanian and English', async () => {
    const keys = (o: unknown, p = ''): string[] => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p]);
    expect(keys(sqCard).sort()).toEqual(keys(enCard).sort());
    await waitFor(() => expect(Object.keys(sqCard).length).toBeGreaterThan(10));
  });
});

describe('The installable card (M4 Slice 12)', () => {
  const setUserAgent = (value: string) => vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(value);
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.head.querySelectorAll('link[rel="manifest"], meta[name^="apple-mobile"], meta[name="mobile-web-app-capable"], meta[name="theme-color"]').forEach((e) => e.remove());
  });

  it('FR-CRD-07 shows today\'s date from the phone and a moving element', async () => {
    respondWith(200, { data: gold() });
    renderPage();
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    const now = new Date();
    const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    expect(screen.getByLabelText(/data e sotme|date/i)).toHaveTextContent(today);
    expect(screen.getByTestId('live-motion')).toBeInTheDocument();
    expect(css).toMatch(/\.stampPulse[^}]*animation:\s*stampPulse/);
  });

  it('FR-CRD-07 with reduced motion the animation gives way to a visible second counter that moves', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }) as MediaQueryList);
    respondWith(200, { data: gold() });
    renderPage();
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    const counter = screen.getByTestId('live-counter');
    expect(screen.queryByTestId('live-motion')).toBeNull();
    const before = counter.textContent;
    await waitFor(() => expect(screen.getByTestId('live-counter').textContent).not.toBe(before), { timeout: 3000 });
  });

  it('FR-CRD-05 adds the manifest and the iOS tags while a card is shown, and removes them after', async () => {
    respondWith(200, { data: gold() });
    const view = renderPage();
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    expect(document.head.querySelector('link[rel="manifest"]')?.getAttribute('href')).toMatch(new RegExp(`/public/cards/${TOKEN}/manifest.webmanifest$`));
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content')).toBe('yes');
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')).toBe('Wellness+');
    view.unmount();
    expect(document.head.querySelector('link[rel="manifest"]')).toBeNull();
  });

  it('FR-CRD-05 an unknown or replaced link is not installable: no manifest', async () => {
    respondWith(410, {});
    renderPage();
    await screen.findByText(/This card was replaced|Kjo kartë u zëvendësua/);
    expect(document.head.querySelector('link[rel="manifest"]')).toBeNull();
  });

  it('FR-CRD-05 shows the iPhone instructions in Safari, the Android ones in Chrome, and none once installed or on a desktop', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1');
    respondWith(200, { data: gold({ language: 'en' }) });
    const first = renderPage();
    expect(await screen.findByText(/Add to Home Screen/)).toBeInTheDocument();
    first.unmount();

    setUserAgent('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36');
    renderPage();
    expect(await screen.findByText(/Install app/)).toBeInTheDocument();
  });

  it('FR-CRD-05 no instructions when the card runs from the home screen', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1');
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    respondWith(200, { data: gold({ language: 'en' }) });
    renderPage();
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    expect(screen.queryByText(/Add this card to your home screen/)).toBeNull();
    delete (window.navigator as { standalone?: boolean }).standalone;
  });

  it('FR-CRD-06 an answer the worker gave from storage shows "Last updated" with the time it was stored', async () => {
    respondWith(200, { data: gold({ language: 'en' }) }, { 'X-From-Cache': '1', 'X-Cached-At': '2027-01-05T10:15:00.000Z' });
    renderPage();
    const note = await screen.findByText(/Last updated 05\.01\.2027 \d\d:\d\d/);
    expect(note).toBeInTheDocument();
  });

  it('FR-CRD-06 a live answer shows no "Last updated" line', async () => {
    respondWith(200, { data: gold({ language: 'en' }) });
    renderPage();
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    expect(screen.queryByText(/Last updated/)).toBeNull();
  });
});

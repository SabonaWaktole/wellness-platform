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

const answer = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

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

const respondWith = (status: number, body?: unknown) => (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(answer(status, body));

describe('The member card page (M4 Slice 11)', () => {
  it('FR-CRD-01 shows the logo name, name, member ID, tier, validity as dd.mm.yyyy, the QR and the benefits, and no personal field', async () => {
    respondWith(200, { data: gold() });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Ana Hoxha' })).toBeInTheDocument();
    // The page starts in Albanian and switches to the card's language once it has loaded, so wait for the English text.
    expect(await screen.findByText('Valid until 31.12.2027')).toBeInTheDocument();
    expect(screen.getAllByText('Wellness+').length).toBeGreaterThan(0);
    expect(screen.getByText('WP-000123')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MemberDetailContent } from './MemberDetailContent';
import { CompanyWellnessTab } from './CompanyWellnessTab';
import { memberService, type MemberDetail, type MemberSummary } from '../../services/memberService';
import { memberCardService } from '../../services/memberCardService';
import { companyMembershipService, type CompanyMembership } from '../../services/companyMembershipService';
import { memberPaymentService } from '../../services/memberPaymentService';
import { membershipSettingsService } from '../../services/membershipSettingsService';
import { lookupService } from '../../services/lookupService';
import { useAuthStore } from '../../store/useAuthStore';
import * as downloads from '../../utils/downloadBlob';

vi.mock('../../services/memberService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberService')>();
  return { ...actual, memberService: { get: vi.fn(), search: vi.fn() } };
});
vi.mock('../../services/memberCardService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberCardService')>();
  return { ...actual, memberCardService: { link: vi.fn(), replace: vi.fn(), linksSheet: vi.fn() } };
});
vi.mock('../../services/companyMembershipService', () => ({ companyMembershipService: { get: vi.fn() } }));
vi.mock('../../services/memberPaymentService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberPaymentService')>();
  return { ...actual, memberPaymentService: { options: vi.fn(), record: vi.fn(), void: vi.fn() } };
});
vi.mock('../../services/membershipSettingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/membershipSettingsService')>();
  return { ...actual, membershipSettingsService: { getBenefits: vi.fn() } };
});
vi.mock('../../services/lookupService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/lookupService')>();
  return { ...actual, lookupService: { ...actual.lookupService, list: vi.fn() } };
});

const members = vi.mocked(memberService);
const cards = vi.mocked(memberCardService);
const company = vi.mocked(companyMembershipService);
const settings = vi.mocked(membershipSettingsService);
const lookups = vi.mocked(lookupService);
vi.mocked(memberPaymentService);

const QR = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><path d="M0 0h1v1H0z"/></svg>';
const LINK = { url: 'https://cards.wellness.test/m/abc', qrPayload: 'https://cards.wellness.test/v/abc', qrSvg: QR };

const summary = (id: string, firstName: string, extra: Partial<MemberSummary> = {}): MemberSummary => ({
  id, memberNumber: `WP-${id}`, firstName, lastName: 'Hoxha', dateOfBirth: null, tier: 'GOLD', status: 'ACTIVE', valid: true, source: 'INDIVIDUAL', startsOn: '2026-10-01',
  employer: null, formerEmployee: false, expiringSoon: false, ...extra,
});

const detail = (extra: Partial<MemberDetail> = {}): MemberDetail => ({
  ...summary('m1', 'Ana'), phone: null, email: null, language: 'sq', cityId: null, note: null,
  createdBy: { id: 'u1', name: 'Ana Admin' }, createdAt: '2026-10-01T09:00:00.000Z', closedAt: null, effectiveTier: 'GOLD', validity: { valid: true, reason: null },
  currentTerm: null, terms: [], tierHistory: [], statusHistory: [],
  family: { principalMemberId: null, relationshipId: null, principal: null, dependants: [], history: [] },
  vip: { requests: [], reviewDate: null }, formerEmployerClientId: null, leftCompanyAt: null, ...extra,
});

const signInWith = (...keys: string[]) =>
  useAuthStore.setState({ user: { tenantCurrency: 'EUR', tenantLocale: 'en-GB', permissions: Object.fromEntries(keys.map((k) => [k, true])) } as never });

const renderMember = () =>
  render(
    <MemoryRouter initialEntries={['/acme/members/m1']}>
      <Routes>
        <Route path="/:tenantSlug/members/:memberId" element={<MemberDetailContent />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  settings.getBenefits.mockResolvedValue({
    tiers: [
      { tier: 'BRONZE', labelSq: 'Bronz', labelEn: 'Bronze', colour: '#B26A2B' },
      { tier: 'SILVER', labelSq: 'Argjend', labelEn: 'Silver', colour: '#8A939B' },
      { tier: 'GOLD', labelSq: 'Ar', labelEn: 'Gold', colour: '#C9A227' },
      { tier: 'VIP', labelSq: 'VIP', labelEn: 'VIP', colour: '#5B3FA6' },
    ],
    services: [],
  });
  lookups.list.mockResolvedValue([] as never);
  members.get.mockResolvedValue(detail());
  cards.link.mockResolvedValue(LINK);
});
afterEach(() => useAuthStore.setState({ user: null }));

const openCard = async () => {
  renderMember();
  fireEvent.click(await screen.findByRole('button', { name: 'Card' }));
  return screen.findByRole('img', { name: 'QR code of the card of Ana Hoxha' });
};

describe('The card on the member page (M4 Slice 11)', () => {
  it('FR-CRD-09 shows the QR on screen on a white square, with the link beside it', async () => {
    signInWith('members.view', 'members.manage');
    const qr = await openCard();
    expect(qr.getAttribute('src')).toContain('data:image/svg+xml');
    expect(Number(qr.getAttribute('width'))).toBeGreaterThanOrEqual(220);
    expect(qr.parentElement?.className).toMatch(/cardQr/);
    expect(screen.getByDisplayValue(LINK.url)).toHaveAttribute('readonly');
    expect(cards.link).toHaveBeenCalledWith('acme', 'm1');
  });

  it('FR-CRD-09 copies the link to the clipboard', async () => {
    signInWith('members.view', 'members.manage');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await openCard();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await screen.findByText('Link copied.')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(LINK.url);
  });

  it('FR-CRD-09 printing draws a card with the name, ID, tier and QR at credit-card size or A6', async () => {
    signInWith('members.view', 'members.manage');
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    await openCard();

    fireEvent.click(screen.getByRole('button', { name: 'Print (card size)' }));
    const sheet = await waitFor(() => {
      const found = document.body.querySelector('[data-member-card-print]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(sheet.textContent).toContain('Ana Hoxha');
    expect(sheet.textContent).toContain('WP-m1');
    expect(sheet.textContent).toContain('Gold');
    expect(sheet.querySelector('img')?.getAttribute('src')).toContain('data:image/svg+xml');
    expect(sheet.className).toMatch(/card/);
    expect(document.head.textContent).toContain('size: 85.6mm 54mm');
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event('afterprint'));
    await waitFor(() => expect(document.body.querySelector('[data-member-card-print]')).toBeNull());
    expect(document.head.textContent).not.toContain('85.6mm');

    fireEvent.click(screen.getByRole('button', { name: 'Print (A6)' }));
    await waitFor(() => expect(document.head.textContent).toContain('size: 105mm 148mm'));
    print.mockRestore();
  });

  it('FR-CRD-10 replacing the link asks first, says what happens, then replaces and shows the new link', async () => {
    signInWith('members.view', 'members.manage');
    cards.replace.mockResolvedValue({ url: 'https://cards.wellness.test/m/new' });
    await openCard();
    cards.link.mockResolvedValue({ ...LINK, url: 'https://cards.wellness.test/m/new' });

    fireEvent.click(screen.getByRole('button', { name: 'Replace link' }));
    expect(await screen.findByText(/stop working at once/)).toBeInTheDocument();
    expect(cards.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Replace link' }).at(-1)!);
    await waitFor(() => expect(cards.replace).toHaveBeenCalledWith('acme', 'm1'));
    expect(await screen.findByText('A new link is ready. The old one no longer works.')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('https://cards.wellness.test/m/new')).toBeInTheDocument();
  });

  it('FR-CRD-10 cancelling the confirmation changes nothing', async () => {
    signInWith('members.view', 'members.manage');
    await openCard();
    fireEvent.click(screen.getByRole('button', { name: 'Replace link' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(cards.replace).not.toHaveBeenCalled();
  });

  it('FR-CRD-10 a failed replacement is reported and the old link is kept on screen', async () => {
    signInWith('members.view', 'members.manage');
    cards.replace.mockRejectedValue(new Error('boom'));
    await openCard();
    fireEvent.click(screen.getByRole('button', { name: 'Replace link' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Replace link' }).at(-1)!);
    expect(await screen.findByText('The link could not be replaced. Try again.')).toBeInTheDocument();
    expect(screen.getByDisplayValue(LINK.url)).toBeInTheDocument();
  });

  it('FR-CRD-03 for a member who is not valid the dialog says the card shows no QR code and no discounts', async () => {
    signInWith('members.view', 'members.manage');
    members.get.mockResolvedValue(detail({ status: 'SUSPENDED', valid: false, validity: { valid: false, reason: 'SUSPENDED' } }));
    await openCard();
    expect(screen.getByText(/shows no QR code and no discounts/)).toBeInTheDocument();
  });

  it('FR-RBAC-28 a user with Members: view alone sees no Card button', async () => {
    signInWith('members.view');
    renderMember();
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    expect(screen.queryByRole('button', { name: 'Card' })).toBeNull();
    expect(cards.link).not.toHaveBeenCalled();
  });
});

const tab = (): CompanyMembership => ({
  company: { id: 'c1', name: 'Kafe Blloku', employeeCount: 40 },
  summary: { members: 4, employees: 40, formerEmployees: 0, perTier: { BRONZE: 0, SILVER: 4, GOLD: 0, VIP: 0 } },
  sponsor: { valid: true, endsOn: '2027-09-30' },
  members: [summary('a', 'Ana', { tier: 'SILVER', source: 'CORPORATE' })],
  formerEmployees: [],
  uploads: [
    { id: 'u1', clientId: 'c1', fileName: 'staff.xlsx', status: 'CONFIRMED', uploadedBy: 'x', uploadedByName: 'Ana Admin', createdAt: '2026-10-01T09:00:00.000Z', confirmedAt: '2026-10-01T09:05:00.000Z', created: 3, linked: 1, skipped: 0, refused: 0, errors: 0 },
    { id: 'u2', clientId: 'c1', fileName: 'draft.xlsx', status: 'PREVIEWED', uploadedBy: 'x', uploadedByName: 'Ana Admin', createdAt: '2026-10-02T09:00:00.000Z', confirmedAt: null, created: 0, linked: 0, skipped: 0, refused: 0, errors: 0 },
  ],
});

const renderTab = () =>
  render(
    <MemoryRouter initialEntries={['/acme/clients/c1']}>
      <Routes>
        <Route path="/:tenantSlug/clients/:clientId" element={<CompanyWellnessTab clientId="c1" />} />
      </Routes>
    </MemoryRouter>
  );

describe('The card links of an upload (M4 Slice 11)', () => {
  it('FR-EMP-08 a user with Members: manage downloads the sheet of a confirmed upload; an unconfirmed one has none', async () => {
    signInWith('members.view', 'members.manage');
    company.get.mockResolvedValue(tab());
    const blob = new Blob(['x']);
    cards.linksSheet.mockResolvedValue(blob);
    const save = vi.spyOn(downloads, 'downloadBlob').mockImplementation(() => {});
    renderTab();
    await screen.findByText('staff.xlsx');

    const buttons = screen.getAllByRole('button', { name: 'Card links' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(cards.linksSheet).toHaveBeenCalledWith('acme', 'u1'));
    await waitFor(() => expect(save).toHaveBeenCalledWith(blob, 'staff-card-links.xlsx'));
    save.mockRestore();
  });

  it('FR-EMP-08 a failed download is reported', async () => {
    signInWith('members.view', 'members.manage');
    company.get.mockResolvedValue(tab());
    cards.linksSheet.mockRejectedValue(new Error('x'));
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Card links' }));
    expect(await screen.findByText('The card links could not be downloaded.')).toBeInTheDocument();
  });

  it('FR-EMP-08, FR-RBAC-28 a user with Members: view alone has no card-links button', async () => {
    signInWith('members.view');
    company.get.mockResolvedValue(tab());
    renderTab();
    await screen.findByText('staff.xlsx');
    expect(screen.queryByRole('button', { name: 'Card links' })).toBeNull();
  });
});

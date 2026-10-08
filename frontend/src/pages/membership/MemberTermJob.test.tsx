import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MembersContent } from './MembersContent';
import { MemberDetailContent } from './MemberDetailContent';
import { memberService, type MemberDetail, type MemberSummary } from '../../services/memberService';
import { membershipSettingsService } from '../../services/membershipSettingsService';
import { lookupService } from '../../services/lookupService';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('../../services/memberService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberService')>();
  return { ...actual, memberService: { search: vi.fn(), get: vi.fn(), changeStatus: vi.fn(), correctTier: vi.fn() } };
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
const settings = vi.mocked(membershipSettingsService);
const lookups = vi.mocked(lookupService);

const row = (extra: Partial<MemberSummary> = {}): MemberSummary => ({
  id: 'm1', memberNumber: 'WP-000001', firstName: 'Ana', lastName: 'Hoxha', dateOfBirth: null, phone: null, email: 'ana@example.com', tier: 'GOLD', status: 'ACTIVE',
  valid: true, source: 'INDIVIDUAL', startsOn: '2026-10-01', employer: null, formerEmployee: false, expiringSoon: false, ...extra,
});

const detail = (extra: Partial<MemberDetail> = {}): MemberDetail => ({
  ...row(), language: 'sq', cityId: null, note: null, createdBy: { id: 'u1', name: 'Ana Admin' }, createdAt: '2026-10-01T09:00:00.000Z', closedAt: null,
  effectiveTier: 'GOLD', validity: { valid: true, reason: null }, currentTerm: { source: 'PAID', startsOn: '2026-01-01', endsOn: '2026-12-31' },
  terms: [{ id: 't1', tier: 'GOLD', source: 'PAID', startsOn: '2026-01-01', endsOn: '2026-12-31' }], tierHistory: [], statusHistory: [],
  family: { principalMemberId: null, relationshipId: null, principal: null, dependants: [], history: [] }, vip: { requests: [], reviewDate: null },
  formerEmployerClientId: null, leftCompanyAt: null, ...extra,
});

const signInWith = (...keys: string[]) => useAuthStore.setState({ user: { permissions: Object.fromEntries(keys.map((k) => [k, true])) } as never });

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:tenantSlug/members" element={<MembersContent />} />
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
});
afterEach(() => useAuthStore.setState({ user: null }));

describe('Expiring soon on the list and the member page (M4 Slice 8)', () => {
  it('FR-TIR-10 the badge shows on the member whose paid term ends in the window, and only there', async () => {
    signInWith('members.view');
    members.search.mockResolvedValue({
      data: [row({ expiringSoon: true }), row({ id: 'm2', memberNumber: 'WP-000002', firstName: 'Zef', lastName: 'Kola' })],
      total: 2, page: 1, limit: 25,
    });
    renderAt('/acme/members');
    const ana = (await screen.findByText(/Hoxha Ana/)).closest('tr')!;
    expect(within(ana).getByText('Expiring soon')).toBeInTheDocument();
    expect(within(screen.getByText(/Kola Zef/).closest('tr')!).queryByText('Expiring soon')).not.toBeInTheDocument();
  });

  it('FR-TIR-11 the notification link opens the list already filtered to Expiring soon', async () => {
    signInWith('members.view');
    members.search.mockResolvedValue({ data: [row({ expiringSoon: true })], total: 1, page: 1, limit: 25 });
    renderAt('/acme/members?expiringSoon=true');
    await screen.findByText(/Hoxha Ana/);
    expect(members.search).toHaveBeenCalledWith('acme', expect.objectContaining({ expiringSoon: true }));
  });

  it('FR-TIR-10 the member page shows the badge next to the status', async () => {
    signInWith('members.view');
    members.get.mockResolvedValue(detail({ expiringSoon: true }));
    renderAt('/acme/members/m1');
    expect(await screen.findByText('Expiring soon')).toBeInTheDocument();
  });

  it('FR-TIR-10 a member whose term is not about to end has no badge', async () => {
    signInWith('members.view');
    members.get.mockResolvedValue(detail());
    renderAt('/acme/members/m1');
    await screen.findByRole('heading', { name: /Ana Hoxha/ });
    expect(screen.queryByText('Expiring soon')).not.toBeInTheDocument();
  });
});

describe('Correct tier (M4 Slice 8)', () => {
  const open = async () => {
    signInWith('members.view', 'wellnessplus.settings.manage');
    members.get.mockResolvedValue(detail({ effectiveTier: 'BRONZE', tier: 'BRONZE' }));
    renderAt('/acme/members/m1');
    fireEvent.click(await screen.findByRole('button', { name: 'Correct tier' }));
  };

  it('FR-TIR-09 an end date and a reason are required, and nothing is sent without them', async () => {
    await open();
    fireEvent.click(screen.getAllByRole('button', { name: 'Correct tier' }).at(-1)!);
    expect(await screen.findByText('Choose an end date that is today or later.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2999-12-31' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Correct tier' }).at(-1)!);
    expect(await screen.findByText('A reason is required.')).toBeInTheDocument();
    expect(members.correctTier).not.toHaveBeenCalled();
  });

  it('FR-TIR-09 the tier, the end date and the trimmed reason are sent, and the page reloads on the history', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Corrected tier'), { target: { value: 'SILVER' } });
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2999-12-31' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: ' Wrong tier entered ' } });
    members.correctTier.mockResolvedValue({ memberId: 'm1', tier: 'SILVER', endsOn: '2999-12-31' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Correct tier' }).at(-1)!);
    await waitFor(() => expect(members.correctTier).toHaveBeenCalledWith('acme', 'm1', { tier: 'SILVER', endsOn: '2999-12-31', reason: 'Wrong tier entered' }));
    await waitFor(() => expect(members.get).toHaveBeenCalledTimes(2));
  });

  it('FR-TIR-09 a refusal by the server is shown and the dialog stays open', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Valid until'), { target: { value: '2000-01-01' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'x' } });
    members.correctTier.mockRejectedValue({ response: { status: 400, data: { field: 'endsOn' } } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Correct tier' }).at(-1)!);
    expect(await screen.findByText('Choose an end date that is today or later.')).toBeInTheDocument();
  });

  it('FR-TIR-09, FR-RBAC-28 a user without "Wellness+ settings: manage" has no Correct tier button', async () => {
    signInWith('members.view', 'members.manage');
    members.get.mockResolvedValue(detail());
    renderAt('/acme/members/m1');
    await screen.findByRole('heading', { name: /Ana Hoxha/ });
    expect(screen.queryByRole('button', { name: 'Correct tier' })).not.toBeInTheDocument();
  });
});

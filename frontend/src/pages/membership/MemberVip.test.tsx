import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MemberDetailContent } from './MemberDetailContent';
import { VipRequestsContent } from './VipRequestsContent';
import { memberService, type MemberDetail, type VipRequest } from '../../services/memberService';
import { memberVipService } from '../../services/memberVipService';
import { membershipSettingsService } from '../../services/membershipSettingsService';
import { lookupService } from '../../services/lookupService';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('../../services/memberService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberService')>();
  return { ...actual, memberService: { get: vi.fn(), changeStatus: vi.fn(), search: vi.fn() } };
});
vi.mock('../../services/memberVipService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberVipService')>();
  return { ...actual, memberVipService: { request: vi.fn(), decide: vi.fn(), end: vi.fn(), list: vi.fn() } };
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
const vip = vi.mocked(memberVipService);
const settings = vi.mocked(membershipSettingsService);
const lookups = vi.mocked(lookupService);

const request = (extra: Partial<VipRequest> = {}): VipRequest => ({
  id: 'r1', member: { id: 'm1', memberNumber: 'WP-000001', name: 'Ana Hoxha' }, status: 'PENDING', reason: 'Key partner',
  requestedBy: { id: 'agent', name: 'Mira Agent' }, createdAt: '2026-10-02T09:00:00.000Z', decidedBy: null, decidedAt: null, decisionNote: null,
  endedBy: null, endedAt: null, endReason: null, ...extra,
});

const detail = (extra: Partial<MemberDetail> = {}): MemberDetail => ({
  id: 'm1', memberNumber: 'WP-000001', firstName: 'Ana', lastName: 'Hoxha', dateOfBirth: null, phone: null, email: 'ana@example.com', tier: 'BRONZE', status: 'ACTIVE',
  valid: true, source: 'INDIVIDUAL', startsOn: '2026-10-01', employer: null, formerEmployee: false, expiringSoon: false, language: 'sq', cityId: null, note: null,
  createdBy: { id: 'u1', name: 'Ana Admin' }, createdAt: '2026-10-01T09:00:00.000Z', closedAt: null, effectiveTier: 'BRONZE', validity: { valid: true, reason: null },
  currentTerm: null, terms: [], tierHistory: [], statusHistory: [],
  family: { principalMemberId: null, relationshipId: null, principal: null, dependants: [], history: [] },
  vip: { requests: [], reviewDate: null },
  formerEmployerClientId: null, leftCompanyAt: null, ...extra,
});

const signInWith = (userId: string, ...keys: string[]) =>
  useAuthStore.setState({ user: { userId, tenantCurrency: 'EUR', tenantLocale: 'en-GB', permissions: Object.fromEntries(keys.map((k) => [k, true])) } as never });

const renderMember = () =>
  render(
    <MemoryRouter initialEntries={['/acme/members/m1']}>
      <Routes>
        <Route path="/:tenantSlug/members/:memberId" element={<MemberDetailContent />} />
      </Routes>
    </MemoryRouter>
  );

const openVip = async () => {
  renderMember();
  fireEvent.click(await screen.findByRole('tab', { name: /VIP/ }));
};

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

describe('The VIP tab (M4 Slice 7)', () => {
  it('FR-VIP-01 a request without a reason is refused on the screen and nothing is sent', async () => {
    signInWith('agent', 'members.view', 'members.manage');
    members.get.mockResolvedValue(detail());
    await openVip();
    fireEvent.click(screen.getByRole('button', { name: 'Request VIP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('A reason is required.')).toBeInTheDocument();
    expect(vip.request).not.toHaveBeenCalled();
  });

  it('FR-VIP-01 a request with a reason is sent and the page reloads', async () => {
    signInWith('agent', 'members.view', 'members.manage');
    members.get.mockResolvedValue(detail());
    vip.request.mockResolvedValue(request());
    await openVip();
    fireEvent.click(screen.getByRole('button', { name: 'Request VIP' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: ' Key partner ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(vip.request).toHaveBeenCalledWith('acme', 'm1', 'Key partner'));
    await waitFor(() => expect(members.get).toHaveBeenCalledTimes(2));
  });

  it('FR-VIP-01 an open request hides "Request VIP", and a user without Members: manage never sees it', async () => {
    signInWith('agent', 'members.view', 'members.manage');
    members.get.mockResolvedValue(detail({ vip: { requests: [request()], reviewDate: null } }));
    await openVip();
    expect(screen.queryByRole('button', { name: 'Request VIP' })).not.toBeInTheDocument();
    expect(screen.getByText('Key partner')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('FR-VIP-02 an approver cannot decide their own request, and gets Approve and Reject on someone else\'s', async () => {
    signInWith('admin', 'members.view', 'members.vip.approve');
    members.get.mockResolvedValue(detail({ vip: { requests: [request({ requestedBy: { id: 'admin', name: 'Ana Admin' } })], reviewDate: null } }));
    await openVip();
    expect(screen.getByText('You made this request; another approver decides it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('FR-VIP-02 a rejection needs a reason; an approval is sent with the optional note', async () => {
    signInWith('admin', 'members.view', 'members.vip.approve');
    members.get.mockResolvedValue(detail({ vip: { requests: [request()], reviewDate: null } }));
    vip.decide.mockResolvedValue(request({ status: 'REJECTED' }));
    await openVip();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' }).at(-1)!);
    expect(await screen.findByText('A reason is required to reject.')).toBeInTheDocument();
    expect(vip.decide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Reason for rejecting'), { target: { value: 'Not strategic' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' }).at(-1)!);
    await waitFor(() => expect(vip.decide).toHaveBeenCalledWith('acme', 'r1', 'REJECT', 'Not strategic'));
  });

  it('FR-VIP-02 the approval says what the server will create and sends no term, tier or date', async () => {
    signInWith('admin', 'members.view', 'members.vip.approve');
    members.get.mockResolvedValue(detail({ vip: { requests: [request()], reviewDate: null } }));
    vip.decide.mockResolvedValue(request({ status: 'APPROVED' }));
    await openVip();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(screen.getByText(/free VIP term from today/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' }).at(-1)!);
    await waitFor(() => expect(vip.decide).toHaveBeenCalledWith('acme', 'r1', 'APPROVE', undefined));
  });

  it('FR-VIP-02 a refusal from the server is shown in words', async () => {
    signInWith('admin', 'members.view', 'members.vip.approve');
    members.get.mockResolvedValue(detail({ vip: { requests: [request()], reviewDate: null } }));
    vip.decide.mockRejectedValue({ response: { status: 409, data: { code: 'VIP_REFUSED', reason: 'NOT_PENDING' } } });
    await openVip();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' }).at(-1)!);
    expect(await screen.findByText('This request has already been decided.')).toBeInTheDocument();
  });

  it('FR-VIP-03, FR-VIP-05 a VIP shows the review date and the approver can end it with a reason', async () => {
    signInWith('admin', 'members.view', 'members.vip.approve');
    members.get.mockResolvedValue(
      detail({ tier: 'VIP', effectiveTier: 'VIP', vip: { requests: [request({ status: 'APPROVED', decidedBy: { id: 'dea', name: 'Dea Approver' }, decidedAt: '2026-10-03T09:00:00.000Z' })], reviewDate: '2027-10-02' } })
    );
    vip.end.mockResolvedValue({ memberId: 'm1', endedOn: '2026-10-07' });
    await openVip();
    expect(screen.getByText(/VIP review date:/)).toBeInTheDocument();
    expect(screen.getByText(/Dea Approver/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'End VIP' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'End VIP' }).at(-1)!);
    expect(await screen.findByText('A reason is required.')).toBeInTheDocument();
    expect(vip.end).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Partnership ended' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'End VIP' }).at(-1)!);
    await waitFor(() => expect(vip.end).toHaveBeenCalledWith('acme', 'm1', 'Partnership ended'));
  });

  it('FR-VIP-05 the ending is shown with who and why', async () => {
    signInWith('admin', 'members.view', 'members.vip.approve');
    members.get.mockResolvedValue(
      detail({ vip: { requests: [request({ status: 'APPROVED', endedAt: '2026-10-05T09:00:00.000Z', endedBy: { id: 'a', name: 'Ana Admin' }, endReason: 'Left the board' })], reviewDate: null } })
    );
    await openVip();
    expect(screen.getByText(/Ending reason: Left the board/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'End VIP' })).not.toBeInTheDocument();
  });

  it('FR-VIP-01 a closed member cannot be requested', async () => {
    signInWith('agent', 'members.view', 'members.manage');
    members.get.mockResolvedValue(detail({ status: 'CLOSED' }));
    await openVip();
    expect(screen.queryByRole('button', { name: 'Request VIP' })).not.toBeInTheDocument();
  });
});

describe('The VIP requests list (M4 Slice 7)', () => {
  const renderList = () =>
    render(
      <MemoryRouter initialEntries={['/acme/members/vip-requests']}>
        <Routes>
          <Route path="/:tenantSlug/members/vip-requests" element={<VipRequestsContent />} />
        </Routes>
      </MemoryRouter>
    );

  it('FR-VIP-02 lists pending requests with Approve and Reject, and no buttons on one\'s own', async () => {
    signInWith('admin', 'members.view', 'members.vip.approve');
    vip.list.mockResolvedValue({
      data: [request(), request({ id: 'r2', requestedBy: { id: 'admin', name: 'Ana Admin' }, member: { id: 'm2', memberNumber: 'WP-000002', name: 'Bora Kola' } })],
      total: 2, page: 1, limit: 25,
    });
    renderList();
    expect(await screen.findByText(/WP-000001 Ana Hoxha/)).toBeInTheDocument();
    expect(vip.list).toHaveBeenCalledWith('acme', { status: 'PENDING', page: 1, limit: 25 });
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
    expect(screen.getByText('You made this request; another approver decides it.')).toBeInTheDocument();
  });

  it('FR-VIP-02 approving from the list reloads it', async () => {
    signInWith('admin', 'members.view', 'members.vip.approve');
    vip.list.mockResolvedValue({ data: [request()], total: 1, page: 1, limit: 25 });
    vip.decide.mockResolvedValue(request({ status: 'APPROVED' }));
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' }).at(-1)!);
    await waitFor(() => expect(vip.decide).toHaveBeenCalledWith('acme', 'r1', 'APPROVE', undefined));
    await waitFor(() => expect(vip.list).toHaveBeenCalledTimes(2));
  });
});

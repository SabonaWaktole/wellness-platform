import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MemberDetailContent } from './MemberDetailContent';
import { CompanyWellnessTab } from './CompanyWellnessTab';
import { memberService, type MemberDetail, type MemberSummary } from '../../services/memberService';
import { companyMembershipService, type CompanyMembership } from '../../services/companyMembershipService';
import { memberPaymentService } from '../../services/memberPaymentService';
import { membershipSettingsService } from '../../services/membershipSettingsService';
import { lookupService } from '../../services/lookupService';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('../../services/memberService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberService')>();
  return { ...actual, memberService: { get: vi.fn(), search: vi.fn(), removeEmployer: vi.fn(), removeEmployees: vi.fn() } };
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
const company = vi.mocked(companyMembershipService);
const settings = vi.mocked(membershipSettingsService);
const lookups = vi.mocked(lookupService);
vi.mocked(memberPaymentService);

const summary = (id: string, firstName: string, extra: Partial<MemberSummary> = {}): MemberSummary => ({
  id, memberNumber: `WP-${id}`, firstName, lastName: 'Hoxha', dateOfBirth: null, tier: 'SILVER', status: 'ACTIVE', valid: true, source: 'CORPORATE', startsOn: '2026-10-01',
  employer: { id: 'c1', name: 'Kafe Blloku' }, formerEmployee: false, expiringSoon: false, ...extra,
});

const tab = (extra: Partial<CompanyMembership> = {}): CompanyMembership => ({
  company: { id: 'c1', name: 'Kafe Blloku', employeeCount: 40 },
  summary: { members: 12, employees: 40, formerEmployees: 1, perTier: { BRONZE: 1, SILVER: 9, GOLD: 2, VIP: 0 } },
  sponsor: { valid: true, endsOn: '2027-09-30' },
  members: [summary('a', 'Ana'), summary('b', 'Bora'), summary('c', 'Dea', { tier: 'GOLD' })],
  formerEmployees: [{ ...summary('f', 'Fiona', { tier: 'BRONZE', employer: null, formerEmployee: true }), leftCompanyAt: '2026-09-15' }],
  uploads: [{ id: 'u1', clientId: 'c1', fileName: 'staff.xlsx', status: 'CONFIRMED', uploadedBy: 'x', uploadedByName: 'Ana Admin', createdAt: '2026-10-01T09:00:00.000Z', confirmedAt: '2026-10-01T09:05:00.000Z', created: 3, linked: 1, skipped: 0, refused: 1, errors: 0 }],
  ...extra,
});

const detail = (extra: Partial<MemberDetail> = {}): MemberDetail => ({
  ...summary('m1', 'Ana'), phone: null, email: 'ana@example.com', language: 'sq', cityId: null, note: null,
  createdBy: { id: 'u1', name: 'Ana Admin' }, createdAt: '2026-10-01T09:00:00.000Z', closedAt: null, effectiveTier: 'SILVER', validity: { valid: true, reason: null },
  currentTerm: { source: 'SPONSORED', startsOn: '2026-10-01', endsOn: '2027-09-30' }, terms: [], tierHistory: [], statusHistory: [],
  family: { principalMemberId: null, relationshipId: null, principal: null, dependants: [], history: [] },
  vip: { requests: [], reviewDate: null }, formerEmployerClientId: null, leftCompanyAt: null, ...extra,
});

const signInWith = (...keys: string[]) =>
  useAuthStore.setState({ user: { tenantCurrency: 'EUR', tenantLocale: 'en-GB', permissions: Object.fromEntries(keys.map((k) => [k, true])) } as never });

const renderTab = () =>
  render(
    <MemoryRouter initialEntries={['/acme/clients/c1']}>
      <Routes>
        <Route path="/:tenantSlug/clients/:clientId" element={<CompanyWellnessTab clientId="c1" />} />
        <Route path="/:tenantSlug/members/:memberId" element={<p>member page</p>} />
        <Route path="/:tenantSlug/members/employee-upload" element={<p>upload page</p>} />
        <Route path="/:tenantSlug/members" element={<p>member list</p>} />
      </Routes>
    </MemoryRouter>
  );

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
});
afterEach(() => useAuthStore.setState({ user: null }));

describe('The Wellness+ tab of the company page (M4 Slice 10)', () => {
  it('FR-MEM-11 shows "12 members of 40 employees", the count per tier, the former employees and the upload history', async () => {
    signInWith('members.view');
    company.get.mockResolvedValue(tab());
    renderTab();
    expect(await screen.findByText('12 members of 40 employees')).toBeInTheDocument();
    expect(screen.getByText(/sponsors Silver until/)).toBeInTheDocument();
    const tiers = within(screen.getByRole('list', { name: 'Members per tier' }));
    expect(tiers.getByText('Silver: 9')).toBeInTheDocument();
    expect(tiers.getByText('Gold: 2')).toBeInTheDocument();
    expect(screen.getByText('Former employee (1)')).toBeInTheDocument();
    expect(screen.getByText('Fiona Hoxha')).toBeInTheDocument();
    expect(screen.getByText('staff.xlsx')).toBeInTheDocument();
    expect(screen.getByText('3 created, 1 linked, 1 not added')).toBeInTheDocument();
  });

  it('FR-MEM-11 a company with no employee count shows the members alone, and a company with no valid contract says so', async () => {
    signInWith('members.view');
    company.get.mockResolvedValue(tab({ summary: { members: 2, employees: null, formerEmployees: 0, perTier: { BRONZE: 2, SILVER: 0, GOLD: 0, VIP: 0 } }, sponsor: { valid: false, endsOn: null }, formerEmployees: [], uploads: [] }));
    renderTab();
    expect(await screen.findByText('2 members')).toBeInTheDocument();
    expect(screen.getByText(/no valid contract/)).toBeInTheDocument();
    expect(screen.getByText('Nobody has left this company.')).toBeInTheDocument();
  });

  it('FR-RBAC-28 a user with Members: view alone sees the tab but no selection, removal or upload control', async () => {
    signInWith('members.view');
    company.get.mockResolvedValue(tab());
    renderTab();
    await screen.findByText('12 members of 40 employees');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove .* from the company/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upload employees' })).toBeNull();
  });

  it('FR-EMP-15 removing two selected members sends one request with both, the date and the reason', async () => {
    signInWith('members.view', 'members.manage');
    company.get.mockResolvedValue(tab());
    members.removeEmployees.mockResolvedValue({ removed: 2, skipped: [] });
    renderTab();
    await screen.findByText('12 members of 40 employees');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Ana Hoxha' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Bora Hoxha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove 2 selected from the company' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason (optional)'), { target: { value: 'Staff reduction' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(members.removeEmployees).toHaveBeenCalledTimes(1));
    const [slug, ids, body] = members.removeEmployees.mock.calls[0];
    expect(slug).toBe('acme');
    expect(ids).toEqual(['a', 'b']);
    expect(body).toMatchObject({ reason: 'Staff reduction', leftOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    await waitFor(() => expect(company.get).toHaveBeenCalledTimes(2));
  });

  it('FR-EMP-13 the tab links to the member list filtered to that company\'s former employees', async () => {
    signInWith('members.view');
    company.get.mockResolvedValue(tab());
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Open in the member list' }));
    expect(await screen.findByText('member list')).toBeInTheDocument();
  });
});

describe('Remove from company on the member page (M4 Slice 10)', () => {
  it('FR-EMP-12 the Members: manage user removes the employee with a leaving date and reason, and the page reloads', async () => {
    signInWith('members.view', 'members.manage');
    members.get.mockResolvedValue(detail());
    members.removeEmployer.mockResolvedValue({} as never);
    renderMember();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from company' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason (optional)'), { target: { value: 'Resigned' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(members.removeEmployer).toHaveBeenCalledTimes(1));
    expect(members.removeEmployer).toHaveBeenCalledWith('acme', 'm1', { leftOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), reason: 'Resigned' });
    await waitFor(() => expect(members.get).toHaveBeenCalledTimes(2));
  });

  it('FR-EMP-12 a leaving date in the future is refused and nothing is sent', async () => {
    signInWith('members.view', 'members.manage');
    members.get.mockResolvedValue(detail());
    renderMember();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from company' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Leaving date'), { target: { value: '2999-01-01' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(await within(dialog).findByText('Choose a day that is not in the future.')).toBeInTheDocument();
    expect(members.removeEmployer).not.toHaveBeenCalled();
  });

  it('FR-EMP-12 a member with no employer, or a user without Members: manage, has no Remove from company button', async () => {
    signInWith('members.view', 'members.manage');
    members.get.mockResolvedValue(detail({ employer: null, source: 'INDIVIDUAL' }));
    const first = renderMember();
    await screen.findByRole('heading', { name: /Ana Hoxha/ });
    expect(screen.queryByRole('button', { name: 'Remove from company' })).toBeNull();
    first.unmount();

    signInWith('members.view');
    members.get.mockResolvedValue(detail());
    renderMember();
    await screen.findByRole('heading', { name: /Ana Hoxha/ });
    expect(screen.queryByRole('button', { name: 'Remove from company' })).toBeNull();
  });

  it('FR-EMP-13 a former employee is labelled, with the leaving date and a link to the company', async () => {
    signInWith('members.view');
    members.get.mockResolvedValue(detail({ employer: null, source: 'INDIVIDUAL', formerEmployee: true, formerEmployerClientId: 'c1', leftCompanyAt: '2026-09-15', effectiveTier: 'BRONZE', currentTerm: null }));
    renderMember();
    await screen.findByRole('heading', { name: /Ana Hoxha/ });
    expect(screen.getAllByText('Former employee').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Left on/ })).toHaveAttribute('href', '/acme/clients/c1');
  });
});

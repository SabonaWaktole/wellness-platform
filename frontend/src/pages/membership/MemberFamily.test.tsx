import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MemberDetailContent } from './MemberDetailContent';
import { memberService, type MemberDetail } from '../../services/memberService';
import { memberPaymentService, type PaymentOption } from '../../services/memberPaymentService';
import { membershipSettingsService } from '../../services/membershipSettingsService';
import { lookupService } from '../../services/lookupService';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('../../services/memberService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberService')>();
  return { ...actual, memberService: { get: vi.fn(), changeStatus: vi.fn(), familyRelationships: vi.fn(), addFamilyMember: vi.fn(), removeFamilyLink: vi.fn(), search: vi.fn() } };
});
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
const pays = vi.mocked(memberPaymentService);
const settings = vi.mocked(membershipSettingsService);
const lookups = vi.mocked(lookupService);

const spouse = { id: 'spouse', nameSq: 'Bashkëshort', nameEn: 'Spouse or partner' };

const detail = (extra: Partial<MemberDetail> = {}): MemberDetail => ({
  id: 'm1', memberNumber: 'WP-000001', firstName: 'Ana', lastName: 'Hoxha', dateOfBirth: null, phone: null, email: 'ana@example.com', tier: 'GOLD', status: 'ACTIVE',
  valid: true, source: 'INDIVIDUAL', startsOn: '2026-10-01', employer: null, formerEmployee: false, expiringSoon: false, language: 'sq', cityId: null, note: null,
  createdBy: { id: 'u1', name: 'Ana Admin' }, createdAt: '2026-10-01T09:00:00.000Z', closedAt: null, effectiveTier: 'GOLD', validity: { valid: true, reason: null },
  currentTerm: { source: 'PAID', startsOn: '2026-10-01', endsOn: '2027-09-30' }, terms: [], tierHistory: [], statusHistory: [],
  family: { principalMemberId: null, relationshipId: null, principal: null, dependants: [], history: [] },
  vip: { requests: [], reviewDate: null },
  formerEmployerClientId: null, leftCompanyAt: null, ...extra,
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

const openFamily = async () => {
  renderMember();
  fireEvent.click(await screen.findByRole('tab', { name: /Family/ }));
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
  members.familyRelationships.mockResolvedValue([spouse, { id: 'child', nameSq: 'Fëmijë', nameEn: 'Child' }]);
});
afterEach(() => useAuthStore.setState({ user: null }));

describe('The Family tab (M4 Slice 6)', () => {
  it('FR-FAM-07 the principal lists the group with relationship, tier and validity', async () => {
    signInWith('members.view', 'members.manage');
    members.get.mockResolvedValue(
      detail({
        family: {
          principalMemberId: null, relationshipId: null, principal: null, history: [],
          dependants: [
            { id: 'd1', memberNumber: 'WP-000002', name: 'Bora Hoxha', relationship: spouse, tier: 'SILVER', status: 'ACTIVE', valid: true, confirmedBy: 'Ana Admin', confirmedAt: '2026-10-02T09:00:00.000Z' },
            { id: 'd2', memberNumber: 'WP-000003', name: 'Dea Hoxha', relationship: { id: 'child', nameSq: 'Fëmijë', nameEn: 'Child' }, tier: 'BRONZE', status: 'SUSPENDED', valid: false, confirmedBy: null, confirmedAt: null },
          ],
        },
      })
    );
    await openFamily();
    expect(await screen.findByText(/WP-000002 Bora Hoxha/)).toBeInTheDocument();
    expect(screen.getByText('Spouse or partner')).toBeInTheDocument();
    expect(screen.getAllByText('Child').length).toBeGreaterThan(0);
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Valid')).toBeInTheDocument();
    expect(table.getByText(/Not valid/)).toBeInTheDocument();
    expect(screen.getByText(/Confirmed by Ana Admin on/)).toBeInTheDocument();
  });

  it('FR-FAM-01, FR-FAM-07 a family member shows the principal and "Confirmed by (name) on (date)"', async () => {
    signInWith('members.view', 'members.manage');
    members.get.mockResolvedValue(
      detail({
        family: {
          principalMemberId: 'p1', relationshipId: 'spouse', dependants: [], history: [],
          principal: { id: 'p1', memberNumber: 'WP-000009', name: 'Petrit Hoxha', relationship: spouse, confirmedBy: 'Ana Admin', confirmedAt: '2026-10-02T09:00:00.000Z' },
        },
      })
    );
    await openFamily();
    expect(await screen.findByText(/WP-000009 Petrit Hoxha/)).toBeInTheDocument();
    expect(screen.getByText(/Confirmed by Ana Admin on/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add family member' })).toBeNull();
  });

  it('FR-RBAC-28 a user without Members: manage sees the group but no add or remove control', async () => {
    signInWith('members.view');
    members.get.mockResolvedValue(detail());
    await openFamily();
    expect(await screen.findByText('This member has no family members yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add family member' })).toBeNull();
  });

  it('FR-FAM-01 saving without the relationship or without the confirmation is refused, and nothing is sent', async () => {
    signInWith('members.view', 'members.manage');
    members.get.mockResolvedValue(detail());
    members.addFamilyMember.mockResolvedValue({} as never);
    await openFamily();
    fireEvent.click(await screen.findByRole('button', { name: 'Add family member' }));
    fireEvent.change(await screen.findByLabelText(/^First name/), { target: { value: 'Bora' } });
    fireEvent.change(screen.getByLabelText(/^Last name/), { target: { value: 'Hoxha' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+355691234567' } });

    fireEvent.click(screen.getAllByRole('button', { name: 'Add family member' }).pop()!);
    expect(await screen.findByText('Choose the relationship.')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('option', { name: 'Spouse or partner' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Relationship'), { target: { value: 'spouse' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add family member' }).pop()!);
    expect(await screen.findByText('Tick the confirmation to save.')).toBeInTheDocument();
    expect(members.addFamilyMember).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('I confirm that the relationship was checked.'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Add family member' }).pop()!);
    await waitFor(() => expect(members.addFamilyMember).toHaveBeenCalledTimes(1));
    const [slug, principal, body, different] = members.addFamilyMember.mock.calls[0];
    expect([slug, principal, different]).toEqual(['acme', 'm1', false]);
    expect(body).toMatchObject({ relationshipId: 'spouse', confirmed: true, member: { firstName: 'Bora', lastName: 'Hoxha', phone: '+355691234567' } });
    expect(Object.keys(body)).not.toContain('tier');
  });

  it('FR-FAM-03 a refused link shows the reason in words', async () => {
    signInWith('members.view', 'members.manage');
    members.get.mockResolvedValue(detail());
    members.addFamilyMember.mockRejectedValue({ response: { status: 409, data: { code: 'FAMILY_LINK_REFUSED', reason: 'ALREADY_HAS_PRINCIPAL' } } });
    members.search.mockResolvedValue({ data: [{ id: 'x1', memberNumber: 'WP-000020', firstName: 'Eni', lastName: 'Gjoka', source: 'INDIVIDUAL' }], total: 1, page: 1, limit: 8 } as never);
    await openFamily();
    fireEvent.click(await screen.findByRole('button', { name: 'Add family member' }));
    fireEvent.change(await screen.findByLabelText('Family member'), { target: { value: 'existing' } });
    fireEvent.change(screen.getByLabelText('Search by name, ID, phone or email'), { target: { value: 'Eni' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /WP-000020 Eni Gjoka/ })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Member'), { target: { value: 'x1' } });
    await waitFor(() => expect(screen.getByRole('option', { name: 'Child' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Relationship'), { target: { value: 'child' } });
    fireEvent.click(screen.getByLabelText('I confirm that the relationship was checked.'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Add family member' }).pop()!);
    expect(await screen.findByText('This member already has a principal.')).toBeInTheDocument();
  });

  it('FR-FAM-06 removing the link needs a reason, then sends it', async () => {
    signInWith('members.view', 'members.manage');
    members.get.mockResolvedValue(
      detail({
        family: {
          principalMemberId: 'p1', relationshipId: 'spouse', dependants: [], history: [],
          principal: { id: 'p1', memberNumber: 'WP-000009', name: 'Petrit Hoxha', relationship: spouse, confirmedBy: 'Ana Admin', confirmedAt: '2026-10-02T09:00:00.000Z' },
        },
      })
    );
    members.removeFamilyLink.mockResolvedValue({} as never);
    await openFamily();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove family link' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove link' }));
    expect(await screen.findByText('A reason is required.')).toBeInTheDocument();
    expect(members.removeFamilyLink).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Divorced' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
    await waitFor(() => expect(members.removeFamilyLink).toHaveBeenCalledWith('acme', 'm1', 'Divorced'));
  });

  it('FR-FAM-05 the payment dialog shows the list fee, the percent and "Family discount, relationship (name)"', async () => {
    signInWith('members.view', 'members.payments.view', 'members.payments.record');
    members.get.mockResolvedValue(detail({ effectiveTier: 'BRONZE', tier: 'BRONZE', payments: [] }));
    const option: PaymentOption = {
      kind: 'NEW', targetTier: 'SILVER',
      quote: {
        kind: 'NEW', fromTier: 'BRONZE', toTier: 'SILVER', listFee: '60.00', discountPercent: '50.00', amount: '30.00', startsOn: '2026-10-07', endsOn: '2027-10-06', warnings: [],
        family: { principalMemberId: 'p1', principalName: 'Petrit Hoxha', relationshipNameSq: 'Bashkëshort', relationshipNameEn: 'Spouse or partner' },
      },
    };
    pays.options.mockResolvedValue([option]);
    renderMember();
    fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
    expect(await screen.findByTestId('payment-amount')).toHaveTextContent('€30.00');
    expect(screen.getByText('€60.00')).toBeInTheDocument();
    expect(screen.getByText('50.00%')).toBeInTheDocument();
    expect(screen.getByTestId('family-discount-reason')).toHaveTextContent('Family discount, Spouse or partner (Petrit Hoxha)');
  });
});

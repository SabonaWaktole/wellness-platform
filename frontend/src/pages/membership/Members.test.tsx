import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MembersContent } from './MembersContent';
import { MemberFormContent } from './MemberFormContent';
import { MemberDetailContent } from './MemberDetailContent';
import { memberService, type MemberDetail, type MemberSummary } from '../../services/memberService';
import { membershipSettingsService } from '../../services/membershipSettingsService';
import { lookupService } from '../../services/lookupService';
import { useAuthStore } from '../../store/useAuthStore';

vi.mock('../../services/memberService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberService')>();
  return { ...actual, memberService: { search: vi.fn(), get: vi.fn(), register: vi.fn(), update: vi.fn(), changeStatus: vi.fn() } };
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
  id: 'm1', memberNumber: 'WP-000001', firstName: 'Ana', lastName: 'Hoxha', dateOfBirth: '1990-05-17', phone: '+355691234567', email: 'ana@example.com',
  tier: 'GOLD', status: 'ACTIVE', valid: true, source: 'INDIVIDUAL', startsOn: '2026-10-01', employer: null, formerEmployee: false, ...extra,
});

const detail = (extra: Partial<MemberDetail> = {}): MemberDetail => ({
  ...row(), language: 'sq', cityId: 'c1', note: 'Prefers mornings', createdBy: { id: 'u1', name: 'Ana Admin' }, createdAt: '2026-10-01T09:00:00.000Z', closedAt: null,
  effectiveTier: 'SILVER', tier: 'SILVER', validity: { valid: true, reason: null },
  currentTerm: { source: 'PAID', startsOn: '2026-01-01', endsOn: '2026-12-31' },
  terms: [{ id: 't1', tier: 'SILVER', source: 'PAID', startsOn: '2026-01-01', endsOn: '2026-12-31' }],
  tierHistory: [{ id: 'h1', fromTier: 'BRONZE', toTier: 'SILVER', reason: 'Purchase', comment: null, createdAt: '2026-01-01T09:00:00.000Z', changedBy: 'Ana Admin' }],
  statusHistory: [{ id: 's1', fromStatus: null, toStatus: 'ACTIVE', reason: null, createdAt: '2026-10-01T09:00:00.000Z', changedBy: 'Ana Admin' }],
  family: { principalMemberId: null, relationshipId: null, dependants: [] }, formerEmployerClientId: null, leftCompanyAt: null, ...extra,
});

const signInWith = (...keys: string[]) => useAuthStore.setState({ user: { permissions: Object.fromEntries(keys.map((k) => [k, true])) } as never });

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}</div>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:tenantSlug/members" element={<MembersContent />} />
        <Route path="/:tenantSlug/members/new" element={<MemberFormContent />} />
        <Route path="/:tenantSlug/members/:memberId" element={<><MemberDetailContent /><Where /></>} />
        <Route path="/:tenantSlug/members/:memberId/edit" element={<MemberFormContent />} />
      </Routes>
      <Where />
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
  lookups.list.mockResolvedValue([{ id: 'c1', areaId: 'a1', nameSq: 'Tiranë', nameEn: 'Tirana', order: 1, active: true }] as never);
});
afterEach(() => useAuthStore.setState({ user: null }));

describe('The member list (M4 Slice 4)', () => {
  beforeEach(() => {
    signInWith('members.view', 'members.manage');
    members.search.mockResolvedValue({ data: [row(), row({ id: 'm2', memberNumber: 'WP-000002', firstName: 'Zef', lastName: 'Kola', tier: 'BRONZE', status: 'SUSPENDED', valid: false, source: 'CORPORATE', employer: { id: 'e1', name: 'Employer Co' } })], total: 2, page: 1, limit: 25 });
  });

  it('FR-MEM-07 shows each member with tier, status and source, and the total', async () => {
    renderAt('/acme/members');
    const ana = (await screen.findByText(/Hoxha Ana/)).closest('tr')!;
    expect(within(ana).getByText('WP-000001')).toBeInTheDocument();
    expect(within(ana).getByText('Gold')).toBeInTheDocument();
    expect(within(ana).getByText('Active')).toBeInTheDocument();
    const zef = screen.getByText(/Kola Zef/).closest('tr')!;
    expect(within(zef).getByText('Suspended')).toBeInTheDocument();
    expect(within(zef).getByText('Corporate')).toBeInTheDocument();
    expect(within(zef).getByText('Employer Co')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 members');
  });

  it('FR-MEM-07 asks the server to search and filter, and starts again from page 1', async () => {
    renderAt('/acme/members');
    await screen.findByText(/Hoxha Ana/);
    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'WP-0001' } });
    await waitFor(() => expect(members.search).toHaveBeenLastCalledWith('acme', expect.objectContaining({ query: 'WP-0001', page: 1 })));
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'GOLD' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'SUSPENDED' } });
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'CORPORATE' } });
    fireEvent.click(screen.getByLabelText('Expiring soon'));
    fireEvent.click(screen.getByLabelText('Former employee'));
    await waitFor(() =>
      expect(members.search).toHaveBeenLastCalledWith('acme', expect.objectContaining({ tier: 'GOLD', status: 'SUSPENDED', source: 'CORPORATE', expiringSoon: true, formerEmployee: true }))
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(members.search).toHaveBeenLastCalledWith('acme', expect.objectContaining({ query: '', tier: '', expiringSoon: false })));
  });

  it('FR-RBAC-27 shows the phone and email columns only when the server sent them', async () => {
    renderAt('/acme/members');
    await screen.findByText(/Hoxha Ana/);
    expect(screen.getByRole('columnheader', { name: 'Phone' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Email' })).toBeInTheDocument();
  });

  it('FR-RBAC-27 without them there are no such columns', async () => {
    members.search.mockResolvedValue({ data: [{ ...row(), phone: undefined, email: undefined }], total: 1, page: 1, limit: 25 });
    renderAt('/acme/members');
    await screen.findByText(/Hoxha Ana/);
    expect(screen.queryByRole('columnheader', { name: 'Phone' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Email' })).toBeNull();
  });

  it('FR-RBAC-28 a user who cannot manage members has no "New member" button', async () => {
    signInWith('members.view');
    renderAt('/acme/members');
    await screen.findByText(/Hoxha Ana/);
    expect(screen.queryByRole('button', { name: 'New member' })).toBeNull();
  });

  it('FR-MEM-07 a row opens the member page, and the empty states say why', async () => {
    renderAt('/acme/members');
    fireEvent.click((await screen.findByText(/Hoxha Ana/)).closest('tr')!);
    await waitFor(() => expect(screen.getAllByTestId('where')[0]).toHaveTextContent('/acme/members/m1'));
  });

  it('FR-MEM-07 an empty workspace and an empty search read differently', async () => {
    members.search.mockResolvedValue({ data: [], total: 0, page: 1, limit: 25 });
    renderAt('/acme/members');
    expect(await screen.findByText('No members yet. Register the first one.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search members'), { target: { value: 'nobody' } });
    expect(await screen.findByText('No member matches this search.')).toBeInTheDocument();
  });
});

describe('The new member form (M4 Slice 4)', () => {
  beforeEach(() => signInWith('members.view', 'members.manage'));

  const fill = () => {
    fireEvent.change(screen.getByLabelText(/First name/), { target: { value: ' Ana ' } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'Hoxha' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.com' } });
  };

  it('FR-MEM-01, FR-MEM-02 sends the personal details and opens the new member', async () => {
    members.register.mockResolvedValue(row({ id: 'new1' }));
    renderAt('/acme/members/new');
    fill();
    await screen.findByRole('option', { name: 'Tirana' });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save member' }));
    await waitFor(() =>
      expect(members.register).toHaveBeenCalledWith(
        'acme',
        { firstName: 'Ana', lastName: 'Hoxha', dateOfBirth: null, phone: null, email: 'ana@example.com', language: 'sq', cityId: 'c1', note: null },
        false
      )
    );
    await waitFor(() => expect(screen.getAllByTestId('where')[0]).toHaveTextContent('/acme/members/new1'));
  });

  it('FR-MEM-09, FR-DPR-03 the form has no tier, expiry, member ID, status, address or ID-number control', () => {
    renderAt('/acme/members/new');
    const labels = [...document.querySelectorAll('label')].map((l) => l.textContent ?? '');
    for (const forbidden of [/tier/i, /expir/i, /member id/i, /status/i, /address/i, /national/i, /photo/i, /diagnos/i]) {
      expect(labels.filter((label) => forbidden.test(label))).toEqual([]);
    }
    expect(screen.getAllByRole('textbox').length + document.querySelectorAll('select, input[type="date"]').length).toBeLessThan(12);
  });

  it('FR-MEM-02 shows the server refusal against the field it names', async () => {
    members.register.mockRejectedValue({ response: { status: 400, data: { field: 'identifier', code: 'INVALID_MEMBER' } } });
    renderAt('/acme/members/new');
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Save member' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a date of birth, a phone number or an email.');
    members.register.mockRejectedValue({ response: { status: 400, data: { field: 'email', code: 'INVALID_MEMBER' } } });
    fireEvent.click(screen.getByRole('button', { name: 'Save member' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
  });

  it('FR-MEM-04 a duplicate shows the existing member and saves only after "Different person, save"', async () => {
    const existing = row({ id: 'old1', memberNumber: 'WP-000007' });
    members.register.mockRejectedValueOnce({ response: { status: 409, data: { code: 'DUPLICATE_MEMBER', duplicates: [existing] } } });
    members.register.mockResolvedValueOnce(row({ id: 'new2' }));
    renderAt('/acme/members/new');
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Save member' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('WP-000007')).toBeInTheDocument();
    expect(members.register).toHaveBeenCalledTimes(1);
    expect(members.register.mock.calls[0][2]).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Different person, save' }));
    await waitFor(() => expect(members.register).toHaveBeenCalledTimes(2));
    expect(members.register.mock.calls[1][2]).toBe(true);
    await waitFor(() => expect(screen.getAllByTestId('where')[0]).toHaveTextContent('/acme/members/new2'));
  });

  it('FR-MEM-04 the dialog can open the existing member instead', async () => {
    members.register.mockRejectedValue({ response: { status: 409, data: { code: 'DUPLICATE_MEMBER', duplicates: [row({ id: 'old1' })] } } });
    renderAt('/acme/members/new');
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Save member' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(screen.getAllByTestId('where')[0]).toHaveTextContent('/acme/members/old1'));
    expect(members.register).toHaveBeenCalledTimes(1);
  });

  it('FR-MEM-10 the note field carries the no-medical-information warning', () => {
    renderAt('/acme/members/new');
    expect(screen.getByText(/Do not write any medical information here/)).toBeInTheDocument();
  });

  it('FR-MEM-10 the warning exists in Albanian and English', () => {
    const read = (lang: string) => JSON.parse(readFileSync(resolve(__dirname, '../../locales', lang, 'members.json'), 'utf8'));
    expect(read('en').form.noteWarning).toMatch(/medical/i);
    expect(read('sq').form.noteWarning).toMatch(/mjekësor/i);
  });

  it('FR-MEM-09 editing loads the member, sends the details and keeps the confirmation off', async () => {
    members.get.mockResolvedValue(detail());
    members.update.mockResolvedValue(row());
    renderAt('/acme/members/m1/edit');
    await waitFor(() => expect(screen.getByLabelText(/First name/)).toHaveValue('Ana'));
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '0692220000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save member' }));
    await waitFor(() =>
      expect(members.update).toHaveBeenCalledWith('acme', 'm1', expect.objectContaining({ phone: '0692220000', language: 'sq', cityId: 'c1', note: 'Prefers mornings' }), false)
    );
  });
});

describe('The member page (M4 Slice 4)', () => {
  beforeEach(() => {
    signInWith('members.view', 'members.manage');
    members.get.mockResolvedValue(detail());
  });

  it('FR-MEM-08 shows the calculated tier with its term dates, and every field', async () => {
    renderAt('/acme/members/m1');
    expect(await screen.findByRole('heading', { name: 'Ana Hoxha' })).toBeInTheDocument();
    const tierCard = screen.getByRole('heading', { name: 'Current tier' }).closest('div')!;
    expect(within(tierCard).getByText('Silver')).toBeInTheDocument();
    expect(within(tierCard).getByText(/Term .* – /)).toBeInTheDocument();
    for (const label of ['Member ID', 'Date of birth', 'Phone', 'Email', 'Card language', 'City', 'Member since', 'Employer company', 'Created by']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('WP-000001', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('Ana Admin', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('Tirana')).toBeInTheDocument();
  });

  it('FR-MEM-08 has the term history, the tier history with who and why, and the status history', async () => {
    renderAt('/acme/members/m1');
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    fireEvent.click(screen.getByRole('tab', { name: /Terms/ }));
    expect(screen.getByText('Paid')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByText('Bronze → Silver')).toBeInTheDocument();
    expect(screen.getByText('Purchase')).toBeInTheDocument();
    expect(screen.getByText('Registered: Active')).toBeInTheDocument();
  });

  it('FR-MEM-06 a member with no term says Bronze is the free level, and a suspended one says why it is not valid', async () => {
    members.get.mockResolvedValue(detail({ effectiveTier: 'BRONZE', currentTerm: null, terms: [], status: 'SUSPENDED', validity: { valid: false, reason: 'SUSPENDED' } }));
    renderAt('/acme/members/m1');
    expect(await screen.findByText('Bronze is the free level every active member has.')).toBeInTheDocument();
    expect(screen.getByText('Not valid: Suspended')).toBeInTheDocument();
  });

  it('FR-MEM-09 there is no control that edits the tier, an expiry date or the member ID', async () => {
    renderAt('/acme/members/m1');
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(expect.arrayContaining(['Edit details', 'Suspend', 'Close member']));
    expect(buttons.filter((b) => /tier|expir|upgrade|renew/i.test(b ?? ''))).toEqual([]);
  });

  it('FR-MEM-05 suspending needs a reason, then reloads the member', async () => {
    members.changeStatus.mockResolvedValue(row({ status: 'SUSPENDED' }));
    renderAt('/acme/members/m1');
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await within(dialog).findByText('A reason is required to suspend a member.')).toBeInTheDocument();
    expect(members.changeStatus).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Card lost' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(members.changeStatus).toHaveBeenCalledWith('acme', 'm1', 'SUSPEND', 'Card lost'));
    await waitFor(() => expect(members.get).toHaveBeenCalledTimes(2));
  });

  it('FR-MEM-05 a closed member can be reopened and has no delete action', async () => {
    members.get.mockResolvedValue(detail({ status: 'CLOSED', closedAt: '2026-10-05T09:00:00.000Z', validity: { valid: false, reason: 'CLOSED' } }));
    renderAt('/acme/members/m1');
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete|remove/i })).toBeNull();
  });

  it('FR-RBAC-27 without phone, email and note in the response the page shows none of them', async () => {
    members.get.mockResolvedValue(detail({ phone: undefined, email: undefined, note: undefined }));
    renderAt('/acme/members/m1');
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    expect(screen.queryByText('Phone')).toBeNull();
    expect(screen.queryByText('Email')).toBeNull();
  });

  it('FR-RBAC-28 a user who may only view sees no edit or status buttons', async () => {
    signInWith('members.view');
    renderAt('/acme/members/m1');
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    expect(screen.queryByRole('button', { name: /Edit details|Suspend|Close member/ })).toBeNull();
  });

  it('FR-MEM-08 the internal note tab shows the note under the warning', async () => {
    renderAt('/acme/members/m1');
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    fireEvent.click(screen.getByRole('tab', { name: 'Internal note' }));
    expect(screen.getByText('Prefers mornings')).toBeInTheDocument();
    expect(screen.getByText(/Do not write any medical information here/)).toBeInTheDocument();
  });

  it('FR-MEM-08 an unknown member says so', async () => {
    members.get.mockRejectedValue({ response: { status: 404 } });
    renderAt('/acme/members/gone');
    expect(await screen.findByRole('alert')).toHaveTextContent('This member does not exist.');
  });
});

describe('NFR-I18N-04 the member strings', () => {
  it('NFR-I18N-04 every members string exists in Albanian and English', () => {
    const read = (lang: string) => JSON.parse(readFileSync(resolve(__dirname, '../../locales', lang, 'members.json'), 'utf8'));
    const keys = (value: unknown, prefix = ''): string[] =>
      typeof value === 'object' && value !== null ? Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k)) : [prefix];
    const en = keys(read('en'));
    expect(en.length).toBeGreaterThan(100);
    expect(keys(read('sq')).sort()).toEqual(en.sort());
    expect(JSON.parse(readFileSync(resolve(__dirname, '../../locales/sq/common.json'), 'utf8')).nav.members).toBeTruthy();
  });
});

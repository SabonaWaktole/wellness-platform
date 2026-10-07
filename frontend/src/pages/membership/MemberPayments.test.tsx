import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemberDetailContent } from './MemberDetailContent';
import { MemberPaymentsContent } from './MemberPaymentsContent';
import { memberService, type MemberDetail } from '../../services/memberService';
import { memberPaymentService, type MemberPayment, type PaymentOption } from '../../services/memberPaymentService';
import { membershipSettingsService } from '../../services/membershipSettingsService';
import { lookupService } from '../../services/lookupService';
import { useAuthStore } from '../../store/useAuthStore';
import { downloadBlob } from '../../utils/downloadBlob';

vi.mock('../../services/memberService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberService')>();
  return { ...actual, memberService: { get: vi.fn(), changeStatus: vi.fn() } };
});
vi.mock('../../services/memberPaymentService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/memberPaymentService')>();
  return { ...actual, memberPaymentService: { options: vi.fn(), record: vi.fn(), void: vi.fn(), search: vi.fn(), downloadCsv: vi.fn(), receipt: vi.fn() } };
});
vi.mock('../../services/membershipSettingsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/membershipSettingsService')>();
  return { ...actual, membershipSettingsService: { getBenefits: vi.fn() } };
});
vi.mock('../../services/lookupService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/lookupService')>();
  return { ...actual, lookupService: { ...actual.lookupService, list: vi.fn() } };
});
vi.mock('../../utils/downloadBlob', () => ({ downloadBlob: vi.fn() }));

const members = vi.mocked(memberService);
const pays = vi.mocked(memberPaymentService);
const settings = vi.mocked(membershipSettingsService);
const lookups = vi.mocked(lookupService);

const payment = (extra: Partial<MemberPayment> = {}): MemberPayment => ({
  id: 'p1', memberId: 'm1', memberNumber: 'WP-000001', memberName: 'Ana Hoxha', kind: 'NEW', fromTier: 'BRONZE', toTier: 'SILVER', listFee: '60.00',
  discountPercent: '0.00', amount: '60.00', method: 'CASH', receivedOn: '2026-10-01', receiptNumber: 'RCP-2026-000001', note: null,
  recordedBy: { id: 'u1', name: 'Ana Admin' }, createdAt: '2026-10-01T09:00:00.000Z', status: 'RECORDED', voidedAt: null, voidedBy: null, voidReason: null, ...extra,
});

const detail = (extra: Partial<MemberDetail> = {}): MemberDetail => ({
  id: 'm1', memberNumber: 'WP-000001', firstName: 'Ana', lastName: 'Hoxha', dateOfBirth: null, phone: null, email: 'ana@example.com', tier: 'SILVER', status: 'ACTIVE',
  valid: true, source: 'INDIVIDUAL', startsOn: '2026-10-01', employer: null, formerEmployee: false, language: 'sq', cityId: null, note: null,
  createdBy: { id: 'u1', name: 'Ana Admin' }, createdAt: '2026-10-01T09:00:00.000Z', closedAt: null, effectiveTier: 'SILVER', validity: { valid: true, reason: null },
  currentTerm: { source: 'PAID', startsOn: '2026-10-01', endsOn: '2027-09-30' }, terms: [], tierHistory: [], statusHistory: [],
  family: { principalMemberId: null, relationshipId: null, dependants: [] }, vip: { requests: [], reviewDate: null }, formerEmployerClientId: null, leftCompanyAt: null, ...extra,
});

const option = (kind: PaymentOption['kind'], targetTier: PaymentOption['targetTier'], amount: string, extra: Partial<PaymentOption['quote']> = {}): PaymentOption => ({
  kind, targetTier, quote: { kind, fromTier: 'BRONZE', toTier: targetTier, listFee: amount, discountPercent: '0.00', amount, startsOn: '2026-10-07', endsOn: '2027-10-06', warnings: [], ...extra },
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

const renderPayments = () =>
  render(
    <MemoryRouter initialEntries={['/acme/members/payments']}>
      <Routes>
        <Route path="/:tenantSlug/members/payments" element={<MemberPaymentsContent />} />
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

describe('Recording a payment (M4 Slice 5)', () => {
  beforeEach(() => {
    signInWith('members.view', 'members.payments.view', 'members.payments.record');
    members.get.mockResolvedValue(detail({ payments: [] }));
    pays.options.mockResolvedValue([option('NEW', 'SILVER', '60.00'), option('NEW', 'GOLD', '100.00')]);
  });

  const openDialog = async () => {
    renderMember();
    fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
    return screen.findByRole('dialog').catch(() => screen.getByText('Record a payment').closest('div')!.parentElement!);
  };

  it('FR-MPAY-01 shows the calculated amount for Bronze to Silver, and the dialog has no amount field', async () => {
    await openDialog();
    expect(await screen.findByTestId('payment-amount')).toHaveTextContent('€60.00');
    expect(screen.queryByLabelText(/^amount/i)).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByText('The amount is calculated by the platform and cannot be changed.')).toBeInTheDocument();
  });

  it('FR-MPAY-01 asks the server for the options of the date received, and sends no amount when saving', async () => {
    pays.record.mockResolvedValue(payment());
    await openDialog();
    await screen.findByTestId('payment-amount');
    expect(pays.options).toHaveBeenCalledWith('acme', 'm1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));

    fireEvent.change(screen.getByLabelText('Payment'), { target: { value: 'NEW:GOLD' } });
    expect(screen.getByTestId('payment-amount')).toHaveTextContent('€100.00');
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'BANK_TRANSFER' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Record payment' }).pop()!);

    await waitFor(() => expect(pays.record).toHaveBeenCalledTimes(1));
    const [slug, id, body] = pays.record.mock.calls[0];
    expect([slug, id]).toEqual(['acme', 'm1']);
    expect(body).toMatchObject({ kind: 'NEW', targetTier: 'GOLD', method: 'BANK_TRANSFER' });
    expect(Object.keys(body)).not.toContain('amount');
    expect(Object.keys(body)).not.toContain('listFee');
  });

  it('FR-MPAY-01 a new date asks the server again, since the price and the term depend on it', async () => {
    await openDialog();
    await screen.findByTestId('payment-amount');
    fireEvent.change(screen.getByLabelText('Date received'), { target: { value: '2026-09-15' } });
    await waitFor(() => expect(pays.options).toHaveBeenLastCalledWith('acme', 'm1', '2026-09-15'));
  });

  it('FR-MPAY-03 offers only what the server allows: an upgrade shows the difference, a sponsored Silver employee sees the warning', async () => {
    pays.options.mockResolvedValue([
      option('NEW', 'SILVER', '60.00', { fromTier: 'SILVER', warnings: ['SPONSORED_SILVER_OWN_TERM'] }),
      option('UPGRADE', 'GOLD', '40.00', { fromTier: 'SILVER', listFee: '100.00' }),
    ]);
    await openDialog();
    const choices = within(await screen.findByLabelText('Payment')).getAllByRole('option').map((o) => o.textContent);
    expect(choices).toEqual(['New membership · Silver', 'Upgrade · Gold']);
    expect(screen.getByRole('note')).toHaveTextContent('already has Silver paid by the company');
    fireEvent.change(screen.getByLabelText('Payment'), { target: { value: 'UPGRADE:GOLD' } });
    expect(screen.getByTestId('payment-amount')).toHaveTextContent('€40.00');
  });

  it('FR-FAM-04 a family discount shows next to the list fee', async () => {
    pays.options.mockResolvedValue([option('NEW', 'SILVER', '30.00', { listFee: '60.00', discountPercent: '50.00' })]);
    await openDialog();
    expect(await screen.findByText('Family discount')).toBeInTheDocument();
    expect(screen.getByText('50.00%')).toBeInTheDocument();
    expect(screen.getByText('€60.00')).toBeInTheDocument();
    expect(screen.getByTestId('payment-amount')).toHaveTextContent('€30.00');
  });

  it('FR-MPAY-01 says when nothing can be recorded, and shows the rule the server refused with', async () => {
    pays.options.mockResolvedValue([]);
    await openDialog();
    expect(await screen.findByText('No payment can be recorded for this member on this date.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Record payment' }).pop()).toBeDisabled();
  });

  it('FR-MPAY-04 shows the server refusal of a rule', async () => {
    pays.record.mockRejectedValue({ response: { status: 409, data: { code: 'PAYMENT_REFUSED', reason: 'PAID_TERM_RUNNING' } } });
    await openDialog();
    await screen.findByTestId('payment-amount');
    fireEvent.click(screen.getAllByRole('button', { name: 'Record payment' }).pop()!);
    expect(await screen.findByRole('alert')).toHaveTextContent('already has a paid term');
  });

  it('FR-MPAY-01 a user who cannot record payments has no button, and a suspended member has none either', async () => {
    signInWith('members.view', 'members.payments.view');
    renderMember();
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull();
  });

  it('FR-MPAY-03 a suspended member cannot be given a payment', async () => {
    members.get.mockResolvedValue(detail({ status: 'SUSPENDED', payments: [] }));
    renderMember();
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull();
  });
});

describe('The Payments tab of the member page (M4 Slice 5)', () => {
  const upgrade = payment({ id: 'p2', kind: 'UPGRADE', fromTier: 'SILVER', toTier: 'GOLD', amount: '40.00', listFee: '100.00', receiptNumber: 'RCP-2026-000002', createdAt: '2026-10-05T09:00:00.000Z' });
  const first = payment({ id: 'p1' });

  beforeEach(() => {
    signInWith('members.view', 'members.payments.view', 'members.payments.record');
    members.get.mockResolvedValue(detail({ payments: [upgrade, first] }));
  });

  const openTab = async () => {
    renderMember();
    fireEvent.click(await screen.findByRole('tab', { name: /Payments/ }));
  };

  it('FR-MEM-08, FR-MPAY-05 lists the payments with the receipt number, the amount, the method and who recorded them', async () => {
    await openTab();
    const row = screen.getByText('RCP-2026-000002').closest('tr')!;
    expect(within(row).getByText('€40.00')).toBeInTheDocument();
    expect(within(row).getByText('Upgrade')).toBeInTheDocument();
    expect(within(row).getByText('Cash')).toBeInTheDocument();
    expect(within(row).getByText('Ana Admin')).toBeInTheDocument();
  });

  it('FR-MPAY-06 only the latest payment has a Void button', async () => {
    await openTab();
    expect(screen.getAllByRole('button', { name: 'Void' })).toHaveLength(1);
    const row = screen.getByText('RCP-2026-000002').closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Void' })).toBeInTheDocument();
  });

  it('FR-MPAY-06 a voided payment is marked Voided with its reason and is not the latest', async () => {
    members.get.mockResolvedValue(detail({ payments: [{ ...upgrade, status: 'VOIDED', voidReason: 'Entered twice' }, first] }));
    await openTab();
    const row = screen.getByText('RCP-2026-000002').closest('tr')!;
    expect(within(row).getByText('Voided')).toBeInTheDocument();
    expect(within(row).getByText('Entered twice')).toBeInTheDocument();
    const rows = screen.getAllByRole('button', { name: 'Void' });
    expect(rows).toHaveLength(1);
    expect(within(screen.getByText('RCP-2026-000001').closest('tr')!).getByRole('button', { name: 'Void' })).toBeInTheDocument();
  });

  it('FR-MPAY-06 voiding needs a reason, then reloads the member', async () => {
    pays.void.mockResolvedValue({ ...upgrade, status: 'VOIDED', voidReason: 'Mistake' });
    await openTab();
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));
    fireEvent.click(screen.getByRole('button', { name: 'Void payment' }));
    expect(await screen.findByText('A reason is required to void a payment.')).toBeInTheDocument();
    expect(pays.void).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: ' Mistake ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Void payment' }));
    await waitFor(() => expect(pays.void).toHaveBeenCalledWith('acme', 'p2', 'Mistake'));
    await waitFor(() => expect(members.get).toHaveBeenCalledTimes(2));
  });

  it('FR-MPAY-06 shows why the server refused the void', async () => {
    pays.void.mockRejectedValue({ response: { status: 409, data: { code: 'PAYMENT_NOT_LATEST' } } });
    await openTab();
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Void payment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the latest payment');
  });

  it('FR-MPAY-11 opens the receipt PDF from the payment', async () => {
    pays.receipt.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    await openTab();
    fireEvent.click(screen.getByRole('button', { name: 'Open receipt RCP-2026-000001' }));
    await waitFor(() => expect(pays.receipt).toHaveBeenCalledWith('acme', 'p1', 'en'));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.any(String), { open: true }));
  });

  it('FR-MPAY-08 without payments in the response there is no Payments tab and no money anywhere', async () => {
    signInWith('members.view');
    members.get.mockResolvedValue(detail());
    renderMember();
    await screen.findByRole('heading', { name: 'Ana Hoxha' });
    expect(screen.queryByRole('tab', { name: /Payments/ })).toBeNull();
    expect(screen.queryByText(/€/)).toBeNull();
  });

  it('FR-MPAY-06 a user who may view but not record payments has no Void button', async () => {
    signInWith('members.view', 'members.payments.view');
    await openTab();
    expect(screen.queryByRole('button', { name: 'Void' })).toBeNull();
  });
});

describe('The Membership payments list (M4 Slice 5)', () => {
  beforeEach(() => {
    signInWith('members.payments.view');
    pays.search.mockResolvedValue({
      data: [payment({ id: 'p2', receiptNumber: 'RCP-2026-000002', kind: 'UPGRADE', toTier: 'GOLD', amount: '40.00' }), payment({ id: 'p3', receiptNumber: 'RCP-2026-000003', status: 'VOIDED', voidReason: 'Duplicate', amount: '60.00' })],
      total: 2,
      totalAmount: '40.00',
      page: 1,
      limit: 25,
    });
  });

  it('FR-MPAY-07 shows the rows and the total the server calculated, which leaves out the voided payment', async () => {
    renderPayments();
    expect(await screen.findByText('RCP-2026-000002')).toBeInTheDocument();
    expect(screen.getByTestId('payments-total')).toHaveTextContent('€40.00');
    expect(screen.getByRole('status')).toHaveTextContent('2 payments');
    expect(within(screen.getByText('RCP-2026-000003').closest('tr')!).getByText('Voided')).toBeInTheDocument();
  });

  it('FR-MPAY-07 asks the server to filter by date range, tier, kind, method and status, from page 1', async () => {
    renderPayments();
    await screen.findByText('RCP-2026-000002');
    fireEvent.change(screen.getByLabelText('Received from'), { target: { value: '2027-03-01' } });
    fireEvent.change(screen.getByLabelText('Received to'), { target: { value: '2027-03-31' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'UPGRADE' } });
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: 'GOLD' } });
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'CASH' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'RECORDED' } });
    await waitFor(() =>
      expect(pays.search).toHaveBeenLastCalledWith('acme', expect.objectContaining({ from: '2027-03-01', to: '2027-03-31', kind: 'UPGRADE', tier: 'GOLD', method: 'CASH', status: 'RECORDED', page: 1 }))
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(pays.search).toHaveBeenLastCalledWith('acme', expect.objectContaining({ from: '', kind: '' })));
  });

  it('FR-MPAY-10 exports the filtered rows as CSV from the server', async () => {
    pays.downloadCsv.mockResolvedValue(new Blob(['csv']));
    renderPayments();
    await screen.findByText('RCP-2026-000002');
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'UPGRADE' } });
    await waitFor(() => expect(pays.search).toHaveBeenLastCalledWith('acme', expect.objectContaining({ kind: 'UPGRADE' })));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(pays.downloadCsv).toHaveBeenCalledWith('acme', expect.objectContaining({ kind: 'UPGRADE' })));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^membership-payments-.*\.csv$/)));
  });

  it('FR-MPAY-11 a receipt number opens the receipt', async () => {
    pays.receipt.mockResolvedValue(new Blob(['pdf']));
    renderPayments();
    fireEvent.click(await screen.findByRole('button', { name: 'Open receipt RCP-2026-000002' }));
    await waitFor(() => expect(pays.receipt).toHaveBeenCalledWith('acme', 'p2', 'en'));
  });

  it('FR-MPAY-07 says when nothing matches, and when the list cannot be loaded', async () => {
    pays.search.mockResolvedValueOnce({ data: [], total: 0, totalAmount: '0.00', page: 1, limit: 25 });
    const { unmount } = renderPayments();
    expect(await screen.findByText('No membership payment has been recorded yet.')).toBeInTheDocument();
    unmount();
    pays.search.mockRejectedValueOnce(new Error('boom'));
    renderPayments();
    expect(await screen.findByText('The payments could not be loaded.')).toBeInTheDocument();
  });
});

describe('NFR-I18N-04 the payment strings', () => {
  const read = (lang: string) => JSON.parse(readFileSync(resolve(__dirname, '../../locales', lang, 'members.json'), 'utf8'));
  const keys = (value: unknown, prefix = ''): string[] =>
    typeof value === 'object' && value !== null ? Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k)) : [prefix];

  it('NFR-I18N-04 every payment string exists in Albanian and English, including the refusal reasons', () => {
    const en = keys(read('en').payments);
    expect(en.length).toBeGreaterThan(60);
    expect(keys(read('sq').payments).sort()).toEqual(en.sort());
    for (const reason of ['MEMBER_NOT_ACTIVE', 'TIER_NOT_PURCHASABLE', 'NOT_A_HIGHER_TIER', 'PAID_TERM_RUNNING', 'NOTHING_TO_RENEW', 'NOTHING_TO_UPGRADE', 'USE_UPGRADE']) {
      expect(read('sq').payments.drawer.refused[reason]).toBeTruthy();
    }
    const common = (lang: string) => JSON.parse(readFileSync(resolve(__dirname, '../../locales', lang, 'common.json'), 'utf8')).nav;
    expect(common('sq').membershipPayments).toBeTruthy();
    expect(common('en').membershipPayments).toBe('Membership payments');
  });
});

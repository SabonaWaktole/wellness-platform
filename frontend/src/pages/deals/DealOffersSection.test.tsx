import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DealOffersSection } from './DealOffersSection';
import { dealService } from '../../services/dealService';
import { offerService } from '../../services/offerService';
import { downloadBlob } from '../../utils/downloadBlob';
import { ToastProvider } from '../../components/ui/Toast';
import { useAuthStore } from '../../store/useAuthStore';
import type { DealDetail } from '../../types/deal';
import type { OfferView } from '../../types/offer';

vi.mock('../../services/dealService', () => ({ dealService: { offers: vi.fn() } }));
vi.mock('../../services/offerService', () => ({
  offerService: { pdf: vi.fn(), markReady: vi.fn(), markSent: vi.fn(), markAccepted: vi.fn(), markRejected: vi.fn(), revise: vi.fn() },
}));
vi.mock('../../utils/downloadBlob', () => ({ downloadBlob: vi.fn() }));

const deal = { id: 'd1', clientId: 'c1', stage: 'OFFER_PREPARED' } as DealDetail;

const offer = (overrides: Partial<OfferView> = {}): OfferView => ({
  id: 'o1',
  dealId: 'd1',
  clientId: 'c1',
  status: 'DRAFT',
  number: 'OF-2026-0007',
  version: 1,
  reference: 'OF-2026-0007',
  previousVersionId: null,
  superseded: false,
  readyAt: null,
  sentAt: null,
  validUntil: null,
  respondedAt: null,
  statusNote: null,
  contactPersonId: null,
  companyName: 'Kafe Blloku',
  dealTitle: null,
  dealOwnerUserId: 'u-a',
  dealOwnerName: 'Besa Test',
  dealOpen: true,
  permittedActions: ['EDIT', 'MARK_READY'],
  language: 'sq',
  note: 'Pagesa çdo tremujor',
  createdByUserId: 'u-a',
  createdByName: 'Besa Test',
  createdAt: '2026-10-03T08:00:00Z',
  updatedAt: '2026-10-03T09:00:00Z',
  employeesPriced: 2,
  packageId: 'pkg',
  frequencyId: 'f2',
  zoneId: 'z1',
  pricingInputs: { employees: 2, package: { id: 'pkg', nameSq: 'Standart', nameEn: 'Standard' } },
  priceOnRequest: null,
  services: [],
  listPrice: '49.40',
  discountPercent: '10.00',
  discountAmount: '4.94',
  netMonthlyPrice: '44.46',
  annualValue: '533.52',
  ...overrides,
});

const signIn = (permissions: Record<string, string | boolean>) =>
  useAuthStore.setState({
    user: {
      userId: 'u-a', email: 'a@example.com', role: 'STAFF', tenantId: 't1', tenantSlug: 'acme',
      tenantCurrency: 'EUR', tenantLocale: 'en-US', tenantTimezone: 'Europe/Tirane', permissions,
    },
    isAuthenticated: true,
  } as any);

const renderSection = (d: DealDetail = deal) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/acme/deals/d1']}>
        <Routes>
          <Route path="/:tenantSlug/deals/:dealId" element={<DealOffersSection deal={d} />} />
          <Route path="/:tenantSlug/deals/:dealId/pricing" element={<p>pricing screen</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );

describe('Deal offers section (FR-DEAL-03, M2 Slice 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signIn({ 'deals.view': 'OWN', 'commercial.view': 'OWN', 'offers.edit': 'OWN' });
  });

  it('FR-DEAL-03 lists the deal\'s draft offer with its net monthly price, discount and package', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer()]);
    renderSection();
    expect(await screen.findByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('€44.46 / month')).toBeInTheDocument();
    expect(screen.getByText(/€49\.40.*10\.00%/)).toBeInTheDocument();
    expect(screen.getByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('Pagesa çdo tremujor')).toBeInTheDocument();
    expect(dealService.offers).toHaveBeenCalledWith('acme', 'd1');
  });

  it('FR-PRC-07 a draft without a price shows "Price on request"', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer({ priceOnRequest: 'NO_BAND', listPrice: null, netMonthlyPrice: null })]);
    renderSection();
    expect(await screen.findByText('Price on request')).toBeInTheDocument();
  });

  it('FR-PRC-01 the offer is edited on the pricing screen, opened from the deal', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer()]);
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit offer' }));
    expect(await screen.findByText('pricing screen')).toBeInTheDocument();
  });

  it('FR-PRC-01 with no offer yet, "Calculate price" opens the pricing screen', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([]);
    renderSection();
    expect(await screen.findByText('No offer yet. Calculate a price to prepare one.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Calculate price' }));
    expect(await screen.findByText('pricing screen')).toBeInTheDocument();
  });

  it('a closed deal offers no pricing action', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer({ dealOpen: false, permittedActions: [] })]);
    renderSection({ ...deal, stage: 'LOST' });
    await screen.findByText('Draft');
    expect(screen.queryByRole('button', { name: 'Edit offer' })).not.toBeInTheDocument();
  });

  it('FR-RBAC-17 without commercial.view the offers are not requested', () => {
    signIn({ 'deals.view': 'OWN' });
    renderSection();
    expect(screen.getByText('Offer figures are not shown for your role.')).toBeInTheDocument();
    expect(dealService.offers).not.toHaveBeenCalled();
  });
});

describe('Offer document on the deal page (M2 Slice 9)', () => {
  const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });

  beforeEach(() => {
    vi.clearAllMocks();
    signIn({ 'deals.view': 'OWN', 'commercial.view': 'OWN', 'offers.edit': 'OWN' });
    vi.mocked(offerService.pdf).mockResolvedValue({ blob: pdf, fileName: 'Oferta_kafe-blloku_OF-2026-0007.pdf' });
    URL.createObjectURL = vi.fn(() => 'blob:offer');
    URL.revokeObjectURL = vi.fn();
  });

  it('FR-OFR-08 FR-OFR-11 each offer shows its reference, and an earlier version says it is replaced', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([
      offer({ id: 'o2', version: 2, reference: 'OF-2026-0007 v2', previousVersionId: 'o1' }),
      offer({ status: 'SENT', superseded: true, permittedActions: [] }),
    ]);
    renderSection();
    expect(await screen.findByText('OF-2026-0007 v2')).toBeInTheDocument();
    const old = screen.getByTestId('offer-o1');
    expect(within(old).getByText('Replaced by a later version')).toBeInTheDocument();
    expect(within(old).queryByRole('button', { name: 'Mark accepted' })).not.toBeInTheDocument();
  });

  it('FR-OFR-05 Preview shows the PDF itself, served inline', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer()]);
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }));
    const frame = await screen.findByTitle('Offer OF-2026-0007');
    expect(frame).toHaveAttribute('src', 'blob:offer');
    expect(offerService.pdf).toHaveBeenCalledWith('acme', 'o1', 'sq', 'inline');
  });

  it('FR-OFR-06 Download is in Albanian by default, in English when chosen, under the server\'s file name', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer()]);
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(pdf, 'Oferta_kafe-blloku_OF-2026-0007.pdf'));
    expect(offerService.pdf).toHaveBeenLastCalledWith('acme', 'o1', 'sq', 'attachment');

    fireEvent.change(screen.getByLabelText('PDF language'), { target: { value: 'en' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() => expect(offerService.pdf).toHaveBeenLastCalledWith('acme', 'o1', 'en', 'attachment'));
  });

  it('FR-OFR-07 there is no "Send by email": the offer is emailed by hand and marked as sent', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer({ status: 'READY', permittedActions: ['EDIT', 'MARK_SENT'] })]);
    renderSection();
    expect(await screen.findByRole('button', { name: 'Mark as sent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /email/i })).not.toBeInTheDocument();
  });

  it('FR-OFR-09 a draft is marked ready from the deal', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer()]);
    vi.mocked(offerService.markReady).mockResolvedValue(offer({ status: 'READY' }));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark ready' }));
    await waitFor(() => expect(offerService.markReady).toHaveBeenCalledWith('acme', 'o1'));
    await waitFor(() => expect(dealService.offers).toHaveBeenCalledTimes(2));
  });

  it('FR-OFR-10 Mark as sent posts the date chosen, today by default', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer({ status: 'READY', permittedActions: ['EDIT', 'MARK_SENT'] })]);
    vi.mocked(offerService.markSent).mockResolvedValue(offer({ status: 'SENT' }));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as sent' }));
    const date = (await screen.findByLabelText(/Date sent/)) as HTMLInputElement;
    expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.change(date, { target: { value: '2026-01-15' } });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as sent' }));
    await waitFor(() => expect(offerService.markSent).toHaveBeenCalledWith('acme', 'o1', '2026-01-15'));
  });

  it('FR-OFR-12 a sent offer shows its validity and is marked rejected with a note', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([
      offer({ status: 'SENT', sentAt: '2026-10-05T12:00:00.000Z', validUntil: '2026-11-04', permittedActions: ['MARK_ACCEPTED', 'MARK_REJECTED', 'REVISE'] }),
    ]);
    vi.mocked(offerService.markRejected).mockResolvedValue(offer({ status: 'REJECTED' }));
    renderSection();
    expect(await screen.findByText(/valid until/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark rejected' }));
    fireEvent.change(await screen.findByLabelText('Note (optional)'), { target: { value: 'Too expensive' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark rejected' }));
    await waitFor(() => expect(offerService.markRejected).toHaveBeenCalledWith('acme', 'o1', 'Too expensive'));
  });

  it('FR-OFR-11 Revise makes the next version and opens it on the pricing screen', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer({ status: 'SENT', permittedActions: ['MARK_ACCEPTED', 'MARK_REJECTED', 'REVISE'] })]);
    vi.mocked(offerService.revise).mockResolvedValue(offer({ id: 'o2', version: 2, reference: 'OF-2026-0007 v2' }));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Revise' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revise' }));
    expect(await screen.findByText('pricing screen')).toBeInTheDocument();
    expect(offerService.revise).toHaveBeenCalledWith('acme', 'o1');
  });

  it('FR-OFR-11 with a sent offer in progress, "Calculate price" is not offered: it is revised instead', async () => {
    vi.mocked(dealService.offers).mockResolvedValue([offer({ status: 'SENT', permittedActions: ['MARK_ACCEPTED', 'MARK_REJECTED', 'REVISE'] })]);
    renderSection();
    await screen.findByRole('button', { name: 'Revise' });
    expect(screen.queryByRole('button', { name: 'Calculate price' })).not.toBeInTheDocument();
  });
});

import { RespondToPublicQuotationUseCase } from './RespondToPublicQuotationUseCase';
import { IPublicQuotationReader, PublicQuotationView } from '../GetPublicQuotationUseCase';
import { MarkQuotationAcceptedUseCase } from './MarkQuotationAcceptedUseCase';
import { MarkQuotationRejectedUseCase } from './MarkQuotationRejectedUseCase';

const view = (status: string): PublicQuotationView => ({
  quotationId: 'q1',
  tenantId: 'tenant-1',
  reference: 'ABC12345',
  status,
  issuedAt: new Date('2026-07-01T00:00:00.000Z'),
  sentAt: new Date('2026-07-02T00:00:00.000Z'),
  respondedAt: null,
  clientName: 'Acme Ltd',
  clientEmail: 'buyer@acme.example',
  companyName: 'Wiztik',
  companyLogoUrl: null,
  companyAddress: null,
  companyContactEmail: null,
  companyContactPhone: null,
  currency: 'EUR',
  locale: 'en-GB',
  dateFormat: 'DD/MM/YYYY',
  lines: [{ description: 'Widget', quantity: 2, unitPrice: 10, lineTotal: 20 }],
  subtotal: 20,
});

describe('RespondToPublicQuotationUseCase', () => {
  let reader: jest.Mocked<IPublicQuotationReader>;
  let acceptUseCase: jest.Mocked<Pick<MarkQuotationAcceptedUseCase, 'execute'>>;
  let rejectUseCase: jest.Mocked<Pick<MarkQuotationRejectedUseCase, 'execute'>>;
  let useCase: RespondToPublicQuotationUseCase;

  beforeEach(() => {
    reader = { findByShareToken: jest.fn() };
    acceptUseCase = { execute: jest.fn() };
    rejectUseCase = { execute: jest.fn() };
    useCase = new RespondToPublicQuotationUseCase(
      reader,
      acceptUseCase as unknown as MarkQuotationAcceptedUseCase,
      rejectUseCase as unknown as MarkQuotationRejectedUseCase
    );
  });

  it('accepts a sent quotation as the client (no actingUserId)', async () => {
    reader.findByShareToken.mockResolvedValue(view('SENT'));
    acceptUseCase.execute.mockResolvedValue({ quotation: {} as any });

    const result = await useCase.execute({ token: 'tok', decision: 'accept' });

    expect(result).toEqual({ outcome: 'ok' });
    expect(acceptUseCase.execute).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      quotationId: 'q1',
      actingUserId: null,
      access: null,
    });
  });

  it('rejects a sent quotation and passes the re-quote note through', async () => {
    reader.findByShareToken.mockResolvedValue(view('SENT'));
    rejectUseCase.execute.mockResolvedValue({ quotation: {} as any });

    const result = await useCase.execute({ token: 'tok', decision: 'reject', note: 'Please lower the price' });

    expect(result).toEqual({ outcome: 'ok' });
    expect(rejectUseCase.execute).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      quotationId: 'q1',
      actingUserId: null,
      access: null,
      note: 'Please lower the price',
    });
  });

  it('returns not_found for an unknown token', async () => {
    reader.findByShareToken.mockResolvedValue(null);

    const result = await useCase.execute({ token: 'nope', decision: 'accept' });

    expect(result).toEqual({ outcome: 'not_found' });
    expect(acceptUseCase.execute).not.toHaveBeenCalled();
  });

  it('never queries on a blank token', async () => {
    const result = await useCase.execute({ token: '   ', decision: 'accept' });

    expect(result).toEqual({ outcome: 'not_found' });
    expect(reader.findByShareToken).not.toHaveBeenCalled();
  });

  it('returns invalid_state when the quotation has already been responded to', async () => {
    reader.findByShareToken.mockResolvedValue(view('ACCEPTED'));
    acceptUseCase.execute.mockRejectedValue(new Error('Invalid state transition from ACCEPTED to Accepted'));

    const result = await useCase.execute({ token: 'tok', decision: 'accept' });

    expect(result).toEqual({ outcome: 'invalid_state' });
  });

  it('returns failed — not invalid_state — when Accept is refused for insufficient stock', async () => {
    // Regression: this used to fall into the same bare `catch` as an
    // already-responded race, so the client got back the unchanged, still-Sent
    // quotation with no explanation — Confirm silently appeared to do nothing.
    reader.findByShareToken.mockResolvedValue(view('SENT'));
    acceptUseCase.execute.mockRejectedValue(
      new Error('Insufficient stock for product p1 at warehouse w1')
    );

    const result = await useCase.execute({ token: 'tok', decision: 'accept' });

    expect(result.outcome).toBe('failed');
    expect((result as any).message).not.toContain('p1');
    expect((result as any).message).not.toContain('w1');
    expect((result as any).message).toMatch(/no longer available|out of stock/i);
  });

  it('returns failed with a generic message for an unrecognised error', async () => {
    reader.findByShareToken.mockResolvedValue(view('SENT'));
    rejectUseCase.execute.mockRejectedValue(new Error('boom'));

    const result = await useCase.execute({ token: 'tok', decision: 'reject' });

    expect(result).toEqual({
      outcome: 'failed',
      message: 'Something went wrong on our end. Please try again, or contact the sender if the problem continues.',
    });
  });
});

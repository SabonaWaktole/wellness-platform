import {
  GetPublicQuotationUseCase,
  IPublicQuotationReader,
  PublicQuotationView,
} from './GetPublicQuotationUseCase';

const view = (status: string): PublicQuotationView => ({
  quotationId: 'quotation-1',
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

describe('GetPublicQuotationUseCase', () => {
  let reader: jest.Mocked<IPublicQuotationReader>;

  beforeEach(() => {
    reader = { findByShareToken: jest.fn() };
  });

  const build = () => new GetPublicQuotationUseCase(reader);

  it('returns a sent quotation', async () => {
    reader.findByShareToken.mockResolvedValue(view('SENT'));

    await expect(build().execute('tok')).resolves.not.toBeNull();
  });

  it.each(['ACCEPTED', 'REJECTED', 'EXPIRED'])(
    'keeps serving a %s quotation the customer has already seen',
    async (status) => {
      reader.findByShareToken.mockResolvedValue(view(status));

      await expect(build().execute('tok')).resolves.not.toBeNull();
    }
  );

  it.each(['DRAFT', 'PENDING_APPROVAL'])(
    'refuses a %s quotation even with a valid token',
    async (status) => {
      // A quotation returned to Draft keeps its token so the customer's
      // original link survives being sent again — but internal pricing must
      // not be readable in the meantime.
      reader.findByShareToken.mockResolvedValue(view(status));

      await expect(build().execute('tok')).resolves.toBeNull();
    }
  );

  it('returns null for an unknown token', async () => {
    reader.findByShareToken.mockResolvedValue(null);

    await expect(build().execute('nope')).resolves.toBeNull();
  });

  it.each(['', '   '])('never queries on a blank token (%p)', async (token) => {
    // A blank token reaching the repository would match a row with a NULL
    // shareToken and hand out an arbitrary unsent quotation.
    await expect(build().execute(token)).resolves.toBeNull();
    expect(reader.findByShareToken).not.toHaveBeenCalled();
  });
});

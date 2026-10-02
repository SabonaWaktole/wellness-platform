import { IEmailSender } from '../../auth/application/ports/IEmailSender';
import { IPublicQuotationReader, PublicQuotationView } from './GetPublicQuotationUseCase';
import { QuotationDeliveryService } from './QuotationDeliveryService';

const view = (overrides: Partial<PublicQuotationView> = {}): PublicQuotationView => ({
  quotationId: 'q1',
  tenantId: 't1',
  reference: 'OF-2026-0001',
  status: 'SENT',
  issuedAt: new Date('2026-07-01T00:00:00.000Z'),
  sentAt: new Date('2026-07-02T00:00:00.000Z'),
  respondedAt: null,
  clientName: 'Acme Ltd',
  clientEmail: 'buyer@acme.example',
  companyName: 'Wellness Albania',
  companyLogoUrl: null,
  companyAddress: null,
  companyContactEmail: null,
  companyContactPhone: null,
  currency: 'EUR',
  locale: 'sq-AL',
  dateFormat: 'DD.MM.YYYY',
  lines: [],
  subtotal: 0,
  ...overrides,
});

describe('QuotationDeliveryService', () => {
  const setup = (found: PublicQuotationView) => {
    const reader: jest.Mocked<IPublicQuotationReader> = { findByShareToken: jest.fn().mockResolvedValue(found) };
    const emailSender = { sendTransactionalEmail: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<IEmailSender>;
    return { emailSender, service: new QuotationDeliveryService(reader, emailSender, 'https://app.example') };
  };

  it('emails the customer the link to a sent quotation, with its reference', async () => {
    const { emailSender, service } = setup(view());
    await service.deliverToClient('token-1');
    expect(emailSender.sendTransactionalEmail).toHaveBeenCalledWith('buyer@acme.example', expect.stringContaining('OF-2026-0001'), expect.any(String));
  });

  it('FR-OFR-07 FR-RBAC-18 never emails a quotation from a workspace on the sales process', async () => {
    const { emailSender, service } = setup(view({ salesProcess: true }));
    await service.deliverToClient('token-1');
    expect(emailSender.sendTransactionalEmail).not.toHaveBeenCalled();
  });
});

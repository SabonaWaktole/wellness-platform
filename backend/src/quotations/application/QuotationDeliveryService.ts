import { IEmailSender } from '../../auth/application/ports/IEmailSender';
import { IPublicQuotationReader } from './GetPublicQuotationUseCase';
import { renderEmailLayout, escapeHtml } from '../../shared/email/emailLayout';

export interface IQuotationDeliveryService {
  /** Best-effort. Never throws: a send failure must not undo a sent quotation. */
  deliverToClient(shareToken: string | null): Promise<void>;
}

/**
 * Sends the quotation to the person it is for (§6.5, "Send Quotation").
 *
 * This is the piece that made "Sent" mean something. The status, the timestamp
 * and the internal notification all existed already; what did not exist was
 * anything leaving the building, so a quotation marked Sent had been sent to
 * nobody.
 *
 * The email carries a link, not the document. A PDF attachment would have to be
 * rendered on the send path (slowing a user-facing action for a file most
 * recipients open once), would age the moment anything changed, and would put
 * pricing in an inbox with no way to withdraw it. The link renders current
 * state and offers the PDF one click further on.
 */
export class QuotationDeliveryService implements IQuotationDeliveryService {
  constructor(
    private readonly reader: IPublicQuotationReader,
    private readonly emailSender: IEmailSender,
    private readonly appUrl: string
  ) {}

  async deliverToClient(shareToken: string | null): Promise<void> {
    if (!shareToken) return;

    try {
      const view = await this.reader.findByShareToken(shareToken);
      if (!view) return;

      /*
       * A client with no email address is an ordinary state, not an error: the
       * SRS makes contact details optional. In that case the quotation is
       * delivered by the staff member copying the link, which the detail page
       * offers for exactly this reason.
       */
      if (!view.clientEmail) return;

      const url = `${this.appUrl}/q/${shareToken}`;
      const bodyHtml = `
        <p><strong>${escapeHtml(view.companyName)}</strong> has sent you a quotation.</p>
        <p>You can view it, and download it as a PDF, using the link below.</p>
      `;
      const html = renderEmailLayout({
        preheader: `${view.companyName} sent you quotation ${view.reference}`,
        eyebrow: 'Quotation',
        heading: `Quotation ${escapeHtml(view.reference)}`,
        bodyHtml,
        cta: { label: 'View quotation', url },
        footerNote: 'This link is private — please do not forward it.',
      });

      await this.emailSender.sendTransactionalEmail(
        view.clientEmail,
        `Quotation ${view.reference} from ${view.companyName}`,
        html
      );
    } catch (error) {
      // The quotation IS sent — status, history and timestamp are already
      // committed. A mail failure means the staff member needs to share the
      // link manually, not that the transition should be undone.
      console.error('Failed to deliver quotation to client', error);
    }
  }
}

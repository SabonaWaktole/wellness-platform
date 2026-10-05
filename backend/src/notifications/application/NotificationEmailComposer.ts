import { NotificationType, NotificationParams } from '../domain/NotificationType';
import { renderEmailLayout, escapeHtml as esc } from '../../shared/email/emailLayout';
import { PRODUCT_NAME } from '../../shared/email/brand';

export interface ComposedEmail {
  subject: string;
  html: string;
}

/**
 * Turns a notification type and its params into an email.
 *
 * **On language.** The in-app notification stores an i18n key and renders in
 * whatever language the reader currently prefers (see NotificationType). Email
 * cannot do that — it is rendered once, at send time, and frozen in the
 * recipient's inbox. The dispatcher passes the recipient's language (their
 * own, else the workspace default). The discount-approval emails (M2 Slice
 * 10) have an Albanian and an English catalogue in `discountLines`; every
 * other type is still English only. The wording deliberately lives here
 * rather than in the frontend catalogues so that nobody mistakes the two for
 * the same text.
 *
 * **On content.** Bodies name the entity and link to it. They deliberately do
 * NOT restate figures — a quotation total in an inbox is a copy of business
 * data sitting outside the system's access control, and the link is one click
 * away from the authoritative version.
 */
export class NotificationEmailComposer {
  constructor(private readonly appUrl: string) {}

  compose(input: {
    type: NotificationType;
    params: NotificationParams;
    tenantName: string;
    tenantSlug: string;
    entityType: string | null;
    entityId: string | null;
    /** The recipient's language, 'sq' or 'en'; the discount-approval and follow-up emails follow it. */
    language?: string | null;
  }): ComposedEmail {
    const recipientLanguage = input.language === 'sq' ? 'sq' : 'en';
    const localised =
      this.discountLines(input.type, input.params, recipientLanguage) ?? this.followUpLines(input.type, input.params, recipientLanguage);
    const language = localised?.language ?? 'en';
    const { subject, body } = localised ?? this.lines(input.type, input.params);
    const link = this.deepLink(input.tenantSlug, input.type, input.entityType, input.entityId, input.params);

    return {
      subject: `${subject} — ${input.tenantName}`,
      html: this.wrap(subject, body, link, input.tenantName, input.entityType, language),
    };
  }

  /**
   * The discount-approval emails (FR-DSC-05, 07, 12, FR-PRC-09), in the
   * recipient's language. They name the salesperson, the company, the offer
   * and the percent; the list price and the reason stay behind the link, as
   * for every other email (see "On content" above). Null for other types.
   */
  private discountLines(
    type: NotificationType,
    p: NotificationParams,
    language: 'sq' | 'en'
  ): { subject: string; body: string; language: 'sq' | 'en' } | null {
    const ref = String(p.reference ?? '');
    const client = esc(String(p.clientName ?? ''));
    const who = esc(String(p.salespersonName ?? ''));
    const manual = p.kind === 'MANUAL_PRICE';
    const percent = esc(String(p.requestedPercent ?? p.approvedPercent ?? ''));
    const r = `<strong>${esc(ref)}</strong>`;
    const sq = language === 'sq';
    let lines: { subject: string; body: string };
    switch (type) {
      case 'DISCOUNT_APPROVAL_REQUESTED':
        lines = manual
          ? sq
            ? {
                subject: `Një çmim manual për ${ref} pret miratimin tuaj`,
                body: `${who} propozoi një çmim manual për ${r} (<strong>${client}</strong>), që ka "Çmimi sipas kërkesës". Një vendim është në pritje.`,
              }
            : {
                subject: `A manual price on ${ref} needs your approval`,
                body: `${who} proposed a manual price on ${r} for <strong>${client}</strong>, which has "Price on request". A decision is waiting.`,
              }
          : sq
            ? {
                subject: `Zbritja ${percent}% për ${ref} pret miratimin tuaj`,
                body: `${who} kërkoi një zbritje prej <strong>${percent}%</strong> për ${r} (<strong>${client}</strong>), mbi kufirin e lejuar. Një vendim është në pritje.`,
              }
            : {
                subject: `Discount ${percent}% on ${ref} needs your approval`,
                body: `${who} asked for a <strong>${percent}%</strong> discount on ${r} for <strong>${client}</strong>, which is above the cap. A decision is waiting.`,
              };
        break;
      case 'DISCOUNT_APPROVED':
        lines = manual
          ? sq
            ? { subject: `Çmimi manual për ${ref} u miratua`, body: `Çmimi manual për ${r} u miratua. Oferta është gati për shkarkim.` }
            : { subject: `The manual price on ${ref} was approved`, body: `The manual price on ${r} was approved. The offer is ready to download.` }
          : sq
            ? {
                subject: `Zbritja ${percent}% për ${ref} u miratua`,
                body: `Zbritja prej <strong>${percent}%</strong> për ${r} u miratua. Oferta është gati për shkarkim.`,
              }
            : {
                subject: `Discount ${percent}% on ${ref} was approved`,
                body: `The <strong>${percent}%</strong> discount on ${r} was approved. The offer is ready to download.`,
              };
        break;
      case 'DISCOUNT_REJECTED':
        lines = manual
          ? sq
            ? {
                subject: `Çmimi manual për ${ref} u refuzua`,
                body: `Çmimi manual për ${r} u refuzua. Oferta u kthye në draft me "Çmimi sipas kërkesës".`,
              }
            : {
                subject: `The manual price on ${ref} was rejected`,
                body: `The manual price on ${r} was rejected. The offer is back to draft with "Price on request".`,
              }
          : sq
            ? {
                subject: `Zbritja për ${ref} u refuzua`,
                body: `Zbritja mbi kufirin për ${r} u refuzua. Oferta u kthye në draft me zbritjen në kufi.`,
              }
            : {
                subject: `Discount on ${ref} was rejected`,
                body: `The discount above the cap on ${r} was rejected. The offer is back to draft at the cap.`,
              };
        break;
      case 'DISCOUNT_APPROVAL_REMINDER':
        lines = manual
          ? sq
            ? {
                subject: `Kujtesë: çmimi manual për ${ref} ende pret`,
                body: `Çmimi manual i propozuar nga ${who} për ${r} (<strong>${client}</strong>) ende pret një vendim.`,
              }
            : {
                subject: `Reminder: the manual price on ${ref} still waits`,
                body: `The manual price ${who} proposed on ${r} for <strong>${client}</strong> is still waiting for a decision.`,
              }
          : sq
            ? {
                subject: `Kujtesë: zbritja ${percent}% për ${ref} ende pret`,
                body: `Kërkesa e ${who} për një zbritje prej <strong>${percent}%</strong> për ${r} (<strong>${client}</strong>) ende pret një vendim.`,
              }
            : {
                subject: `Reminder: discount ${percent}% on ${ref} still waits`,
                body: `The <strong>${percent}%</strong> discount ${who} asked for on ${r} for <strong>${client}</strong> is still waiting for a decision.`,
              };
        break;
      default:
        return null;
    }
    return { ...lines, language };
  }

  /**
   * The follow-up emails (FR-FUP-02, 09, 10), in the recipient's language.
   * They name the company and leave the time behind the link: the email is
   * composed without the workspace's time zone, and a time in the wrong zone
   * is worse than none. Null for other types.
   */
  private followUpLines(
    type: NotificationType,
    p: NotificationParams,
    language: 'sq' | 'en'
  ): { subject: string; body: string; language: 'sq' | 'en' } | null {
    const client = String(p.clientName ?? '');
    const sq = language === 'sq';
    let lines: { subject: string; body: string };
    switch (type) {
      case 'FOLLOW_UP_ASSIGNED':
        lines = sq
          ? { subject: `Ju u caktua një ndjekje me ${client}`, body: `Ju u caktua një ndjekje me <strong>${esc(client)}</strong>. E gjeni te "Ndjekjet e mia".` }
          : { subject: `A follow-up with ${client} was given to you`, body: `A follow-up with <strong>${esc(client)}</strong> was given to you. It is in "My follow-ups".` };
        break;
      case 'FOLLOW_UP_DUE':
        lines = sq
          ? { subject: `Ndjekja me ${client} është për tani`, body: `Ndjekja juaj me <strong>${esc(client)}</strong> ka ardhur në kohë.` }
          : { subject: `Your follow-up with ${client} is due`, body: `Your follow-up with <strong>${esc(client)}</strong> is due now.` };
        break;
      case 'FOLLOW_UP_DAILY_SUMMARY': {
        const today = Number(p.today ?? 0);
        const overdue = Number(p.overdue ?? 0);
        lines = sq
          ? {
              subject: `Ndjekjet e sotme: ${today}`,
              body: `Sot keni <strong>${today}</strong> ndjekje${overdue > 0 ? ` dhe <strong>${overdue}</strong> të vonuara nga ditët e kaluara` : ''}.`,
            }
          : {
              subject: `Today's follow-ups: ${today}`,
              body: `You have <strong>${today}</strong> follow-up${today === 1 ? '' : 's'} today${overdue > 0 ? `, and <strong>${overdue}</strong> overdue from earlier days` : ''}.`,
            };
        break;
      }
      default:
        return null;
    }
    return { ...lines, language };
  }

  private lines(
    type: NotificationType,
    p: NotificationParams
  ): { subject: string; body: string } {
    const ref = String(p.reference ?? '');
    const client = String(p.clientName ?? 'a client');
    const when = String(p.scheduledAt ?? '');

    switch (type) {
      case 'DISCOUNT_APPROVAL_REQUESTED':
      case 'DISCOUNT_APPROVED':
      case 'DISCOUNT_REJECTED':
      case 'DISCOUNT_APPROVAL_REMINDER':
        return this.discountLines(type, p, 'en')!;
      case 'QUOTATION_SUBMITTED_FOR_APPROVAL':
        return {
          subject: `Quotation ${ref} needs your approval`,
          body: `Quotation <strong>${esc(ref)}</strong> has been submitted and is waiting for approval before it can be sent.`,
        };
      case 'QUOTATION_APPROVED':
        return {
          subject: `Quotation ${ref} was approved`,
          body: `Quotation <strong>${esc(ref)}</strong> has been approved and sent to the client.`,
        };
      case 'QUOTATION_RETURNED_TO_DRAFT':
        return {
          subject: `Quotation ${ref} was returned to draft`,
          body: `Quotation <strong>${esc(ref)}</strong> was returned to draft and needs changes before it can go out again.`,
        };
      case 'QUOTATION_ACCEPTED':
        return {
          subject: `Quotation ${ref} was accepted`,
          body: `<strong>${esc(client)}</strong> accepted quotation <strong>${esc(ref)}</strong>. Stock has been deducted for the items on it.`,
        };
      case 'QUOTATION_REJECTED':
        return {
          subject: `Quotation ${ref} was rejected`,
          body: `<strong>${esc(client)}</strong> rejected quotation <strong>${esc(ref)}</strong>.`,
        };
      case 'QUOTATION_EXPIRED':
        return {
          subject: `Quotation ${ref} expired`,
          body: `Quotation <strong>${esc(ref)}</strong> expired without a response.`,
        };
      case 'QUOTATION_FOLLOW_UP':
        return {
          subject: `Quotation ${ref} is still unanswered`,
          body: `Quotation <strong>${esc(ref)}</strong> was sent to <strong>${esc(client)}</strong> ${esc(String(p.daysWaiting ?? ''))} days ago and has had no response.`,
        };
      case 'APPOINTMENT_ASSIGNED':
        return {
          subject: `New appointment with ${client}`,
          body: `You have been assigned an appointment with <strong>${esc(client)}</strong>${when ? ` on <strong>${esc(when)}</strong>` : ''}.`,
        };
      case 'APPOINTMENT_RESCHEDULED':
        return {
          subject: `Appointment with ${client} was moved`,
          body: `Your appointment with <strong>${esc(client)}</strong> has been moved${when ? ` to <strong>${esc(when)}</strong>` : ''}.`,
        };
      case 'APPOINTMENT_CANCELLED':
        return {
          subject: `Appointment with ${client} was cancelled`,
          body: `Your appointment with <strong>${esc(client)}</strong>${when ? ` on <strong>${esc(when)}</strong>` : ''} has been cancelled.`,
        };
      case 'APPOINTMENT_REMINDER':
        return {
          subject: `Reminder: appointment with ${client}`,
          body: `This is a reminder that you have an appointment with <strong>${esc(client)}</strong>${when ? ` on <strong>${esc(when)}</strong>` : ''}.`,
        };
      case 'CLIENT_ASSIGNED':
        return {
          subject: `${client} was assigned to you`,
          body: `<strong>${esc(client)}</strong> is now assigned to you.`,
        };
      case 'FORM_SUBMITTED':
        return {
          subject: `New submission for "${String(p.form ?? 'your form')}"`,
          body: `Someone submitted <strong>${esc(String(p.form ?? 'your form'))}</strong>.`,
        };
      case 'CONTRACT_EXPIRING':
        return {
          subject: `${client}'s contract expires in ${String(p.daysRemaining ?? '')} days`,
          body: `The <strong>${esc(String(p.planName ?? 'subscription'))}</strong> contract for <strong>${esc(client)}</strong> ends on <strong>${esc(String(p.endsAt ?? ''))}</strong>. Renew it before then to keep the subscription running.`,
        };
      case 'CONTRACT_EXPIRED':
        return {
          subject: `${client}'s contract has expired`,
          body: `The <strong>${esc(String(p.planName ?? 'subscription'))}</strong> contract for <strong>${esc(client)}</strong> reached its end date and is now marked expired.`,
        };
      case 'CONTRACT_SUSPENDED':
      case 'CONTRACT_CANCELLED': {
        const word = type === 'CONTRACT_SUSPENDED' ? 'suspended' : 'cancelled';
        const reason = String(p.reason ?? '');
        return {
          subject: `${client}'s contract was ${word}`,
          body: `The <strong>${esc(String(p.planName ?? 'subscription'))}</strong> contract for <strong>${esc(client)}</strong> was ${word}.${reason ? ` Reason: ${esc(reason)}` : ''}`,
        };
      }
      case 'FOLLOW_UP_ASSIGNED':
      case 'FOLLOW_UP_DUE':
      case 'FOLLOW_UP_DAILY_SUMMARY':
        return this.followUpLines(type, p, 'en')!;
      case 'INVITATION_ACCEPTED':
        return {
          subject: `${String(p.memberName ?? 'A new member')} joined the workspace`,
          body: `<strong>${esc(String(p.memberName ?? 'A new member'))}</strong> accepted their invitation and now has access to the workspace.`,
        };
      default: {
        /*
         * Exhaustiveness check. Adding a NotificationType without adding a
         * case here is a compile error, not an email that silently reads
         * "Notification" — which is the failure mode this catches.
         */
        const unreachable: never = type;
        throw new Error(`No email copy for notification type: ${String(unreachable)}`);
      }
    }
  }

  private deepLink(
    tenantSlug: string,
    type: NotificationType,
    entityType: string | null,
    entityId: string | null,
    params: NotificationParams = {}
  ): string | null {
    // FR-FUP-09: the daily summary has no single follow-up; it opens the list.
    if (type === 'FOLLOW_UP_DAILY_SUMMARY') {
      return `${this.appUrl}/${tenantSlug}/follow-ups`;
    }
    if (!entityType || !entityId) return null;
    // A follow-up opens "My follow-ups" on it.
    if (entityType === 'FOLLOW_UP') return `${this.appUrl}/${tenantSlug}/follow-ups?open=${encodeURIComponent(entityId)}`;
    // FR-DSC-05: an approval request opens the deal on that offer.
    if (entityType === 'OFFER' && typeof params.offerId === 'string') {
      return `${this.appUrl}/${tenantSlug}/deals/${entityId}?offer=${encodeURIComponent(params.offerId)}`;
    }
    const path =
      entityType === 'QUOTATION'
        ? `quotations/${entityId}`
        : entityType === 'OFFER'
          ? `deals/${entityId}`
          : entityType === 'APPOINTMENT'
            ? 'appointments'
            : entityType === 'CLIENT'
              ? `clients/${entityId}`
              : entityType === 'FORM'
                ? `settings/client-management/forms/${entityId}/submissions`
                : entityType === 'CONTRACT'
                  ? `contracts/${entityId}`
                  : null;
    return path ? `${this.appUrl}/${tenantSlug}/${path}` : null;
  }

  private wrap(
    heading: string,
    body: string,
    link: string | null,
    tenantName: string,
    entityType: string | null,
    language: 'sq' | 'en' = 'en'
  ): string {
    const sq = language === 'sq';
    return renderEmailLayout({
      appUrl: this.appUrl,
      preheader: heading,
      eyebrow: sq ? (entityType === 'OFFER' ? 'Ofertë' : entityType === 'FOLLOW_UP' ? 'Ndjekje' : this.eyebrowFor(entityType)) : this.eyebrowFor(entityType),
      heading: esc(heading),
      bodyHtml: `<p>${body}</p>`,
      cta: link ? { label: sq ? `Hape në ${PRODUCT_NAME}` : `Open in ${PRODUCT_NAME}`, url: link } : undefined,
      footerNote: sq
        ? `E merrni këtë sepse email-i i njoftimeve është i aktivizuar për ${esc(tenantName)}. Një Pronar Biznesi mund ta ndryshojë te Cilësimet → Njoftimet.`
        : `You are receiving this because notification email is switched on for ${esc(tenantName)}. A Business Owner can change that under Settings → Notifications.`,
      language,
    });
  }

  private eyebrowFor(entityType: string | null): string {
    switch (entityType) {
      case 'QUOTATION':
        return 'Quotation';
      case 'OFFER':
        return 'Offer';
      case 'APPOINTMENT':
        return 'Appointment';
      case 'CLIENT':
        return 'Client';
      case 'FORM':
        return 'Form';
      case 'CONTRACT':
        return 'Contract';
      case 'FOLLOW_UP':
        return 'Follow-up';
      default:
        return 'Notification';
    }
  }
}

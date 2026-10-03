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
 * recipient's inbox. This composer therefore writes in English only, and the
 * wording deliberately lives here rather than in the frontend catalogues so
 * that nobody mistakes the two for the same text. Adding a language means
 * giving this class a catalogue keyed by language and passing the recipient's
 * `User.language` through from the dispatcher; the seam is the `type` switch
 * below and nothing else.
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
  }): ComposedEmail {
    const { subject, body } = this.lines(input.type, input.params);
    const link = this.deepLink(input.tenantSlug, input.entityType, input.entityId);

    return {
      subject: `${subject} — ${input.tenantName}`,
      html: this.wrap(subject, body, link, input.tenantName, input.entityType),
    };
  }

  private lines(
    type: NotificationType,
    p: NotificationParams
  ): { subject: string; body: string } {
    const ref = String(p.reference ?? '');
    const client = String(p.clientName ?? 'a client');
    const when = String(p.scheduledAt ?? '');
    const percent = String(p.requestedPercent ?? p.approvedPercent ?? '');

    switch (type) {
      case 'DISCOUNT_APPROVAL_REQUESTED':
        return {
          subject: `Discount ${percent}% on ${ref} needs your approval`,
          body: `<strong>${esc(client)}</strong> was offered <strong>${esc(ref)}</strong> with a <strong>${esc(percent)}%</strong> discount, which is above the cap. A decision is waiting.`,
        };
      case 'DISCOUNT_APPROVED':
        return {
          subject: `Discount ${percent}% on ${ref} was approved`,
          body: `The <strong>${esc(percent)}%</strong> discount on <strong>${esc(ref)}</strong> was approved. The offer is ready to download.`,
        };
      case 'DISCOUNT_REJECTED':
        return {
          subject: `Discount on ${ref} was rejected`,
          body: `The discount above the cap on <strong>${esc(ref)}</strong> was rejected. The offer is back to draft at the cap.`,
        };
      case 'DISCOUNT_APPROVAL_REMINDER':
        return {
          subject: `Reminder: discount ${percent}% on ${ref} still waits`,
          body: `The <strong>${esc(percent)}%</strong> discount request on <strong>${esc(ref)}</strong> is still waiting for a decision.`,
        };
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

  private deepLink(tenantSlug: string, entityType: string | null, entityId: string | null): string | null {
    if (!entityType || !entityId) return null;
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
    entityType: string | null
  ): string {
    return renderEmailLayout({
      appUrl: this.appUrl,
      preheader: heading,
      eyebrow: this.eyebrowFor(entityType),
      heading: esc(heading),
      bodyHtml: `<p>${body}</p>`,
      cta: link ? { label: `Open in ${PRODUCT_NAME}`, url: link } : undefined,
      footerNote: `You are receiving this because notification email is switched on for ${esc(tenantName)}. A Business Owner can change that under Settings → Notifications.`,
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
      default:
        return 'Notification';
    }
  }
}

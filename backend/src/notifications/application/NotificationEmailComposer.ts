import { NotificationType, NotificationParams } from '../domain/NotificationType';
import { renderEmailLayout, escapeHtml as esc } from '../../shared/email/emailLayout';

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
      html: this.wrap(subject, body, link, input.tenantName),
    };
  }

  private lines(
    type: NotificationType,
    p: NotificationParams
  ): { subject: string; body: string } {
    const ref = String(p.reference ?? '');
    const client = String(p.clientName ?? 'a client');
    const when = String(p.scheduledAt ?? '');

    switch (type) {
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
        : entityType === 'APPOINTMENT'
          ? 'appointments'
          : entityType === 'CLIENT'
            ? `clients/${entityId}`
            : null;
    return path ? `${this.appUrl}/${tenantSlug}/${path}` : null;
  }

  private wrap(heading: string, body: string, link: string | null, tenantName: string): string {
    return renderEmailLayout({
      preheader: heading,
      heading: esc(heading),
      bodyHtml: `<p>${body}</p>`,
      cta: link ? { label: 'Open in NevaCRM', url: link } : undefined,
      footerNote: `You are receiving this because notification email is switched on for ${esc(tenantName)}. A Business Owner can change that under Settings → Notifications.`,
    });
  }
}

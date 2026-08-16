import nodemailer, { Transporter } from 'nodemailer';
import { IEmailSender } from '../application/ports/IEmailSender';
import { renderEmailLayout, escapeHtml } from '../../shared/email/emailLayout';

/**
 * Sends mail through a plain SMTP mailbox (Hostinger's info@nevacrm.eu),
 * replacing the EmailJS relay. One transporter is created per instance and
 * reused across sends rather than reconnecting per call.
 */
export class SmtpEmailSender implements IEmailSender {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST || '';
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASSWORD || '';

    this.from = process.env.SMTP_FROM || `"NevaCRM" <${user}>`;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  private async send(to: string, subject: string, html: string, kind: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      console.log(`${kind} email sent successfully to ${to} via SMTP`);
    } catch (error: any) {
      console.error(`Error sending ${kind} email via SMTP:`, error);
      throw new Error(`Failed to send ${kind} email`);
    }
  }

  async sendTransactionalEmail(to: string, subject: string, html: string): Promise<void> {
    await this.send(to, subject, html, 'notification');
  }

  async sendWorkspaceCreatedEmail(
    to: string,
    params: { companyName: string; urlSlug: string; ownerPassword: string }
  ): Promise<void> {
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;

    const bodyHtml = `
      <p>A workspace has been created for you on NevaCRM. Here are your login details:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top: 12px; border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">Workspace</td><td style="padding: 6px 0;"><strong>${escapeHtml(params.companyName)}</strong></td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">Workspace URL</td><td style="padding: 6px 0;"><strong>${escapeHtml(params.urlSlug)}</strong></td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">Email</td><td style="padding: 6px 0;"><strong>${escapeHtml(to)}</strong></td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #6b7280;">Password</td><td style="padding: 6px 0;"><strong>${escapeHtml(params.ownerPassword)}</strong></td></tr>
      </table>
    `;

    const html = renderEmailLayout({
      preheader: 'Your NevaCRM workspace is ready',
      heading: 'Your workspace is ready',
      bodyHtml,
      cta: { label: 'Log in to your workspace', url: loginUrl },
      footerNote: 'For your security, we recommend changing your password after logging in.',
    });

    await this.send(to, `Your NevaCRM workspace "${params.companyName}" is ready`, html, 'workspace created');
  }

  async sendInvitationEmail(to: string, token: string, tenantName: string): Promise<void> {
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invitations/accept?token=${token}&email=${encodeURIComponent(to)}`;
    const safeTenantName = escapeHtml(tenantName);

    const bodyHtml = `
      <p>You have been invited to join <strong>${safeTenantName}</strong> on NevaCRM as a team member.</p>
      <p>Click the button below to accept the invitation and set up your account password.</p>
    `;

    const html = renderEmailLayout({
      preheader: `You've been invited to join ${tenantName} on NevaCRM`,
      heading: `You're invited to join ${safeTenantName}`,
      bodyHtml,
      cta: { label: 'Accept Invitation', url: inviteLink },
      footerNote: "If you didn't expect this invitation, you can safely ignore this email.",
    });

    await this.send(to, `You have been invited to join ${tenantName} on NevaCRM`, html, 'invitation');
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}&email=${encodeURIComponent(to)}`;

    const bodyHtml = `
      <p>We received a request to reset your password. If you didn't make this request, you can safely ignore this email.</p>
      <p>To reset your password, click the button below:</p>
    `;

    const html = renderEmailLayout({
      preheader: 'Reset your NevaCRM password',
      heading: 'Reset your password',
      bodyHtml,
      cta: { label: 'Reset Password', url: resetLink },
      footerNote: 'This link will expire in 1 hour.',
    });

    await this.send(to, 'Reset Your Password - NevaCRM', html, 'password reset');
  }
}

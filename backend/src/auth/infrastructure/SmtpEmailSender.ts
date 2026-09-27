import nodemailer, { Transporter } from 'nodemailer';
import { IEmailSender } from '../application/ports/IEmailSender';
import { renderEmailLayout, escapeHtml } from '../../shared/email/emailLayout';
import { PRODUCT_NAME } from '../../shared/email/brand';

export interface SmtpEmailSenderOptions {
  /**
   * Where composed mail is handed over. Defaults to the SMTP server described
   * by the SMTP_* environment variables; tests pass a transport that captures
   * the message instead of sending it.
   */
  transporter?: Pick<Transporter, 'sendMail'>;
  /** The frontend's public URL, for links and the logo. Defaults to FRONTEND_URL. */
  appUrl?: string;
}

/**
 * Sends mail through a plain SMTP mailbox, replacing the EmailJS relay. One
 * transporter is created per instance and reused across sends rather than
 * reconnecting per call.
 *
 * The wording is English for now; sending each person's mail in their own
 * language is part of user administration (Milestone 1, slice 5).
 */
export class SmtpEmailSender implements IEmailSender {
  private readonly transporter: Pick<Transporter, 'sendMail'>;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(options: SmtpEmailSenderOptions = {}) {
    const host = process.env.SMTP_HOST || '';
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASSWORD || '';

    this.from = process.env.SMTP_FROM || `"${PRODUCT_NAME}" <${user}>`;
    this.appUrl = options.appUrl ?? (process.env.FRONTEND_URL || 'http://localhost:5173');
    this.transporter =
      options.transporter ??
      nodemailer.createTransport({
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
    const loginUrl = `${this.appUrl}/login`;

    const bodyHtml = `
      <p>A workspace has been created for you on ${PRODUCT_NAME}. Here are your login details:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top: 14px; width: 100%; background-color:#f5f8f9; border:1px solid #e6ebee; border-radius: 10px;">
        <tr><td style="padding: 12px 16px 4px 16px; font-size:12px; color:#5f6873; text-transform:uppercase; letter-spacing:0.04em;">Workspace</td></tr>
        <tr><td style="padding: 0 16px 12px 16px; font-size:15px; font-weight:600; color:#0b2b42;">${escapeHtml(params.companyName)} <span style="font-weight:400; color:#5f6873;">(${escapeHtml(params.urlSlug)})</span></td></tr>
        <tr><td style="padding: 0 16px 4px 16px; font-size:12px; color:#5f6873; text-transform:uppercase; letter-spacing:0.04em;">Email</td></tr>
        <tr><td style="padding: 0 16px 12px 16px; font-size:15px; font-weight:600; color:#0b2b42;">${escapeHtml(to)}</td></tr>
        <tr><td style="padding: 0 16px 4px 16px; font-size:12px; color:#5f6873; text-transform:uppercase; letter-spacing:0.04em;">Password</td></tr>
        <tr><td style="padding: 0 16px 16px 16px; font-size:15px; font-weight:600; color:#0b2b42; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;">${escapeHtml(params.ownerPassword)}</td></tr>
      </table>
    `;

    const html = renderEmailLayout({
      appUrl: this.appUrl,
      preheader: `Your ${PRODUCT_NAME} workspace is ready`,
      eyebrow: 'New Workspace',
      heading: 'Your workspace is ready',
      bodyHtml,
      cta: { label: 'Log in to your workspace', url: loginUrl },
      footerNote: 'For your security, we recommend changing your password after logging in.',
    });

    await this.send(to, `Your workspace "${params.companyName}" is ready — ${PRODUCT_NAME}`, html, 'workspace created');
  }

  async sendInvitationEmail(to: string, token: string, tenantName?: string): Promise<void> {
    const inviteLink = `${this.appUrl}/invitations/accept?token=${token}&email=${encodeURIComponent(to)}`;

    if (!tenantName) {
      const bodyHtml = `
        <p>You have been invited to join ${PRODUCT_NAME} as a <strong>Platform Administrator</strong>.</p>
        <p>Click the button below to accept the invitation and set up your account password.</p>
      `;

      const html = renderEmailLayout({
        appUrl: this.appUrl,
        preheader: `You've been invited to join ${PRODUCT_NAME} as a Platform Administrator`,
        eyebrow: 'Platform Invitation',
        heading: "You're invited as a Platform Administrator",
        bodyHtml,
        cta: { label: 'Accept Invitation', url: inviteLink },
        footerNote: "If you didn't expect this invitation, you can safely ignore this email.",
      });

      await this.send(to, `You have been invited to join ${PRODUCT_NAME} as a Platform Administrator`, html, 'invitation');
      return;
    }

    const safeTenantName = escapeHtml(tenantName);

    /*
     * The workspace is named on its own, not as "<workspace> on Wellness
     * Albania": in this edition the workspace IS Wellness Albania, and the
     * product already signs the email in the logo, the sender and the footer.
     */
    const bodyHtml = `
      <p>You have been invited to join <strong>${safeTenantName}</strong> as a team member.</p>
      <p>Click the button below to accept the invitation and set up your account password.</p>
    `;

    const html = renderEmailLayout({
      appUrl: this.appUrl,
      preheader: `You've been invited to join ${tenantName}`,
      eyebrow: 'Team Invitation',
      heading: `You're invited to join ${safeTenantName}`,
      bodyHtml,
      cta: { label: 'Accept Invitation', url: inviteLink },
      footerNote: "If you didn't expect this invitation, you can safely ignore this email.",
    });

    await this.send(to, `You have been invited to join ${tenantName}`, html, 'invitation');
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetLink = `${this.appUrl}/reset-password?token=${token}&email=${encodeURIComponent(to)}`;

    const bodyHtml = `
      <p>We received a request to reset your password. If you didn't make this request, you can safely ignore this email.</p>
      <p>To reset your password, click the button below:</p>
    `;

    const html = renderEmailLayout({
      appUrl: this.appUrl,
      preheader: `Reset your ${PRODUCT_NAME} password`,
      eyebrow: 'Password Reset',
      heading: 'Reset your password',
      bodyHtml,
      cta: { label: 'Reset Password', url: resetLink },
      footerNote: 'This link will expire in 1 hour.',
    });

    await this.send(to, `Reset your password — ${PRODUCT_NAME}`, html, 'password reset');
  }
}

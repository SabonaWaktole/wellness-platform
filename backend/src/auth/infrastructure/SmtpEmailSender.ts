import nodemailer, { Transporter } from 'nodemailer';
import { IEmailSender } from '../application/ports/IEmailSender';

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

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #4F46E5;">Your NevaCRM workspace is ready</h2>
        <p>A workspace has been created for you on NevaCRM. Here are your login details:</p>
        <table style="margin-top: 15px; border-collapse: collapse;">
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Workspace</td><td><strong>${params.companyName}</strong></td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Workspace URL</td><td><strong>${params.urlSlug}</strong></td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Email</td><td><strong>${to}</strong></td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #666;">Password</td><td><strong>${params.ownerPassword}</strong></td></tr>
        </table>
        <a href="${loginUrl}" style="display: inline-block; background-color: #4F46E5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px;">Log in to your workspace</a>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">For your security, we recommend changing your password after logging in.</p>
      </div>
    `;

    await this.send(to, `Your NevaCRM workspace "${params.companyName}" is ready`, html, 'workspace created');
  }

  async sendInvitationEmail(to: string, token: string, tenantName: string): Promise<void> {
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invitations/accept?token=${token}&email=${encodeURIComponent(to)}`;

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #4F46E5;">Invitation to join ${tenantName}</h2>
        <p>You have been invited to join ${tenantName} on NevaCRM as a team member.</p>
        <p>Please click the button below to accept the invitation and set up your account password.</p>
        <a href="${inviteLink}" style="display: inline-block; background-color: #4F46E5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px;">Accept Invitation</a>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">If you didn't expect this invitation, you can safely ignore this email.</p>
      </div>
    `;

    await this.send(to, `You have been invited to join ${tenantName} on NevaCRM`, html, 'invitation');
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}&email=${encodeURIComponent(to)}`;

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #4F46E5;">Password Reset Request</h2>
        <p>We received a request to reset your password. If you didn't make this request, you can ignore this email.</p>
        <p>To reset your password, click the button below:</p>
        <a href="${resetLink}" style="display: inline-block; background-color: #4F46E5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px;">Reset Password</a>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">This link will expire in 1 hour.</p>
      </div>
    `;

    await this.send(to, 'Reset Your Password - NevaCRM', html, 'password reset');
  }
}

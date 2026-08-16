import { IEmailSender } from '../application/ports/IEmailSender';
import emailjs from '@emailjs/nodejs';

export class EmailJsSender implements IEmailSender {
  private serviceId: string;
  private templateId: string;
  private publicKey: string;
  private privateKey: string;

  constructor() {
    this.serviceId = process.env.EMAILJS_SERVICE_ID || '';
    this.templateId = process.env.EMAILJS_TEMPLATE_ID || '';
    this.publicKey = process.env.EMAILJS_PUBLIC_KEY || '';
    this.privateKey = process.env.EMAILJS_PRIVATE_KEY || '';
  }

  /**
   * The one place this class actually talks to EmailJS.
   *
   * All three public methods funnel through here, so the service/template/key
   * wiring and the error handling exist once. `sendTransactionalEmail` is
   * simply this with no body of its own to build.
   */
  private async send(to: string, subject: string, htmlContent: string, kind: string): Promise<void> {
    try {
      await emailjs.send(
        this.serviceId,
        this.templateId,
        { to_email: to, subject, html_content: htmlContent },
        { publicKey: this.publicKey, privateKey: this.privateKey }
      );
      console.log(`${kind} email sent successfully to ${to} via EmailJS`);
    } catch (error: any) {
      console.error(`Error sending ${kind} email via EmailJS:`, error);
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

    const htmlContent = `
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

    await this.send(to, `Your NevaCRM workspace "${params.companyName}" is ready`, htmlContent, 'workspace created');
  }

  async sendInvitationEmail(to: string, token: string, tenantName: string): Promise<void> {
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invitations/accept?token=${token}&email=${encodeURIComponent(to)}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #4F46E5;">Invitation to join ${tenantName}</h2>
        <p>You have been invited to join ${tenantName} on NevaCRM as a team member.</p>
        <p>Please click the button below to accept the invitation and set up your account password.</p>
        <a href="${inviteLink}" style="display: inline-block; background-color: #4F46E5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px;">Accept Invitation</a>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">If you didn't expect this invitation, you can safely ignore this email.</p>
      </div>
    `;

    try {
      await emailjs.send(
        this.serviceId,
        this.templateId,
        {
          to_email: to,
          subject: `You have been invited to join ${tenantName} on NevaCRM`,
          html_content: htmlContent,
        },
        {
          publicKey: this.publicKey,
          privateKey: this.privateKey,
        }
      );
      console.log(`Invitation email sent successfully to ${to} via EmailJS`);
    } catch (error: any) {
      console.error('Error sending invitation email via EmailJS:', error);
      throw new Error('Failed to send invitation email');
    }
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}&email=${encodeURIComponent(to)}`;
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #4F46E5;">Password Reset Request</h2>
        <p>We received a request to reset your password. If you didn't make this request, you can ignore this email.</p>
        <p>To reset your password, click the button below:</p>
        <a href="${resetLink}" style="display: inline-block; background-color: #4F46E5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px;">Reset Password</a>
        <p style="margin-top: 20px; font-size: 12px; color: #999;">This link will expire in 1 hour.</p>
      </div>
    `;

    try {
      await emailjs.send(
        this.serviceId,
        this.templateId,
        {
          to_email: to,
          subject: 'Reset Your Password - NevaCRM',
          html_content: htmlContent,
        },
        {
          publicKey: this.publicKey,
          privateKey: this.privateKey,
        }
      );
      console.log(`Password reset email sent successfully to ${to} via EmailJS`);
    } catch (error: any) {
      console.error('Error sending password reset email via EmailJS:', error);
      throw new Error('Failed to send password reset email');
    }
  }
}

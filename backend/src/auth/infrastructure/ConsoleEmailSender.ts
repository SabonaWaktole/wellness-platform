import { IEmailSender } from '@auth/application/ports/IEmailSender';

export class ConsoleEmailSender implements IEmailSender {
  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    console.log(`[EMAIL] To: ${to} | Password Reset Token: ${token}`);
  }

  async sendInvitationEmail(to: string, token: string, tenantName?: string): Promise<void> {
    if (!tenantName) {
      console.log(`[EMAIL] To: ${to} | You are invited as a Platform Administrator | Token: ${token}`);
      return;
    }
    console.log(`[EMAIL] To: ${to} | You are invited to join ${tenantName} | Token: ${token}`);
  }

  async sendTransactionalEmail(to: string, subject: string, html: string): Promise<void> {
    // The body is logged as a length rather than in full: business-event mail
    // quotes client names and quotation references, and a development log is
    // the last place that should become a second copy of customer data.
    console.log(`[EMAIL] To: ${to} | ${subject} | ${html.length} bytes`);
  }

  async sendWorkspaceCreatedEmail(
    to: string,
    params: { companyName: string; urlSlug: string; ownerPassword: string }
  ): Promise<void> {
    console.log(
      `[EMAIL] To: ${to} | Workspace "${params.companyName}" (${params.urlSlug}) created | Password: ${params.ownerPassword}`
    );
  }
}

export interface IEmailSender {
  sendPasswordResetEmail(to: string, token: string): Promise<void>;
  /** `tenantName` is omitted for a Platform Admin invitation, which has no workspace. */
  sendInvitationEmail(to: string, token: string, tenantName?: string): Promise<void>;

  /**
   * Generic transactional send, used for every business-event email (§6.6).
   *
   * The two methods above stayed specific because they are part of the auth
   * flow and their bodies carry a token this port is responsible for building
   * a link around. Business events are the opposite: there are eleven of them
   * and growing, their wording belongs to the notification catalogue rather
   * than to the transport, and adding a method per event would make every new
   * notification type a change to three implementations of this interface.
   *
   * So the composition happens in `NotificationEmailComposer` and this port
   * only ships bytes.
   */
  sendTransactionalEmail(to: string, subject: string, html: string): Promise<void>;

  /**
   * Sent once, right after a Super Admin provisions a workspace: gives the new
   * Business Owner the login credentials for the workspace just created on
   * their behalf. A separate method rather than a `sendTransactionalEmail`
   * call from the route, because the password is a secret this port should be
   * the one place responsible for wording it correctly.
   */
  sendWorkspaceCreatedEmail(
    to: string,
    params: { companyName: string; urlSlug: string; ownerPassword: string }
  ): Promise<void>;
}

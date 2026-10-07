/** Who a card token belongs to: the workspace and the member, and the workspace's time zone for "today". */
export interface CardOwner {
  tenantId: string;
  memberId: string;
  timezone: string;
}

/**
 * The card token behind a member's link (M4 Slice 11, D11). The member store
 * never returns the token; only this port does, and only to build a link for
 * staff or to answer the card page.
 */
export interface ICardStore {
  /** The member the current token belongs to, or null for an unknown token. */
  resolve(token: string): Promise<CardOwner | null>;
  /** True when this token was replaced (FR-CRD-10). Looked up by hash. */
  wasReplaced(tokenHash: string): Promise<boolean>;
  /** The member's current token; null when the member is not in the workspace. */
  tokenOf(tenantId: string, memberId: string): Promise<string | null>;
  /** The current tokens of several members, by member id, workspace-checked. */
  tokensOf(tenantId: string, memberIds: string[]): Promise<Record<string, string>>;
  /**
   * Gives the member a new token only if `oldToken` is still the current one,
   * and keeps the hash of the old one, in the caller's transaction. Returns false when the member is not in the
   * workspace or the token changed meanwhile.
   */
  replace(tenantId: string, memberId: string, oldToken: string, newToken: string): Promise<boolean>;
}

/** Draws the QR code of a link as SVG (D13). */
export interface IQrCodeRenderer {
  svg(text: string): Promise<string>;
}

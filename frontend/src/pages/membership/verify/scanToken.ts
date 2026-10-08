const CARD_VERIFY_LINK = /\/v\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/;

/**
 * The card token inside what a QR code held: the verification link `<address>/v/<token>` (FR-CRD-02, D12). Anything
 * else, such as another QR code in the room, is not a Wellness+ card and gives null. The token is not logged or kept.
 */
export const tokenFromScan = (text: string): string | null => CARD_VERIFY_LINK.exec(text.trim())?.[1] ?? null;

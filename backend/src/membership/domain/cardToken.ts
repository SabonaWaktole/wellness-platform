import { createHash } from 'crypto';

/**
 * A card token is `generateShareToken()`: 32 random bytes as base64url, so 43
 * characters of A-Z a-z 0-9 - _ (D11, NFR-SEC-07). Anything else cannot be a
 * token and is answered like an unknown one without touching the database.
 */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_IN_TEXT = /[A-Za-z0-9_-]{43}/g;

export const isWellFormedCardToken = (value: unknown): value is string => typeof value === 'string' && TOKEN.test(value);

/** What is kept of a replaced token: the old link can be recognised, the old secret is not stored (D11). */
export const hashCardToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** The page a member opens (FR-CRD-01) and the address the QR holds (FR-CRD-02, D12). */
export const cardPath = (token: string): string => `/m/${token}`;
export const verificationPath = (token: string): string => `/v/${token}`;

/**
 * Removes anything shaped like a card token from text that is about to be
 * logged, so an error that quotes a query or a URL cannot leak one
 * (FR-AUD-16, FR-CRD-08).
 */
export const scrubCardTokens = (text: string): string => text.replace(TOKEN_IN_TEXT, '[card-token]');

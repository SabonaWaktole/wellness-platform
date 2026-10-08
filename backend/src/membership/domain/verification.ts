import { createHmac } from 'crypto';

export const VERIFICATION_CHANNELS = ['RECEPTION_SCAN', 'RECEPTION_SEARCH', 'PARTNER_SCAN'] as const;
export type VerificationChannel = (typeof VERIFICATION_CHANNELS)[number];
export type VerificationResult = 'VALID' | 'NOT_VALID' | 'NOT_FOUND';
export const IDENTITY_CHOICES = ['NONE', 'CONFIRMED', 'MISMATCH'] as const;
export type IdentityChoice = (typeof IDENTITY_CHOICES)[number];

/** NFR-SEC-08: public verifications per hour from one address, unless the deployment sets another number. */
export const DEFAULT_VERIFY_REQUESTS_PER_HOUR = 300;

/**
 * FR-VER-10: the caller's address is kept only as a keyed hash (HMAC-SHA-256
 * with a server secret), so the same address can be counted but no address can
 * be read back, not even by someone who holds the database.
 */
export const hashAddress = (address: string, secret: string): string => createHmac('sha256', secret).update(`verify-ip:${address}`).digest('hex');

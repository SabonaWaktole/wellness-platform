import { apiClient as api } from '../api';
import { API_BASE_URL } from '../api/baseUrl';
import type { Tier } from './membershipSettingsService';

const base = (slug: string) => `/${slug}/membership/verify`;

export interface VerificationTier {
  tier: Tier;
  labelSq: string;
  labelEn: string;
  colour: string;
}

export interface VerificationDiscount {
  nameSq: string;
  nameEn: string;
  percent: string;
}

/** What Reception sees (FR-VER-02): the server decides every field, the screen shows them. */
export type ReceptionVerification =
  | { found: false; verificationId: string }
  | {
      found: true;
      verificationId: string;
      valid: boolean;
      reason: 'SUSPENDED' | 'CLOSED' | null;
      name: string;
      memberNumber: string;
      tier: VerificationTier;
      validUntil: string | null;
      status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
      dateOfBirth: string | null;
      discounts: VerificationDiscount[];
    };

export interface VerificationCandidate {
  id: string;
  name: string;
  memberNumber: string;
}

export type IdentityChoice = 'CONFIRMED' | 'MISMATCH';

export const memberVerificationService = {
  /** FR-VER-01: the token read from the QR code. It is only ever in the path. */
  byToken: async (slug: string, token: string) => (await api.get<{ data: ReceptionVerification }>(`${base(slug)}/by-token/${encodeURIComponent(token)}`)).data.data,
  search: async (slug: string, query: string) => (await api.get<{ data: VerificationCandidate[] }>(`${base(slug)}/search`, { params: { query } })).data.data,
  byMember: async (slug: string, memberId: string) => (await api.post<{ data: ReceptionVerification }>(`${base(slug)}/members/${encodeURIComponent(memberId)}`)).data.data,
  /** FR-VER-03: "Identity confirmed" or "Does not match", stored on the check just made. */
  recordIdentity: async (slug: string, verificationId: string, choice: IdentityChoice) =>
    (await api.patch<{ data: { identityChoice: IdentityChoice } }>(`${base(slug)}/${encodeURIComponent(verificationId)}/identity`, { choice })).data.data,
};

/** What a partner clinic's phone sees (FR-VER-07, FR-VER-09): one neutral "Not valid" for every reason. */
export type PublicVerification =
  | { valid: false }
  | { valid: true; name: string; memberNumber: string; tier: VerificationTier; validUntil: string | null };

export type PublicVerificationResult = { kind: 'result'; result: PublicVerification } | { kind: 'failed' };

/**
 * The public page has no account, so it uses plain `fetch` and not the shared client: that one sends credentials and
 * redirects on 401. The token is only ever in the path and is never logged (FR-CRD-08).
 */
export async function fetchPublicVerification(token: string, signal?: AbortSignal): Promise<PublicVerificationResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/verify/${encodeURIComponent(token)}`, { signal, credentials: 'omit', cache: 'no-store' });
    if (!response.ok) return { kind: 'failed' };
    return { kind: 'result', result: ((await response.json()) as { data: PublicVerification }).data };
  } catch {
    return { kind: 'failed' };
  }
}

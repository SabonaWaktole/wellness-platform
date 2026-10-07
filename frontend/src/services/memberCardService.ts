import { apiClient as api } from '../api';
import { API_BASE_URL } from '../api/baseUrl';
import type { Tier } from './membershipSettingsService';

const base = (slug: string) => `/${slug}/membership/members`;

/** What staff need to show, copy and print a member's card (FR-CRD-09). The QR is drawn by the server. */
export interface CardLink {
  url: string;
  qrPayload: string;
  qrSvg: string;
}

export const memberCardService = {
  link: async (slug: string, memberId: string) => (await api.get<{ data: CardLink }>(`${base(slug)}/${memberId}/card-link`)).data.data,
  /** FR-CRD-10: a new link; the old one stops working at once. */
  replace: async (slug: string, memberId: string) => (await api.post<{ data: { url: string } }>(`${base(slug)}/${memberId}/card-link/replace`)).data.data,
  /** FR-EMP-08: name, member ID and card link of every member of one upload. */
  linksSheet: async (slug: string, importId: string) =>
    (await api.get<Blob>(`/${slug}/membership/employee-imports/${importId}/card-links.xlsx`, { responseType: 'blob' })).data,
};

/** The card exactly as the public endpoint sends it (FR-CRD-01): nothing personal beyond name and ID. */
export interface PublicCard {
  valid: boolean;
  name: string;
  memberNumber: string;
  language: 'sq' | 'en' | 'el' | 'it';
  tier: { tier: Tier; labelSq: string; labelEn: string; colour: string } | null;
  validUntil: string | null;
  benefits: Array<{ nameSq: string; nameEn: string; percent: string }>;
  qrSvg: string | null;
  generatedAt: string;
}

export type PublicCardResult = { kind: 'card'; card: PublicCard } | { kind: 'replaced' } | { kind: 'not-found' } | { kind: 'failed' };

/**
 * The card page has no account, so it uses plain `fetch` and not the shared client: that one sends credentials and
 * redirects on 401, and a member opening a card must never be sent to a login. The token is only ever in the path
 * and is never logged (FR-CRD-08).
 */
export async function fetchPublicCard(token: string, signal?: AbortSignal): Promise<PublicCardResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/cards/${encodeURIComponent(token)}`, { signal, credentials: 'omit', cache: 'no-store' });
    if (response.status === 410) return { kind: 'replaced' };
    if (response.status === 404) return { kind: 'not-found' };
    if (!response.ok) return { kind: 'failed' };
    const body = (await response.json()) as { data: PublicCard };
    return { kind: 'card', card: body.data };
  } catch {
    return { kind: 'failed' };
  }
}

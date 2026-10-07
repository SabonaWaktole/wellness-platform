import { apiClient as api } from '../api';
import type { Tier } from './membershipSettingsService';

export type PaymentKind = 'NEW' | 'RENEWAL' | 'UPGRADE';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'OTHER';
export const PAYMENT_KINDS: PaymentKind[] = ['NEW', 'RENEWAL', 'UPGRADE'];
export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'];

/** A payment as the server sends it. Money is a two-decimal string: this screen formats it and never calculates (NFR-ACC-05). */
export interface MemberPayment {
  id: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  kind: PaymentKind;
  fromTier: Tier;
  toTier: Tier;
  listFee: string;
  discountPercent: string;
  amount: string;
  method: PaymentMethod;
  receivedOn: string;
  receiptNumber: string;
  note?: string | null;
  recordedBy: { id: string; name: string | null };
  createdAt: string;
  status: 'RECORDED' | 'VOIDED';
  voidedAt: string | null;
  voidedBy: { id: string; name: string | null } | null;
  voidReason: string | null;
}

/** What the server calculated for one payment before it is saved (FR-MPAY-01, FR-MPAY-02). */
export interface PaymentQuote {
  kind: PaymentKind;
  fromTier: Tier;
  toTier: Tier;
  listFee: string;
  discountPercent: string;
  amount: string;
  startsOn: string;
  endsOn: string;
  warnings: Array<'SPONSORED_SILVER_OWN_TERM'>;
}

export interface PaymentOption {
  kind: PaymentKind;
  targetTier: Tier;
  quote: PaymentQuote;
}

/** The only fields a payment can be recorded with: there is no amount (FR-MPAY-01). */
export interface RecordPaymentInput {
  kind: PaymentKind;
  targetTier: Tier;
  method: PaymentMethod;
  receivedOn: string;
  note?: string | null;
}

export interface PaymentFilters {
  from?: string;
  to?: string;
  tier?: Tier | '';
  kind?: PaymentKind | '';
  method?: PaymentMethod | '';
  agentId?: string;
  status?: 'RECORDED' | 'VOIDED' | '';
  memberId?: string;
}

export interface PaymentsPage {
  data: MemberPayment[];
  total: number;
  /** The total of the whole filtered list, voided payments left out (FR-MPAY-07). */
  totalAmount: string;
  page: number;
  limit: number;
}

const clean = (filters: object) => Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined));
const members = (slug: string) => `/${slug}/membership/members`;
const payments = (slug: string) => `/${slug}/membership/payments`;

export const memberPaymentService = {
  /** Every payment the member can make on the date, each with its calculated quote. */
  options: async (slug: string, memberId: string, receivedOn?: string) =>
    (await api.get<{ data: { options: PaymentOption[] } }>(`${members(slug)}/${memberId}/payments/options`, { params: clean({ receivedOn }) })).data.data.options,
  record: async (slug: string, memberId: string, body: RecordPaymentInput) =>
    (await api.post<{ data: MemberPayment }>(`${members(slug)}/${memberId}/payments`, body)).data.data,
  void: async (slug: string, paymentId: string, reason: string) =>
    (await api.post<{ data: MemberPayment }>(`${payments(slug)}/${paymentId}/void`, { reason })).data.data,
  search: async (slug: string, filters: PaymentFilters & { page?: number; limit?: number }) =>
    (await api.get<PaymentsPage>(payments(slug), { params: clean(filters) })).data,
  /** The same filters as a CSV file; the export is recorded in the audit log (FR-MPAY-10). */
  downloadCsv: async (slug: string, filters: PaymentFilters): Promise<Blob> =>
    (await api.get<Blob>(`${payments(slug)}/export.csv`, { params: clean(filters), responseType: 'blob' })).data,
  /** The printable receipt, not an invoice (FR-MPAY-11). */
  receipt: async (slug: string, paymentId: string, lang: 'sq' | 'en'): Promise<Blob> =>
    (await api.get<Blob>(`${payments(slug)}/${paymentId}/receipt.pdf`, { params: { lang }, responseType: 'blob' })).data,
};

/** The reason a purchase rule refused a payment (409), if the error is one. */
export const refusalOf = (err: unknown): string | null => {
  const response = (err as { response?: { status?: number; data?: { code?: string; reason?: string } } })?.response;
  return response?.status === 409 && response.data?.code === 'PAYMENT_REFUSED' ? (response.data.reason ?? null) : null;
};

/** The code of a 409 about voiding (PAYMENT_NOT_LATEST, PAYMENT_ALREADY_VOIDED), if the error is one. */
export const voidRefusalOf = (err: unknown): string | null => {
  const response = (err as { response?: { status?: number; data?: { code?: string } } })?.response;
  return response?.status === 409 ? (response.data?.code ?? null) : null;
};

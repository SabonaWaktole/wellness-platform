import type { ClientStatus } from '../types/client';
import type { ProductStatus } from '../types/inventory';
import type { DealStage, DealType } from '../types/deal';

/**
 * Translation keys for every domain status the UI displays.
 *
 * This replaces four separate mechanisms that all derived display text from the
 * enum's own spelling:
 *
 *   - `ClientListContent.getStatusLabel`   — `s.charAt(0).toUpperCase() + s.slice(1)`
 *   - `QuotationListContent.getStatusLabel`   ┐ byte-identical duplicates
 *   - `QuotationDetailContent.getStatusLabel` ┘
 *   - `PRODUCT_STATUS_LABELS` in types/inventory.ts
 *
 * Deriving a label by capitalising the enum value cannot work in any language
 * but English — it is not a translation problem that was overlooked, it is
 * untranslatable by construction.
 *
 * Keys are explicit `Record` maps rather than built from a template
 * (``t(`status.${s}`)``) so that a status without a key is a compile error, and
 * so every key remains greppable. Same reasoning as FIELD_TYPE_TO_INPUT.
 */

/** Mirrors the backend's QuotationStatus enum (Quotation.ts). */
export const QUOTATION_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  // M2 Slice 9: an offer that may be downloaded as final and marked as sent.
  'READY',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
] as const;

export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_STATUS_KEYS: Record<QuotationStatus, string> = {
  DRAFT: 'quotations:status.draft',
  PENDING_APPROVAL: 'quotations:status.pendingApproval',
  READY: 'quotations:status.ready',
  SENT: 'quotations:status.sent',
  ACCEPTED: 'quotations:status.accepted',
  REJECTED: 'quotations:status.rejected',
  EXPIRED: 'quotations:status.expired',
};

/** Mirrors the backend's InvoiceStatus enum (Invoice.ts). */
export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'VOID'] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_KEYS: Record<InvoiceStatus, string> = {
  DRAFT: 'invoices:status.draft',
  SENT: 'invoices:status.sent',
  PAID: 'invoices:status.paid',
  OVERDUE: 'invoices:status.overdue',
  VOID: 'invoices:status.void',
};

/** Mirrors the backend's ContractStatus enum (backend Contract.ts). */
export const CONTRACT_STATUSES = ['DRAFT', 'PENDING_SIGNATURE', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED'] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_KEYS: Record<ContractStatus, string> = {
  DRAFT: 'contracts:status.draft',
  PENDING_SIGNATURE: 'contracts:status.pendingSignature',
  ACTIVE: 'contracts:status.active',
  SUSPENDED: 'contracts:status.suspended',
  EXPIRED: 'contracts:status.expired',
  CANCELLED: 'contracts:status.cancelled',
};

/** Mirrors the backend's DealStage (M2 Slice 6), the fallback until the tenant's stage labels load. */
export const DEAL_STAGE_KEYS: Record<DealStage, string> = {
  NEW_LEAD: 'deals:stage.NEW_LEAD',
  CONTACTED: 'deals:stage.CONTACTED',
  INTERESTED: 'deals:stage.INTERESTED',
  OFFER_PREPARED: 'deals:stage.OFFER_PREPARED',
  OFFER_SENT: 'deals:stage.OFFER_SENT',
  FOLLOW_UP: 'deals:stage.FOLLOW_UP',
  NEGOTIATION: 'deals:stage.NEGOTIATION',
  WON: 'deals:stage.WON',
  LOST: 'deals:stage.LOST',
};

export const DEAL_TYPE_KEYS: Record<DealType, string> = {
  NEW_CONTRACT: 'deals:type.NEW_CONTRACT',
  RENEWAL: 'deals:type.RENEWAL',
  EXTRA_SERVICES: 'deals:type.EXTRA_SERVICES',
};

/**
 * Mirrors the backend's PaymentStatus enum (backend ContractPayment.ts).
 * WAIVED is the one legacy key (decision D6, Slice 10): kept only so an
 * existing row still renders a label.
 */
export const CONTRACT_PAYMENT_STATUSES = [
  'NOT_INVOICED',
  'INVOICE_ISSUED',
  'PAYMENT_PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'WAIVED',
] as const;

export type ContractPaymentStatus = (typeof CONTRACT_PAYMENT_STATUSES)[number];

export const CONTRACT_PAYMENT_STATUS_KEYS: Record<ContractPaymentStatus, string> = {
  NOT_INVOICED: 'contracts:paymentStatus.notInvoiced',
  INVOICE_ISSUED: 'contracts:paymentStatus.invoiceIssued',
  PAYMENT_PENDING: 'contracts:paymentStatus.paymentPending',
  PARTIALLY_PAID: 'contracts:paymentStatus.partiallyPaid',
  PAID: 'contracts:paymentStatus.paid',
  OVERDUE: 'contracts:paymentStatus.overdue',
  WAIVED: 'contracts:paymentStatus.waived',
};

/** Mirrors the backend's BillingPeriod enum. Not a status, but same problem. */
export const BILLING_PERIOD_KEYS: Record<string, string> = {
  MONTHLY: 'contracts:billingPeriod.monthly',
  QUARTERLY: 'contracts:billingPeriod.quarterly',
  ANNUAL: 'contracts:billingPeriod.annual',
  ONE_TIME: 'contracts:billingPeriod.oneTime',
};

export const CLIENT_STATUS_KEYS: Record<ClientStatus, string> = {
  LEAD: 'clients:status.lead',
  PROSPECT: 'clients:status.prospect',
  CLIENT: 'clients:status.client',
  FORMER_CLIENT: 'clients:status.formerClient',
};

/** Mirrors the backend's Appointment status column. */
export const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'RESCHEDULED',
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_KEYS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'appointments:status.scheduled',
  CONFIRMED: 'appointments:status.confirmed',
  COMPLETED: 'appointments:status.completed',
  CANCELLED: 'appointments:status.cancelled',
  RESCHEDULED: 'appointments:status.rescheduled',
};

export const PRODUCT_STATUS_KEYS: Record<ProductStatus, string> = {
  IN_STOCK: 'inventory:status.inStock',
  LOW_STOCK: 'inventory:status.lowStock',
  OUT_OF_STOCK: 'inventory:status.outOfStock',
  ARCHIVED: 'inventory:status.archived',
};

/**
 * Statuses arrive from the API as plain strings, so lookup has to tolerate a
 * value the frontend does not know — a newly added backend status, or a stale
 * record. Returning the raw value is deliberately visible: it renders as
 * `PENDING_REVIEW` rather than silently as blank or as the wrong status, so the
 * gap is obvious rather than misleading.
 */
const lookup = (keys: Record<string, string>, status: string): string | null =>
  Object.prototype.hasOwnProperty.call(keys, status) ? keys[status] : null;

export const quotationStatusKey = (status: string) => lookup(QUOTATION_STATUS_KEYS, status);
export const invoiceStatusKey = (status: string) => lookup(INVOICE_STATUS_KEYS, status);
export const clientStatusKey = (status: string) => lookup(CLIENT_STATUS_KEYS, status);
export const productStatusKey = (status: string) => lookup(PRODUCT_STATUS_KEYS, status);
export const appointmentStatusKey = (status: string) => lookup(APPOINTMENT_STATUS_KEYS, status);
export const dealStageKey = (stage: string) => lookup(DEAL_STAGE_KEYS, stage);
export const dealTypeKey = (type: string) => lookup(DEAL_TYPE_KEYS, type);
export const contractStatusKey = (status: string) => lookup(CONTRACT_STATUS_KEYS, status);
export const contractPaymentStatusKey = (status: string) =>
  lookup(CONTRACT_PAYMENT_STATUS_KEYS, status);
export const billingPeriodKey = (period: string) => lookup(BILLING_PERIOD_KEYS, period);

/** An appointment due a reminder, with just enough context to write one. */
export interface DueAppointment {
  id: string;
  tenantId: string;
  assignedUserId: string;
  scheduledAt: Date;
  clientName: string;
}

/** A sent quotation nobody has answered. */
export interface StaleQuotation {
  id: string;
  /** For its reference (FR-OFR-08). */
  number: string | null;
  version: number;
  tenantId: string;
  createdByUserId: string;
  sentAt: Date;
  clientName: string;
}

/**
 * The read side of the scheduler's sweeps.
 *
 * A port rather than direct Prisma use, for one reason that matters: these
 * queries decide who gets emailed and when. They are the part of the scheduler
 * most worth testing and the part hardest to test through a database — "does a
 * reschedule re-arm the reminder" is a question about this contract, not about
 * SQL. The jobs above it hold the policy; this holds the lookups.
 */
export interface ISchedulerQueries {
  /**
   * Appointments starting within `leadMinutes` that have not been reminded.
   *
   * Scoped to one tenant because the lead time is a per-tenant setting — a
   * single cross-tenant query would have to pick one window for everybody.
   *
   * Excludes terminal statuses: reminding someone about an appointment that was
   * cancelled or already completed is worse than not reminding them at all.
   */
  findAppointmentsDueReminder(
    tenantId: string,
    now: Date,
    leadMinutes: number
  ): Promise<DueAppointment[]>;

  /** Idempotency marker. Set once the reminder has actually been emitted. */
  markAppointmentReminded(appointmentId: string, at: Date): Promise<void>;

  /**
   * Quotations sent at least `days` ago with no response and no follow-up yet.
   *
   * `respondedAt IS NULL` and `status = SENT` are both checked even though
   * either would nearly do: status is the authority, and respondedAt guards the
   * window between a response being recorded and the status write landing.
   */
  findQuotationsNeedingFollowUp(
    tenantId: string,
    now: Date,
    days: number
  ): Promise<StaleQuotation[]>;

  markQuotationFollowedUp(quotationId: string, at: Date): Promise<void>;

  /**
   * Quotations sent at least `days` ago that are still SENT.
   *
   * No marker column here, unlike the two above: expiry changes the row's own
   * status, so a quotation that has been expired can no longer match this
   * query. The state change is the idempotency.
   */
  findQuotationsDueExpiry(tenantId: string, now: Date, days: number): Promise<StaleQuotation[]>;

  /**
   * The workspaces that run the sales process (D6), with their time zone.
   * Their offers expire on their own validity date (FR-OFR-13), and the
   * legacy quotation sweeps leave them alone.
   */
  listSalesProcessTenants(): Promise<{ id: string; timeZone: string }[]>;

  /**
   * Sent offers of the workspace whose validity date is before `today`
   * (YYYY-MM-DD in the workspace's time zone), not replaced by a later
   * version (FR-OFR-11, 13). The status change is the idempotency.
   */
  findOffersPastValidity(tenantId: string, today: string): Promise<{ id: string; tenantId: string }[]>;

  /**
   * Every Sent invoice whose due date has passed, across all tenants.
   *
   * Cross-tenant and unconditional, unlike the quotation queries above —
   * there is no per-tenant opt-in for invoice overdue detection (see
   * `InvoiceOverdueJob`), so there is nothing to loop over per tenant. The
   * state change (Sent -> Overdue) is its own idempotency marker, same as
   * `findQuotationsDueExpiry`.
   */
  findInvoicesPastDue(now: Date): Promise<PastDueInvoice[]>;

  /** Every workspace with its time zone, for the daily jobs (NFR-REL-01). */
  listTenants(): Promise<{ id: string; timeZone: string }[]>;

  /**
   * One workspace's ACTIVE contracts whose end date is before `today`
   * (a UTC-midnight date, the workspace's day).
   *
   * Selected by state, not by "ended yesterday", so a run after a gap still
   * finds everything it missed. The state change (Active -> Expired) is its own
   * idempotency marker.
   */
  findContractsPastEnd(tenantId: string, today: Date): Promise<{ id: string; tenantId: string }[]>;

  /**
   * Contracts the system expired since `since` that nobody has been told about
   * and that have no renewal (FR-CON-16): the retry list for a notification
   * that failed after the state change committed. A contract with a renewal
   * contract or an open renewal deal never appears.
   */
  findExpiredAwaitingNotice(tenantId: string, since: Date): Promise<ExpiredContractNotice[]>;

  /**
   * ACTIVE contracts ending within `days` that have not been warned about yet.
   *
   * Unlike the sweep above, this one DOES need a marker column
   * (`expiryNotifiedAt`): warning about an upcoming expiry does not change the
   * contract, so nothing about the row would stop the next hourly pass from
   * warning again. Same mechanism as `Appointment.remindedAt`.
   */
  findContractsNearingExpiry(now: Date, days: number): Promise<ExpiringContract[]>;

  /** Idempotency marker. Set once the expiry warning has actually been emitted. */
  markContractExpiryNotified(contractId: string, at: Date): Promise<void>;
}

/** A contract at or near the end of its term, with enough context to write a notice. */
export interface ExpiringContract {
  id: string;
  tenantId: string;
  clientId: string;
  clientName: string;
  planName: string;
  endsAt: Date;
  /** Who to tell. NULL when nobody owns the account — see the job for the fallback. */
  assignedUserId: string | null;
  createdByUserId: string;
}

/** A contract the system expired, with what the notice needs. */
export interface ExpiredContractNotice {
  id: string;
  tenantId: string;
  clientName: string;
  planName: string;
  number: string | null;
  endsAt: Date;
  assignedUserId: string | null;
  clientAssignedUserId: string | null;
  createdByUserId: string;
}

/** A Sent invoice whose due date has passed. */
export interface PastDueInvoice {
  id: string;
  tenantId: string;
  dueDate: Date;
}

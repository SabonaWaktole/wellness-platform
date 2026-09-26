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
   * Every Sent invoice whose due date has passed, across all tenants.
   *
   * Cross-tenant and unconditional, unlike the quotation queries above —
   * there is no per-tenant opt-in for invoice overdue detection (see
   * `InvoiceOverdueJob`), so there is nothing to loop over per tenant. The
   * state change (Sent -> Overdue) is its own idempotency marker, same as
   * `findQuotationsDueExpiry`.
   */
  findInvoicesPastDue(now: Date): Promise<PastDueInvoice[]>;

  /**
   * Every ACTIVE contract whose end date has passed, across all tenants.
   *
   * Cross-tenant and unconditional for the same reason as
   * `findInvoicesPastDue`: a term running out is a fact about the calendar,
   * not a destructive action a tenant needs to have switched on. The state
   * change (Active -> Expired) is its own idempotency marker.
   */
  findContractsPastEnd(now: Date): Promise<ExpiringContract[]>;

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

/** A Sent invoice whose due date has passed. */
export interface PastDueInvoice {
  id: string;
  tenantId: string;
  dueDate: Date;
}

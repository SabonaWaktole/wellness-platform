import { InvoiceLineItem } from './InvoiceLineItem';

export enum InvoiceStatus {
  Draft = 'DRAFT',
  Sent = 'SENT',
  Paid = 'PAID',
  Overdue = 'OVERDUE',
  Void = 'VOID'
}

export class Invoice {
  id: string;
  tenantId: string;
  clientId: string;
  quotationId: string;
  createdByUserId: string;
  status: InvoiceStatus;
  dueDate: Date;
  createdAt: Date;
  sentAt: Date | null;
  paidAt: Date | null;
  lineItems: InvoiceLineItem[];

  /**
   * Display name of the client, hydrated from the joined Client row on read.
   * Same convention as `Quotation.clientName` — not persisted from here.
   */
  clientName?: string;

  /**
   * The company's responsible salesperson, hydrated from the joined Client row
   * on read and never persisted from here. Data scope reads it: a invoice
   * belongs to whoever its company belongs to (FR-RBAC-11).
   */
  clientAssignedUserId?: string | null;

  private constructor(props: {
    id: string;
    tenantId: string;
    clientId: string;
    quotationId: string;
    createdByUserId: string;
    status: InvoiceStatus;
    dueDate: Date;
    createdAt: Date;
    sentAt: Date | null;
    paidAt: Date | null;
    lineItems: InvoiceLineItem[];
    clientName?: string;
    clientAssignedUserId?: string | null;
  }) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.clientId = props.clientId;
    this.quotationId = props.quotationId;
    this.createdByUserId = props.createdByUserId;
    this.status = props.status;
    this.dueDate = props.dueDate;
    this.createdAt = props.createdAt;
    this.sentAt = props.sentAt;
    this.paidAt = props.paidAt;
    this.lineItems = props.lineItems;
    this.clientName = props.clientName;
    this.clientAssignedUserId = props.clientAssignedUserId;
  }

  /**
   * Explicit serialization for the HTTP layer — see `Quotation.toJSON` for why
   * this exists at all: without it, `subtotal` (a getter) would silently drop
   * from `res.json(invoice)`.
   */
  toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      clientId: this.clientId,
      clientName: this.clientName,
      quotationId: this.quotationId,
      createdByUserId: this.createdByUserId,
      status: this.status,
      dueDate: this.dueDate,
      createdAt: this.createdAt,
      sentAt: this.sentAt,
      paidAt: this.paidAt,
      lineItems: this.lineItems,
      subtotal: this.subtotal,
      grandTotal: this.subtotal
    };
  }

  get subtotal(): number {
    return this.lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  }

  static create(props: {
    id: string;
    tenantId: string;
    clientId: string;
    quotationId: string;
    createdByUserId: string;
    lineItems: InvoiceLineItem[];
    dueDate: Date;
    status?: InvoiceStatus;
    createdAt?: Date;
    sentAt?: Date | null;
    paidAt?: Date | null;
    clientName?: string;
    clientAssignedUserId?: string | null;
  }): Invoice {
    if (!props.lineItems || props.lineItems.length === 0) {
      throw new Error('An invoice must have at least one line item');
    }

    for (const item of props.lineItems) {
      if (item.tenantId !== props.tenantId) {
        throw new Error('Line item tenantId does not match invoice tenantId');
      }
    }

    return new Invoice({
      id: props.id,
      tenantId: props.tenantId,
      clientId: props.clientId,
      quotationId: props.quotationId,
      createdByUserId: props.createdByUserId,
      status: props.status ?? InvoiceStatus.Draft,
      dueDate: props.dueDate,
      createdAt: props.createdAt ?? new Date(),
      sentAt: props.sentAt ?? null,
      paidAt: props.paidAt ?? null,
      lineItems: props.lineItems,
      clientName: props.clientName,
      clientAssignedUserId: props.clientAssignedUserId
    });
  }

  send(): void {
    if (this.status !== InvoiceStatus.Draft) {
      throw new Error(`Invalid state transition from ${this.status} to Sent`);
    }
    this.status = InvoiceStatus.Sent;
    this.sentAt = new Date();
  }

  /**
   * A payment closes either a still-on-time invoice or one that has already
   * lapsed into Overdue — the money is what matters, not whether it arrived
   * before or after the due date.
   */
  markPaid(): void {
    if (this.status !== InvoiceStatus.Sent && this.status !== InvoiceStatus.Overdue) {
      throw new Error(`Invalid state transition from ${this.status} to Paid`);
    }
    this.status = InvoiceStatus.Paid;
    this.paidAt = new Date();
  }

  /**
   * System-only transition — no acting user, mirrors `Quotation.expire()`.
   * Only a Sent invoice can lapse; Draft was never issued and Paid/Void are
   * already terminal.
   */
  markOverdue(): void {
    if (this.status !== InvoiceStatus.Sent) {
      throw new Error(`Invalid state transition from ${this.status} to Overdue`);
    }
    this.status = InvoiceStatus.Overdue;
  }

  void(): void {
    if (
      this.status !== InvoiceStatus.Draft &&
      this.status !== InvoiceStatus.Sent &&
      this.status !== InvoiceStatus.Overdue
    ) {
      throw new Error(`Invalid state transition from ${this.status} to Void`);
    }
    this.status = InvoiceStatus.Void;
  }
}

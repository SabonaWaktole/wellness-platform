import { QuotationLineItem } from './QuotationLineItem';

export enum QuotationStatus {
  Draft = 'DRAFT',
  PendingApproval = 'PENDING_APPROVAL',
  Sent = 'SENT',
  Accepted = 'ACCEPTED',
  Rejected = 'REJECTED',
  Expired = 'EXPIRED'
}

export class Quotation {
  id: string;
  tenantId: string;
  clientId: string;
  createdByUserId: string;
  status: QuotationStatus;
  createdAt: Date;
  sentAt: Date | null;
  respondedAt: Date | null;
  lineItems: QuotationLineItem[];

  /**
   * Display name of the client, hydrated from the joined Client row on read.
   * Not persisted from here — the quotation owns `clientId`, nothing more.
   * Undefined on entities built by a write path that never loaded the join.
   */
  clientName?: string;

  /**
   * The company's responsible salesperson, hydrated from the joined Client row
   * on read and never persisted from here. Data scope reads it: a quotation
   * belongs to whoever its company belongs to (FR-RBAC-11).
   */
  clientAssignedUserId?: string | null;

  /**
   * Capability token for the customer-facing view.
   *
   * Private with a getter because there is exactly one legitimate way to set
   * it — `issueShareToken`, on the transition to Sent — and a public field
   * would let any caller mint or overwrite a link that is already in a
   * customer's inbox.
   */
  private _shareToken: string | null;
  private _shareTokenIssuedAt: Date | null;

  private constructor(props: {
    id: string;
    tenantId: string;
    clientId: string;
    createdByUserId: string;
    status: QuotationStatus;
    createdAt: Date;
    sentAt: Date | null;
    respondedAt: Date | null;
    lineItems: QuotationLineItem[];
    clientName?: string;
    clientAssignedUserId?: string | null;
    shareToken?: string | null;
    shareTokenIssuedAt?: Date | null;
  }) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.clientId = props.clientId;
    this.createdByUserId = props.createdByUserId;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.sentAt = props.sentAt;
    this.respondedAt = props.respondedAt;
    this.lineItems = props.lineItems;
    this.clientName = props.clientName;
    this.clientAssignedUserId = props.clientAssignedUserId;
    this._shareToken = props.shareToken ?? null;
    this._shareTokenIssuedAt = props.shareTokenIssuedAt ?? null;
  }

  /**
   * Explicit serialization for the HTTP layer.
   *
   * Without this, `res.json(quotation)` drops everything behind a getter —
   * `subtotal` most importantly — and leaks the `_shareToken` field name. The
   * money total is exposed as `grandTotal` because that is what the clients
   * read; there is no tax or discount stage, so it equals the subtotal.
   */
  toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      clientId: this.clientId,
      clientName: this.clientName,
      createdByUserId: this.createdByUserId,
      status: this.status,
      createdAt: this.createdAt,
      sentAt: this.sentAt,
      respondedAt: this.respondedAt,
      lineItems: this.lineItems,
      subtotal: this.subtotal,
      grandTotal: this.subtotal,
      shareToken: this._shareToken,
      shareTokenIssuedAt: this._shareTokenIssuedAt,
    };
  }

  get shareToken(): string | null {
    return this._shareToken;
  }

  get shareTokenIssuedAt(): Date | null {
    return this._shareTokenIssuedAt;
  }

  /**
   * Mint the customer link, once.
   *
   * Called by the use cases that put a quotation into Sent — whether directly
   * from Draft or via approval — so both routes to "the customer can see this"
   * produce a link, and neither has to remember to.
   *
   * Two guards, both load-bearing:
   *
   *  - **Only when Sent.** A token on a draft would make an unfinished
   *    quotation publicly readable by anyone holding the URL.
   *  - **Never reissued.** Both routes into Sent call this unconditionally, so
   *    the second call has to be a no-op: a customer may already hold the first
   *    link, and silently replacing it would break a URL they were told to use.
   *    The link resolves to current state rather than to a snapshot, so keeping
   *    it costs nothing in accuracy.
   *
   * Note there is no Sent → Draft transition to worry about — `returnToDraft`
   * only accepts Pending Approval, which never had a token in the first place.
   */
  issueShareToken(token: string): void {
    if (this.status !== QuotationStatus.Sent) return;
    if (this._shareToken !== null) return;
    this._shareToken = token;
    this._shareTokenIssuedAt = new Date();
  }

  get subtotal(): number {
    return this.lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  }

  static create(props: {
    id: string;
    tenantId: string;
    clientId: string;
    createdByUserId: string;
    lineItems: QuotationLineItem[];
    status?: QuotationStatus;
    createdAt?: Date;
    sentAt?: Date | null;
    respondedAt?: Date | null;
    clientName?: string;
    clientAssignedUserId?: string | null;
    shareToken?: string | null;
    shareTokenIssuedAt?: Date | null;
  }): Quotation {
    if (!props.lineItems || props.lineItems.length === 0) {
      throw new Error('A quotation must have at least one line item');
    }

    for (const item of props.lineItems) {
      if (item.tenantId !== props.tenantId) {
        throw new Error('Line item tenantId does not match quotation tenantId');
      }
    }

    return new Quotation({
      id: props.id,
      tenantId: props.tenantId,
      clientId: props.clientId,
      createdByUserId: props.createdByUserId,
      status: props.status ?? QuotationStatus.Draft,
      createdAt: props.createdAt ?? new Date(),
      sentAt: props.sentAt ?? null,
      respondedAt: props.respondedAt ?? null,
      lineItems: props.lineItems,
      clientName: props.clientName,
      clientAssignedUserId: props.clientAssignedUserId,
      shareToken: props.shareToken ?? null,
      shareTokenIssuedAt: props.shareTokenIssuedAt ?? null
    });
  }

  submit(options: { requiresApproval: boolean }) {
    if (this.status !== QuotationStatus.Draft) {
      throw new Error(`Invalid state transition from ${this.status} to Submit`);
    }

    if (options.requiresApproval) {
      this.status = QuotationStatus.PendingApproval;
      this.sentAt = null;
    } else {
      this.status = QuotationStatus.Sent;
      this.sentAt = new Date();
    }
  }

  approve() {
    if (this.status !== QuotationStatus.PendingApproval) {
      throw new Error(`Invalid state transition from ${this.status} to Approve`);
    }
    this.status = QuotationStatus.Sent;
    this.sentAt = new Date();
  }

  returnToDraft() {
    if (this.status !== QuotationStatus.PendingApproval) {
      throw new Error(`Invalid state transition from ${this.status} to Draft`);
    }
    this.status = QuotationStatus.Draft;
  }

  accept() {
    if (this.status !== QuotationStatus.Sent) {
      throw new Error(`Invalid state transition from ${this.status} to Accepted`);
    }
    this.status = QuotationStatus.Accepted;
    this.respondedAt = new Date();
  }

  reject() {
    if (this.status !== QuotationStatus.Sent) {
      throw new Error(`Invalid state transition from ${this.status} to Rejected`);
    }
    this.status = QuotationStatus.Rejected;
    this.respondedAt = new Date();
  }

  expire() {
    if (this.status !== QuotationStatus.Sent) {
      throw new Error(`Invalid state transition from ${this.status} to Expired`);
    }
    this.status = QuotationStatus.Expired;
  }

  /**
   * Puts a Rejected quotation back in front of the client, after staff has
   * revised it (`UpdateQuotationUseCase`, which is also what allows editing a
   * Rejected quotation's line items at all — Draft is not the only editable
   * status).
   *
   * `respondedAt` resets to null: it means "the client's answer to what they
   * are looking at now", and a Rejected verdict on the old pricing has nothing
   * to say about the revised offer. `sentAt` moves forward for the same
   * reason. `shareToken` is untouched — `issueShareToken`'s own "never
   * reissued" guard already means the customer's original link keeps
   * resolving to whatever is current, which is exactly what a revision needs.
   */
  resend() {
    if (this.status !== QuotationStatus.Rejected) {
      throw new Error(`Invalid state transition from ${this.status} to Sent`);
    }
    this.status = QuotationStatus.Sent;
    this.sentAt = new Date();
    this.respondedAt = null;
  }
}

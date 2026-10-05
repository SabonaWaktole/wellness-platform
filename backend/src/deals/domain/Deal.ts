import { DealStage, isDealStage, isOpenStage, stageRank } from './DealStage';
import { DealType, isDealType } from './DealType';
import { DealNotWinnableError, DealStageNotAllowedError, InvalidDealError } from './errors';

const TITLE_MAX = 200;
const NOTES_MAX = 5000;

export interface DealProps {
  id: string;
  tenantId: string;
  clientId: string;
  ownerUserId: string;
  type: DealType;
  /** NULL means the default "<company> – <type>", rendered in the reader's language. */
  title: string | null;
  stage: DealStage;
  expectedCloseDate: Date | null;
  notes: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  deletedAt: Date | null;
  /** The result of a closed deal (Slice 13). Cleared by reopening; the history note keeps them. */
  wonAt: Date | null;
  lostAt: Date | null;
  lostReasonId: string | null;
  lostNote: string | null;
  /** Two-decimal strings copied from the won offer (FR-DEAL-14), never typed. */
  agreedMonthlyPrice: string | null;
  agreedAnnualValue: string | null;
  packageId: string | null;
  wonQuotationId: string | null;
  /** The contract a Renewal deal renews (M3 FR-REN-06); null on every other deal. */
  renewalOfContractId: string | null;
}

/**
 * What a deal needs to know of an offer to be won with it (FR-DEAL-14).
 * The offer's use case builds it from the stored offer, so the price comes
 * from the offer and cannot be passed in.
 */
export interface WinningOffer {
  id: string;
  dealId: string;
  /** The status key: READY, SENT or ACCEPTED qualify. */
  status: string;
  /** True once a later version replaces it. */
  superseded: boolean;
  hasPendingApproval: boolean;
  netMonthlyPrice: string | null;
  annualValue: string | null;
  packageId: string | null;
}

const WINNING_STATUSES = ['READY', 'SENT', 'ACCEPTED'];
const LOST_NOTE_MAX = 2000;
const COMMENT_MAX = 2000;

/** One row of the stage history (FR-DEAL-09). `changedByUserId` null means the platform moved the deal. */
export interface DealStageChange {
  id: string;
  dealId: string;
  fromStage: DealStage | null;
  toStage: DealStage;
  changedByUserId: string | null;
  at: Date;
  /** Reopening keeps the previous result here (FR-DEAL-17). */
  note?: string | null;
}

export interface OpenDealInput {
  id: string;
  tenantId: string;
  clientId: string;
  ownerUserId: string;
  createdByUserId: string;
  type: DealType;
  title: string | null;
  expectedCloseDate: Date | null;
  notes: string | null;
  now: Date;
  newId: () => string;
}

export interface DealEdit {
  type?: DealType;
  title?: string | null;
  expectedCloseDate?: Date | null;
  notes?: string | null;
}

/**
 * A sales opportunity with a company (FR-DEAL-01) and the rules for moving it
 * through the pipeline. Every stage change returns the history row it
 * produces (FR-DEAL-09), which the use case saves with the deal in one
 * transaction; a call that changes nothing returns null.
 */
export class Deal {
  private constructor(private props: DealProps) {}

  /** A new deal, in New Lead, with its first history row. */
  static open(input: OpenDealInput): { deal: Deal; change: DealStageChange } {
    const deal = new Deal({
      id: input.id,
      tenantId: input.tenantId,
      clientId: input.clientId,
      ownerUserId: input.ownerUserId,
      type: validType(input.type),
      title: cleanTitle(input.title),
      stage: DealStage.NewLead,
      expectedCloseDate: input.expectedCloseDate,
      notes: cleanNotes(input.notes),
      createdByUserId: input.createdByUserId,
      createdAt: input.now,
      updatedAt: input.now,
      closedAt: null,
      deletedAt: null,
      wonAt: null,
      lostAt: null,
      lostReasonId: null,
      lostNote: null,
      agreedMonthlyPrice: null,
      agreedAnnualValue: null,
      packageId: null,
      wonQuotationId: null,
      renewalOfContractId: null,
    });
    const change: DealStageChange = {
      id: input.newId(),
      dealId: input.id,
      fromStage: null,
      toStage: DealStage.NewLead,
      changedByUserId: input.createdByUserId,
      at: input.now,
    };
    return { deal, change };
  }

  /**
   * A Renewal deal started from a contract (M3 FR-REN-06). It begins in
   * Interested, not New Lead: the company is already a client, so there is
   * nothing to qualify. Its first history row says who started it and why.
   */
  static openRenewal(input: Omit<OpenDealInput, 'type' | 'title'> & { renewalOfContractId: string; note: string }): {
    deal: Deal;
    change: DealStageChange;
  } {
    const { deal } = Deal.open({ ...input, type: DealType.Renewal, title: null });
    deal.props.stage = DealStage.Interested;
    deal.props.renewalOfContractId = input.renewalOfContractId;
    const change: DealStageChange = {
      id: input.newId(),
      dealId: input.id,
      fromStage: null,
      toStage: DealStage.Interested,
      changedByUserId: input.createdByUserId,
      at: input.now,
      note: input.note,
    };
    return { deal, change };
  }

  /** A deal as stored. No validation: what is stored was valid when written. */
  static rebuild(props: DealProps): Deal {
    return new Deal({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get clientId(): string {
    return this.props.clientId;
  }
  get ownerUserId(): string {
    return this.props.ownerUserId;
  }
  get type(): DealType {
    return this.props.type;
  }
  get title(): string | null {
    return this.props.title;
  }
  get renewalOfContractId(): string | null {
    return this.props.renewalOfContractId;
  }
  get stage(): DealStage {
    return this.props.stage;
  }
  get expectedCloseDate(): Date | null {
    return this.props.expectedCloseDate;
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
  get closedAt(): Date | null {
    return this.props.closedAt;
  }
  get isOpen(): boolean {
    return isOpenStage(this.props.stage);
  }

  /**
   * The salesperson's move (FR-DEAL-07): any open stage to any other, forwards
   * or backwards (Q10). Won and Lost are reached only through the win and
   * lose actions, and a closed deal only through reopening (Slice 13).
   */
  moveTo(target: DealStage, userId: string, now: Date, newId: () => string): DealStageChange | null {
    if (!isDealStage(target)) {
      throw new InvalidDealError('stage', 'Unknown stage.');
    }
    if (!isOpenStage(target)) {
      throw new DealStageNotAllowedError('Won and Lost are reached through the win and lose actions.');
    }
    if (!this.isOpen) {
      throw new DealStageNotAllowedError('A closed deal cannot be moved. Reopen it first.');
    }
    return this.changeStage(target, userId, now, newId);
  }

  /**
   * The platform's move (FR-DEAL-08), for the first activity, the first
   * offer, a sent offer and a follow-up. Only forwards, only between open
   * stages: it never moves a deal back, out of Won or Lost, or into them.
   */
  advanceAutomatically(target: DealStage, now: Date, newId: () => string): DealStageChange | null {
    if (!this.isOpen || !isOpenStage(target) || stageRank(target) <= stageRank(this.props.stage)) {
      return null;
    }
    return this.changeStage(target, null, now, newId);
  }

  /**
   * FR-DEAL-14: wins the deal with one of its offers. The offer must be this
   * deal's latest version, Ready, Sent or Accepted, with no approval waiting.
   * The agreed price, annual value and package are read from the offer.
   */
  win(offer: WinningOffer, closingDate: Date, userId: string, now: Date, newId: () => string): DealStageChange {
    if (!this.isOpen) throw new DealStageNotAllowedError('A closed deal cannot be won. Reopen it first.');
    if (offer.dealId !== this.props.id) throw new DealNotWinnableError('That offer belongs to another deal.');
    if (offer.superseded) throw new DealNotWinnableError('Only the latest version of the offer can win the deal.');
    if (offer.hasPendingApproval) throw new DealNotWinnableError('The offer has an approval waiting.');
    if (!WINNING_STATUSES.includes(offer.status)) {
      throw new DealNotWinnableError('Win the deal with an offer that is ready, sent or accepted.');
    }
    if (offer.netMonthlyPrice === null || offer.annualValue === null) {
      throw new DealNotWinnableError('The offer has no price yet.');
    }
    const change = this.changeStage(DealStage.Won, userId, now, newId)!;
    this.props.wonAt = closingDate;
    this.props.closedAt = closingDate;
    this.props.agreedMonthlyPrice = offer.netMonthlyPrice;
    this.props.agreedAnnualValue = offer.annualValue;
    this.props.packageId = offer.packageId;
    this.props.wonQuotationId = offer.id;
    return change;
  }

  /** FR-DEAL-16: loses the deal for one of the active lost reasons, which the use case checks. */
  lose(reasonId: string, note: string | null, closingDate: Date, userId: string, now: Date, newId: () => string): DealStageChange {
    if (!this.isOpen) throw new DealStageNotAllowedError('A closed deal cannot be lost. Reopen it first.');
    if (!reasonId?.trim()) throw new InvalidDealError('lostReasonId', 'Choose why the deal was lost.');
    const cleaned = note?.trim() ?? '';
    if (cleaned.length > LOST_NOTE_MAX) {
      throw new InvalidDealError('lostNote', `The note can be at most ${LOST_NOTE_MAX} characters.`);
    }
    const change = this.changeStage(DealStage.Lost, userId, now, newId)!;
    this.props.lostAt = closingDate;
    this.props.closedAt = closingDate;
    this.props.lostReasonId = reasonId;
    this.props.lostNote = cleaned || null;
    return change;
  }

  /**
   * FR-DEAL-17: a won or lost deal goes back to an open stage. The result
   * fields are cleared and kept in the history row's note, with who and why.
   */
  reopen(target: DealStage, comment: string, userId: string, now: Date, newId: () => string): DealStageChange {
    if (this.isOpen) throw new DealStageNotAllowedError('Only a won or lost deal can be reopened.');
    if (!isDealStage(target) || !isOpenStage(target)) {
      throw new InvalidDealError('stage', 'Reopen the deal into an open stage.');
    }
    const cleaned = comment?.trim() ?? '';
    if (!cleaned) throw new InvalidDealError('comment', 'Say why the deal is reopened.');
    if (cleaned.length > COMMENT_MAX) throw new InvalidDealError('comment', `The comment can be at most ${COMMENT_MAX} characters.`);
    const previous = this.props.stage === DealStage.Won
      ? `Won ${this.props.agreedMonthlyPrice ?? '-'}/month, ${this.props.agreedAnnualValue ?? '-'}/year, offer ${this.props.wonQuotationId ?? '-'}`
      : `Lost reason ${this.props.lostReasonId ?? '-'}${this.props.lostNote ? `: ${this.props.lostNote}` : ''}`;
    const change = this.changeStage(target, userId, now, newId)!;
    change.note = `${cleaned} (was: ${previous})`;
    this.props.closedAt = null;
    this.props.wonAt = null;
    this.props.lostAt = null;
    this.props.lostReasonId = null;
    this.props.lostNote = null;
    this.props.agreedMonthlyPrice = null;
    this.props.agreedAnnualValue = null;
    this.props.packageId = null;
    this.props.wonQuotationId = null;
    return change;
  }

  /** Hands the deal to another salesperson (FR-DEAL-05). Returns the previous one. */
  reassign(ownerUserId: string, now: Date): string {
    const previous = this.props.ownerUserId;
    this.props.ownerUserId = ownerUserId;
    this.props.updatedAt = now;
    return previous;
  }

  edit(fields: DealEdit, now: Date): void {
    if (fields.type !== undefined) this.props.type = validType(fields.type);
    if (fields.title !== undefined) this.props.title = cleanTitle(fields.title);
    if (fields.expectedCloseDate !== undefined) this.props.expectedCloseDate = fields.expectedCloseDate;
    if (fields.notes !== undefined) this.props.notes = cleanNotes(fields.notes);
    this.props.updatedAt = now;
  }

  /** FR-DEAL-19. The row stays, so its stage history and audit entries keep their subject. */
  softDelete(now: Date): void {
    this.props.deletedAt = now;
    this.props.updatedAt = now;
  }

  toProps(): DealProps {
    return { ...this.props };
  }

  private changeStage(target: DealStage, userId: string | null, now: Date, newId: () => string): DealStageChange | null {
    if (target === this.props.stage) return null;
    const change: DealStageChange = {
      id: newId(),
      dealId: this.props.id,
      fromStage: this.props.stage,
      toStage: target,
      changedByUserId: userId,
      at: now,
    };
    this.props.stage = target;
    this.props.updatedAt = now;
    return change;
  }
}

function validType(type: string): DealType {
  if (!isDealType(type)) {
    throw new InvalidDealError('type', 'Choose New contract, Renewal or Extra services.');
  }
  return type;
}

function cleanTitle(title: string | null | undefined): string | null {
  const trimmed = title?.trim() ?? '';
  if (trimmed.length > TITLE_MAX) {
    throw new InvalidDealError('title', `The title can be at most ${TITLE_MAX} characters.`);
  }
  return trimmed || null;
}

function cleanNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim() ?? '';
  if (trimmed.length > NOTES_MAX) {
    throw new InvalidDealError('notes', `The notes can be at most ${NOTES_MAX} characters.`);
  }
  return trimmed || null;
}

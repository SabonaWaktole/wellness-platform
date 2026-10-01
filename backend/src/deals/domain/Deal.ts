import { DealStage, isDealStage, isOpenStage, stageRank } from './DealStage';
import { DealType, isDealType } from './DealType';
import { DealStageNotAllowedError, InvalidDealError } from './errors';

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
}

/** One row of the stage history (FR-DEAL-09). `changedByUserId` null means the platform moved the deal. */
export interface DealStageChange {
  id: string;
  dealId: string;
  fromStage: DealStage | null;
  toStage: DealStage;
  changedByUserId: string | null;
  at: Date;
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

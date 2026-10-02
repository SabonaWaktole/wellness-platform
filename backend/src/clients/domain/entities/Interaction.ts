import { InteractionChannel } from '../enums/InteractionChannel';
import { OutcomeCategory } from './OutcomeCategory';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { InvalidActivityError } from '../errors';

/** How far ahead of the server an activity's time may be: the sender's clock, not the future (FR-ACT-02). */
const CLOCK_SKEW_MS = 60 * 1000;

/** FR-ACT-06: the author edits their own activity for this long. */
export const AUTHOR_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface InteractionProps {
  id: string;
  tenantId: string;
  clientId: string;
  authorUserId: string;
  content: string;
  channel: InteractionChannel;
  /** The M1 outcome; read only. Results come from `resultId` since M2 Slice 7 (D5). */
  outcomeCategory?: OutcomeCategory | null;
  createdAt: Date;
  /** NULL only on a row the Slice 7 migration has not reached; read as `createdAt` (FR-ACT-07). */
  occurredAt?: Date | null;
  contactPersonId?: string | null;
  dealId?: string | null;
  resultId?: string | null;
  clientFeedback?: string | null;
  nextAction?: string | null;
  updatedAt?: Date | null;
  updatedByUserId?: string | null;
}

/** What the user enters for an activity, on create and on edit (FR-ACT-01, 02). */
export interface ActivityDetails {
  channel: InteractionChannel;
  content?: string | null;
  /** Defaults to now. */
  occurredAt?: Date | null;
  contactPersonId?: string | null;
  dealId?: string | null;
  resultId?: string | null;
  clientFeedback?: string | null;
  nextAction?: string | null;
}

const text = (value: string | null | undefined): string | null => value?.trim() || null;

/**
 * A recorded activity: a call, email, visit, meeting, online meeting or note
 * on a company (FR-ACT-01). Immutable; `edit` returns the edited copy.
 */
export class Interaction {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly clientId: string;
  public readonly authorUserId: string;
  public readonly content: string;
  public readonly channel: InteractionChannel;
  public readonly outcomeCategory?: OutcomeCategory | null;
  public readonly createdAt: Date;
  public readonly occurredAt: Date;
  public readonly contactPersonId: string | null;
  public readonly dealId: string | null;
  public readonly resultId: string | null;
  public readonly clientFeedback: string | null;
  public readonly nextAction: string | null;
  public readonly updatedAt: Date | null;
  public readonly updatedByUserId: string | null;

  private constructor(props: InteractionProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.clientId = props.clientId;
    this.authorUserId = props.authorUserId;
    this.content = props.content;
    this.channel = props.channel;
    this.outcomeCategory = props.outcomeCategory;
    this.createdAt = props.createdAt;
    this.occurredAt = props.occurredAt ?? props.createdAt;
    this.contactPersonId = props.contactPersonId ?? null;
    this.dealId = props.dealId ?? null;
    this.resultId = props.resultId ?? null;
    this.clientFeedback = props.clientFeedback ?? null;
    this.nextAction = props.nextAction ?? null;
    this.updatedAt = props.updatedAt ?? null;
    this.updatedByUserId = props.updatedByUserId ?? null;
  }

  /** Rebuilds a stored interaction. New activities go through `record`. */
  public static create(props: InteractionProps): Interaction {
    if (props.outcomeCategory) {
      if (props.outcomeCategory.tenantId !== props.tenantId) {
        throw new DomainError('Outcome category does not belong to this tenant.');
      }
    }

    return new Interaction(props);
  }

  /** A new activity, checked against FR-ACT-02. */
  public static record(
    input: ActivityDetails & { id: string; tenantId: string; clientId: string; authorUserId: string },
    now: Date
  ): Interaction {
    return new Interaction({
      id: input.id,
      tenantId: input.tenantId,
      clientId: input.clientId,
      authorUserId: input.authorUserId,
      createdAt: now,
      ...Interaction.checked(input, now),
    });
  }

  get isNote(): boolean {
    return this.channel === InteractionChannel.NOTE;
  }

  /** FR-ACT-06: whether the author's own edit window is still open at `now`. */
  authorMayStillEdit(now: Date): boolean {
    return now.getTime() - this.createdAt.getTime() < AUTHOR_EDIT_WINDOW_MS;
  }

  /**
   * The activity with `details` in place of what the user entered. Who
   * recorded it and when stay; a note stays a note and an activity stays an
   * activity, since the two sit behind different permissions (D3).
   */
  edit(details: ActivityDetails, byUserId: string, now: Date): Interaction {
    if ((details.channel === InteractionChannel.NOTE) !== this.isNote) {
      throw new InvalidActivityError('channel', 'A note cannot become an activity, or an activity a note.');
    }
    return new Interaction({
      ...this.props(),
      ...Interaction.checked({ ...details, occurredAt: details.occurredAt ?? this.occurredAt }, now),
      updatedAt: now,
      updatedByUserId: byUserId,
    });
  }

  private props(): InteractionProps {
    return { ...this };
  }

  private static checked(details: ActivityDetails, now: Date) {
    const content = details.content?.trim() ?? '';
    const occurredAt = details.occurredAt ?? now;
    if (occurredAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
      throw new InvalidActivityError('occurredAt', 'An activity cannot be in the future.');
    }
    if (details.channel === InteractionChannel.NOTE) {
      if (!content) throw new InvalidActivityError('content', 'Write the note.');
    } else {
      if (!details.contactPersonId) throw new InvalidActivityError('contactPersonId', 'Choose the contact person.');
      if (!details.resultId) throw new InvalidActivityError('resultId', 'Choose a result.');
    }
    return {
      channel: details.channel,
      content,
      occurredAt,
      contactPersonId: details.contactPersonId ?? null,
      dealId: details.dealId ?? null,
      resultId: details.resultId ?? null,
      clientFeedback: text(details.clientFeedback),
      nextAction: text(details.nextAction),
    };
  }
}

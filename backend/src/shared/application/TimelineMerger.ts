import { Interaction } from '../../clients/domain/entities/Interaction';
import { Appointment } from '../../appointments/domain/entities/Appointment';
import { Client } from '../../clients/domain/entities/Client';
import { InvalidTimelineCursorError, TimelineCategory, TimelineEntry } from './timeline/TimelineEntry';

export interface TimelineMergerOptions {
  limit?: number;
}

export interface TimelinePageOptions {
  /** Empty or omitted means every category. */
  types?: readonly TimelineCategory[];
  /** From a previous page's `nextCursor`. */
  cursor?: string;
  limit: number;
}

export interface TimelinePage {
  entries: TimelineEntry[];
  nextCursor: string | null;
}

export class TimelineMerger {
  /**
   * One page of a company's timeline, ordered by (timestamp, id) descending.
   * The id tie-break makes the order total, so a cursor taken from the last
   * entry of a page never skips or repeats an entry with the same timestamp.
   */
  static page(entries: readonly TimelineEntry[], options: TimelinePageOptions): TimelinePage {
    const types = options.types && options.types.length > 0 ? new Set(options.types) : null;
    const after = options.cursor ? decodeCursor(options.cursor) : null;

    const sorted = entries
      .filter((entry) => !types || types.has(entry.category))
      .sort(compareNewestFirst)
      .filter((entry) => !after || compareNewestFirst(entry, after) > 0);

    const page = sorted.slice(0, options.limit);
    const last = page[page.length - 1];
    return {
      entries: page,
      nextCursor: sorted.length > options.limit && last ? encodeCursor(last) : null,
    };
  }

  static merge(
    interactions: Interaction[],
    appointments: Appointment[],
    clients: Client[] = [],
    options: TimelineMergerOptions = {}
  ): any[] {
    const interactionTimeline = interactions.map(interaction => ({
      id: interaction.id,
      timestamp: interaction.createdAt.toISOString(),
      type: 'INTERACTION_ADDED',
      description: `Interaction (${interaction.channel})`,
      actor: interaction.authorUserId,
      details: {
        channel: interaction.channel,
        content: interaction.content,
        outcomeCategoryId: interaction.outcomeCategory?.id || null,
      },
    }));

    const appointmentTimeline = appointments.map(appointment => ({
      id: appointment.id,
      timestamp: appointment.updatedAt.toISOString(), // Use updatedAt so recent changes float to the top
      type: `APPOINTMENT_${appointment.status}`,
      statusLabel: appointment.status,
      description: `Appointment (${appointment.status})`,
      actor: appointment.assignedUserId,
      details: {
        scheduledAt: appointment.scheduledAt.toISOString(),
        notes: appointment.notes,
        status: appointment.status,
      },
    }));

    const clientTimeline = clients.map(client => ({
      id: client.id,
      timestamp: client.createdAt.toISOString(),
      type: 'CLIENT_CREATED',
      description: 'Client Added',
      actor: client.assignedUserId || 'system',
      details: {
        name: client.name,
        status: client.status,
      },
    }));

    const timeline = [...interactionTimeline, ...appointmentTimeline, ...clientTimeline];

    // Sort descending by timestamp
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options.limit && options.limit > 0) {
      return timeline.slice(0, options.limit);
    }

    return timeline;
  }
}

type CursorPoint = Pick<TimelineEntry, 'timestamp' | 'id'>;

/** Negative when `a` comes first (is newer, or equally new with the larger id). */
function compareNewestFirst(a: CursorPoint, b: CursorPoint): number {
  const byTime = Date.parse(b.timestamp) - Date.parse(a.timestamp);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

function encodeCursor(entry: CursorPoint): string {
  return Buffer.from(`${entry.timestamp}|${entry.id}`).toString('base64url');
}

function decodeCursor(cursor: string): CursorPoint {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const separator = decoded.indexOf('|');
  const timestamp = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (separator <= 0 || !id || Number.isNaN(Date.parse(timestamp))) {
    throw new InvalidTimelineCursorError();
  }
  return { timestamp, id };
}

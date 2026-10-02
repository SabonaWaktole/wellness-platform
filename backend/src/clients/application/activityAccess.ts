import { AccessContext } from '../../access/domain/AccessContext';
import { InteractionChannel } from '../domain/enums/InteractionChannel';

/** Recording and reading notes (D3). Scoped, on the company's salesperson. */
export const ADD_NOTES = 'notes.add';
export const VIEW_NOTES = 'notes.view';

/** Recording and reading every other activity type (D3). Scoped, on the company's salesperson. */
export const ADD_ACTIVITIES = 'activities.add';
export const VIEW_ACTIVITIES = 'activities.view';

/** D3: a note needs `notes.add`, every other type `activities.add`. */
export function addKeyFor(channel: InteractionChannel): string {
  return channel === InteractionChannel.NOTE ? ADD_NOTES : ADD_ACTIVITIES;
}

/** D3: notes and every other type are separate permissions. */
export function visibleChannels(access: AccessContext): InteractionChannel[] {
  const channels: InteractionChannel[] = [];
  if (access.can(VIEW_NOTES)) channels.push(InteractionChannel.NOTE);
  if (access.can(VIEW_ACTIVITIES)) {
    channels.push(...Object.values(InteractionChannel).filter((channel) => channel !== InteractionChannel.NOTE));
  }
  return channels;
}

import type { User } from '../store/useAuthStore';

export const getUserDisplayName = (user: User | null, fallback = 'User'): string => {
  if (!user) return fallback;
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName.charAt(0)}.`;
  }
  if (user.firstName) return user.firstName;
  if (user.lastName) return user.lastName;
  return user.userId ? `User ${user.userId.substring(0, 8)}` : fallback;
};

/** The subset needed to render a person; matches StaffMember from useTeam. */
export interface DisplayablePerson {
  id: string;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Render a staff member as a name.
 *
 * Falls back to email, then to a short id — never the bare UUID, which is what
 * the client list and detail views were showing where an assignee name belongs.
 */
export const getStaffDisplayName = (person: DisplayablePerson | null | undefined): string => {
  if (!person) return 'Unassigned';
  const full = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (person.email) return person.email;
  return `User ${person.id.substring(0, 8)}`;
};

/** Two-character avatar fallback derived from the same source as the name. */
export const getStaffInitials = (person: DisplayablePerson | null | undefined): string => {
  if (!person) return 'UN';
  if (person.firstName || person.lastName) {
    const first = person.firstName?.charAt(0) ?? '';
    const last = person.lastName?.charAt(0) ?? '';
    const initials = `${first}${last}`.trim();
    if (initials) return initials.toUpperCase();
  }
  if (person.email) return person.email.substring(0, 2).toUpperCase();
  return 'UN';
};

/**
 * Look up an assignee by id. Returns undefined when the id is null (unassigned)
 * or the user is no longer in the tenant's staff list.
 */
export const findPersonById = <T extends { id: string }>(
  people: T[] | undefined,
  id: string | null | undefined
): T | undefined => (id ? people?.find(p => p.id === id) : undefined);

export const getUserFirstName = (user: User | null, fallback = 'User'): string => {
  if (!user) return fallback;
  if (user.firstName) return user.firstName;
  return fallback;
};
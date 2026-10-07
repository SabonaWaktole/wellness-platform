/** Test helpers: a workspace day from an ISO date, and back. */
export const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
export const iso = (d: Date): string => d.toISOString().slice(0, 10);

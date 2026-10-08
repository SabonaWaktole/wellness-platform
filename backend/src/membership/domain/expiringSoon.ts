import { daysBetween } from '../../contracts/domain/calendarDay';

/** FR-TIR-10: a term ending today up to `windowDays` from today is Expiring soon. */
export const expiringSoon = (endsOn: Date | null, today: Date, windowDays: number): boolean => {
  if (endsOn === null) return false;
  const daysLeft = daysBetween(today, endsOn);
  return daysLeft >= 0 && daysLeft <= windowDays;
};

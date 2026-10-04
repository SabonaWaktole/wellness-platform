import { followUpDue, followUpOn } from '../../../../src/appointments/domain/followUps/FollowUpSchedule';
import { InvalidFollowUpError } from '../../../../src/appointments/domain/followUps/errors';

const TIRANE = 'Europe/Tirane';

describe('FollowUpSchedule (M2 Slice 11)', () => {
  it('FR-FUP-01 "+3 days" on Monday 5 October is due on Thursday 8 October at 09:00, Europe/Tirane', () => {
    const monday = new Date('2026-10-05T10:15:00Z');
    // October is summer time in Tirana (UTC+2), so 09:00 there is 07:00 UTC.
    expect(followUpDue(monday, 3, TIRANE).toISOString()).toBe('2026-10-08T07:00:00.000Z');
  });

  it('FR-FUP-03 "+3 days" on a Thursday gives the following Monday', () => {
    const thursday = new Date('2026-10-08T12:00:00Z');
    expect(followUpDue(thursday, 3, TIRANE).toISOString()).toBe('2026-10-12T07:00:00.000Z');
  });

  it('FR-FUP-03 a due date on a Saturday also moves to the Monday', () => {
    const wednesday = new Date('2026-10-07T12:00:00Z');
    expect(followUpDue(wednesday, 3, TIRANE).toISOString()).toBe('2026-10-12T07:00:00.000Z');
  });

  it('FR-FUP-03 counts calendar days from the workspace day, not the UTC day', () => {
    // 23:30 UTC on Sunday is already 01:30 on Monday 5 October in Tirana.
    const lateSunday = new Date('2026-10-04T23:30:00Z');
    expect(followUpDue(lateSunday, 3, TIRANE).toISOString()).toBe('2026-10-08T07:00:00.000Z');
  });

  it('FR-FUP-01 09:00 stays 09:00 across the change to winter time', () => {
    // Thursday 22 October + 3 = Sunday 25 (the clocks go back) → Monday 26, UTC+1.
    const thursday = new Date('2026-10-22T09:00:00Z');
    expect(followUpDue(thursday, 3, TIRANE).toISOString()).toBe('2026-10-26T08:00:00.000Z');
  });

  it('FR-FUP-02 the default time can be changed', () => {
    const monday = new Date('2026-10-05T10:15:00Z');
    expect(followUpDue(monday, 5, TIRANE, '14:30').toISOString()).toBe('2026-10-12T12:30:00.000Z');
  });

  it('FR-FUP-01 a custom date is kept as chosen, even on a weekend', () => {
    expect(followUpOn('2026-10-10', '09:00', TIRANE).toISOString()).toBe('2026-10-10T07:00:00.000Z');
  });

  it('refuses a malformed date, time or interval', () => {
    expect(() => followUpOn('10/10/2026', '09:00', TIRANE)).toThrow(InvalidFollowUpError);
    expect(() => followUpOn('2026-02-30', '09:00', TIRANE)).toThrow(InvalidFollowUpError);
    expect(() => followUpOn('2026-10-10', '25:00', TIRANE)).toThrow(InvalidFollowUpError);
    expect(() => followUpDue(new Date(), 0, TIRANE)).toThrow(InvalidFollowUpError);
    expect(() => followUpDue(new Date(), 1.5, TIRANE)).toThrow(InvalidFollowUpError);
  });
});

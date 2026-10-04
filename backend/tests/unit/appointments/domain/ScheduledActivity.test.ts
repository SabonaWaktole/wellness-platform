import { ScheduledActivity, ScheduledActivityKind } from '../../../../src/appointments/domain/followUps/ScheduledActivity';
import { FollowUpClosedError, InvalidFollowUpError } from '../../../../src/appointments/domain/followUps/errors';
import { AppointmentStatus } from '../../../../src/appointments/domain/enums/AppointmentStatus';

const NOW = new Date('2026-10-05T08:00:00Z');
const DUE = new Date('2026-10-08T07:00:00Z');

function followUp(overrides: Partial<Parameters<typeof ScheduledActivity.scheduleFollowUp>[0]> = {}) {
  return ScheduledActivity.scheduleFollowUp(
    {
      id: 'fu-1',
      tenantId: 'tenant-1',
      clientId: 'client-1',
      dealId: 'deal-1',
      contactPersonId: null,
      assignedUserId: 'sales-a',
      type: 'CALL',
      dueAt: DUE,
      intervalDays: 3,
      note: '  Send the offer  ',
      ...overrides,
    },
    NOW
  );
}

describe('ScheduledActivity (M2 Slice 11)', () => {
  it('FR-FUP-02 a follow-up has a company, a deal, a type, a due time, a salesperson and a note', () => {
    const scheduled = followUp();
    expect(scheduled.kind).toBe(ScheduledActivityKind.FollowUp);
    expect(scheduled.status).toBe(AppointmentStatus.SCHEDULED);
    expect(scheduled.toProps()).toMatchObject({
      clientId: 'client-1',
      dealId: 'deal-1',
      type: 'CALL',
      scheduledAt: DUE,
      assignedUserId: 'sales-a',
      notes: 'Send the offer',
      intervalDays: 3,
    });
  });

  it('FR-FUP-02 refuses an unknown type, a long note and a due time in the past', () => {
    expect(() => followUp({ type: 'NOTE' as any })).toThrow(InvalidFollowUpError);
    expect(() => followUp({ note: 'x'.repeat(501) })).toThrow(InvalidFollowUpError);
    expect(() => followUp({ dueAt: new Date(NOW.getTime() - 60 * 60 * 1000) })).toThrow(InvalidFollowUpError);
  });

  it('FR-FUP-05 overdue is derived: open and due before now, until it is closed', () => {
    const scheduled = followUp();
    expect(scheduled.isOverdue(new Date('2026-10-08T06:59:00Z'))).toBe(false);
    expect(scheduled.isOverdue(new Date('2026-10-08T07:01:00Z'))).toBe(true);

    scheduled.complete('activity-1', new Date('2026-10-09T08:00:00Z'));
    expect(scheduled.isOverdue(new Date('2026-10-09T08:00:00Z'))).toBe(false);
  });

  it('FR-FUP-06 completing closes it and links the activity; a closed follow-up cannot change', () => {
    const scheduled = followUp();
    scheduled.complete('activity-1', NOW);
    expect(scheduled.status).toBe(AppointmentStatus.COMPLETED);
    expect(scheduled.completedInteractionId).toBe('activity-1');

    expect(() => scheduled.complete('activity-2', NOW)).toThrow(FollowUpClosedError);
    expect(() => scheduled.reschedule(DUE, null, 'sales-a', NOW)).toThrow(FollowUpClosedError);
    expect(() => scheduled.cancel('No longer needed', NOW)).toThrow(FollowUpClosedError);
    expect(() => scheduled.reassign('sales-b', NOW)).toThrow(FollowUpClosedError);
  });

  it('FR-FUP-06 rescheduling keeps the previous date in its history and re-arms the due notification', () => {
    const scheduled = ScheduledActivity.rebuild({ ...followUp().toProps(), dueNotifiedAt: DUE });
    const later = new Date('2026-10-12T07:00:00Z');

    scheduled.reschedule(later, 'Client on holiday', 'sales-a', NOW);

    expect(scheduled.scheduledAt).toEqual(later);
    expect(scheduled.toProps().dueNotifiedAt).toBeNull();
    expect(scheduled.history).toEqual([
      expect.objectContaining({ previousDate: DUE, newDate: later, reason: 'Client on holiday', changedBy: 'sales-a' }),
    ]);
  });

  it('FR-FUP-06 cancelling needs a reason, which is kept', () => {
    const scheduled = followUp();
    expect(() => scheduled.cancel('   ', NOW)).toThrow(InvalidFollowUpError);

    scheduled.cancel('Company closed for the season', NOW);
    expect(scheduled.status).toBe(AppointmentStatus.CANCELLED);
    expect(scheduled.toProps().cancelReason).toBe('Company closed for the season');
  });

  it('FR-FUP-10 reassigning hands it to another salesperson', () => {
    const scheduled = followUp();
    expect(scheduled.reassign('sales-b', NOW)).toBe('sales-a');
    expect(scheduled.assignedUserId).toBe('sales-b');
  });
});

import { AppointmentReminderJob } from './AppointmentReminderJob';
import { ISchedulerQueries, DueAppointment } from '../ISchedulerQueries';
import { NotificationSettings } from '../../notifications/domain/NotificationSettings';

const NOW = new Date('2026-07-28T09:00:00.000Z');

const appointment = (overrides: Partial<DueAppointment> = {}): DueAppointment => ({
  id: 'appt-1',
  tenantId: 'tenant-1',
  assignedUserId: 'user-1',
  scheduledAt: new Date('2026-07-29T09:00:00.000Z'),
  clientName: 'Acme Ltd',
  ...overrides,
});

describe('AppointmentReminderJob', () => {
  let queries: jest.Mocked<ISchedulerQueries>;
  let settingsRepo: { listAll: jest.Mock; get: jest.Mock; save: jest.Mock };
  let notifications: { emitSafe: jest.Mock; emit: jest.Mock };

  beforeEach(() => {
    queries = {
      findAppointmentsDueReminder: jest.fn().mockResolvedValue([]),
      markAppointmentReminded: jest.fn().mockResolvedValue(undefined),
      findQuotationsNeedingFollowUp: jest.fn().mockResolvedValue([]),
      markQuotationFollowedUp: jest.fn().mockResolvedValue(undefined),
      findQuotationsDueExpiry: jest.fn().mockResolvedValue([]),
      listSalesProcessTenants: jest.fn().mockResolvedValue([]),
      findOffersPastValidity: jest.fn().mockResolvedValue([]),
      findInvoicesPastDue: jest.fn().mockResolvedValue([]),
      listTenants: jest.fn().mockResolvedValue([]),
      findContractsPastEnd: jest.fn().mockResolvedValue([]),
      findExpiredAwaitingNotice: jest.fn().mockResolvedValue([]),
      getPaymentGraceDays: jest.fn().mockResolvedValue(0),
      findPaymentsPastDue: jest.fn().mockResolvedValue([]),
      findOverdueAwaitingNotice: jest.fn().mockResolvedValue([]),
      markPaymentOverdueNotified: jest.fn().mockResolvedValue(undefined),
      getReminderLeadDays: jest.fn().mockResolvedValue([60, 30, 7]),
      findContractsForReminder: jest.fn().mockResolvedValue([]),
      recordContractReminders: jest.fn().mockResolvedValue(undefined),
    };
    settingsRepo = {
      listAll: jest.fn().mockResolvedValue([NotificationSettings.defaults('tenant-1')]),
      get: jest.fn(),
      save: jest.fn(),
    };
    notifications = { emitSafe: jest.fn().mockResolvedValue(undefined), emit: jest.fn() };
  });

  const build = () =>
    new AppointmentReminderJob(queries, settingsRepo as any, notifications as any);

  it('notifies the assignee about an upcoming appointment', async () => {
    queries.findAppointmentsDueReminder.mockResolvedValue([appointment()]);

    await build().run(NOW);

    expect(notifications.emitSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        recipientUserIds: ['user-1'],
        type: 'APPOINTMENT_REMINDER',
        entityType: 'APPOINTMENT',
        entityId: 'appt-1',
      })
    );
  });

  it('emits with no actor, so the assignee is not skipped as the cause', async () => {
    // NotificationService drops a recipient who is also the actor. A reminder
    // has no actor, and getting this wrong would silently deliver nothing.
    queries.findAppointmentsDueReminder.mockResolvedValue([appointment()]);

    await build().run(NOW);

    expect(notifications.emitSafe.mock.calls[0][0].actorUserId).toBeNull();
  });

  it('carries the client name and time for the message body', async () => {
    queries.findAppointmentsDueReminder.mockResolvedValue([appointment()]);

    await build().run(NOW);

    expect(notifications.emitSafe.mock.calls[0][0].params).toEqual({
      clientName: 'Acme Ltd',
      scheduledAt: '2026-07-29T09:00:00.000Z',
    });
  });

  it('marks the appointment before notifying, so a crash cannot repeat the send', async () => {
    const order: string[] = [];
    queries.findAppointmentsDueReminder.mockResolvedValue([appointment()]);
    queries.markAppointmentReminded.mockImplementation(async () => {
      order.push('mark');
    });
    notifications.emitSafe.mockImplementation(async () => {
      order.push('notify');
    });

    await build().run(NOW);

    expect(order).toEqual(['mark', 'notify']);
  });

  it('uses the tenant lead time', async () => {
    settingsRepo.listAll.mockResolvedValue([
      NotificationSettings.defaults('tenant-1').withPatch({
        appointmentReminderLeadMinutes: 60,
      }),
    ]);

    await build().run(NOW);

    expect(queries.findAppointmentsDueReminder).toHaveBeenCalledWith('tenant-1', NOW, 60);
  });

  it('skips a tenant that has switched reminders off', async () => {
    settingsRepo.listAll.mockResolvedValue([
      NotificationSettings.defaults('tenant-1').withPatch({
        appointmentRemindersEnabled: false,
      }),
    ]);

    await build().run(NOW);

    expect(queries.findAppointmentsDueReminder).not.toHaveBeenCalled();
    expect(notifications.emitSafe).not.toHaveBeenCalled();
  });

  it('sweeps every tenant independently', async () => {
    settingsRepo.listAll.mockResolvedValue([
      NotificationSettings.defaults('tenant-1'),
      NotificationSettings.defaults('tenant-2').withPatch({
        appointmentRemindersEnabled: false,
      }),
      NotificationSettings.defaults('tenant-3'),
    ]);

    await build().run(NOW);

    const sweptTenants = queries.findAppointmentsDueReminder.mock.calls.map((c) => c[0]);
    expect(sweptTenants).toEqual(['tenant-1', 'tenant-3']);
  });

  it('reports how many reminders it sent', async () => {
    queries.findAppointmentsDueReminder.mockResolvedValue([
      appointment({ id: 'a' }),
      appointment({ id: 'b' }),
    ]);

    await expect(build().run(NOW)).resolves.toBe('2 reminder(s) sent');
  });
});

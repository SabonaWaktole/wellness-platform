import { Appointment } from '../../../../../src/appointments/domain/entities/Appointment';
import { AppointmentStatus } from '../../../../../src/appointments/domain/enums/AppointmentStatus';
import { DomainError } from '../../../../../src/shared/domain/errors/DomainError';

describe('Appointment Entity', () => {
  const validProps = {
    id: 'appt-1',
    tenantId: 'tenant-1',
    clientTenantId: 'tenant-1',
    assignedUserTenantId: 'tenant-1',
    clientId: 'client-1',
    assignedUserId: 'user-1',
    scheduledAt: new Date(Date.now() + 86400000), // Tomorrow
    notes: 'Initial consultation',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('Creation and Cross-Tenant Validation', () => {
    it('should create an appointment with valid cross-tenant IDs', () => {
      const appointment = Appointment.create(validProps);
      expect(appointment.id).toBe('appt-1');
      expect(appointment.status).toBe(AppointmentStatus.SCHEDULED);
      expect(appointment.tenantId).toBe('tenant-1');
    });

    it('should reject creation if client belongs to a different tenant', () => {
      expect(() => {
        Appointment.create({
          ...validProps,
          clientTenantId: 'tenant-2', // Mismatch!
        });
      }).toThrow(DomainError);
      expect(() => {
        Appointment.create({
          ...validProps,
          clientTenantId: 'tenant-2',
        });
      }).toThrow('Client does not belong to this tenant');
    });

    it('should reject creation if assigned staff belongs to a different tenant', () => {
      expect(() => {
        Appointment.create({
          ...validProps,
          assignedUserTenantId: 'tenant-2', // Mismatch!
        });
      }).toThrow(DomainError);
      expect(() => {
        Appointment.create({
          ...validProps,
          assignedUserTenantId: 'tenant-2',
        });
      }).toThrow('Assigned user does not belong to this tenant');
    });
  });

  describe('Status Transition Graph', () => {
    let appointment: Appointment;

    beforeEach(() => {
      appointment = Appointment.create(validProps);
    });

    it('should transition from SCHEDULED to CONFIRMED', () => {
      appointment.confirm();
      expect(appointment.status).toBe(AppointmentStatus.CONFIRMED);
    });

    it('should transition from CONFIRMED to COMPLETED', () => {
      appointment.confirm();
      appointment.complete();
      expect(appointment.status).toBe(AppointmentStatus.COMPLETED);
    });

    it('should NOT transition from SCHEDULED to COMPLETED directly', () => {
      expect(() => {
        appointment.complete();
      }).toThrow(DomainError);
      expect(() => {
        appointment.complete();
      }).toThrow('Cannot complete an unconfirmed appointment');
    });

    it('should transition from SCHEDULED to CANCELLED', () => {
      appointment.cancel('Client requested', 'user-1');
      expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
    });

    it('should transition from CONFIRMED to CANCELLED', () => {
      appointment.confirm();
      appointment.cancel('Client requested', 'user-1');
      expect(appointment.status).toBe(AppointmentStatus.CANCELLED);
    });

    it('should NOT transition out of CANCELLED (Terminal State)', () => {
      appointment.cancel('Client requested', 'user-1');
      
      expect(() => appointment.confirm()).toThrow(DomainError);
      expect(() => appointment.complete()).toThrow(DomainError);
      expect(() => appointment.reschedule(new Date(), 'New time', 'user-1')).toThrow(DomainError);
    });

    it('should NOT transition out of COMPLETED (Terminal State)', () => {
      appointment.confirm();
      appointment.complete();
      
      expect(() => appointment.cancel('No longer needed', 'user-1')).toThrow(DomainError);
      expect(() => appointment.reschedule(new Date(), 'New time', 'user-1')).toThrow(DomainError);
    });
  });

  describe('Rescheduling', () => {
    let appointment: Appointment;
    const initialDate = new Date(Date.now() + 86400000); // Tomorrow

    beforeEach(() => {
      appointment = Appointment.create({
        ...validProps,
        scheduledAt: initialDate,
      });
    });

    it('should update scheduledAt and append to history on reschedule without changing status', () => {
      const newDate = new Date(Date.now() + 172800000); // Day after tomorrow
      appointment.reschedule(newDate, 'Conflict', 'user-1');

      expect(appointment.scheduledAt).toEqual(newDate);
      expect(appointment.status).toBe(AppointmentStatus.SCHEDULED); // Should retain initial status
      expect(appointment.history).toHaveLength(1);
      
      const log = appointment.history[0];
      expect(log.previousDate).toEqual(initialDate);
      expect(log.newDate).toEqual(newDate);
      expect(log.reason).toBe('Conflict');
      expect(log.changedBy).toBe('user-1');
    });

    it('should allow multiple reschedules, retaining full history', () => {
      const date2 = new Date(Date.now() + 172800000);
      appointment.reschedule(date2, 'Conflict 1', 'user-1');
      
      const date3 = new Date(Date.now() + 259200000);
      appointment.reschedule(date3, 'Conflict 2', 'user-1');

      expect(appointment.scheduledAt).toEqual(date3);
      expect(appointment.status).toBe(AppointmentStatus.SCHEDULED); // Should retain initial status
      expect(appointment.history).toHaveLength(2);
      
      expect(appointment.history[0].previousDate).toEqual(initialDate);
      expect(appointment.history[0].newDate).toEqual(date2);
      
      expect(appointment.history[1].previousDate).toEqual(date2);
      expect(appointment.history[1].newDate).toEqual(date3);
    });

    it('should allow CONFIRMED appointment to be rescheduled and retain CONFIRMED status', () => {
      appointment.confirm();
      const newDate = new Date(Date.now() + 172800000);
      appointment.reschedule(newDate, 'Conflict', 'user-1');
      
      expect(appointment.scheduledAt).toEqual(newDate);
      expect(appointment.status).toBe(AppointmentStatus.CONFIRMED); // Proves CONFIRMED remains CONFIRMED
    });
  });

  describe('Planned items (M2 Slice 12, FR-CAL-02, 07)', () => {
    const start = new Date('2026-09-04T10:00:00Z');
    const end = new Date('2026-09-04T11:00:00Z');
    const plan = (overrides = {}) => Appointment.plan({ ...validProps, scheduledAt: start, ...overrides });

    it('is a planned meeting unless a type is given', () => {
      expect(plan()).toMatchObject({ kind: 'PLANNED', type: 'MEETING', endAt: null, place: null });
    });

    it('keeps the type, deal, contact, end and place of a visit', () => {
      const visit = plan({ type: 'VISIT', endAt: end, place: 'Kafe Blloku', dealId: 'deal-1', contactPersonId: 'contact-1' });
      expect(visit).toMatchObject({ type: 'VISIT', endAt: end, place: 'Kafe Blloku', dealId: 'deal-1', contactPersonId: 'contact-1' });
    });

    it('refuses an unknown type, an end that is not after the start, and a place on anything but a visit', () => {
      expect(() => plan({ type: 'EMAIL' })).toThrow(DomainError);
      expect(() => plan({ endAt: start })).toThrow('The end must be after the start.');
      expect(() => plan({ endAt: new Date(start.getTime() - 1) })).toThrow(DomainError);
      expect(() => plan({ type: 'CALL', place: 'Somewhere' })).toThrow('A place applies to visits only.');
      expect(() => plan({ type: 'VISIT', place: 'x'.repeat(201) })).toThrow(DomainError);
    });

    it('FR-CAL-07 rescheduling moves the end with the start, so the item keeps its length', () => {
      const meeting = plan({ endAt: end });
      meeting.reschedule(new Date('2026-09-04T14:00:00Z'), '', 'user-1');
      expect(meeting.scheduledAt).toEqual(new Date('2026-09-04T14:00:00Z'));
      expect(meeting.endAt).toEqual(new Date('2026-09-04T15:00:00Z'));
    });

    it('FR-CAL-07 rescheduling takes a new end, which has to be after the new start', () => {
      const meeting = plan({ endAt: end });
      meeting.reschedule(new Date('2026-09-04T14:00:00Z'), '', 'user-1', new Date('2026-09-04T16:30:00Z'));
      expect(meeting.endAt).toEqual(new Date('2026-09-04T16:30:00Z'));
      expect(() => meeting.reschedule(new Date('2026-09-05T14:00:00Z'), '', 'user-1', new Date('2026-09-05T13:00:00Z'))).toThrow(DomainError);
    });

    it('an item with no end stays without one when rescheduled', () => {
      const call = plan({ type: 'CALL' });
      call.reschedule(new Date('2026-09-05T09:00:00Z'), '', 'user-1');
      expect(call.endAt).toBeNull();
    });

    it('a new company clears the deal and contact of the old one', () => {
      const meeting = plan({ dealId: 'deal-1', contactPersonId: 'contact-1' });
      meeting.updateDetails({ clientId: 'client-2' });
      expect(meeting).toMatchObject({ clientId: 'client-2', dealId: null, contactPersonId: null });
    });

    it('updating the start alone moves the end with it; null clears an end or a place', () => {
      const visit = plan({ type: 'VISIT', endAt: end, place: 'Kafe Blloku' });
      visit.updateDetails({ scheduledAt: new Date('2026-09-04T12:00:00Z') });
      expect(visit.endAt).toEqual(new Date('2026-09-04T13:00:00Z'));
      visit.updateDetails({ endAt: null, place: null });
      expect(visit).toMatchObject({ endAt: null, place: null });
    });
  });
});

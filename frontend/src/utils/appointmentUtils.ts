import type { Appointment } from '../types/appointment';
import type { CalendarItem, CalendarKind, CalendarType } from '../types/calendar';

/**
 * Patches an appointment in a local list.
 * Useful for optimistic updates or localized event callbacks where the parent 
 * maintains the array state and needs to replace a single item without a full refetch.
 */
export function patchAppointmentInList(
  list: Appointment[],
  updatedAppointment: Appointment
): Appointment[] {
  return list.map(app => 
    app.id === updatedAppointment.id ? updatedAppointment : app
  );
}

/**
 * An appointment as the calendar's item panel shows it (M2 Slice 12), for the
 * company page's list. Overdue is decided here, from the clock, as the feed
 * decides it on the server.
 */
export function appointmentToCalendarItem(appointment: Appointment, now: Date = new Date()): CalendarItem {
  const open = appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED';
  return {
    id: appointment.id,
    kind: (appointment.kind ?? 'PLANNED') as CalendarKind,
    type: (appointment.type ?? 'MEETING') as CalendarType,
    status: appointment.status,
    scheduledAt: appointment.scheduledAt,
    endAt: appointment.endAt ?? null,
    place: appointment.place ?? null,
    notes: appointment.notes ?? null,
    clientId: appointment.clientId,
    companyName: appointment.clientName ?? '',
    dealId: appointment.dealId ?? null,
    dealTitle: appointment.dealTitle ?? null,
    dealType: appointment.dealType ?? null,
    contactPersonId: appointment.contactPersonId ?? null,
    contactName: appointment.contactName ?? null,
    assignedUserId: appointment.assignedUserId,
    assignedUserName: appointment.staffName ?? '',
    isOverdue: open && new Date(appointment.scheduledAt).getTime() < now.getTime(),
  };
}

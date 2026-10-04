import { z } from 'zod';
import { PLANNED_ACTIVITY_TYPES } from '../../../domain/entities/Appointment';
import { AppointmentStatus } from '../../../domain/enums/AppointmentStatus';

const optionalId = z.string().trim().min(1).nullable().optional();
const optionalDate = z.coerce.date().nullable().optional();
/** FR-CAL-02: what a planned item adds to the company, the person and the time. */
const planningFields = {
  type: z.enum(PLANNED_ACTIVITY_TYPES, { errorMap: () => ({ message: 'Choose a call, visit, meeting or online meeting.' }) }).optional(),
  dealId: optionalId,
  contactPersonId: optionalId,
  endAt: optionalDate,
  place: z.string().trim().max(200).nullable().optional(),
};

export const createAppointmentSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  assignedUserId: z.string().min(1, 'Assigned user ID is required'),
  scheduledAt: z.coerce.date().refine(
    (date) => date > new Date(),
    { message: 'Scheduled date must be in the future' }
  ),
  notes: z.string().optional(),
  ...planningFields,
});

export const updateAppointmentSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required').optional(),
  assignedUserId: z.string().min(1, 'Assigned user ID is required').optional(),
  scheduledAt: z.coerce.date().refine(
    (date) => date > new Date(),
    { message: 'Scheduled date must be in the future' }
  ).optional(),
  notes: z.string().optional(),
  ...planningFields,
});

export const rescheduleAppointmentSchema = z.object({
  newDate: z.coerce.date().refine(
    (date) => date > new Date(),
    { message: 'New date must be in the future' }
  ),
  newEnd: z.coerce.date().optional(),
  // Dragging an item on the calendar gives no reason.
  reason: z.string().default(''),
});

export const cancelAppointmentSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});

export const updateAppointmentStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'COMPLETED'], {
    errorMap: () => ({ message: 'Status must be CONFIRMED or COMPLETED' }),
  }),
});

export const searchAppointmentsSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  clientId: z.string().optional(),
  assignedUserId: z.string().optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
}).refine(
  (data) => data.endDate > data.startDate,
  { message: 'End date must be after start date', path: ['endDate'] }
);

export const getUpcomingAppointmentsSchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(5),
});


import { apiClient } from '../api';
import type { 
  Appointment, 
  SearchAppointmentsParams, 
  AppointmentStatus
} from '../types/appointment';
import type { PlanActivityInput } from '../types/calendar';

export const appointmentService = {
  createAppointment: async (tenantSlug: string, data: { clientId: string; assignedUserId: string; scheduledAt: string; notes?: string } & Partial<PlanActivityInput>) => {
    const response = await apiClient.post<Appointment>(`/${tenantSlug}/appointments`, data);
    return response.data;
  },

  updateAppointment: async (tenantSlug: string, appointmentId: string, data: Partial<PlanActivityInput>) => {
    const response = await apiClient.put<Appointment>(`/${tenantSlug}/appointments/${appointmentId}`, data);
    return response.data;
  },

  /** FR-CAL-07: a new start; the end moves with it unless `newEnd` is given. A drag on the calendar gives no reason. */
  rescheduleAppointment: async (tenantSlug: string, appointmentId: string, data: { newDate: string; newEnd?: string; reason?: string }) => {
    const response = await apiClient.put<Appointment>(`/${tenantSlug}/appointments/${appointmentId}/reschedule`, data);
    return response.data;
  },

  cancelAppointment: async (tenantSlug: string, appointmentId: string, data: { reason: string }) => {
    const response = await apiClient.put<Appointment>(`/${tenantSlug}/appointments/${appointmentId}/cancel`, data);
    return response.data;
  },

  updateAppointmentStatus: async (tenantSlug: string, appointmentId: string, data: { status: AppointmentStatus }) => {
    const response = await apiClient.put<Appointment>(`/${tenantSlug}/appointments/${appointmentId}/status`, data);
    return response.data;
  },

  searchAppointments: async (tenantSlug: string, params: SearchAppointmentsParams) => {
    const response = await apiClient.get<Appointment[]>(`/${tenantSlug}/appointments/search`, { params });
    return response.data;
  },

  getUpcomingAppointments: async (tenantSlug: string, limit?: number) => {
    const response = await apiClient.get<Appointment[]>(`/${tenantSlug}/appointments/upcoming`, { params: { limit } });
    return response.data;
  },

  getAppointmentHistory: async (tenantSlug: string, appointmentId: string) => {
    // We can type this strictly based on what history returns
    const response = await apiClient.get<any[]>(`/${tenantSlug}/appointments/${appointmentId}/history`);
    return response.data;
  },
};

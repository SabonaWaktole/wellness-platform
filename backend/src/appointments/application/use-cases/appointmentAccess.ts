import { AccessContext } from '../../../access/domain/AccessContext';
import { admits } from '../../../access/domain/RecordScope';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { Appointment } from '../../domain/entities/Appointment';
import { IAppointmentRepository } from '../../domain/repositories/IAppointmentRepository';

/** Reads need `calendar.view`; changes need `activities.add` (D3: meetings and visits are activities). */
export type AppointmentPermission = 'calendar.view' | 'activities.add';

/**
 * Loads one appointment, as long as its assignee is inside the viewer's scope
 * of `key` (FR-RBAC-11). Outside it the appointment is "not found", exactly
 * like one that does not exist (FR-RBAC-05: 404, not 403).
 */
export async function findReachableAppointment(
  repository: IAppointmentRepository,
  scopes: RecordScopeResolver,
  access: AccessContext,
  key: AppointmentPermission,
  id: string,
  tenantId: string
): Promise<Appointment> {
  const [appointment, scope] = await Promise.all([repository.findById(id, tenantId), scopes.resolve(access, key)]);
  if (!appointment || !admits(scope, appointment.assignedUserId)) {
    throw new Error('Appointment not found');
  }
  return appointment;
}

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
 *
 * A follow-up (M2 Slice 11) is changed under `followups.manage`, not
 * `activities.add`, so these routes cannot reach past the follow-up rules.
 */
export async function findReachableAppointment(
  repository: IAppointmentRepository,
  scopes: RecordScopeResolver,
  access: AccessContext,
  key: AppointmentPermission,
  id: string,
  tenantId: string
): Promise<Appointment> {
  const appointment = await repository.findById(id, tenantId);
  const effectiveKey = appointment?.kind === 'FOLLOW_UP' && key === 'activities.add' ? 'followups.manage' : key;
  const scope = await scopes.resolve(access, effectiveKey);
  if (!appointment || !admits(scope, appointment.assignedUserId)) {
    throw new Error('Appointment not found');
  }
  return appointment;
}

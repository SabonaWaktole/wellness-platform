import { IClientRepository } from '../../../clients/domain/repositories/IClientRepository';
import { IInteractionRepository } from '../../../clients/domain/repositories/IInteractionRepository';
import { IAppointmentRepository } from '../../../appointments/domain/repositories/IAppointmentRepository';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { TimelineMerger } from '../../../shared/application/TimelineMerger';

export interface GetTenantActivityFeedDTO {
  tenantId: string;
  /** The requesting user. Only used when their scope restricts them to own data. */
  userId?: string;
  /** Slice 3: the caller's `companies.view` scope. `OWN` sees only their own activity. */
  scope?: string | null;
  limit?: number;
}

export class GetTenantActivityFeedUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private interactionRepo: IInteractionRepository,
    private appointmentRepo: IAppointmentRepository,
    private userRepo?: IUserRepository
  ) {}

  async execute(dto: GetTenantActivityFeedDTO) {
    const limit = dto.limit ?? 20;

    // Scope-based visibility, matching GetUpcomingAppointmentsUseCase: OWN
    // sees only their own activity, wider scopes see the tenant. Decided
    // here rather than in the route so the policy lives with the business rules
    // and cannot be forgotten by a second caller.
    const scopedUserId = dto.scope === 'OWN' ? dto.userId : undefined;

    // We fetch `limit` from each to ensure we don't miss anything if one is full of recent events
    const [clients, interactions, appointments] = await Promise.all([
      this.clientRepo.findRecentByTenant(dto.tenantId, limit, scopedUserId),
      this.interactionRepo.findRecentByTenant(dto.tenantId, limit, scopedUserId),
      this.appointmentRepo.findRecentByTenant(dto.tenantId, limit, scopedUserId),
    ]);

    const timeline = TimelineMerger.merge(interactions, appointments, clients, { limit });

    // TimelineMerger only has raw actor ids to work with (authorUserId /
    // assignedUserId / 'system'), so names are resolved here where the user
    // repository is available.
    const actorIds = [...new Set(timeline.map((entry) => entry.actor).filter((id) => id && id !== 'system'))];
    const actorNames = new Map<string, string>();
    if (this.userRepo && actorIds.length > 0) {
      const users = await Promise.all(actorIds.map((id) => this.userRepo!.findById(id)));
      users.forEach((user, index) => {
        if (user) {
          const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
          actorNames.set(actorIds[index], name);
        }
      });
    }

    const timelineWithActors = timeline.map((entry) => ({
      ...entry,
      actor: {
        id: entry.actor,
        name: entry.actor === 'system' ? 'System' : actorNames.get(entry.actor) || 'Unknown',
      },
    }));

    return { timeline: timelineWithActors };
  }
}

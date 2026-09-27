import { IClientRepository } from '../../../clients/domain/repositories/IClientRepository';
import { IInteractionRepository } from '../../../clients/domain/repositories/IInteractionRepository';
import { IAppointmentRepository } from '../../../appointments/domain/repositories/IAppointmentRepository';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { TimelineMerger } from '../../../shared/application/TimelineMerger';
import { InteractionChannel } from '../../../clients/domain/enums/InteractionChannel';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';

export interface GetTenantActivityFeedDTO {
  tenantId: string;
  access: AccessContext;
  limit?: number;
}

export class GetTenantActivityFeedUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private interactionRepo: IInteractionRepository,
    private appointmentRepo: IAppointmentRepository,
    private scopes: RecordScopeResolver,
    private userRepo?: IUserRepository
  ) {}

  /**
   * The workspace's recent activity, as far as the viewer reaches
   * (FR-RBAC-11..13): companies by `companies.view`, their notes and
   * activities by D3's `notes.view` / `activities.view` within the same
   * company scope, appointments by `calendar.view`. Decided here rather than
   * in the route so the policy lives with the business rules and cannot be
   * forgotten by a second caller.
   */
  async execute(dto: GetTenantActivityFeedDTO) {
    const limit = dto.limit ?? 20;
    const { access } = dto;

    const [companies, calendar] = await Promise.all([
      this.scopes.resolve(access, 'companies.view'),
      this.scopes.resolve(access, 'calendar.view'),
    ]);
    const channels = visibleChannels(access);

    // We fetch `limit` from each to ensure we don't miss anything if one is full of recent events
    const [clients, interactions, appointments] = await Promise.all([
      this.clientRepo.findRecentByTenant(dto.tenantId, limit, companies),
      channels.length > 0
        ? this.interactionRepo.findRecentByTenant(dto.tenantId, limit, { scope: companies, channels })
        : Promise.resolve([]),
      this.appointmentRepo.findRecentByTenant(dto.tenantId, limit, calendar),
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

/** D3: notes and every other channel are separate permissions. */
function visibleChannels(access: AccessContext): InteractionChannel[] {
  const channels: InteractionChannel[] = [];
  if (access.can('notes.view')) channels.push(InteractionChannel.NOTE);
  if (access.can('activities.view')) {
    channels.push(...Object.values(InteractionChannel).filter((channel) => channel !== InteractionChannel.NOTE));
  }
  return channels;
}

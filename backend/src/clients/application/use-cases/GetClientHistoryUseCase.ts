import { IClientRepository } from '../../domain/repositories/IClientRepository';
import { IUserRepository } from '../../../auth/domain/repositories/IUserRepository';
import { DomainError } from '../../../shared/domain/errors/DomainError';
import { AccessContext } from '../../../access/domain/AccessContext';
import { RecordScopeResolver } from '../../../access/application/RecordScopeResolver';
import { admits } from '../../../access/domain/RecordScope';
import { redactFields } from '../../../access/domain/redactFields';
import { TimelineMerger } from '../../../shared/application/TimelineMerger';
import { TimelineSource } from '../../../shared/application/timeline/TimelineSource';
import { TimelineCategory, TimelineEntry } from '../../../shared/application/timeline/TimelineEntry';

export const DEFAULT_TIMELINE_LIMIT = 50;

interface GetClientHistoryDTO {
  tenantId: string;
  clientId: string;
  access: AccessContext;
  types?: TimelineCategory[];
  cursor?: string;
  limit?: number;
}

export type PresentedTimelineEntry = Omit<TimelineEntry, 'actorId'> & {
  actor: { id: string; name: string } | null;
};

export interface ClientHistory {
  timeline: PresentedTimelineEntry[];
  nextCursor: string | null;
}

/**
 * The company's unified timeline (FR-CMP-05), for a company inside the
 * viewer's `companies.view` scope (FR-RBAC-11).
 *
 * Each source is shown only when the viewer's grant of its permission
 * reaches this company's owner — so a role with company-wide view but
 * own-only commercial data sees no offers on a colleague's company. D3 falls
 * out of the same rule: notes need `notes.view`, calls/emails/meetings and
 * appointments need `activities.view`. What survives then passes the Slice 4
 * field redaction, so Reception gets contract validity with no amounts.
 */
export class GetClientHistoryUseCase {
  constructor(
    private clientRepo: IClientRepository,
    private scopes: RecordScopeResolver,
    private sources: readonly TimelineSource[],
    private userRepo?: IUserRepository
  ) {}

  async execute(dto: GetClientHistoryDTO): Promise<ClientHistory> {
    const scope = await this.scopes.resolve(dto.access, 'companies.view');
    const client = await this.clientRepo.findById(dto.tenantId, dto.clientId, { scope });
    if (!client || client.tenantId !== dto.tenantId) {
      throw new DomainError('Client not found or access denied');
    }

    const wanted = dto.types && dto.types.length > 0 ? new Set(dto.types) : null;
    const visible = await this.visibleSources(dto.access, client.assignedUserId ?? null);
    const loaded = await Promise.all(
      visible
        .filter((source) => !wanted || wanted.has(source.category))
        .map((source) => source.load(dto.tenantId, dto.clientId))
    );

    const page = TimelineMerger.page(loaded.flat(), {
      types: dto.types,
      cursor: dto.cursor,
      limit: dto.limit ?? DEFAULT_TIMELINE_LIMIT,
    });

    const names = await this.actorNames(page.entries);
    const timeline = page.entries.map(({ actorId, ...entry }) => ({
      ...entry,
      actor: actorId ? { id: actorId, name: names.get(actorId) ?? 'Unknown' } : null,
    }));

    return {
      timeline: redactFields(timeline, dto.access) as PresentedTimelineEntry[],
      nextCursor: page.nextCursor,
    };
  }

  private async visibleSources(access: AccessContext, ownerId: string | null): Promise<TimelineSource[]> {
    const permissions = [...new Set(this.sources.map((source) => source.permission))];
    const reaches = new Map<string, boolean>();
    await Promise.all(
      permissions.map(async (permission) => {
        reaches.set(permission, admits(await this.scopes.resolve(access, permission), ownerId));
      })
    );
    return this.sources.filter((source) => reaches.get(source.permission));
  }

  private async actorNames(entries: TimelineEntry[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (!this.userRepo) return names;
    const ids = [...new Set(entries.map((entry) => entry.actorId).filter((id): id is string => !!id))];
    const users = await Promise.all(ids.map((id) => this.userRepo!.findById(id)));
    users.forEach((user, index) => {
      if (user) names.set(ids[index], [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email);
    });
    return names;
  }
}

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { ITeamRoster } from '../../access/application/ports/ITeamRoster';
import { PermissionScope } from '../../access/domain/PermissionScope';
import { admits, RecordScope } from '../../access/domain/RecordScope';
import { IPermissionHolderDirectory } from '../application/ports/IPermissionHolderDirectory';

const toScope = (value: string | null): PermissionScope | null =>
  value === PermissionScope.Own || value === PermissionScope.Team || value === PermissionScope.All
    ? (value as PermissionScope)
    : null;

/**
 * Active holders of a scoped permission key, narrowed to those whose grant
 * admits the subject's owner (D9, FR-DSC-05, 09). TEAM fans out through the
 * sales-user roster, exactly as `RecordScopeResolver` does for reads.
 */
export class PrismaPermissionHolderDirectory implements IPermissionHolderDirectory {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly roster: ITeamRoster | null = null
  ) {}

  async approvers(
    tenantId: string,
    permissionKey: string,
    subjectOwnerId: string | null,
    excludeUserId?: string
  ): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        assignedRole: { permissions: { some: { permissionKey } } },
      },
      select: { id: true, assignedRole: { select: { permissions: true } } },
    });

    const teamIds =
      users.some((user) =>
        user.assignedRole?.permissions.some(
          (grant) => grant.permissionKey === permissionKey && grant.scope === PermissionScope.Team
        )
      ) && this.roster
        ? await this.roster.salesUserIds(tenantId)
        : [];

    const ids: string[] = [];
    for (const user of users) {
      if (user.id === excludeUserId) continue;
      const grant = user.assignedRole?.permissions.find((candidate) => candidate.permissionKey === permissionKey);
      const scope = toScope(grant?.scope ?? null);
      const recordScope: RecordScope =
        scope === null || scope === PermissionScope.All
          ? { kind: 'all' }
          : scope === PermissionScope.Own
            ? { kind: 'owners', userIds: [user.id], includeUnowned: false }
            : { kind: 'owners', userIds: [...new Set([...teamIds, user.id])], includeUnowned: true };
      if (admits(recordScope, subjectOwnerId)) ids.push(user.id);
    }
    return ids;
  }
}

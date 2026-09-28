import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { ITeamRoster } from '../application/ports/ITeamRoster';
import { RoleKey } from '../domain/RoleKey';

export class PrismaTeamRoster implements ITeamRoster {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async salesUserIds(tenantId: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { assignedRole: { key: RoleKey.SalesUser } },
          // FR-RBAC-04: a custom role copied from Sales User is still a Sales User here.
          { assignedRole: { baseKey: RoleKey.SalesUser } },
          // D2: a user not yet given a roleId reads its role from the legacy
          // string, and STAFF maps to Sales User.
          { roleId: null, role: 'STAFF' },
        ],
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }
}

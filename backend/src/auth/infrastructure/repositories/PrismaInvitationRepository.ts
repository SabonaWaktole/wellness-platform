import { IInvitationRepository } from '../../domain/repositories/IInvitationRepository';
import { Invitation } from '../../domain/entities/Invitation';
import { UserRole } from '../../domain/enums/UserRole';
import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';

export class PrismaInvitationRepository implements IInvitationRepository {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async create(invitation: Invitation): Promise<Invitation> {
    await this.prisma.invitation.create({
      data: {
        id: invitation.id,
        tenantId: invitation.tenantId,
        email: invitation.email,
        role: invitation.role,
        roleId: invitation.roleId,
        token: invitation.token,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
        warehouseId: invitation.warehouseId,
        invitedByUserId: invitation.invitedByUserId,
      },
    });
    return invitation;
  }

  async findByToken(token: string): Promise<Invitation | null> {
    const data = await this.prisma.invitation.findUnique({ where: { token } });
    if (!data) return null;
    return Invitation.create({ ...data, role: data.role as UserRole });
  }

  async findByTenantId(tenantId: string | null): Promise<Invitation[]> {
    const data = await this.prisma.invitation.findMany({ 
      where: { tenantId }
    });
    return data.map(d => Invitation.create({ ...d, role: d.role as UserRole }));
  }

  async markAccepted(id: string, acceptedAt: Date): Promise<void> {
    await this.prisma.invitation.update({
      where: { id },
      data: { acceptedAt },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.invitation.delete({
      where: { id },
    });
  }
}

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import {
  IAssignmentTransfer,
  IStaffWrites,
  IUserAdminTransaction,
  ReassignedRecord,
  UserAdminRepos,
} from '../application/ports/IUserAdminTransaction';
import { User } from '../domain/entities/User';
import { PrismaInvitationRepository } from './repositories/PrismaInvitationRepository';
import { PrismaUserRepository } from './repositories/PrismaUserRepository';
import { IAuditTrail } from '../../audit/application/ports/IAuditTrail';
import { PrismaAuditTrail } from '../../audit/infrastructure/PrismaAuditTrail';

const OPEN_CONTRACT_STATUSES = ['DRAFT', 'ACTIVE'];

class PrismaStaffWrites implements IStaffWrites {
  constructor(private readonly prisma: PrismaClient) {}

  async create(user: User): Promise<void> {
    await new PrismaUserRepository(this.prisma).create(user);
  }

  async setRole(
    tenantId: string,
    userId: string,
    change: { roleId: string; legacyRole: string; warehouseId: string | null }
  ): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, tenantId },
      data: { roleId: change.roleId, role: change.legacyRole, warehouseId: change.warehouseId },
    });
  }

  async setActive(tenantId: string, userId: string, isActive: boolean): Promise<void> {
    await this.prisma.user.updateMany({ where: { id: userId, tenantId }, data: { isActive } });
  }
}

class PrismaAssignmentTransfer implements IAssignmentTransfer {
  constructor(private readonly prisma: PrismaClient) {}

  async reassignCompanies(tenantId: string, fromUserId: string, toUserId: string): Promise<ReassignedRecord[]> {
    const where = { tenantId, assignedUserId: fromUserId, deletedAt: null };
    const companies = await this.prisma.client.findMany({ where, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    if (companies.length > 0) {
      await this.prisma.client.updateMany({
        where: { ...where, id: { in: companies.map((company) => company.id) } },
        data: { assignedUserId: toUserId },
      });
    }
    return companies.map((company) => ({ id: company.id, label: company.name ?? company.id }));
  }

  async reassignOpenContracts(tenantId: string, fromUserId: string, toUserId: string): Promise<ReassignedRecord[]> {
    const where = { tenantId, assignedUserId: fromUserId, status: { in: OPEN_CONTRACT_STATUSES } };
    const contracts = await this.prisma.contract.findMany({
      where,
      select: { id: true, planName: true, client: { select: { name: true } } },
    });
    if (contracts.length > 0) {
      await this.prisma.contract.updateMany({
        where: { ...where, id: { in: contracts.map((contract) => contract.id) } },
        data: { assignedUserId: toUserId },
      });
    }
    return contracts.map((contract) => ({
      id: contract.id,
      label: `${contract.client.name ?? contract.id} — ${contract.planName}`,
    }));
  }
}

export class PrismaUserAdminTransaction implements IUserAdminTransaction {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    // Overridable only so a test can prove a failed audit write rolls the
    // whole change back (FR-AUD-04), as in PrismaContractWriteTransaction.
    private readonly auditTrailFor: (client: PrismaClient) => IAuditTrail = (client) => new PrismaAuditTrail(client)
  ) {}

  async run<T>(work: (repos: UserAdminRepos) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaClient;
      return work({
        staff: new PrismaStaffWrites(client),
        invitations: new PrismaInvitationRepository(client),
        assignments: new PrismaAssignmentTransfer(client),
        auditTrail: this.auditTrailFor(client),
      });
    });
  }
}

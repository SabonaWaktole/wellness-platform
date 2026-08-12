import { PrismaClient } from '@prisma/client';
import {
  IUserRepository,
  PlatformUserFilters,
  PlatformUserRow,
} from '../../domain/repositories/IUserRepository';
import { User } from '../../domain/entities/User';
import { UserRole } from '../../domain/enums/UserRole';
import { prisma as defaultPrisma } from '../../../shared/infrastructure/prisma/client';
import { insensitiveContains } from '../../../shared/infrastructure/prisma/caseInsensitiveFilter';

export class PrismaUserRepository implements IUserRepository {
  /**
   * Injected so this repository can be bound to a transaction client — see
   * PrismaTenantRepository for the full reasoning. Defaults to the global
   * client, so existing call sites are unaffected.
   */
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async findById(id: string): Promise<User | null> {
    const data = await this.prisma.user.findUnique({ where: { id } });
    if (!data) return null;
    return User.create({ ...data, role: data.role as UserRole });
  }

  async findByEmail(email: string, tenantId: string): Promise<User | null> {
    const data = await this.prisma.user.findFirst({ where: { email, tenantId } });
    if (!data) return null;
    return User.create({ ...data, role: data.role as UserRole });
  }

  async findAnyByEmail(email: string): Promise<User | null> {
    const data = await this.prisma.user.findFirst({ where: { email } });
    if (!data) return null;
    return User.create({ ...data, role: data.role as UserRole });
  }

  async findSuperAdminByEmail(email: string): Promise<User | null> {
    const data = await this.prisma.user.findFirst({ where: { email, role: 'SUPER_ADMIN' } });
    if (!data) return null;
    return User.create({ ...data, role: data.role as UserRole });
  }

  async create(user: User): Promise<User> {
    await this.prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        hashedPassword: user.hashedPassword,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        tenantId: user.tenantId,
        warehouseId: user.warehouseId,
        createdAt: user.createdAt,
      },
    });
    return user;
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedPassword },
    });
  }

  async updateProfile(userId: string, data: { firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string; language?: string | null }): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async findByTenantId(tenantId: string): Promise<User[]> {
    const data = await this.prisma.user.findMany({ where: { tenantId } });
    return data.map(u => User.create({ ...u, role: u.role as UserRole }));
  }

  async findActiveByTenantAndRole(tenantId: string, role: string): Promise<User[]> {
    const data = await this.prisma.user.findMany({ where: { tenantId, role, isActive: true } });
    return data.map(u => User.create({ ...u, role: u.role as UserRole }));
  }

  async updateRoleAndWarehouse(userId: string, role: string, warehouseId: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { role, warehouseId },
    });
  }

  async setActive(userId: string, isActive: boolean): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
    });
  }

  async softDelete(userId: string): Promise<void> {
    // Anonymized rather than nulled: email/firstName/lastName/phone keep their
    // columns NOT NULL-compatible (email in particular is read by every join
    // that still references this user), while no longer identifying anyone.
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletedAt: new Date(),
        email: `deleted-${userId}@deleted.invalid`,
        firstName: null,
        lastName: null,
        phone: null,
        avatarUrl: null,
        coverImageUrl: null,
      },
    });
  }

  async countAssignedWork(userId: string): Promise<{ clients: number; upcomingAppointments: number }> {
    // Only work that would actually go unattended is counted: currently
    // assigned clients, and appointments still ahead that are not cancelled.
    // Past and cancelled appointments are history, not a handover concern.
    const [clients, upcomingAppointments] = await Promise.all([
      this.prisma.client.count({ where: { assignedUserId: userId } }),
      this.prisma.appointment.count({
        where: {
          assignedUserId: userId,
          scheduledAt: { gte: new Date() },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
      }),
    ]);

    return { clients, upcomingAppointments };
  }

  async findPlatformUsers(
    filters: PlatformUserFilters
  ): Promise<{ items: PlatformUserRow[]; total: number }> {
    // Deleted accounts never appear in the console's list — that is what
    // "delete" means here, as opposed to suspend/reactivate which keep the
    // row visible with a status badge.
    const where: any = { deletedAt: null };
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.role) where.role = filters.role;
    if (filters.isActive !== undefined) where.isActive = filters.isActive;
    if (filters.q) {
      // Searching for a person by name must not depend on how they capitalised
      // it, so this is explicitly case-insensitive — Postgres `contains` is
      // case-SENSITIVE without it. See PrismaClientRepository.search, which
      // does the same for the client list.
      where.OR = [
        { email: insensitiveContains(filters.q) },
        { firstName: insensitiveContains(filters.q) },
        { lastName: insensitiveContains(filters.q) },
      ];
    }

    // `total` is the count under the same filters, not the table size — the
    // console pages through a filtered list and needs to know how deep it goes.
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          tenantId: true,
          createdAt: true,
          tenant: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: filters.skip,
        take: filters.take,
      }),
      this.prisma.user.count({ where }),
    ]);

    // A second query rather than a join: only rows with an ACTIVE transfer as
    // ORIGINAL owner need it, which is a small minority, and Prisma cannot
    // express "latest active row per user" as a single findMany include.
    const pendingTransfers = rows.length
      ? await this.prisma.ownershipTransfer.findMany({
          where: { originalOwnerId: { in: rows.map((r) => r.id) }, status: 'ACTIVE' },
          select: { originalOwnerId: true, actingOwner: { select: { firstName: true, lastName: true, email: true } } },
        })
      : [];
    const transferByOriginalOwnerId = new Map(
      pendingTransfers.map((t) => [
        t.originalOwnerId,
        { actingOwnerName: [t.actingOwner.firstName, t.actingOwner.lastName].filter(Boolean).join(' ') || t.actingOwner.email },
      ])
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        role: r.role,
        isActive: r.isActive,
        tenantId: r.tenantId,
        // Null for SUPER_ADMIN, who has no workspace — the console renders that
        // as "Platform" rather than as a missing value.
        tenantName: r.tenant?.name ?? null,
        createdAt: r.createdAt,
        pendingOwnershipTransfer: transferByOriginalOwnerId.get(r.id) ?? null,
      })),
      total,
    };
  }
}

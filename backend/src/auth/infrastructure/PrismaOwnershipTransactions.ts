import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { IOwnershipTransactions } from '../application/ports/IOwnershipTransactions';
import { OwnershipTransfer, OwnershipTransferStatus } from '../domain/entities/OwnershipTransfer';
import { UserRole } from '../domain/enums/UserRole';
import { RoleKey } from '../../access/domain/RoleKey';
import { legacyRoleKeyFor } from '../../access/domain/LegacyRoleMapping';
import { IPermissionsChanged } from '../../access/application/ports/IPermissionsChanged';

/**
 * Since Slice 3, what a user may do comes from `User.roleId`; `User.role` is
 * only the legacy mirror. Every handover below therefore writes both — a
 * Business Owner is an Administrator, and "returns as STAFF" means the Sales
 * User role (D2) — and tells the access cache, so the change applies on the
 * user's next request rather than after the cache TTL.
 */
export class PrismaOwnershipTransactions implements IOwnershipTransactions {
  constructor(
    private readonly prisma: PrismaClient = defaultPrisma,
    private readonly permissionsChanged?: IPermissionsChanged
  ) {}

  /**
   * Null when the workspace has no such system role (never true of a seeded
   * workspace). A null `roleId` makes ResolveAccessContextUseCase map the
   * legacy `role` written alongside it (D2), which grants the same role.
   */
  private async systemRoleId(tx: Prisma.TransactionClient, tenantId: string, key: RoleKey): Promise<string | null> {
    const role = await tx.role.findUnique({ where: { tenantId_key: { tenantId, key } } });
    return role?.id ?? null;
  }

  private async asOwner(tx: Prisma.TransactionClient, tenantId: string) {
    return { role: UserRole.BUSINESS_OWNER, roleId: await this.systemRoleId(tx, tenantId, RoleKey.Administrator) };
  }

  private changed(...userIds: string[]): void {
    for (const userId of userIds) this.permissionsChanged?.userChanged(userId);
  }

  async promoteForSuspension(params: {
    id: string;
    tenantId: string;
    originalOwnerId: string;
    actingOwnerId: string;
    actingOwnerRole: string;
    actingOwnerWarehouseId: string | null;
    createdByUserId: string;
  }): Promise<OwnershipTransfer> {
    const created = await this.prisma.$transaction(async (tx) => {
      const acting = await tx.user.findUniqueOrThrow({ where: { id: params.actingOwnerId }, select: { roleId: true } });
      await tx.user.update({
        where: { id: params.originalOwnerId },
        data: { isActive: false },
      });
      await tx.user.update({
        where: { id: params.actingOwnerId },
        data: await this.asOwner(tx, params.tenantId),
      });
      return tx.ownershipTransfer.create({
        data: {
          id: params.id,
          tenantId: params.tenantId,
          originalOwnerId: params.originalOwnerId,
          actingOwnerId: params.actingOwnerId,
          previousActingRole: params.actingOwnerRole,
          previousActingRoleId: acting.roleId,
          previousActingWarehouseId: params.actingOwnerWarehouseId,
          status: OwnershipTransferStatus.ACTIVE,
          createdByUserId: params.createdByUserId,
        },
      });
    });
    this.changed(params.originalOwnerId, params.actingOwnerId);

    return OwnershipTransfer.create({
      ...created,
      status: created.status as OwnershipTransferStatus,
    });
  }

  async restoreOwnership(transferId: string, resolvedByUserId: string): Promise<void> {
    const transfer = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: transferId } });

      // A transfer recorded before the role was stored falls back to D2's
      // mapping of the legacy string it did store.
      const legacyKey = legacyRoleKeyFor(transfer.previousActingRole);
      const previousRoleId =
        transfer.previousActingRoleId ?? (legacyKey ? await this.systemRoleId(tx, transfer.tenantId, legacyKey) : null);

      await tx.user.update({
        where: { id: transfer.originalOwnerId },
        data: { ...(await this.asOwner(tx, transfer.tenantId)), isActive: true },
      });
      await tx.user.update({
        where: { id: transfer.actingOwnerId },
        data: {
          role: transfer.previousActingRole,
          roleId: previousRoleId,
          warehouseId: transfer.previousActingWarehouseId,
        },
      });
      await tx.ownershipTransfer.update({
        where: { id: transferId },
        data: {
          status: OwnershipTransferStatus.RESTORED,
          resolvedAt: new Date(),
          resolvedByUserId,
        },
      });
      return transfer;
    });
    this.changed(transfer.originalOwnerId, transfer.actingOwnerId);
  }

  async keepOwnership(transferId: string, resolvedByUserId: string): Promise<void> {
    const transfer = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: transferId } });

      await tx.user.update({
        where: { id: transfer.originalOwnerId },
        data: {
          role: UserRole.STAFF,
          roleId: await this.systemRoleId(tx, transfer.tenantId, RoleKey.SalesUser),
          isActive: true,
        },
      });
      await tx.ownershipTransfer.update({
        where: { id: transferId },
        data: {
          status: OwnershipTransferStatus.KEPT,
          resolvedAt: new Date(),
          resolvedByUserId,
        },
      });
      return transfer;
    });
    this.changed(transfer.originalOwnerId);
  }

  async keepBothOwners(transferId: string, resolvedByUserId: string): Promise<void> {
    const transfer = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.ownershipTransfer.findUniqueOrThrow({ where: { id: transferId } });

      // Only the original owner is written. The acting owner is deliberately
      // left exactly as `promoteForSuspension` left them — an Administrator,
      // with the role/warehouse they had before saved on the transfer row but
      // never applied, because this resolution does not take the promotion
      // back.
      await tx.user.update({
        where: { id: transfer.originalOwnerId },
        data: { ...(await this.asOwner(tx, transfer.tenantId)), isActive: true },
      });
      await tx.ownershipTransfer.update({
        where: { id: transferId },
        data: {
          status: OwnershipTransferStatus.KEPT_BOTH,
          resolvedAt: new Date(),
          resolvedByUserId,
        },
      });
      return transfer;
    });
    this.changed(transfer.originalOwnerId);
  }

  async promoteForDeletion(params: { actingOwnerId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const acting = await tx.user.findUniqueOrThrow({ where: { id: params.actingOwnerId }, select: { tenantId: true } });
      await tx.user.update({
        where: { id: params.actingOwnerId },
        data: await this.asOwner(tx, acting.tenantId!),
      });
    });
    this.changed(params.actingOwnerId);
  }
}

import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../shared/infrastructure/prisma/client';
import { ITenantDeletionTransaction } from '../application/ports/ITenantDeletionTransaction';

export class PrismaTenantDeletionTransaction implements ITenantDeletionTransaction {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async run(tenantId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      /*
       * Deleted in dependency order, leaves-first, so nothing is ever removed
       * while another row still points at it under RESTRICT (Postgres' default
       * for an FK with no explicit `onDelete`, which is what most tenantId
       * relations in schema.prisma are).
       *
       * Rows with `onDelete: Cascade` to a parent deleted here are NOT listed
       * separately — deleting the parent removes them for free:
       *   - Appointment  -> AppointmentAuditLog
       *   - Quotation    -> QuotationLineItem, QuotationStatusHistory
       *   - Product      -> ProductImage
       *   - Tenant       -> NotificationSettings (deleted last, below)
       *
       * Everything that references User under RESTRICT (Client, Interaction,
       * Appointment, Quotation, StockMovement, Notification, Invitation) is
       * therefore deleted BEFORE `user.deleteMany`, and Warehouse — which only
       * User.warehouseId still points at by the time we get there — is deleted
       * after Users.
       */
      await tx.notification.deleteMany({ where: { tenantId } });
      await tx.appointment.deleteMany({ where: { tenantId } });
      await tx.interaction.deleteMany({ where: { tenantId } });
      await tx.quotation.deleteMany({ where: { tenantId } });
      await tx.stockMovement.deleteMany({ where: { tenantId } });
      await tx.stockLevel.deleteMany({ where: { tenantId } });
      await tx.product.deleteMany({ where: { tenantId } });
      await tx.category.deleteMany({ where: { tenantId } });
      await tx.client.deleteMany({ where: { tenantId } });
      await tx.customFieldDefinition.deleteMany({ where: { tenantId } });
      await tx.outcomeCategory.deleteMany({ where: { tenantId } });
      await tx.invitation.deleteMany({ where: { tenantId } });
      // PasswordResetToken has no tenantId column of its own — only via the
      // user it belongs to.
      await tx.passwordResetToken.deleteMany({ where: { user: { tenantId } } });
      await tx.integration.deleteMany({ where: { tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.warehouse.deleteMany({ where: { tenantId } });

      // NotificationSettings cascades from this and needs no separate call.
      await tx.tenant.delete({ where: { id: tenantId } });
    });
  }
}

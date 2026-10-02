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
       * INCIDENT, SEP 11 2026: this list was written before the forms feature,
       * Invoice and OwnershipTransfer existed, and was never updated when they
       * were added — each carries its own tenantId FK under the same RESTRICT
       * default. Because every tenant gets a default ClientForm the moment it
       * is provisioned, that alone broke deletion for every workspace on the
       * platform: `tx.tenant.delete()` failed with "Foreign key constraint
       * violated on the fields: (`tenantId`)" every time. Invoice is the
       * sharper case — it also references the Client, Quotation and User rows
       * this function was ALREADY deleting, so it has to be removed before
       * those deleteManys run, not merely before the tenant itself; the
       * integration test this comment sits beside proves it by failing at
       * `quotation.deleteMany()`, not at the final delete, when Invoice is
       * left out.
       *
       * Rows with `onDelete: Cascade` to a parent deleted here are NOT listed
       * separately — deleting the parent removes them for free:
       *   - Appointment  -> AppointmentAuditLog
       *   - Quotation    -> QuotationLineItem, QuotationStatusHistory
       *   - Product      -> ProductImage
       *   - Invoice      -> InvoiceLineItem, InvoiceStatusHistory
       *   - Contract     -> ContractPayment, ContractStatusHistory
       *   - Tenant       -> NotificationSettings (deleted last, below)
       *
       * AuditLog is deliberately absent: its tenantId column carries no
       * foreign key at all (see the model comment in schema.prisma), on
       * purpose, so the TENANT_DELETED entry can still be written after this
       * transaction commits and the tenant is gone.
       *
       * Everything that references User under RESTRICT (Client, Interaction,
       * Appointment, Quotation, Invoice, Contract, OwnershipTransfer,
       * StockMovement, Notification, Invitation) is therefore deleted BEFORE
       * `user.deleteMany`, and Warehouse — which only User.warehouseId still
       * points at by the time we get there — is deleted after Users.
       */
      await tx.formSubmission.deleteMany({ where: { tenantId } });
      await tx.formVersion.deleteMany({ where: { tenantId } });
      await tx.clientForm.deleteMany({ where: { tenantId } });
      await tx.invoice.deleteMany({ where: { tenantId } });
      /*
       * Before Client and User, like Invoice above and for the same reason:
       * Contract holds RESTRICT references to both, plus a self-reference
       * (`renewedFromContractId`). The self-reference is why this is a single
       * deleteMany rather than an ordered walk — Postgres defers nothing here,
       * but one statement removing the whole set satisfies the constraint in a
       * way that deleting renewals one at a time would not.
       */
      await tx.contract.deleteMany({ where: { tenantId } });
      await tx.ownershipTransfer.deleteMany({ where: { tenantId } });
      await tx.notification.deleteMany({ where: { tenantId } });
      await tx.appointment.deleteMany({ where: { tenantId } });
      await tx.interaction.deleteMany({ where: { tenantId } });
      await tx.quotation.deleteMany({ where: { tenantId } });
      await tx.stockMovement.deleteMany({ where: { tenantId } });
      await tx.stockLevel.deleteMany({ where: { tenantId } });
      await tx.product.deleteMany({ where: { tenantId } });
      await tx.category.deleteMany({ where: { tenantId } });
      // Cascades from Client on Postgres, but its own tenantId FK is RESTRICT
      // and MySQL's cascade ordering is not to be relied on — same reasoning
      // as BusinessType/City below, explicit rather than implicit.
      await tx.contactPerson.deleteMany({ where: { tenantId } });
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
      // AuditEntry has no foreign key either (same reason as AuditLog), so
      // this order is not load-bearing — but unlike AuditLog, AuditEntry IS
      // this tenant's own data (Slice 2), so deleting the workspace erases
      // it rather than leaving it behind.
      await tx.auditEntry.deleteMany({ where: { tenantId } });
      // Both cascade from Tenant, but BusinessType holds RESTRICT on its
      // RiskLevel. Deleting them in order leaves nothing to MySQL's cascade
      // ordering.
      await tx.businessType.deleteMany({ where: { tenantId } });
      await tx.riskLevel.deleteMany({ where: { tenantId } });
      // Pricing (M2 Slice 3): PriceZoneCity cascades from both its zone and its
      // City. The zones go first anyway, and the rest are listed rather than
      // left to MySQL's cascade ordering.
      await tx.priceZone.deleteMany({ where: { tenantId } });
      await tx.riskSurcharge.deleteMany({ where: { tenantId } });
      await tx.visitFrequency.deleteMany({ where: { tenantId } });
      await tx.employeeBand.deleteMany({ where: { tenantId } });
      await tx.pricingSettings.deleteMany({ where: { tenantId } });
      // Same situation: City holds RESTRICT on its Area.
      await tx.city.deleteMany({ where: { tenantId } });
      await tx.area.deleteMany({ where: { tenantId } });

      // NotificationSettings cascades from this and needs no separate call.
      await tx.tenant.delete({ where: { id: tenantId } });
    });
  }
}

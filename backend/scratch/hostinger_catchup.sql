-- NevaCRM: Hostinger catch-up script (v2 — no information_schema access)
--
-- Brings an ALREADY-LIVE MySQL database (with real data in it) up to date
-- with migrations added after this database was last provisioned:
-- add_platform_settings, add_user_lifecycle_management, and add_invoices.
--
-- v1 of this script used a stored procedure that checked information_schema
-- before each change. Hostinger's shared-hosting DB user is denied access to
-- information_schema entirely, so that approach can't run here. This version
-- uses MySQL's native `IF NOT EXISTS` clauses instead, which the server
-- handles internally as part of the DDL statement itself — no query against
-- information_schema, so no extra privilege needed beyond CREATE/ALTER on
-- your own database, which your account already has.
--
-- Safe to run more than once: CREATE TABLE IF NOT EXISTS and ADD COLUMN IF
-- NOT EXISTS both no-op when the target already exists. Nothing here drops
-- or rewrites an existing table or column.
--
-- BEFORE RUNNING: in phpMyAdmin, use Export on this database (quick, SQL
-- format) to take a backup first. This script is additive-only, but a
-- backup costs one click and this is production.

-- ===== User.deletedAt (from add_user_lifecycle_management) =====
ALTER TABLE `User` ADD COLUMN IF NOT EXISTS `deletedAt` DATETIME(3) NULL AFTER `isActive`;

-- ===== PlatformSettings (from add_platform_settings) =====
CREATE TABLE IF NOT EXISTS `PlatformSettings` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'platform',
    `requiresQuotationApproval` BOOLEAN NOT NULL DEFAULT true,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `locale` VARCHAR(191) NOT NULL DEFAULT 'en-US',
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'UTC',
    `dateFormat` VARCHAR(191) NOT NULL DEFAULT 'MM/DD/YYYY',
    `defaultLanguage` VARCHAR(191) NOT NULL DEFAULT 'en',
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ===== OwnershipTransfer (from add_user_lifecycle_management) =====
CREATE TABLE IF NOT EXISTS `OwnershipTransfer` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `originalOwnerId` VARCHAR(191) NOT NULL,
    `actingOwnerId` VARCHAR(191) NOT NULL,
    `previousActingRole` VARCHAR(191) NOT NULL,
    `previousActingWarehouseId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdByUserId` VARCHAR(191) NOT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolvedByUserId` VARCHAR(191) NULL,
    INDEX `OwnershipTransfer_originalOwnerId_status_idx`(`originalOwnerId`, `status`),
    INDEX `OwnershipTransfer_actingOwnerId_status_idx`(`actingOwnerId`, `status`),
    PRIMARY KEY (`id`),
    CONSTRAINT `OwnershipTransfer_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `OwnershipTransfer_originalOwnerId_fkey` FOREIGN KEY (`originalOwnerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `OwnershipTransfer_actingOwnerId_fkey` FOREIGN KEY (`actingOwnerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ===== AuditLog (from add_user_lifecycle_management) =====
CREATE TABLE IF NOT EXISTS `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NOT NULL,
    `actorRole` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `AuditLog_targetType_targetId_idx`(`targetType`, `targetId`),
    INDEX `AuditLog_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ===== Invoice (from add_invoices) =====
CREATE TABLE IF NOT EXISTS `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `Invoice_quotationId_key`(`quotationId`),
    INDEX `Invoice_tenantId_clientId_idx`(`tenantId`, `clientId`),
    INDEX `Invoice_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `Invoice_status_dueDate_idx`(`status`, `dueDate`),
    PRIMARY KEY (`id`),
    CONSTRAINT `Invoice_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Invoice_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Invoice_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `Invoice_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ===== InvoiceLineItem (from add_invoices) =====
CREATE TABLE IF NOT EXISTS `InvoiceLineItem` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitPrice` DOUBLE NOT NULL,
    INDEX `InvoiceLineItem_tenantId_invoiceId_idx`(`tenantId`, `invoiceId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `InvoiceLineItem_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `InvoiceLineItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `InvoiceLineItem_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ===== InvoiceStatusHistory (from add_invoices) =====
CREATE TABLE IF NOT EXISTS `InvoiceStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `fromStatus` VARCHAR(191) NOT NULL,
    `toStatus` VARCHAR(191) NOT NULL,
    `changedByUserId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `InvoiceStatusHistory_tenantId_invoiceId_idx`(`tenantId`, `invoiceId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `InvoiceStatusHistory_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `InvoiceStatusHistory_changedByUserId_fkey` FOREIGN KEY (`changedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ===== Verify (does not require information_schema — reads the tables
-- themselves, which you already have SELECT on) =====
SELECT `deletedAt` FROM `User` LIMIT 0;
SELECT * FROM `PlatformSettings` LIMIT 0;
SELECT * FROM `OwnershipTransfer` LIMIT 0;
SELECT * FROM `AuditLog` LIMIT 0;
SELECT * FROM `Invoice` LIMIT 0;
SELECT * FROM `InvoiceLineItem` LIMIT 0;
SELECT * FROM `InvoiceStatusHistory` LIMIT 0;

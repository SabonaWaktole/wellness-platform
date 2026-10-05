-- Wellness Albania — Milestone 3 contracts from won deals (M3 Slice 4) on a
-- live MySQL database.
--
-- Converts Contract.amount and ContractPayment.amount / paidAmount from DOUBLE
-- to DECIMAL(12, 2) (NFR-ACC-03), after refusing to continue if any amount
-- would move by half a cent or more; makes NOT_INVOICED the default instalment
-- status (no existing row changes); and adds the contract's deal, offer,
-- package, services, terms, annual value, discount, number, renewal date and
-- lifecycle columns, with a unique index on the deal (one contract per won
-- deal, NFR-DAT-01) and on the number per workspace. Existing contracts get no
-- deal: they are Legacy and nothing is invented for them.
--
-- SAFE TO RUN ON PRODUCTION, AND SAFE TO RUN TWICE. Every column, index and
-- foreign key is guarded by information_schema.
--
-- The same statements are also carried by mysql_upgrade_to_current.sql, which
-- is the file to run when bringing a database up to date generally.
--
-- TAKE A BACKUP FIRST (it is the way back: the Float values cannot be
-- recovered from the rounded Decimal):
--   mysqldump -u USER -p --single-transaction --routines DBNAME > backup.sql

SELECT 'm3 contracts from deals' AS step, DATABASE() AS db, NOW() AS at;

-- Refuse to continue if a stored Float amount would move by half a cent or
-- more when rounded to two decimals (plan D2, NFR-OPS-03). Review the rows
-- this lists, then run `SET @m3_rounding_reviewed := 1;` in the same session
-- and run the script again. Amounts that already have two decimals do not
-- move. Skipped once the columns are DECIMAL.
SET @is_float := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'amount' AND DATA_TYPE <> 'decimal');
SET @sql := IF(@is_float = 0, 'SELECT ''skip: amounts are already DECIMAL'' AS note',
  'SELECT ''Contract'' AS tbl, `id`, ''amount'' AS col, `amount` AS value FROM `Contract` WHERE ABS(`amount` - ROUND(`amount`, 2)) >= 0.005 UNION ALL SELECT ''ContractPayment'', `id`, ''amount'', `amount` FROM `ContractPayment` WHERE ABS(`amount` - ROUND(`amount`, 2)) >= 0.005 UNION ALL SELECT ''ContractPayment'', `id`, ''paidAmount'', `paidAmount` FROM `ContractPayment` WHERE ABS(`paidAmount` - ROUND(`paidAmount`, 2)) >= 0.005');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @moved := IF(@is_float = 0, 0, (SELECT COUNT(*) FROM `Contract` WHERE ABS(`amount` - ROUND(`amount`, 2)) >= 0.005) + (SELECT COUNT(*) FROM `ContractPayment` WHERE ABS(`amount` - ROUND(`amount`, 2)) >= 0.005 OR ABS(`paidAmount` - ROUND(`paidAmount`, 2)) >= 0.005));
SET @sql := IF(@moved > 0 AND COALESCE(@m3_rounding_reviewed, 0) = 0, 'SELECT * FROM `m3_amounts_would_change_review_the_rows_listed_above`', 'SELECT ''rounding check passed'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'amount' AND DATA_TYPE = 'decimal');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` MODIFY `amount` DECIMAL(12, 2) NOT NULL', 'SELECT ''skip: Contract.amount is already DECIMAL'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND COLUMN_NAME = 'amount' AND DATA_TYPE = 'decimal');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` MODIFY `amount` DECIMAL(12, 2) NOT NULL', 'SELECT ''skip: ContractPayment.amount is already DECIMAL'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND COLUMN_NAME = 'paidAmount' AND DATA_TYPE = 'decimal');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` MODIFY `paidAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0', 'SELECT ''skip: ContractPayment.paidAmount is already DECIMAL'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND COLUMN_NAME = 'status' AND COLUMN_DEFAULT = 'NOT_INVOICED');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` ALTER COLUMN `status` SET DEFAULT ''NOT_INVOICED''', 'SELECT ''skip: ContractPayment.status default'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'agreedAnnualValue');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `agreedAnnualValue` DECIMAL(12, 2) NULL', 'SELECT ''skip: Contract.agreedAnnualValue'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'cancelReason');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `cancelReason` TEXT NULL', 'SELECT ''skip: Contract.cancelReason'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'dealId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `dealId` VARCHAR(191) NULL', 'SELECT ''skip: Contract.dealId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'discountPercent');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `discountPercent` DECIMAL(7, 2) NULL', 'SELECT ''skip: Contract.discountPercent'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'lockedAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `lockedAt` DATETIME(3) NULL', 'SELECT ''skip: Contract.lockedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'notRenewingNote');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `notRenewingNote` TEXT NULL', 'SELECT ''skip: Contract.notRenewingNote'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'notRenewingReasonId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `notRenewingReasonId` VARCHAR(191) NULL', 'SELECT ''skip: Contract.notRenewingReasonId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'number');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `number` VARCHAR(191) NULL', 'SELECT ''skip: Contract.number'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'packageId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `packageId` VARCHAR(191) NULL', 'SELECT ''skip: Contract.packageId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'quotationId');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `quotationId` VARCHAR(191) NULL', 'SELECT ''skip: Contract.quotationId'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'renewalDate');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `renewalDate` DATE NULL', 'SELECT ''skip: Contract.renewalDate'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'servicesSnapshot');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `servicesSnapshot` JSON NULL', 'SELECT ''skip: Contract.servicesSnapshot'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'suspendedAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `suspendedAt` DATETIME(3) NULL', 'SELECT ''skip: Contract.suspendedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'suspensionReason');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `suspensionReason` TEXT NULL', 'SELECT ''skip: Contract.suspensionReason'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND COLUMN_NAME = 'termsText');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD COLUMN `termsText` JSON NULL', 'SELECT ''skip: Contract.termsText'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND COLUMN_NAME = 'invoiceDate');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` ADD COLUMN `invoiceDate` DATE NULL', 'SELECT ''skip: ContractPayment.invoiceDate'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND COLUMN_NAME = 'invoiceNumber');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` ADD COLUMN `invoiceNumber` VARCHAR(191) NULL', 'SELECT ''skip: ContractPayment.invoiceNumber'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ContractPayment' AND COLUMN_NAME = 'overdueNotifiedAt');
SET @sql := IF(@needed = 0, 'ALTER TABLE `ContractPayment` ADD COLUMN `overdueNotifiedAt` DATETIME(3) NULL', 'SELECT ''skip: ContractPayment.overdueNotifiedAt'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND INDEX_NAME = 'Contract_dealId_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `Contract_dealId_key` ON `Contract`(`dealId`)', 'SELECT ''skip: Contract_dealId_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND INDEX_NAME = 'Contract_quotationId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Contract_quotationId_idx` ON `Contract`(`quotationId`)', 'SELECT ''skip: Contract_quotationId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND INDEX_NAME = 'Contract_packageId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Contract_packageId_idx` ON `Contract`(`packageId`)', 'SELECT ''skip: Contract_packageId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND INDEX_NAME = 'Contract_notRenewingReasonId_idx');
SET @sql := IF(@needed = 0, 'CREATE INDEX `Contract_notRenewingReasonId_idx` ON `Contract`(`notRenewingReasonId`)', 'SELECT ''skip: Contract_notRenewingReasonId_idx'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND INDEX_NAME = 'Contract_tenantId_number_key');
SET @sql := IF(@needed = 0, 'CREATE UNIQUE INDEX `Contract_tenantId_number_key` ON `Contract`(`tenantId`, `number`)', 'SELECT ''skip: Contract_tenantId_number_key'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_dealId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract_dealId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_quotationId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `Quotation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract_quotationId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_packageId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `ServicePackage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract_packageId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @needed := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Contract' AND CONSTRAINT_NAME = 'Contract_notRenewingReasonId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@needed = 0, 'ALTER TABLE `Contract` ADD CONSTRAINT `Contract_notRenewingReasonId_fkey` FOREIGN KEY (`notRenewingReasonId`) REFERENCES `LostReason`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT ''skip: Contract_notRenewingReasonId_fkey'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT INTO `_prisma_migrations`
  (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
SELECT
  UUID(), '', NOW(3), '20261010100000_m3_contracts_from_deals', NULL, NULL, NOW(3), 1
WHERE NOT EXISTS (
  SELECT 1 FROM `_prisma_migrations` WHERE `migration_name` = '20261010100000_m3_contracts_from_deals'
);

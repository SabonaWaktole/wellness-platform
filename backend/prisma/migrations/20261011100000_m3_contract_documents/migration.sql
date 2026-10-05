-- M3 Slice 5: the signed contract document, versioned (FR-CON-19, plan D14).
--
-- ContractDocument keeps every file ever attached to a contract; exactly the
-- newest is current. An existing Contract.documentUrl is copied into one
-- current row (attributed to the contract's creator, dated at its last update)
-- so it appears in the version list. Contract.documentUrl / documentName stay
-- and mirror the current row.

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractDocument_contractId_isCurrent_idx" ON "ContractDocument"("contractId", "isCurrent");

-- CreateIndex
CREATE INDEX "ContractDocument_tenantId_contractId_idx" ON "ContractDocument"("tenantId", "contractId");

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Copy each existing document into one current row.
INSERT INTO "ContractDocument" ("id", "tenantId", "contractId", "fileName", "url", "uploadedByUserId", "uploadedAt", "isCurrent")
SELECT gen_random_uuid()::text, c."tenantId", c."id", COALESCE(c."documentName", 'contract.pdf'), c."documentUrl", c."createdByUserId", c."updatedAt", true
FROM "Contract" c
WHERE c."documentUrl" IS NOT NULL;

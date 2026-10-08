-- M4 Slice 9: corporate employee upload (FR-EMP-01..07, FR-EMP-14, NFR-DAT-02).
-- Adds EmployeeImport. The table starts empty on every workspace: no existing row
-- is read or changed (NFR-OPS-04). `rows` holds the parsed upload only until it
-- is confirmed or expires, then it is cleared (FR-DPR-03).

-- CreateTable
CREATE TABLE "EmployeeImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEWED',
    "rows" JSONB,
    "result" JSONB,
    "confirmToken" TEXT NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "linked" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "refused" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeImport_tenantId_clientId_createdAt_idx" ON "EmployeeImport"("tenantId", "clientId", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeImport_tenantId_status_createdAt_idx" ON "EmployeeImport"("tenantId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "EmployeeImport" ADD CONSTRAINT "EmployeeImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeImport" ADD CONSTRAINT "EmployeeImport_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

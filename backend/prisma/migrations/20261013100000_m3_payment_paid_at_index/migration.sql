-- M3 Slice 9: money received in a period, for the revenue figure of the KPI
-- engine and the dashboards (Slices 12-14). The overview's own queries are
-- served by the existing (tenantId, contractId, dueDate) and
-- (tenantId, status, dueDate) indexes.

-- CreateIndex
CREATE INDEX "ContractPayment_tenantId_paidAt_idx" ON "ContractPayment"("tenantId", "paidAt");

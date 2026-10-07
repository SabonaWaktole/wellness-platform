-- M4 Slice 11: digital member card (FR-CRD-10, FR-AUD-16, D11).
-- Adds MemberCardToken, which keeps only the SHA-256 of a replaced card token so the
-- old link can say "This card was replaced". The table starts empty on every
-- workspace: no existing row is read or changed (NFR-OPS-04). Adds
-- EmployeeImport.memberIds (opaque ids) for the card-links sheet of an upload.

-- AlterTable
ALTER TABLE "EmployeeImport" ADD COLUMN "memberIds" JSONB;

-- CreateTable
CREATE TABLE "MemberCardToken" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberCardToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberCardToken_tokenHash_key" ON "MemberCardToken"("tokenHash");

-- CreateIndex
CREATE INDEX "MemberCardToken_memberId_idx" ON "MemberCardToken"("memberId");

-- AddForeignKey
ALTER TABLE "MemberCardToken" ADD CONSTRAINT "MemberCardToken_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

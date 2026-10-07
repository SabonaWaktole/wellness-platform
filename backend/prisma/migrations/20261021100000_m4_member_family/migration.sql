-- M4 Slice 6: Wellness+ family members (FR-FAM-01..08). Adds MemberFamilyEvent,
-- the history of family links and removals. The table starts empty on every
-- workspace: no existing row is read or changed (NFR-OPS-04).

-- CreateTable
CREATE TABLE "MemberFamilyEvent" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "principalMemberId" TEXT,
    "relationshipId" TEXT,
    "kind" TEXT NOT NULL,
    "reason" TEXT,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberFamilyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberFamilyEvent_memberId_at_idx" ON "MemberFamilyEvent"("memberId", "at");

-- AddForeignKey
ALTER TABLE "MemberFamilyEvent" ADD CONSTRAINT "MemberFamilyEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

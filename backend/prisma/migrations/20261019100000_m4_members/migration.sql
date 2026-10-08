-- M4 Slice 4: Wellness+ member record (FR-MEM-01..05, 07..10, FR-TIR-08,
-- FR-DPR-01, FR-DPR-03, NFR-DAT-02). Adds Member, MemberTerm, MemberTierHistory
-- and MemberStatusHistory. The tables start empty on every workspace: members
-- are registered by hand or uploaded later (NFR-OPS-04).

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "phone" TEXT,
    "email" TEXT,
    "language" TEXT NOT NULL DEFAULT 'sq',
    "cityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentTier" TEXT NOT NULL DEFAULT 'BRONZE',
    "startsOn" DATE NOT NULL,
    "employerClientId" TEXT,
    "formerEmployerClientId" TEXT,
    "leftCompanyAt" DATE,
    "principalMemberId" TEXT,
    "relationshipId" TEXT,
    "relationshipConfirmedBy" TEXT,
    "relationshipConfirmedAt" TIMESTAMP(3),
    "cardToken" TEXT NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "anonymisedAt" TIMESTAMP(3),

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTerm" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "paymentId" TEXT,
    "followsTermId" TEXT,
    "closedEarlyByPaymentId" TEXT,
    "originalEndsOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTierHistory" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "fromTier" TEXT NOT NULL,
    "toTier" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberTierHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberStatusHistory" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_cardToken_key" ON "Member"("cardToken");

-- CreateIndex
CREATE INDEX "Member_tenantId_lastName_firstName_idx" ON "Member"("tenantId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Member_tenantId_currentTier_status_idx" ON "Member"("tenantId", "currentTier", "status");

-- CreateIndex
CREATE INDEX "Member_tenantId_employerClientId_idx" ON "Member"("tenantId", "employerClientId");

-- CreateIndex
CREATE INDEX "Member_tenantId_email_idx" ON "Member"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Member_tenantId_phone_idx" ON "Member"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Member_tenantId_dateOfBirth_idx" ON "Member"("tenantId", "dateOfBirth");

-- CreateIndex
CREATE INDEX "Member_principalMemberId_idx" ON "Member"("principalMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_tenantId_memberNumber_key" ON "Member"("tenantId", "memberNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MemberTerm_followsTermId_key" ON "MemberTerm"("followsTermId");

-- CreateIndex
CREATE INDEX "MemberTerm_memberId_startsOn_idx" ON "MemberTerm"("memberId", "startsOn");

-- CreateIndex
CREATE INDEX "MemberTierHistory_memberId_createdAt_idx" ON "MemberTierHistory"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "MemberStatusHistory_memberId_createdAt_idx" ON "MemberStatusHistory"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_employerClientId_fkey" FOREIGN KEY ("employerClientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_formerEmployerClientId_fkey" FOREIGN KEY ("formerEmployerClientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_principalMemberId_fkey" FOREIGN KEY ("principalMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "FamilyRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTerm" ADD CONSTRAINT "MemberTerm_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberTierHistory" ADD CONSTRAINT "MemberTierHistory_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberStatusHistory" ADD CONSTRAINT "MemberStatusHistory_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;


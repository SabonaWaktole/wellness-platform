-- M2 Slice 5: the workspace sales script (FR-SCR-03..06). One row per
-- version; (tenantId, liveSlot) allows one DRAFT and one PUBLISHED per
-- workspace, because a unique index ignores the NULL every SUPERSEDED row
-- holds. Content is TipTap JSON, sanitised on the server (plan D10,
-- NFR-SEC-05).

-- CreateTable
CREATE TABLE "SalesScript" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "liveSlot" TEXT,
    "contentSq" JSONB NOT NULL,
    "contentEn" JSONB,
    "createdByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesScript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesScript_createdByUserId_idx" ON "SalesScript"("createdByUserId");

-- CreateIndex
CREATE INDEX "SalesScript_publishedByUserId_idx" ON "SalesScript"("publishedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesScript_tenantId_version_key" ON "SalesScript"("tenantId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SalesScript_tenantId_liveSlot_key" ON "SalesScript"("tenantId", "liveSlot");

-- AddForeignKey
ALTER TABLE "SalesScript" ADD CONSTRAINT "SalesScript_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesScript" ADD CONSTRAINT "SalesScript_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesScript" ADD CONSTRAINT "SalesScript_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: the placeholder script in src/salesScript/domain/DefaultSalesScript.ts,
-- published as version 1 for every workspace that has no script yet.
INSERT INTO "SalesScript" ("id", "tenantId", "version", "status", "liveSlot", "contentSq", "contentEn", "publishedAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 1, 'PUBLISHED', 'PUBLISHED',
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Hapja"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Prezantoni veten dhe Wellness Albania, dhe pyesni nëse është një moment i përshtatshëm për të folur."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Zbulimi i nevojave"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Pyesni për aktivitetin e kompanisë, numrin e punonjësve dhe si e menaxhojnë sot sigurinë në punë."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Pyetje për çmimin"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Konfirmoni numrin e punonjësve, llojin e biznesit, frekuencën e vizitave dhe qytetin para se të llogaritni çmimin."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Kundërshtimet"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Dëgjoni kundërshtimin deri në fund, pastaj shpjegoni vlerën e shërbimit për kompaninë."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Mbyllja"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Përmblidhni ofertën dhe bini dakord për hapin e radhës dhe datën e ndjekjes."}]}]}]}]}'::jsonb,
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Opening"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Introduce yourself and Wellness Albania, and ask whether this is a good moment to talk."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Needs discovery"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Ask about the company activity, the number of employees and how they handle safety at work today."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Pricing questions"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Confirm the number of employees, business type, visit frequency and city before calculating the price."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Objections"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Hear the objection out, then explain the value of the service for the company."}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Closing"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Summarise the offer and agree the next step and the follow-up date."}]}]}]}]}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "SalesScript" s WHERE s."tenantId" = t."id");

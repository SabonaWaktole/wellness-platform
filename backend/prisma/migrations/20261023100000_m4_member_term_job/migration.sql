-- M4 Slice 8: the daily member job (FR-TIR-05..07, FR-TIR-11, NFR-REL-02).
-- Adds the marker that says the expiring-soon notice of a paid term was sent.
-- The column is set only AFTER the notification was emitted, so a failed send is
-- retried and a second run sends nothing (D9). Existing rows get NULL: a term
-- already inside the window is announced once by the first run.
-- (MemberTerm.followsTermId and its unique index, which make the downgrade term
-- idempotent in the database, already exist from the Slice 4 migration.)

-- AlterTable
ALTER TABLE "MemberTerm" ADD COLUMN "expiringNotifiedAt" TIMESTAMP(3);

-- In-app notifications (one row per recipient) and the invitation sender the
-- "invitation accepted" notification needs in order to have someone to notify.

-- Nullable: invitations created before this column exist and cannot be
-- attributed retroactively. New ones always carry a sender.
ALTER TABLE "Invitation" ADD COLUMN "invitedByUserId" TEXT;

ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_invitedByUserId_fkey"
  FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Notification" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    -- An i18n key plus its interpolation values, never a rendered sentence.
    "type"            TEXT NOT NULL,
    "params"          JSONB NOT NULL,
    "actorUserId"     TEXT,
    "entityType"      TEXT,
    "entityId"        TEXT,
    "readAt"          TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- Serves the unread badge and the list; both are scoped to one recipient in
-- one tenant and ordered newest-first.
CREATE INDEX "Notification_tenantId_recipientUserId_readAt_createdAt_idx"
  ON "Notification"("tenantId", "recipientUserId", "readAt", "createdAt");

-- Retention pruning scans by age.
CREATE INDEX "Notification_tenantId_createdAt_idx"
  ON "Notification"("tenantId", "createdAt");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- RESTRICT, matching the seven existing non-nullable User references: a
-- notification is history and must not disappear because someone was
-- off-boarded. Deactivation is the off-boarding mechanism, not deletion.
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

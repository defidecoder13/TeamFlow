-- Phase 4H.2: server-derived message mention relation.
--
-- MessageMention is the authoritative record of which users are mentioned in
-- a message body. Bodies stay plain text; clients must never determine
-- notification recipients. Rows represent CURRENT mention truth: edits
-- rewrite the set, soft-deletes clear it (see service layer), and hard
-- deletes cascade via foreign keys. No notification state lives here.

-- CreateTable
CREATE TABLE "message_mention" (
    "messageId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "message_mention_mentionedUserId_createdAt_idx" ON "message_mention"("mentionedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "message_mention_messageId_idx" ON "message_mention"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "message_mention_messageId_mentionedUserId_key" ON "message_mention"("messageId", "mentionedUserId");

-- AddForeignKey
ALTER TABLE "message_mention" ADD CONSTRAINT "message_mention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_mention" ADD CONSTRAINT "message_mention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

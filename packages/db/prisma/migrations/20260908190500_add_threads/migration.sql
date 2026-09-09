-- AlterTable
ALTER TABLE "message" ADD COLUMN "parentMessageId" TEXT,
ADD COLUMN "replyCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "latestReplyAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "message_parentMessageId_createdAt_id_idx" ON "message"("parentMessageId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

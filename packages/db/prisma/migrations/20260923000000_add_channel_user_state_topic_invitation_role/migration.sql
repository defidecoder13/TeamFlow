-- AlterTable
ALTER TABLE "invitation" ADD COLUMN     "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "channel" ADD COLUMN     "topic" TEXT;

-- CreateTable
CREATE TABLE "channel_user_state" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_user_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_user_state_channelId_userId_key" ON "channel_user_state"("channelId", "userId");

-- CreateIndex
CREATE INDEX "channel_user_state_userId_idx" ON "channel_user_state"("userId");

-- CreateIndex
CREATE INDEX "channel_user_state_channelId_idx" ON "channel_user_state"("channelId");

-- CreateIndex
CREATE INDEX "channel_user_state_lastReadMessageId_idx" ON "channel_user_state"("lastReadMessageId");

-- AddForeignKey
ALTER TABLE "channel_user_state" ADD CONSTRAINT "channel_user_state_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_user_state" ADD CONSTRAINT "channel_user_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_user_state" ADD CONSTRAINT "channel_user_state_lastReadMessageId_fkey" FOREIGN KEY ("lastReadMessageId") REFERENCES "message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase 4H.3: durable notification + delivery-preference models.
--
-- Notification is the append-only record of mention/DM/group/thread-reply
-- events per recipient. Display snapshots (actor/channel/conversation names)
-- are stored so the notification center reads in one query; they are never
-- the source of truth for authorization, which is always re-derived.
--
-- Durability rules: message/thread-root links are ON DELETE SET NULL so
-- notification history survives source-message deletion; workspace,
-- recipient, and actor links cascade with the tenant/user lifecycle.
--
-- UserNotificationPreference gates realtime delivery only; generation (4H.4)
-- always persists. Missing rows mean ALL (column defaults, no backfill).
-- No notification generation, routes, events, or UI are created here.

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MENTION', 'DM_MESSAGE', 'GROUP_MESSAGE', 'THREAD_REPLY');

-- CreateEnum
CREATE TYPE "NotificationDelivery" AS ENUM ('ALL', 'NONE');

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "messageId" TEXT,
    "conversationId" TEXT,
    "channelId" TEXT,
    "threadRootMessageId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorImage" TEXT,
    "channelName" TEXT,
    "conversationName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_preference" (
    "userId" TEXT NOT NULL,
    "mentionDelivery" "NotificationDelivery" NOT NULL DEFAULT 'ALL',
    "dmDelivery" "NotificationDelivery" NOT NULL DEFAULT 'ALL',
    "threadReplyDelivery" "NotificationDelivery" NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "notification_recipientUserId_createdAt_idx" ON "notification"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_recipientUserId_readAt_idx" ON "notification"("recipientUserId", "readAt");

-- CreateIndex
-- Deduplication identity (recipient, type, message). PostgreSQL treats NULLs
-- as distinct in UNIQUE constraints, so rows with NULL messageId (e.g. after
-- source-message deletion nulls the link) can still coexist by design.
CREATE UNIQUE INDEX "notification_recipientUserId_type_messageId_key" ON "notification"("recipientUserId", "type", "messageId");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "direct_message_conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_threadRootMessageId_fkey" FOREIGN KEY ("threadRootMessageId") REFERENCES "message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preference" ADD CONSTRAINT "user_notification_preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

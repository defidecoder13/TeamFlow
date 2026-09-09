-- CreateEnum
CREATE TYPE "DirectMessageConversationType" AS ENUM ('DIRECT', 'GROUP');

-- AlterTable
ALTER TABLE "message" ALTER COLUMN "channelId" DROP NOT NULL,
ADD COLUMN "directMessageConversationId" TEXT;

-- CreateTable
CREATE TABLE "direct_message_conversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "DirectMessageConversationType" NOT NULL DEFAULT 'DIRECT',
    "participantAId" TEXT,
    "participantBId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_message_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_message_participant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_message_participant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "direct_message_conversation_workspaceId_idx" ON "direct_message_conversation"("workspaceId");

-- CreateIndex
CREATE INDEX "direct_message_conversation_participantAId_idx" ON "direct_message_conversation"("participantAId");

-- CreateIndex
CREATE INDEX "direct_message_conversation_participantBId_idx" ON "direct_message_conversation"("participantBId");

-- CreateIndex
CREATE UNIQUE INDEX "direct_message_conversation_workspaceId_type_participantA_key" ON "direct_message_conversation"("workspaceId", "type", "participantAId", "participantBId");

-- Check constraint: for DIRECT conversations, participantAId < participantBId
ALTER TABLE "direct_message_conversation" ADD CONSTRAINT "direct_message_conversation_pair_check"
CHECK ("type" != 'DIRECT' OR ("participantAId" IS NOT NULL AND "participantBId" IS NOT NULL AND "participantAId" < "participantBId"));

-- CreateIndex
CREATE INDEX "direct_message_participant_conversationId_idx" ON "direct_message_participant"("conversationId");

-- CreateIndex
CREATE INDEX "direct_message_participant_userId_idx" ON "direct_message_participant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "direct_message_participant_conversationId_userId_key" ON "direct_message_participant"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "message_directMessageConversationId_createdAt_id_idx" ON "message"("directMessageConversationId", "createdAt", "id");

-- Check constraint: exactly one of channelId or directMessageConversationId must be set
ALTER TABLE "message" ADD CONSTRAINT "message_container_check"
CHECK (("channelId" IS NOT NULL AND "directMessageConversationId" IS NULL) OR ("channelId" IS NULL AND "directMessageConversationId" IS NOT NULL));

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_directMessageConversationId_fkey" FOREIGN KEY ("directMessageConversationId") REFERENCES "direct_message_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_conversation" ADD CONSTRAINT "direct_message_conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_conversation" ADD CONSTRAINT "direct_message_conversation_participantAId_fkey" FOREIGN KEY ("participantAId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_conversation" ADD CONSTRAINT "direct_message_conversation_participantBId_fkey" FOREIGN KEY ("participantBId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_participant" ADD CONSTRAINT "direct_message_participant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "direct_message_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_participant" ADD CONSTRAINT "direct_message_participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

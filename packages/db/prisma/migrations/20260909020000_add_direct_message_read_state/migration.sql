-- CreateTable
CREATE TABLE "direct_message_read_state" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadMessageId" TEXT,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_message_read_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "direct_message_read_state_userId_conversationId_key" ON "direct_message_read_state"("userId", "conversationId");

-- CreateIndex
CREATE INDEX "direct_message_read_state_userId_idx" ON "direct_message_read_state"("userId");

-- CreateIndex
CREATE INDEX "direct_message_read_state_conversationId_idx" ON "direct_message_read_state"("conversationId");

-- CreateIndex
CREATE INDEX "direct_message_read_state_lastReadMessageId_idx" ON "direct_message_read_state"("lastReadMessageId");

-- AddForeignKey
ALTER TABLE "direct_message_read_state" ADD CONSTRAINT "direct_message_read_state_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "direct_message_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_read_state" ADD CONSTRAINT "direct_message_read_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_message_read_state" ADD CONSTRAINT "direct_message_read_state_lastReadMessageId_fkey" FOREIGN KEY ("lastReadMessageId") REFERENCES "message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

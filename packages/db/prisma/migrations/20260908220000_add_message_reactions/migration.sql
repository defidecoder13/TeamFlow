-- CreateTable
CREATE TABLE "message_reaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_reaction_messageId_idx" ON "message_reaction"("messageId");

-- CreateIndex
CREATE INDEX "message_reaction_userId_idx" ON "message_reaction"("userId");

-- CreateIndex
CREATE INDEX "message_reaction_messageId_emoji_idx" ON "message_reaction"("messageId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "message_reaction_messageId_userId_emoji_key" ON "message_reaction"("messageId", "userId", "emoji");

-- AddForeignKey
ALTER TABLE "message_reaction" ADD CONSTRAINT "message_reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reaction" ADD CONSTRAINT "message_reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

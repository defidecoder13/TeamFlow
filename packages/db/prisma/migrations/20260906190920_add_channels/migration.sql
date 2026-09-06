-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateTable
CREATE TABLE "channel" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" "ChannelType" NOT NULL DEFAULT 'PUBLIC',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_membership" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channel_workspaceId_idx" ON "channel"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_workspaceId_slug_key" ON "channel"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "channel_membership_channelId_idx" ON "channel_membership"("channelId");

-- CreateIndex
CREATE INDEX "channel_membership_userId_idx" ON "channel_membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_membership_channelId_userId_key" ON "channel_membership"("channelId", "userId");

-- AddForeignKey
ALTER TABLE "channel" ADD CONSTRAINT "channel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel" ADD CONSTRAINT "channel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_membership" ADD CONSTRAINT "channel_membership_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_membership" ADD CONSTRAINT "channel_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


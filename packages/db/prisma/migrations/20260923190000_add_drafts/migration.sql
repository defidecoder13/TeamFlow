-- Audit 13: Draft model (unsent composer bodies)

-- CreateEnum
CREATE TYPE "DraftTargetKind" AS ENUM ('CHANNEL', 'DIRECT_MESSAGE', 'THREAD');

-- CreateTable
CREATE TABLE "draft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetKind" "DraftTargetKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "draft_userId_workspaceId_updatedAt_idx" ON "draft"("userId", "workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "draft_workspaceId_idx" ON "draft"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "draft_userId_workspaceId_targetId_key" ON "draft"("userId", "workspaceId", "targetId");

-- AddForeignKey
ALTER TABLE "draft" ADD CONSTRAINT "draft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft" ADD CONSTRAINT "draft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

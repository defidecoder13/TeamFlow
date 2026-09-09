-- CreateEnum
CREATE TYPE "DirectMessageRole" AS ENUM ('ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "direct_message_conversation" ADD COLUMN "name" TEXT;

-- AlterTable
ALTER TABLE "direct_message_participant" ADD COLUMN "role" "DirectMessageRole" NOT NULL DEFAULT 'MEMBER';

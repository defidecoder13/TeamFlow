-- Clerk migration: link local users to Clerk identities.
-- Existing Better Auth rows keep working with NULL clerkId; new
-- Clerk-authenticated users are provisioned with clerkId set.
-- Better Auth session/account/verification tables are left dormant
-- (no data deleted).

ALTER TABLE "user" ADD COLUMN "clerkId" TEXT;

CREATE UNIQUE INDEX "user_clerkId_key" ON "user"("clerkId");

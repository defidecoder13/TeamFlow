/**
 * Workspace authorization (Phase 2A).
 *
 * Reusable membership checks so routes never duplicate session/role logic:
 *
 *   requireAuth → getMembershipRole → can* check → controller/service
 *
 * The user ID always comes from the session (`req.authUser`). Role semantics:
 * OWNER = full workspace control, ADMIN = metadata administration (no delete),
 * MEMBER = read-only access to the workspace itself.
 */

import type { PrismaClient, WorkspaceRole } from '@teamflow/db';

/** Membership role of a user in a workspace, or null when not a member. */
export async function getMembershipRole(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const membership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/** OWNER and ADMIN may rename the workspace. Slug stays immutable. */
export function canEditMetadata(role: WorkspaceRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

/** Only OWNER may delete the workspace. */
export function canDeleteWorkspace(role: WorkspaceRole): boolean {
  return role === 'OWNER';
}

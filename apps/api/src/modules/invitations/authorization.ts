/**
 * Invitation authorization (Phase 2F-A).
 *
 * Invitation management is a workspace-administration capability: OWNER and
 * ADMIN only. Membership lookup itself is reused from the workspaces module
 * (`getMembershipRole`) — never duplicated here.
 */

import type { WorkspaceRole } from '@teamflow/db';

/** OWNER and ADMIN may create and list invitations. */
export function canManageInvitations(role: WorkspaceRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

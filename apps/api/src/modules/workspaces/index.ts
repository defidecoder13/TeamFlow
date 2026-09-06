/**
 * Workspaces module boundary (Phase 2A: tenant foundation).
 *
 * Only workspace + membership CRUD lives here. Channels, messaging, and all
 * later vertical slices get their own modules.
 */

export { createWorkspacesRouter } from './routes';
export { canDeleteWorkspace, canEditMetadata, getMembershipRole } from './authorization';
export {
  createWorkspace,
  deleteWorkspace,
  getWorkspaceForMember,
  listWorkspaceMembers,
  listWorkspaces,
  renameWorkspace,
  WorkspaceNotFoundError,
  WorkspaceSlugConflictError,
  type WorkspaceMemberWithUser,
  type WorkspaceWithRole,
} from './service';
export { slugify, withSlugSuffix } from './slug';

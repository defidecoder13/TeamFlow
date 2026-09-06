/**
 * Invitations module boundary (Phase 2F-A: backend only).
 *
 * Invitation lifecycle (create/list/accept) without email delivery — the raw
 * token is returned once at creation for the future email/UI layer. No UI,
 * no background jobs, no role management here.
 */

export { createInvitationAcceptRouter, createWorkspaceInvitationsRouter } from './routes';
export { canManageInvitations } from './authorization';
export {
  acceptInvitation,
  createInvitation,
  INVITATION_TTL_MS,
  InvitationConflictError,
  InvitationForbiddenError,
  InvitationInvalidError,
  listPendingInvitations,
  type AcceptedMembership,
  type CreatedInvitation,
  type PendingInvitationView,
} from './service';
export {
  generateInvitationToken,
  hashInvitationToken,
  INVITATION_TOKEN_BYTES,
  normalizeEmail,
} from './tokens';

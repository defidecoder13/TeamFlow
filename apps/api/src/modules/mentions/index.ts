/**
 * Mentions module boundary (Phase 4H.2: server-derived message mentions).
 *
 * Mention parsing, access-aware resolution, and persistence. Audit 12 adds
 * the workspace-scoped listing (`GET /workspaces/:id/mentions`). The
 * MessageMention relation is the authoritative record of who is mentioned in
 * a message body. No notifications, no realtime here.
 */

export {
  candidateNames,
  parseMentionCandidates,
  MAX_CANDIDATE_LENGTH,
  MAX_PREFIX_WORDS,
  type MentionCandidate,
} from './parser';
export {
  createMentionsForMessage,
  matchMentionCandidates,
  MentionNotFoundError,
  normalizeMentionName,
  resolveMentionedUserIds,
  syncMessageMentions,
} from './service';
export { createWorkspaceMentionsRouter } from './routes';
export { decodeMentionCursor, encodeMentionCursor, type MentionCursor } from './cursor';
export {
  listWorkspaceMentions,
  MentionListNotFoundError,
  MentionListValidationError,
  type MentionListItem,
  type MentionPage,
} from './list.service';
export {
  firstValidationMessage,
  mentionListQuerySchema,
  type MentionListQuery,
} from './schemas';

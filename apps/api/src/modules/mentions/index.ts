/**
 * Mentions module boundary (Phase 4H.2: server-derived message mentions).
 *
 * Mention parsing, access-aware resolution, and persistence only. The
 * MessageMention relation is the authoritative record of who is mentioned in
 * a message body. No notifications, no realtime, no routes here.
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

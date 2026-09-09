/**
 * Direct Messages module boundary (Phase 4F.1 & Phase 4F.2).
 *
 * Workspace-scoped direct messaging domain and HTTP boundaries.
 */

export { createDirectMessagesRouter, createWorkspaceDirectMessagesRouter } from './routes';

export {
  authorizeDirectConversationAccess,
  authorizeDirectConversationAdmin,
  canCreateDirectConversation,
} from './authorization';

export {
  addConversationParticipant,
  createDirectMessage,
  createGroupConversation,
  DirectMessageConflictError,
  DirectMessageForbiddenError,
  DirectMessageNotFoundError,
  DirectMessageValidationError,
  getConversationParticipants,
  getDirectConversation,
  getDirectConversationUnread,
  getOrCreateDirectConversation,
  getWorkspaceDirectConversationsUnread,
  getWorkspaceDirectConversationsUnreadMap,
  leaveGroupConversation,
  listDirectMessages,
  listUserDirectConversations,
  markDirectConversationRead,
  removeConversationParticipant,
  renameGroupConversation,
  type AddConversationParticipantInput,
  type ConversationUnreadInfo,
  type CreateGroupConversationInput,
  type DirectConversationPage,
  type DirectConversationResponse,
  type DirectMessageReadStateResponse,
  type LeaveGroupConversationInput,
  type MarkDirectConversationReadInput,
  type ParticipantProfile,
  type RemoveConversationParticipantInput,
  type RenameGroupConversationInput,
  type WorkspaceDirectUnreadResponse,
} from './service';

export { decodeConversationCursor, encodeConversationCursor } from './cursor';

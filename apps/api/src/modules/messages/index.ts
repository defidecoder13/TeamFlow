/**
 * Messages module boundary (Phase 4A: durable channel messages).
 *
 * REST persistence and retrieval only — the durable source of truth a future
 * realtime layer will publish from. No broadcast, no Socket.IO here.
 */

export { createChannelMessagesRouter, createMessagesRouter } from './routes';
export { authorizeChannelAccess, isMessageAuthor } from './authorization';
export { decodeMessageCursor, encodeMessageCursor } from './cursor';
export {
  createMessage,
  deleteMessage,
  listMessages,
  MessageConflictError,
  MessageForbiddenError,
  MessageNotFoundError,
  updateMessage,
  type MessagePage,
  type MessageResponse,
} from './service';

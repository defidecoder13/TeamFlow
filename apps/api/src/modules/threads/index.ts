/**
 * Threads module boundary (Audit 11).
 *
 * Workspace-scoped listing of active threads (roots with replies the caller
 * participates in). Domain logic stays pure; the HTTP boundary owns session
 * and membership presentation.
 */

export { createWorkspaceThreadsRouter } from './routes';
export { decodeThreadCursor, encodeThreadCursor } from './cursor';
export {
  listWorkspaceThreads,
  ThreadNotFoundError,
  ThreadValidationError,
  type ThreadListItem,
  type ThreadPage,
} from './service';
export {
  firstValidationMessage,
  threadListQuerySchema,
  type ThreadListQuery,
} from './schemas';

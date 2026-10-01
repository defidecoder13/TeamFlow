/**
 * Drafts module boundary (Audit 13).
 *
 * Workspace-scoped unsent composer bodies. Domain logic stays pure; the
 * HTTP boundary owns session and membership presentation.
 */

export { createWorkspaceDraftsRouter } from './routes';
export {
  deleteWorkspaceDraft,
  DraftForbiddenError,
  DraftNotFoundError,
  DraftValidationError,
  listWorkspaceDrafts,
  upsertWorkspaceDraft,
  type DraftListItem,
  type DraftTargetKind,
} from './service';
export {
  draftTargetKindSchema,
  firstValidationMessage,
  upsertDraftSchema,
  type UpsertDraftBody,
} from './schemas';

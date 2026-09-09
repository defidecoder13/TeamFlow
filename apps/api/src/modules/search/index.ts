/**
 * Search module boundary (Phase 4G.3: authorization-aware workspace search).
 *
 * Hybrid PostgreSQL search (FTS primary + pg_trgm fallback) over the shared
 * Message model, plus workspace-member and accessible-channel directory
 * search. Authorization resolves server-side and is enforced inside the SQL
 * predicates — never after results return. No external search engine.
 */

export { createSearchRouter } from './routes';
export { decodeSearchCursor, encodeSearchCursor, type SearchCursor } from './cursor';
export {
  buildSnippet,
  resolveSearchScope,
  searchChannels,
  searchMessages,
  searchUsers,
  SearchNotFoundError,
  SearchValidationError,
  TRIGRAM_SIMILARITY_THRESHOLD,
  TRIGRAM_WORD_SIMILARITY_THRESHOLD,
  type ChannelSearchResponse,
  type ChannelSearchResult,
  type MessageSearchResponse,
  type MessageSearchResult,
  type SearchResponse,
  type UserSearchResponse,
  type UserSearchResult,
} from './service';
export {
  parseInFilter,
  searchQuerySchema,
  firstValidationMessage,
  type SearchInFilter,
  type SearchQuery,
  type SearchThreadFilter,
  type SearchType,
} from './validation';

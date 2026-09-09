/**
 * Authorization-aware workspace search service (Phase 4G.3, backend only).
 *
 * Hybrid PostgreSQL search (FTS primary + pg_trgm fallback) over the shared
 * Message model, plus workspace-member and accessible-channel directory
 * search. No external search infrastructure.
 *
 * Security model: the caller's workspace membership is verified first; the
 * accessible channel/conversation ID sets are resolved server-side with the
 * existing authorization helpers; those sets are injected as SQL predicates,
 * so authorization happens INSIDE the query — never after results return.
 * Trigram thresholds are explicit per-transaction GUCs (see constants).
 * All interpolated values are bound parameters; only static allowlisted SQL
 * fragments are concatenated, which is why `$queryRawUnsafe` is used instead
 * of the tagged template form (dynamic predicate composition).
 */

import type { PrismaClient } from '@teamflow/db';
import { getAccessibleChannel } from '../channels/authorization';
import { authorizeDirectConversationAccess } from '../direct-messages/authorization';
import { getMembershipRole } from '../workspaces/authorization';
import { encodeSearchCursor, type SearchCursor } from './cursor';
import {
  parseInFilter,
  type SearchInFilter,
  type SearchThreadFilter,
  type SearchType,
} from './validation';

export class SearchNotFoundError extends Error {
  constructor(message = 'Workspace not found.') {
    super(message);
    this.name = 'SearchNotFoundError';
  }
}

export class SearchValidationError extends Error {
  constructor(message = 'Invalid search request.') {
    super(message);
    this.name = 'SearchValidationError';
  }
}

/**
 * Trigram similarity floors, calibrated against live data (Phase 4G.3):
 * genuine typo/prefix pairs measured 0.17–0.86 while unrelated content
 * measured 0.0, so 0.15 admits the typo/partial arm without flooding.
 * Applied per-transaction via SET LOCAL so the indexed `%` / `%>` operator
 * forms (backed by the 4G.2 GIN indexes) are used instead of bare function
 * predicates. Deterministic for a fixed query + snapshot.
 */
export const TRIGRAM_SIMILARITY_THRESHOLD = 0.15;
export const TRIGRAM_WORD_SIMILARITY_THRESHOLD = 0.15;

const FTS_WEIGHT = 0.7;
const TRIGRAM_WEIGHT = 0.3;
/** Small controlled boost for exact-phrase matches (explainable ranking). */
const PHRASE_BOOST = 0.15;
/**
 * Score quantization (correctness-critical). Scores travel cursor → JSON →
 * Prisma-bound parameter → SQL comparison. Raw float8 values do NOT survive
 * that round trip bit-identically through this stack (verified live: a bound
 * float8 compared greater than its own literal), which corrupt strict keyset
 * predicates into duplicates/missing rows. Quantizing to 6-decimal NUMERIC
 * on both sides makes the round trip exact; (score, tie, id) stays a total
 * order via the tie-breakers, and 1e-6 granularity loss is irrelevant next
 * to the 0.7/0.3 weighting.
 */
const SCORE_DECIMALS = 6;

export interface SearchPageInfo {
  hasMore: boolean;
  nextCursor: string | null;
}

export interface SearchAuthor {
  id: string;
  name: string;
  image: string | null;
}

export interface MessageSearchContainer {
  kind: 'channel' | 'dm';
  channelId?: string;
  channelSlug?: string;
  channelName?: string;
  conversationId?: string;
  conversationName?: string | null;
  conversationType?: 'DIRECT' | 'GROUP';
  /** The other participant for DIRECT conversations (display context). */
  peer?: SearchAuthor | null;
}

export interface MessageSearchResult {
  id: string;
  container: MessageSearchContainer;
  author: SearchAuthor;
  snippet: string;
  matchOffsets: Array<{ start: number; length: number }>;
  parentMessageId: string | null;
  /** Present only for thread replies (root id they belong to). */
  threadRootId?: string;
  replyCount: number;
  createdAt: Date;
  updatedAt: Date;
  score: number;
}

export interface MessageSearchResponse {
  type: 'messages';
  results: MessageSearchResult[];
  pageInfo: SearchPageInfo;
}

export interface UserSearchResult {
  id: string;
  name: string;
  image: string | null;
  score: number;
}

export interface UserSearchResponse {
  type: 'users';
  results: UserSearchResult[];
  pageInfo: SearchPageInfo;
}

export interface ChannelSearchResult {
  kind: 'channel' | 'group_dm';
  id: string;
  slug?: string;
  name: string | null;
  description?: string | null;
  channelType?: 'PUBLIC' | 'PRIVATE';
  conversationType?: 'DIRECT' | 'GROUP';
  score: number;
}

export interface ChannelSearchResponse {
  type: 'channels';
  results: ChannelSearchResult[];
  pageInfo: SearchPageInfo;
}

export type SearchResponse = MessageSearchResponse | UserSearchResponse | ChannelSearchResponse;

export interface BaseSearchInput {
  workspaceId: string;
  userId: string;
  q: string;
  limit: number;
  cursor?: SearchCursor;
}

export interface MessageSearchInput extends BaseSearchInput {
  /** Raw validated `in:` value (`channel:<slug>` | `dm:<id>`); parsed once here. */
  inRaw?: string;
  fromUserId?: string;
  after?: string;
  before?: string;
  thread: SearchThreadFilter;
}

async function requireWorkspaceMember(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const role = await getMembershipRole(prisma, workspaceId, userId);
  if (!role) {
    // Non-enumerating: missing workspace and non-membership share this error.
    throw new SearchNotFoundError('Workspace not found.');
  }
}

function requireCursorKind(cursor: SearchCursor | undefined, kind: SearchType): void {
  if (cursor && cursor.kind !== kind) {
    throw new SearchValidationError('Invalid pagination cursor.');
  }
}

interface ContainerSets {
  channelIds: string[];
  dmConversationIds: string[];
}

/** Resolve every container the caller may discover results in. */
async function resolveAccessibleContainers(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
): Promise<ContainerSets> {
  const [publicChannels, privateMemberships, dmParticipations] = await Promise.all([
    prisma.channel.findMany({
      where: { workspaceId, type: 'PUBLIC' },
      select: { id: true },
    }),
    prisma.channelMembership.findMany({
      where: { userId, channel: { workspaceId, type: 'PRIVATE' } },
      select: { channelId: true },
    }),
    prisma.directMessageParticipant.findMany({
      where: { userId, conversation: { workspaceId } },
      select: { conversationId: true },
    }),
  ]);
  return {
    channelIds: [...publicChannels.map((c) => c.id), ...privateMemberships.map((m) => m.channelId)],
    dmConversationIds: dmParticipations.map((p) => p.conversationId),
  };
}

export interface ResolvedSearchScope {
  containers: ContainerSets;
  inFilter?: SearchInFilter;
}

/**
 * Resolve + verify the search scope: workspace membership first, then the
 * `in:` target (missing/inaccessible/out-of-workspace all map to one 404 so
 * private existence never leaks), otherwise the full accessible sets.
 */
export async function resolveSearchScope(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    userId: string;
    inRaw?: string;
  },
): Promise<ResolvedSearchScope> {
  await requireWorkspaceMember(prisma, input.workspaceId, input.userId);
  if (!input.inRaw) {
    return {
      containers: await resolveAccessibleContainers(prisma, input.workspaceId, input.userId),
    };
  }
  const inFilter = parseInFilter(input.inRaw);
  if (!inFilter) {
    throw new SearchValidationError(
      'Invalid search scope. Use in:channel:<slug> or in:dm:<conversationId>.',
    );
  }
  if (inFilter.kind === 'channel') {
    const accessible = await getAccessibleChannel(prisma, {
      workspaceId: input.workspaceId,
      channelSlug: inFilter.slug,
      userId: input.userId,
    });
    if (!accessible) {
      throw new SearchNotFoundError('Search target not found.');
    }
    return { containers: { channelIds: [accessible.channel.id], dmConversationIds: [] }, inFilter };
  }
  const conversation = await authorizeDirectConversationAccess(prisma, {
    conversationId: inFilter.conversationId,
    userId: input.userId,
  });
  // The helper is not workspace-scoped by itself: an ID from another
  // workspace must not satisfy an `in:` filter for this workspace.
  if (!conversation || conversation.workspaceId !== input.workspaceId) {
    throw new SearchNotFoundError('Search target not found.');
  }
  return { containers: { channelIds: [], dmConversationIds: [conversation.id] }, inFilter };
}

// ---------------------------------------------------------------------------
// Snippets (plain text only — highlighting offsets, never HTML)
// ---------------------------------------------------------------------------

const SNIPPET_TARGET_LENGTH = 200;
const SNIPPET_CONTEXT = 80;
const MAX_MATCH_OFFSETS = 20;
const MIN_TOKEN_LENGTH = 2;

export interface SnippetResult {
  snippet: string;
  matchOffsets: Array<{ start: number; length: number }>;
}

function tokenizeQuery(query: string): string[] {
  const tokens = new Set<string>();
  for (const raw of query.trim().toLowerCase().split(/\s+/)) {
    const token = raw.replace(/^[^\p{L}\p{N}_#@]+|[^\p{L}\p{N}_#@]+$/gu, '');
    if (token.length >= MIN_TOKEN_LENGTH) {
      tokens.add(token);
    }
  }
  return [...tokens];
}

/**
 * Build a ~200-character plain-text window around the first query-token hit
 * plus the offsets of every token hit inside the returned snippet.
 *
 * Offsets use JavaScript UTF-16 code-unit indexing on both sides (indexOf
 * here, String.slice in the future frontend), so surrogate pairs such as
 * emoji stay aligned. When nothing matches literally (e.g. typo-only
 * trigram hits), the snippet is the message head with no offsets — a
 * documented limitation, never guessed positions.
 */
export function buildSnippet(body: string, query: string): SnippetResult {
  const tokens = tokenizeQuery(query);
  const lowered = body.toLowerCase();
  let hit = -1;
  for (const token of tokens) {
    const index = lowered.indexOf(token);
    if (index !== -1 && (hit === -1 || index < hit)) {
      hit = index;
    }
  }
  let snippet = body;
  let prefix = '';
  if (hit !== -1 && body.length > SNIPPET_TARGET_LENGTH) {
    let start = Math.max(0, hit - SNIPPET_CONTEXT);
    // Avoid cutting a token in half at the window edges where cheap to do so.
    const spaceBefore = body.lastIndexOf(' ', start);
    if (start > 0 && spaceBefore > Math.max(0, start - 20)) {
      start = spaceBefore + 1;
    }
    let end = Math.min(body.length, start + SNIPPET_TARGET_LENGTH);
    const spaceAfter = body.indexOf(' ', end);
    if (end < body.length && spaceAfter !== -1 && spaceAfter - end < 20) {
      end = spaceAfter;
    }
    snippet = body.slice(start, end);
    if (start > 0) {
      prefix = '…';
    }
    if (end < body.length) {
      snippet += '…';
    }
  } else if (body.length > SNIPPET_TARGET_LENGTH) {
    snippet = `${body.slice(0, SNIPPET_TARGET_LENGTH)}…`;
  }
  const full = `${prefix}${snippet}`;
  const loweredFull = full.toLowerCase();
  const matchOffsets: Array<{ start: number; length: number }> = [];
  for (const token of tokens) {
    let from = 0;
    while (matchOffsets.length < MAX_MATCH_OFFSETS) {
      const index = loweredFull.indexOf(token, from);
      if (index === -1) {
        break;
      }
      matchOffsets.push({ start: index, length: token.length });
      from = index + token.length;
    }
    if (matchOffsets.length >= MAX_MATCH_OFFSETS) {
      break;
    }
  }
  matchOffsets.sort((a, b) => a.start - b.start);
  return { snippet: full, matchOffsets };
}

// ---------------------------------------------------------------------------
// Message search
// ---------------------------------------------------------------------------

interface MessageSearchRow {
  id: string;
  score: number;
  createdAt: Date;
}

export async function searchMessages(
  prisma: PrismaClient,
  input: MessageSearchInput,
): Promise<MessageSearchResponse> {
  requireCursorKind(input.cursor, 'messages');
  const scope = await resolveSearchScope(prisma, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    inRaw: input.inRaw,
  });

  if (input.fromUserId) {
    const fromMembership = await prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: { workspaceId: input.workspaceId, userId: input.fromUserId },
      },
      select: { id: true },
    });
    if (!fromMembership) {
      // 400, not 404: the filter value is invalid, and this reveals nothing
      // about users outside the workspace (any non-member ID behaves alike).
      throw new SearchValidationError('Author filter must reference a workspace member.');
    }
  }

  const conditions: string[] = [
    `m."deletedAt" IS NULL`,
    `(m."channelId" = ANY($1) OR m."directMessageConversationId" = ANY($2))`,
  ];
  // $1/$2 are the accessible container sets resolved above — authorization
  // predicates inside the query, never applied after results return.
  const params: unknown[] = [scope.containers.channelIds, scope.containers.dmConversationIds];
  const bind = (value: unknown, cast?: string): string => {
    params.push(value);
    return `$${params.length}${cast ?? ''}`;
  };

  if (input.thread === 'only') {
    conditions.push(`m."parentMessageId" IS NOT NULL`);
  } else if (input.thread === 'exclude') {
    conditions.push(`m."parentMessageId" IS NULL`);
  }
  if (input.fromUserId) {
    conditions.push(`m."authorId" = ${bind(input.fromUserId)}`);
  }
  // Date semantics: createdAt (message origination), not updatedAt — edits
  // must not move a message in or out of a date window. ISO strings are
  // validated by Zod; Postgres parses them as timestamptz.
  if (input.after) {
    conditions.push(`m."createdAt" >= ${bind(input.after, '::timestamptz')}`);
  }
  if (input.before) {
    conditions.push(`m."createdAt" <= ${bind(input.before, '::timestamptz')}`);
  }

  // plainto_tsquery (never raw tsquery syntax): metacharacters such as :&|!
  // are treated literally, so query text cannot inject tsquery operators.
  const qParam = bind(input.q);
  conditions.push(
    `(m."body_tsv" @@ plainto_tsquery('english', ${qParam}) OR m."body" % ${bind(input.q)} OR m."body" %> ${bind(input.q)})`,
  );

  const scoreExpr = `(ROUND(((${FTS_WEIGHT} * COALESCE(ts_rank(m."body_tsv", plainto_tsquery('english', ${bind(input.q)})), 0)) + (${TRIGRAM_WEIGHT} * COALESCE(GREATEST(similarity(m."body", ${bind(input.q)}), word_similarity(${bind(input.q)}, m."body")), 0)) + (CASE WHEN m."body_tsv" @@ phraseto_tsquery('english', ${bind(input.q)}) THEN ${PHRASE_BOOST} ELSE 0 END))::numeric, ${SCORE_DECIMALS}))`;

  let cursorPredicate = '';
  if (input.cursor) {
    const scoreParam = bind(input.cursor.score, '::numeric');
    // Millisecond truncation matches the ordering key below: JS Dates cannot
    // carry microsecond precision, so the cursor tie must compare against the
    // same truncated value or same-millisecond rows could be skipped.
    const createdParam = bind(new Date(input.cursor.tie).toISOString(), '::timestamptz');
    const idParam = bind(input.cursor.id);
    cursorPredicate = `WHERE (ranked."score", ranked."createdAt", ranked."id") < (${scoreParam}, ${createdParam}, ${idParam})`;
  }

  const take = input.limit + 1;
  const takeParam = bind(take);
  const sql = `SELECT ranked."id", ranked."score", ranked."createdAt" FROM (SELECT m."id" AS "id", date_trunc('milliseconds', m."createdAt") AS "createdAt", ${scoreExpr} AS "score" FROM "message" m WHERE ${conditions.join(' AND ')}) AS ranked ${cursorPredicate} ORDER BY ranked."score" DESC, ranked."createdAt" DESC, ranked."id" DESC LIMIT ${takeParam}`;

  interface RawMessageSearchRow {
    id: string;
    // NUMERIC arrives as a Decimal object via $queryRawUnsafe — normalized
    // with Number() below (exact for 6-decimal values).
    score: number | { toString(): string };
    createdAt: Date;
  }

  const rawRows = await prisma.$transaction(
    async (tx) => {
      // Explicit per-transaction trigram floors (calibrated, Phase 4G.3):
      // the indexed `%` / `%>` operator forms honor these GUCs.
      await tx.$executeRawUnsafe(
        `SET LOCAL pg_trgm.similarity_threshold = ${TRIGRAM_SIMILARITY_THRESHOLD}`,
      );
      await tx.$executeRawUnsafe(
        `SET LOCAL pg_trgm.word_similarity_threshold = ${TRIGRAM_WORD_SIMILARITY_THRESHOLD}`,
      );
      return tx.$queryRawUnsafe<RawMessageSearchRow[]>(sql, ...params);
    },
    { timeout: 15000, maxWait: 5000 },
  );
  const rows: MessageSearchRow[] = rawRows.map((r) => ({
    id: r.id,
    score: Number(r.score),
    createdAt: r.createdAt,
  }));

  const page = rows.slice(0, input.limit);
  const hasMore = rows.length > input.limit;

  // Bounded hydration: exactly one query for authors + containers.
  const hydrated =
    page.length === 0
      ? []
      : await prisma.message.findMany({
          where: { id: { in: page.map((r) => r.id) } },
          include: {
            author: { select: { id: true, name: true, image: true } },
            channel: { select: { id: true, slug: true, name: true } },
            directMessageConversation: { select: { id: true, name: true, type: true } },
          },
        });
  const byId = new Map<string, (typeof hydrated)[number]>();
  for (const message of hydrated) {
    byId.set(message.id, message);
  }

  // Fellow participants for DIRECT conversations (display context only; the
  // caller is a participant by construction of the container sets).
  const dmIds = [
    ...new Set(
      hydrated.flatMap((m) =>
        m.directMessageConversationId ? [m.directMessageConversationId] : [],
      ),
    ),
  ];
  const peers = new Map<string, SearchAuthor>();
  if (dmIds.length > 0) {
    const participants = await prisma.directMessageParticipant.findMany({
      where: { conversationId: { in: dmIds }, userId: { not: input.userId } },
      select: { conversationId: true, user: { select: { id: true, name: true, image: true } } },
    });
    for (const p of participants) {
      // DIRECT conversations have exactly one peer; for GROUP the map keeps
      // the first non-caller participant and the UI uses the group name.
      if (!peers.has(p.conversationId)) {
        peers.set(p.conversationId, p.user);
      }
    }
  }

  const scoreById = new Map(page.map((r) => [r.id, r.score] as const));
  const results: MessageSearchResult[] = [];
  for (const row of page) {
    const message = byId.get(row.id);
    if (!message) {
      continue;
    }
    const { snippet, matchOffsets } = buildSnippet(message.body, input.q);
    const container: MessageSearchContainer =
      message.channelId && message.channel
        ? {
            kind: 'channel',
            channelId: message.channel.id,
            channelSlug: message.channel.slug,
            channelName: message.channel.name,
          }
        : {
            kind: 'dm',
            conversationId: message.directMessageConversation!.id,
            conversationName: message.directMessageConversation!.name,
            conversationType: message.directMessageConversation!.type,
            peer: peers.get(message.directMessageConversation!.id) ?? null,
          };
    results.push({
      id: message.id,
      container,
      author: message.author,
      snippet,
      matchOffsets,
      parentMessageId: message.parentMessageId,
      ...(message.parentMessageId ? { threadRootId: message.parentMessageId } : {}),
      replyCount: message.replyCount,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      score: scoreById.get(message.id) ?? 0,
    });
  }

  const last = page[page.length - 1];
  return {
    type: 'messages',
    results,
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeSearchCursor({
              kind: 'messages',
              score: last.score,
              tie: last.createdAt.toISOString(),
              id: last.id,
            })
          : null,
    },
  };
}

// ---------------------------------------------------------------------------
// User search (workspace-member directory, name only)
// ---------------------------------------------------------------------------

interface DirectorySearchRow {
  id: string;
  name: string;
  image: string | null;
  score: number;
  tie: string;
}

export type DirectorySearchInput = BaseSearchInput;

export async function searchUsers(
  prisma: PrismaClient,
  input: DirectorySearchInput,
): Promise<UserSearchResponse> {
  requireCursorKind(input.cursor, 'users');
  await requireWorkspaceMember(prisma, input.workspaceId, input.userId);

  const params: unknown[] = [input.workspaceId, input.q];
  const bind = (value: unknown, cast?: string): string => {
    params.push(value);
    return `$${params.length}${cast ?? ''}`;
  };
  // $1 = workspaceId, $2 = q. Membership join keeps results workspace-scoped;
  // email is never matched and never returned.
  let cursorPredicate = '';
  if (input.cursor) {
    const scoreParam = bind(input.cursor.score, '::numeric');
    const nameParam = bind(input.cursor.tie);
    const idParam = bind(input.cursor.id);
    cursorPredicate = `AND (ranked."score" < ${scoreParam} OR (ranked."score" = ${scoreParam} AND (ranked."tie" > ${nameParam} OR (ranked."tie" = ${nameParam} AND ranked."id" > ${idParam})))`;
  }
  const takeParam = bind(input.limit + 1);
  const sql = `SELECT ranked."id", ranked."name", ranked."image", ranked."score", ranked."tie" FROM (SELECT u."id" AS "id", u."name" AS "name", u."image" AS "image", ROUND(GREATEST(similarity(u."name", $2), word_similarity($2, u."name"))::numeric, ${SCORE_DECIMALS}) AS "score", u."name" AS "tie" FROM "user" u JOIN "workspace_membership" wm ON wm."userId" = u."id" AND wm."workspaceId" = $1 WHERE (u."name" % $2 OR u."name" %> $2)) AS ranked ${cursorPredicate} ORDER BY ranked."score" DESC, ranked."tie" ASC, ranked."id" ASC LIMIT ${takeParam}`;

  interface RawDirectorySearchRow {
    id: string;
    name: string;
    image: string | null;
    score: number | { toString(): string };
    tie: string;
  }

  const rawRows = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL pg_trgm.similarity_threshold = ${TRIGRAM_SIMILARITY_THRESHOLD}`,
      );
      await tx.$executeRawUnsafe(
        `SET LOCAL pg_trgm.word_similarity_threshold = ${TRIGRAM_WORD_SIMILARITY_THRESHOLD}`,
      );
      return tx.$queryRawUnsafe<RawDirectorySearchRow[]>(sql, ...params);
    },
    { timeout: 15000, maxWait: 5000 },
  );
  const rows: DirectorySearchRow[] = rawRows.map((r) => ({ ...r, score: Number(r.score) }));

  const page = rows.slice(0, input.limit);
  const hasMore = rows.length > input.limit;
  const last = page[page.length - 1];
  return {
    type: 'users',
    results: page.map((r) => ({ id: r.id, name: r.name, image: r.image, score: r.score })),
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeSearchCursor({ kind: 'users', score: last.score, tie: last.tie, id: last.id })
          : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Channel search (accessible channels + participating group DMs)
// ---------------------------------------------------------------------------

export async function searchChannels(
  prisma: PrismaClient,
  input: DirectorySearchInput,
): Promise<ChannelSearchResponse> {
  requireCursorKind(input.cursor, 'channels');
  await requireWorkspaceMember(prisma, input.workspaceId, input.userId);
  const containers = await resolveAccessibleContainers(prisma, input.workspaceId, input.userId);

  const params: unknown[] = [input.workspaceId, input.q, containers.channelIds];
  const bind = (value: unknown, cast?: string): string => {
    params.push(value);
    return `$${params.length}${cast ?? ''}`;
  };
  // $1 = workspaceId, $2 = q, $3 = accessible channel IDs.
  // Private channels outside the caller's membership never enter the query.
  // Group DMs join on current participation only (removed users lose them).
  const dmIdsParam = bind(containers.dmConversationIds);
  let cursorPredicate = '';
  if (input.cursor) {
    const scoreParam = bind(input.cursor.score, '::numeric');
    const nameParam = bind(input.cursor.tie);
    const idParam = bind(input.cursor.id);
    cursorPredicate = `AND (ranked."score" < ${scoreParam} OR (ranked."score" = ${scoreParam} AND (ranked."tie" > ${nameParam} OR (ranked."tie" = ${nameParam} AND ranked."id" > ${idParam})))`;
  }
  const takeParam = bind(input.limit + 1);
  const sql = `SELECT ranked."kind", ranked."id", ranked."slug", ranked."name", ranked."description", ranked."channelType", ranked."conversationType", ranked."score", ranked."tie" FROM ((SELECT 'channel' AS "kind", c."id" AS "id", c."slug" AS "slug", c."name" AS "name", c."description" AS "description", c."type"::text AS "channelType", NULL AS "conversationType", ROUND(GREATEST(similarity(c."name", $2), word_similarity($2, c."name"))::numeric, ${SCORE_DECIMALS}) AS "score", c."name" AS "tie" FROM "channel" c WHERE c."workspaceId" = $1 AND c."id" = ANY($3) AND (c."name" % $2 OR c."name" %> $2)) UNION ALL (SELECT 'group_dm' AS "kind", d."id" AS "id", NULL AS "slug", d."name" AS "name", NULL AS "description", NULL AS "channelType", d."type"::text AS "conversationType", ROUND(GREATEST(similarity(d."name", $2), word_similarity($2, d."name"))::numeric, ${SCORE_DECIMALS}) AS "score", d."name" AS "tie" FROM "direct_message_conversation" d WHERE d."workspaceId" = $1 AND d."type" = 'GROUP' AND d."name" IS NOT NULL AND d."id" = ANY(${dmIdsParam}) AND (d."name" % $2 OR d."name" %> $2))) AS ranked ${cursorPredicate} ORDER BY ranked."score" DESC, ranked."tie" ASC, ranked."id" ASC LIMIT ${takeParam}`;

  interface ChannelSearchRow {
    kind: 'channel' | 'group_dm';
    id: string;
    slug: string | null;
    name: string | null;
    description: string | null;
    channelType: 'PUBLIC' | 'PRIVATE' | null;
    conversationType: 'DIRECT' | 'GROUP' | null;
    score: number | { toString(): string };
    tie: string;
  }

  const rawChannelRows = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL pg_trgm.similarity_threshold = ${TRIGRAM_SIMILARITY_THRESHOLD}`,
      );
      await tx.$executeRawUnsafe(
        `SET LOCAL pg_trgm.word_similarity_threshold = ${TRIGRAM_WORD_SIMILARITY_THRESHOLD}`,
      );
      return tx.$queryRawUnsafe<ChannelSearchRow[]>(sql, ...params);
    },
    { timeout: 15000, maxWait: 5000 },
  );
  const rows: Array<Omit<ChannelSearchRow, 'score'> & { score: number }> = rawChannelRows.map(
    (r) => ({ ...r, score: Number(r.score) }),
  );

  const page = rows.slice(0, input.limit);
  const hasMore = rows.length > input.limit;
  const last = page[page.length - 1];
  return {
    type: 'channels',
    results: page.map((r) =>
      r.kind === 'channel'
        ? {
            kind: 'channel' as const,
            id: r.id,
            slug: r.slug ?? undefined,
            name: r.name,
            description: r.description,
            channelType: r.channelType ?? undefined,
            score: r.score,
          }
        : {
            kind: 'group_dm' as const,
            id: r.id,
            name: r.name,
            conversationType: r.conversationType ?? undefined,
            score: r.score,
          },
    ),
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeSearchCursor({ kind: 'channels', score: last.score, tie: last.tie, id: last.id })
          : null,
    },
  };
}

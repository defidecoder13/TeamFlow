/**
 * Workspace threads listing (Audit 11).
 *
 * Roots the caller participates in (authored or replied to) inside channels
 * they can access (public, or private with membership) and DMs they belong
 * to. Ordered by latest activity (latestReplyAt DESC, id DESC) with an
 * opaque keyset cursor. Workspace membership is enforced first; non-members
 * and unknown workspaces share one 404.
 */

import type { PrismaClient } from '@teamflow/db';
import { getMembershipRole } from '../workspaces/authorization';
import { decodeThreadCursor, encodeThreadCursor } from './cursor';

export interface ThreadAuthor {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface ThreadContainer {
  type: 'channel' | 'directMessage';
  id: string;
  name: string;
  slug?: string;
}

export interface ThreadPreview {
  id: string;
  body: string;
  createdAt: Date;
  author: ThreadAuthor;
}

export interface ThreadListItem {
  id: string;
  body: string;
  replyCount: number;
  createdAt: Date;
  latestReplyAt: Date | null;
  author: ThreadAuthor;
  container: ThreadContainer;
  latestReply: ThreadPreview | null;
}

export interface ThreadPage {
  threads: ThreadListItem[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
}

export class ThreadNotFoundError extends Error {
  constructor(message = 'Workspace not found.') {
    super(message);
    this.name = 'ThreadNotFoundError';
  }
}

export class ThreadValidationError extends Error {
  constructor(message = 'Invalid request.') {
    super(message);
    this.name = 'ThreadValidationError';
  }
}

export interface ListWorkspaceThreadsInput {
  workspaceId: string;
  userId: string;
  limit?: number;
  cursor?: string;
}

const authorSelect = { id: true, name: true, email: true, image: true } as const;

type RootRow = {
  id: string;
  body: string;
  replyCount: number;
  createdAt: Date;
  latestReplyAt: Date | null;
  author: ThreadAuthor;
  channel: { id: string; name: string; slug: string } | null;
  directMessageConversation: { id: string; name: string | null } | null;
};

async function loadLatestReplies(
  prisma: PrismaClient,
  rootIds: string[],
): Promise<Map<string, ThreadPreview>> {
  if (rootIds.length === 0) return new Map();
  const rows = await prisma.message.findMany({
    where: { parentMessageId: { in: rootIds }, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      parentMessageId: true,
      body: true,
      createdAt: true,
      author: { select: authorSelect },
    },
  });
  const byRoot = new Map<string, ThreadPreview>();
  for (const row of rows) {
    if (!row.parentMessageId) continue;
    if (byRoot.has(row.parentMessageId)) continue;
    byRoot.set(row.parentMessageId, {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      author: row.author,
    });
  }
  return byRoot;
}

function toListItem(row: RootRow, latestReply: ThreadPreview | null): ThreadListItem {
  const container: ThreadContainer = row.channel
    ? { type: 'channel', id: row.channel.id, name: row.channel.name, slug: row.channel.slug }
    : {
        type: 'directMessage',
        id: row.directMessageConversation?.id ?? '',
        name: row.directMessageConversation?.name ?? 'Direct message',
      };
  return {
    id: row.id,
    body: row.body,
    replyCount: row.replyCount,
    createdAt: row.createdAt,
    latestReplyAt: row.latestReplyAt,
    author: row.author,
    container,
    latestReply,
  };
}

export async function listWorkspaceThreads(
  prisma: PrismaClient,
  input: ListWorkspaceThreadsInput,
): Promise<ThreadPage> {
  const role = await getMembershipRole(prisma, input.workspaceId, input.userId);
  if (!role) {
    throw new ThreadNotFoundError('Workspace not found.');
  }

  const limit = input.limit ?? 50;
  let cursor: { latestReplyAt: Date; id: string } | undefined;
  if (input.cursor !== undefined) {
    const decoded = decodeThreadCursor(input.cursor);
    if (!decoded) {
      throw new ThreadValidationError('Invalid pagination cursor.');
    }
    cursor = { latestReplyAt: new Date(decoded.latestReplyAt), id: decoded.id };
  }

  const rows = (await prisma.message.findMany({
    where: {
      parentMessageId: null,
      replyCount: { gt: 0 },
      deletedAt: null,
      latestReplyAt: { not: null },
      // Caller participates: root author or reply author.
      OR: [
        { authorId: input.userId },
        { replies: { some: { authorId: input.userId, deletedAt: null } } },
      ],
      AND: [
        {
          // Accessible container only.
          OR: [
            {
              channel: {
                workspaceId: input.workspaceId,
                OR: [
                  { type: 'PUBLIC' },
                  { type: 'PRIVATE', memberships: { some: { userId: input.userId } } },
                ],
              },
            },
            {
              directMessageConversation: {
                workspaceId: input.workspaceId,
                participants: { some: { userId: input.userId } },
              },
            },
          ],
        },
        ...(cursor
          ? [
              {
                OR: [
                  { latestReplyAt: { lt: cursor.latestReplyAt } },
                  { latestReplyAt: cursor.latestReplyAt, id: { lt: cursor.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ latestReplyAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true,
      body: true,
      replyCount: true,
      createdAt: true,
      latestReplyAt: true,
      author: { select: authorSelect },
      channel: { select: { id: true, name: true, slug: true } },
      directMessageConversation: { select: { id: true, name: true } },
    },
  })) as RootRow[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const latestReplies = await loadLatestReplies(
    prisma,
    page.map((row) => row.id),
  );
  const last = page[page.length - 1];

  return {
    threads: page.map((row) =>
      toListItem(row, row.latestReplyAt ? (latestReplies.get(row.id) ?? null) : null),
    ),
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last?.latestReplyAt
          ? encodeThreadCursor({
              latestReplyAt: last.latestReplyAt.toISOString(),
              id: last.id,
            })
          : null,
    },
  };
}

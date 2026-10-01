/**
 * Workspace mentions listing (Audit 12).
 *
 * Messages where `MessageMention.mentionedUserId = caller` inside containers
 * the caller can still access (public channel, private with membership, or
 * DM participation). Soft-deleted messages never appear even if a stale
 * mention row remains (rows are cleared on soft-delete, but we still filter).
 * Ordered by mention row createdAt DESC, message id DESC with an opaque
 * keyset cursor. Workspace membership is enforced first; non-members and
 * unknown workspaces share one 404.
 */

import type { PrismaClient } from '@teamflow/db';
import { getMembershipRole } from '../workspaces/authorization';
import { decodeMentionCursor, encodeMentionCursor } from './cursor';

export interface MentionAuthor {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface MentionContainer {
  type: 'channel' | 'directMessage';
  id: string;
  name: string;
  slug?: string;
}

export interface MentionListItem {
  id: string;
  body: string;
  createdAt: Date;
  parentMessageId: string | null;
  author: MentionAuthor;
  container: MentionContainer;
}

export interface MentionPage {
  mentions: MentionListItem[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
}

export class MentionListNotFoundError extends Error {
  constructor(message = 'Workspace not found.') {
    super(message);
    this.name = 'MentionListNotFoundError';
  }
}

export class MentionListValidationError extends Error {
  constructor(message = 'Invalid request.') {
    super(message);
    this.name = 'MentionListValidationError';
  }
}

export interface ListWorkspaceMentionsInput {
  workspaceId: string;
  userId: string;
  limit?: number;
  cursor?: string;
}

const authorSelect = { id: true, name: true, email: true, image: true } as const;

type MentionRow = {
  createdAt: Date;
  message: {
    id: string;
    body: string;
    createdAt: Date;
    parentMessageId: string | null;
    author: MentionAuthor;
    channel: { id: string; name: string; slug: string } | null;
    directMessageConversation: {
      id: string;
      name: string | null;
      participants: Array<{ user: { id: string; name: string } }>;
    } | null;
  };
};

function dmDisplayName(
  conversation: NonNullable<MentionRow['message']['directMessageConversation']>,
  currentUserId: string,
): string {
  if (conversation.name && conversation.name.trim().length > 0) {
    return conversation.name;
  }
  const peer = conversation.participants.find((p) => p.user.id !== currentUserId);
  return peer?.user.name ?? 'Direct message';
}

function toListItem(row: MentionRow, currentUserId: string): MentionListItem {
  const message = row.message;
  const container: MentionContainer = message.channel
    ? { type: 'channel', id: message.channel.id, name: message.channel.name, slug: message.channel.slug }
    : {
        type: 'directMessage',
        id: message.directMessageConversation?.id ?? '',
        name: message.directMessageConversation
          ? dmDisplayName(message.directMessageConversation, currentUserId)
          : 'Direct message',
      };
  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt,
    parentMessageId: message.parentMessageId,
    author: message.author,
    container,
  };
}

export async function listWorkspaceMentions(
  prisma: PrismaClient,
  input: ListWorkspaceMentionsInput,
): Promise<MentionPage> {
  const role = await getMembershipRole(prisma, input.workspaceId, input.userId);
  if (!role) {
    throw new MentionListNotFoundError('Workspace not found.');
  }

  const limit = input.limit ?? 50;
  let cursor: { createdAt: Date; messageId: string } | undefined;
  if (input.cursor !== undefined) {
    const decoded = decodeMentionCursor(input.cursor);
    if (!decoded) {
      throw new MentionListValidationError('Invalid pagination cursor.');
    }
    cursor = { createdAt: new Date(decoded.createdAt), messageId: decoded.messageId };
  }

  const rows = (await prisma.messageMention.findMany({
    where: {
      mentionedUserId: input.userId,
      // Keyset on the mention row (createdAt DESC, messageId DESC).
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, messageId: { lt: cursor.messageId } },
            ],
          }
        : {}),
      message: {
        deletedAt: null,
        // Accessible container only (same shape as threads listing).
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
    },
    orderBy: [{ createdAt: 'desc' }, { messageId: 'desc' }],
    take: limit + 1,
    select: {
      createdAt: true,
      messageId: true,
      message: {
        select: {
          id: true,
          body: true,
          createdAt: true,
          parentMessageId: true,
          author: { select: authorSelect },
          channel: { select: { id: true, name: true, slug: true } },
          directMessageConversation: {
            select: {
              id: true,
              name: true,
              participants: { select: { user: { select: { id: true, name: true } } } },
            },
          },
        },
      },
    },
  })) as MentionRow[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    mentions: page.map((row) => toListItem(row, input.userId)),
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeMentionCursor({
              createdAt: last.createdAt.toISOString(),
              messageId: last.message.id,
            })
          : null,
    },
  };
}

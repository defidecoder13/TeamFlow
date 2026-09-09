/**
 * Message domain operations (Phase 4A).
 *
 * Pure database logic — no Express, no session handling. Every function takes
 * an explicit PrismaClient. Persistence rule: every mutation commits to
 * PostgreSQL and returns the persisted row, so a future realtime layer can
 * publish only after this service resolves. No broadcast happens here.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@teamflow/db';
import { authorizeChannelAccess, isMessageAuthor } from './authorization';
import { decodeMessageCursor, encodeMessageCursor } from './cursor';

export interface MessageAuthor {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

/** Safe message representation. `body` is null once soft-deleted. */
export interface MessageResponse {
  id: string;
  channelId: string | null;
  directMessageConversationId?: string | null;
  parentMessageId?: string | null;
  body: string | null;
  replyCount?: number;
  latestReplyAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  author: MessageAuthor;
}

export interface MessagePage {
  messages: MessageResponse[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
}

export class MessageNotFoundError extends Error {
  constructor(message = 'Message not found.') {
    super(message);
    this.name = 'MessageNotFoundError';
  }
}

export class MessageForbiddenError extends Error {
  constructor() {
    super('You do not have permission.');
    this.name = 'MessageForbiddenError';
  }
}

export class MessageConflictError extends Error {
  constructor(message = 'This message cannot be changed.') {
    super(message);
    this.name = 'MessageConflictError';
  }
}

const authorSelect = { id: true, name: true, email: true, image: true } as const;

type MessageRow = {
  id: string;
  channelId?: string | null;
  directMessageConversationId?: string | null;
  parentMessageId?: string | null;
  body: string;
  replyCount?: number;
  latestReplyAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  author: MessageAuthor;
};

function toResponse(message: MessageRow): MessageResponse {
  return {
    id: message.id,
    channelId: message.channelId ?? null,
    directMessageConversationId: message.directMessageConversationId ?? null,
    parentMessageId: message.parentMessageId ?? null,
    body: message.deletedAt ? null : message.body,
    replyCount: message.replyCount ?? 0,
    latestReplyAt: message.latestReplyAt ?? null,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    author: message.author,
  };
}

/**
 * Helper to authorize container access (either Channel or DirectMessageConversation).
 */
async function authorizeMessageContainerAccess(
  prisma: PrismaClient,
  container: { channelId?: string | null; directMessageConversationId?: string | null },
  userId: string,
): Promise<boolean> {
  if (container.channelId) {
    const channel = await authorizeChannelAccess(prisma, {
      channelId: container.channelId,
      userId,
    });
    return channel !== null;
  }
  if (container.directMessageConversationId) {
    const participant = await prisma.directMessageParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: container.directMessageConversationId,
          userId,
        },
      },
      select: { id: true },
    });
    return participant !== null;
  }
  return false;
}

/**
 * Persist a message and return it. Supports either channelId or
 * directMessageConversationId.
 */
export async function createMessage(
  prisma: PrismaClient,
  input: {
    channelId?: string;
    directMessageConversationId?: string;
    authorId: string;
    body: string;
  },
): Promise<MessageResponse> {
  if (
    (!input.channelId && !input.directMessageConversationId) ||
    (input.channelId && input.directMessageConversationId)
  ) {
    throw new MessageConflictError(
      'Message must specify exactly one of channelId or directMessageConversationId.',
    );
  }

  const message = await prisma.message.create({
    data: {
      id: randomUUID(),
      channelId: input.channelId ?? null,
      directMessageConversationId: input.directMessageConversationId ?? null,
      authorId: input.authorId,
      body: input.body,
    },
    include: { author: { select: authorSelect } },
  });
  return toResponse(message);
}

export interface ListMessagesInput {
  channelId: string;
  limit?: number;
  cursor?: string;
}

/**
 * Keyset-paginated messages, newest first ((createdAt, id) DESC). Deleted
 * rows stay in sequence with nulled bodies so pagination never shifts.
 * Thread replies are explicitly excluded (parentMessageId: null) so they
 * never appear in the main channel timeline.
 */
export async function listMessages(
  prisma: PrismaClient,
  input: ListMessagesInput,
): Promise<MessagePage> {
  const limit = input.limit ?? 50;
  const decoded = input.cursor === undefined ? null : decodeMessageCursor(input.cursor);
  if (input.cursor !== undefined && !decoded) {
    throw new MessageConflictError('Invalid pagination cursor.');
  }
  const messages = await prisma.message.findMany({
    where: {
      channelId: input.channelId,
      parentMessageId: null,
      ...(decoded
        ? {
            OR: [
              { createdAt: { lt: new Date(decoded.createdAt) } },
              { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
            ],
          }
        : {}),
    },
    include: { author: { select: authorSelect } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const last = page[page.length - 1];
  return {
    messages: page.map(toResponse),
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeMessageCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    },
  };
}

export interface CreateThreadReplyInput {
  messageId: string;
  authorId?: string;
  userId?: string;
  body: string;
}

export interface CreateThreadReplyResult {
  reply: MessageResponse;
  parent: MessageResponse;
}

/**
 * Create a reply in a thread. If `input.messageId` is already a reply, its
 * root message is resolved so replies cannot become parents (max depth = 1).
 * The reply creation and parent counter/timestamp update commit atomically
 * in a transaction to prevent replyCount drift.
 */
export async function createThreadReply(
  prisma: PrismaClient,
  input: CreateThreadReplyInput,
): Promise<CreateThreadReplyResult> {
  const authorId = input.authorId ?? input.userId;
  if (!authorId) {
    throw new MessageForbiddenError();
  }

  const target = await prisma.message.findUnique({
    where: { id: input.messageId },
    select: {
      id: true,
      channelId: true,
      directMessageConversationId: true,
      parentMessageId: true,
    },
  });
  if (!target) {
    throw new MessageNotFoundError();
  }

  const hasAccess = await authorizeMessageContainerAccess(prisma, target, authorId);
  if (!hasAccess) {
    throw new MessageNotFoundError();
  }

  // Enforce max depth = 1: target may be a root or a reply.
  const rootId = target.parentMessageId ?? target.id;

  const now = new Date();
  const { created, updatedParent } = await prisma.$transaction(
    async (tx) => {
      const created = await tx.message.create({
        data: {
          id: randomUUID(),
          channelId: target.channelId ?? null,
          directMessageConversationId: target.directMessageConversationId ?? null,
          authorId,
          parentMessageId: rootId,
          body: input.body,
          createdAt: now,
          updatedAt: now,
        },
        include: { author: { select: authorSelect } },
      });

      const updatedParent = await tx.message.update({
        where: { id: rootId },
        data: {
          replyCount: { increment: 1 },
          latestReplyAt: now,
        },
        include: { author: { select: authorSelect } },
      });

      return { created, updatedParent };
    },
    { maxWait: 10000, timeout: 20000 },
  );

  return {
    reply: toResponse(created),
    parent: toResponse(updatedParent),
  };
}

export interface ListThreadRepliesInput {
  messageId: string;
  userId: string;
  limit?: number;
  cursor?: string;
}

/**
 * Keyset-paginated thread replies, newest first ((createdAt, id) DESC).
 * If the target message is itself a reply, resolves the root thread.
 */
export async function listThreadReplies(
  prisma: PrismaClient,
  input: ListThreadRepliesInput,
): Promise<MessagePage> {
  const limit = input.limit ?? 50;
  const target = await prisma.message.findUnique({
    where: { id: input.messageId },
    select: {
      id: true,
      channelId: true,
      directMessageConversationId: true,
      parentMessageId: true,
    },
  });
  if (!target) {
    throw new MessageNotFoundError();
  }

  const hasAccess = await authorizeMessageContainerAccess(prisma, target, input.userId);
  if (!hasAccess) {
    throw new MessageNotFoundError();
  }

  const rootId = target.parentMessageId ?? target.id;

  const decoded = input.cursor === undefined ? null : decodeMessageCursor(input.cursor);
  if (input.cursor !== undefined && !decoded) {
    throw new MessageConflictError('Invalid pagination cursor.');
  }

  const replies = await prisma.message.findMany({
    where: {
      parentMessageId: rootId,
      ...(decoded
        ? {
            OR: [
              { createdAt: { lt: new Date(decoded.createdAt) } },
              { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
            ],
          }
        : {}),
    },
    include: { author: { select: authorSelect } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = replies.length > limit;
  const page = hasMore ? replies.slice(0, limit) : replies;
  const last = page[page.length - 1];

  return {
    messages: page.map(toResponse),
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeMessageCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    },
  };
}

async function resolveAuthoredMessage(
  prisma: PrismaClient,
  input: { messageId: string; userId: string },
) {
  const message = await prisma.message.findUnique({
    where: { id: input.messageId },
    include: {
      channel: { select: { id: true } },
      author: { select: authorSelect },
    },
  });
  if (!message) {
    throw new MessageNotFoundError();
  }
  const hasAccess = await authorizeMessageContainerAccess(prisma, message, input.userId);
  if (!hasAccess) {
    throw new MessageNotFoundError();
  }
  if (!isMessageAuthor(message, input.userId)) {
    throw new MessageForbiddenError();
  }
  return message;
}

/**
 * Edit own message: body + updatedAt + editedAt. Deleted messages cannot be
 * edited (409). No version history is kept in this phase.
 */
export async function updateMessage(
  prisma: PrismaClient,
  input: { messageId: string; userId: string; body: string },
): Promise<MessageResponse> {
  const message = await resolveAuthoredMessage(prisma, input);
  if (message.deletedAt) {
    throw new MessageConflictError('Deleted messages cannot be edited.');
  }
  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { body: input.body, editedAt: new Date() },
    include: { author: { select: authorSelect } },
  });
  return toResponse(updated);
}

/**
 * Soft-delete own message: sets deletedAt, keeps the row (threads,
 * reactions, audit, and realtime events may reference it later). Repeat
 * deletes are idempotent. The tombstone never exposes the original body.
 */
export async function deleteMessage(
  prisma: PrismaClient,
  input: { messageId: string; userId: string },
): Promise<MessageResponse> {
  const message = await resolveAuthoredMessage(prisma, input);
  if (message.deletedAt) {
    return toResponse(message);
  }
  const deleted = await prisma.message.update({
    where: { id: message.id },
    data: { deletedAt: new Date() },
    include: { author: { select: authorSelect } },
  });
  return toResponse(deleted);
}

export interface MessageReactionResponse {
  id: string;
  messageId: string;
  channelId: string | null;
  directMessageConversationId?: string | null;
  userId: string;
  emoji: string;
  createdAt: Date;
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean;
  userIds: string[];
}

export interface AddMessageReactionInput {
  messageId: string;
  userId: string;
  emoji: string;
}

export async function addMessageReaction(
  prisma: PrismaClient,
  input: AddMessageReactionInput,
): Promise<MessageReactionResponse> {
  const target = await prisma.message.findUnique({
    where: { id: input.messageId },
    select: {
      id: true,
      channelId: true,
      directMessageConversationId: true,
      deletedAt: true,
    },
  });
  if (!target) {
    throw new MessageNotFoundError();
  }

  const hasAccess = await authorizeMessageContainerAccess(prisma, target, input.userId);
  if (!hasAccess) {
    throw new MessageNotFoundError();
  }

  if (target.deletedAt) {
    throw new MessageConflictError('Cannot react to a deleted message.');
  }

  try {
    const reaction = await prisma.messageReaction.create({
      data: {
        id: randomUUID(),
        messageId: target.id,
        userId: input.userId,
        emoji: input.emoji,
      },
    });

    return {
      id: reaction.id,
      messageId: reaction.messageId,
      channelId: target.channelId ?? null,
      ...(target.directMessageConversationId !== undefined
        ? { directMessageConversationId: target.directMessageConversationId }
        : {}),
      userId: reaction.userId,
      emoji: reaction.emoji,
      createdAt: reaction.createdAt,
    };
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      throw new MessageConflictError('Reaction already exists.');
    }
    throw error;
  }
}

export interface RemoveMessageReactionInput {
  messageId: string;
  userId: string;
  emoji: string;
}

export async function removeMessageReaction(
  prisma: PrismaClient,
  input: RemoveMessageReactionInput,
): Promise<{ channelId: string | null; directMessageConversationId?: string | null }> {
  const target = await prisma.message.findUnique({
    where: { id: input.messageId },
    select: { id: true, channelId: true, directMessageConversationId: true },
  });
  if (!target) {
    throw new MessageNotFoundError();
  }

  const hasAccess = await authorizeMessageContainerAccess(prisma, target, input.userId);
  if (!hasAccess) {
    throw new MessageNotFoundError();
  }

  const result = await prisma.messageReaction.deleteMany({
    where: {
      messageId: target.id,
      userId: input.userId,
      emoji: input.emoji,
    },
  });

  if (result.count === 0) {
    throw new MessageNotFoundError('Reaction not found.');
  }

  return {
    channelId: target.channelId ?? null,
    ...(target.directMessageConversationId !== undefined
      ? { directMessageConversationId: target.directMessageConversationId }
      : {}),
  };
}

export interface GetMessageReactionsInput {
  messageId: string;
  userId: string;
}

export async function getMessageReactions(
  prisma: PrismaClient,
  input: GetMessageReactionsInput,
): Promise<MessageReactionSummary[]> {
  const target = await prisma.message.findUnique({
    where: { id: input.messageId },
    select: { id: true, channelId: true, directMessageConversationId: true },
  });
  if (!target) {
    throw new MessageNotFoundError();
  }

  const hasAccess = await authorizeMessageContainerAccess(prisma, target, input.userId);
  if (!hasAccess) {
    throw new MessageNotFoundError();
  }

  const reactions = await prisma.messageReaction.findMany({
    where: { messageId: target.id },
    orderBy: { createdAt: 'asc' },
  });

  const map = new Map<string, { count: number; userIds: string[]; reacted: boolean }>();
  for (const r of reactions) {
    let entry = map.get(r.emoji);
    if (!entry) {
      entry = { count: 0, userIds: [], reacted: false };
      map.set(r.emoji, entry);
    }
    entry.count += 1;
    entry.userIds.push(r.userId);
    if (r.userId === input.userId) {
      entry.reacted = true;
    }
  }

  const summaries: MessageReactionSummary[] = [];
  for (const [emoji, data] of map.entries()) {
    summaries.push({
      emoji,
      count: data.count,
      reacted: data.reacted,
      userIds: data.userIds,
    });
  }

  return summaries;
}

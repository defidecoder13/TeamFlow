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
  channelId: string;
  body: string | null;
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
  constructor() {
    super('Message not found.');
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
  channelId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  author: MessageAuthor;
};

function toResponse(message: MessageRow): MessageResponse {
  return {
    id: message.id,
    channelId: message.channelId,
    body: message.deletedAt ? null : message.body,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    editedAt: message.editedAt,
    deletedAt: message.deletedAt,
    author: message.author,
  };
}

/**
 * Persist a message and return it. The insert commits before this function
 * resolves — the single choke point a future realtime publish step will sit
 * behind. Author/channel come from the route, never the client.
 */
export async function createMessage(
  prisma: PrismaClient,
  input: { channelId: string; authorId: string; body: string },
): Promise<MessageResponse> {
  const message = await prisma.message.create({
    data: {
      id: randomUUID(),
      channelId: input.channelId,
      authorId: input.authorId,
      body: input.body,
    },
    include: { author: { select: authorSelect } },
  });
  return toResponse(message);
}

export interface ListMessagesInput {
  channelId: string;
  limit: number;
  cursor?: string;
}

/**
 * Keyset-paginated messages, newest first ((createdAt, id) DESC). Deleted
 * rows stay in sequence with nulled bodies so pagination never shifts.
 */
export async function listMessages(
  prisma: PrismaClient,
  input: ListMessagesInput,
): Promise<MessagePage> {
  const decoded = input.cursor === undefined ? null : decodeMessageCursor(input.cursor);
  if (input.cursor !== undefined && !decoded) {
    throw new MessageConflictError('Invalid pagination cursor.');
  }
  const messages = await prisma.message.findMany({
    where: {
      channelId: input.channelId,
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
    take: input.limit + 1,
  });
  const hasMore = messages.length > input.limit;
  const page = hasMore ? messages.slice(0, input.limit) : messages;
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
  const channel = await authorizeChannelAccess(prisma, {
    channelId: message.channelId,
    userId: input.userId,
  });
  if (!channel) {
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

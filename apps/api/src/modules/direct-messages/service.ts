/**
 * Direct Message domain operations (Phase 4F.1 & Phase 4F.2).
 *
 * Scopes DMs to workspace boundaries. 1-to-1 DMs are uniquely identified by
 * normalized (participantAId < participantBId) pairs. Reuses the core Message
 * model via directMessageConversationId.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@teamflow/db';
import {
  authorizeDirectConversationAccess,
  authorizeDirectConversationAdmin,
  canCreateDirectConversation,
} from './authorization';
import { decodeConversationCursor, encodeConversationCursor } from './cursor';
import { decodeMessageCursor, encodeMessageCursor } from '../messages/cursor';
import type { MessagePage, MessageResponse } from '../messages/service';
import {
  emitDirectConversationUpdated,
  emitDirectParticipantAdded,
  emitDirectParticipantRemoved,
  removeUserFromDirectConversationRoom,
} from '../realtime/index';
import { hasControlCharacters } from './validation';

export interface ParticipantProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role?: 'ADMIN' | 'MEMBER';
  joinedAt?: Date;
}

export interface DirectConversationResponse {
  id: string;
  workspaceId: string;
  type: 'DIRECT' | 'GROUP';
  name?: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: ParticipantProfile[];
  participant: ParticipantProfile | null;
  peer: ParticipantProfile | null;
  participantCount?: number;
  currentUserRole?: 'ADMIN' | 'MEMBER';
  unreadCount?: number;
  hasUnread?: boolean;
  lastReadMessageId?: string | null;
}

export interface ConversationUnreadInfo {
  conversationId: string;
  unreadCount: number;
  hasUnread: boolean;
  lastReadMessageId: string | null;
}

export interface WorkspaceDirectUnreadResponse {
  conversations: ConversationUnreadInfo[];
  totalUnreadCount: number;
}

export interface DirectMessageReadStateResponse {
  conversationId: string;
  userId: string;
  lastReadMessageId: string | null;
  lastReadAt: Date;
}

export interface DirectConversationPage {
  conversations: DirectConversationResponse[];
  pageInfo: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export class DirectMessageNotFoundError extends Error {
  constructor(message = 'Direct message conversation not found.') {
    super(message);
    this.name = 'DirectMessageNotFoundError';
  }
}

export class DirectMessageForbiddenError extends Error {
  constructor(message = 'You do not have permission.') {
    super(message);
    this.name = 'DirectMessageForbiddenError';
  }
}

export class DirectMessageConflictError extends Error {
  constructor(message = 'Invalid direct conversation operation.') {
    super(message);
    this.name = 'DirectMessageConflictError';
  }
}

export class DirectMessageValidationError extends Error {
  constructor(message = 'Validation failed.') {
    super(message);
    this.name = 'DirectMessageValidationError';
  }
}

const userProfileSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

const conversationInclude = {
  participants: {
    include: {
      user: {
        select: userProfileSelect,
      },
    },
    orderBy: { joinedAt: 'asc' as const },
  },
} as const;

type ConversationWithParticipants = {
  id: string;
  workspaceId: string;
  type: 'DIRECT' | 'GROUP';
  name?: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: {
    id?: string;
    userId?: string;
    role?: 'ADMIN' | 'MEMBER';
    joinedAt?: Date;
    user: ParticipantProfile;
  }[];
  _count?: {
    participants: number;
  };
};

function toConversationResponse(
  conversation: Partial<ConversationWithParticipants> & {
    id: string;
    workspaceId: string;
    type: 'DIRECT' | 'GROUP';
    name?: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: {
      participants: number;
    };
  },
  currentUserId?: string,
  unreadInfo?: ConversationUnreadInfo | null,
): DirectConversationResponse {
  const participants: ParticipantProfile[] = Array.isArray(conversation.participants)
    ? conversation.participants.map((p) => ({
        ...p.user,
        role: p.role,
        joinedAt: p.joinedAt,
      }))
    : [];
  const otherParticipant = currentUserId
    ? (participants.find((p) => p.id !== currentUserId) ?? null)
    : null;

  const currentParticipant =
    currentUserId && Array.isArray(conversation.participants)
      ? conversation.participants.find(
          (p) =>
            (p as { userId?: string }).userId === currentUserId || p.user?.id === currentUserId,
        )
      : null;
  const currentUserRole = currentParticipant?.role;

  const participantCount =
    conversation._count?.participants !== undefined
      ? conversation._count.participants
      : participants.length;

  return {
    id: conversation.id,
    workspaceId: conversation.workspaceId,
    type: conversation.type,
    name: conversation.name ?? null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    participants,
    participant: conversation.type === 'GROUP' ? null : otherParticipant,
    peer: conversation.type === 'GROUP' ? null : otherParticipant,
    participantCount,
    currentUserRole,
    unreadCount: unreadInfo?.unreadCount ?? 0,
    hasUnread: unreadInfo?.hasUnread ?? false,
    lastReadMessageId: unreadInfo?.lastReadMessageId ?? null,
  };
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}

export interface GetOrCreateDirectConversationInput {
  workspaceId: string;
  userId: string;
  recipientId?: string;
  targetUserId?: string;
}

/**
 * Get or create a 1-to-1 direct conversation between two users in a workspace.
 * Normalized ordering (participantAId < participantBId) combined with a database
 * unique constraint guarantees idempotent, race-safe resolution.
 */
export async function getOrCreateDirectConversation(
  prisma: PrismaClient,
  input: GetOrCreateDirectConversationInput,
): Promise<DirectConversationResponse> {
  const recipientId = input.recipientId ?? input.targetUserId;
  if (!recipientId) {
    throw new DirectMessageValidationError('Recipient ID is required.');
  }

  const check = await canCreateDirectConversation(prisma, {
    workspaceId: input.workspaceId,
    userId: input.userId,
    targetUserId: recipientId,
  });
  if (!check.ok) {
    if (check.reason === 'SELF_DM') {
      throw new DirectMessageValidationError('Cannot start a direct message with yourself.');
    }
    if (check.reason === 'TARGET_NOT_IN_WORKSPACE') {
      throw new DirectMessageValidationError('Recipient is not a member of this workspace.');
    }
    throw new DirectMessageNotFoundError('Workspace not found.');
  }

  // Deterministic ordering for 1-to-1 pair
  const [participantAId, participantBId] =
    input.userId < recipientId ? [input.userId, recipientId] : [recipientId, input.userId];

  // 1. Check if conversation already exists
  const existing = await prisma.directMessageConversation.findUnique({
    where: {
      workspaceId_type_participantAId_participantBId: {
        workspaceId: input.workspaceId,
        type: 'DIRECT',
        participantAId,
        participantBId,
      },
    },
    include: conversationInclude,
  });

  if (existing) {
    return toConversationResponse(existing, input.userId);
  }

  // 2. Create atomically in transaction, with race-condition catch for concurrent creates
  try {
    const created = await prisma.$transaction(async (tx) => {
      return await tx.directMessageConversation.create({
        data: {
          id: randomUUID(),
          workspaceId: input.workspaceId,
          type: 'DIRECT',
          participantAId,
          participantBId,
          participants: {
            create: [
              { id: randomUUID(), userId: participantAId },
              { id: randomUUID(), userId: participantBId },
            ],
          },
        },
        include: conversationInclude,
      });
    });

    const unreadInfo = await getDirectConversationUnread(prisma, {
      conversationId: created.id,
      userId: input.userId,
    });
    return toConversationResponse(created, input.userId, unreadInfo);
  } catch (error: unknown) {
    if (isPrismaUniqueConstraintError(error)) {
      // Concurrent request won the race: retrieve and return the created record
      const concurrent = await prisma.directMessageConversation.findUnique({
        where: {
          workspaceId_type_participantAId_participantBId: {
            workspaceId: input.workspaceId,
            type: 'DIRECT',
            participantAId,
            participantBId,
          },
        },
        include: conversationInclude,
      });
      if (concurrent) {
        const unreadInfo = await getDirectConversationUnread(prisma, {
          conversationId: concurrent.id,
          userId: input.userId,
        });
        return toConversationResponse(concurrent, input.userId, unreadInfo);
      }
    }
    throw error;
  }
}

export interface GetDirectConversationInput {
  conversationId: string;
  userId: string;
}

export async function getDirectConversation(
  prisma: PrismaClient,
  input: GetDirectConversationInput,
): Promise<DirectConversationResponse> {
  const authorized = await authorizeDirectConversationAccess(prisma, input);
  if (!authorized) {
    throw new DirectMessageNotFoundError();
  }

  const conversation = await prisma.directMessageConversation.findUnique({
    where: { id: input.conversationId },
    include: {
      ...conversationInclude,
      _count: {
        select: { participants: true },
      },
    },
  });
  if (!conversation) {
    throw new DirectMessageNotFoundError();
  }

  const unreadInfo = await getDirectConversationUnread(prisma, {
    conversationId: input.conversationId,
    userId: input.userId,
  });

  return toConversationResponse(conversation, input.userId, unreadInfo);
}

export interface ListUserDirectConversationsInput {
  workspaceId: string;
  userId: string;
  limit?: number;
  cursor?: string;
}

export async function listUserDirectConversations(
  prisma: PrismaClient,
  input: ListUserDirectConversationsInput,
): Promise<DirectConversationPage> {
  const membership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new DirectMessageNotFoundError('Workspace not found.');
  }

  const limit = input.limit ?? 50;
  const decoded = input.cursor === undefined ? null : decodeConversationCursor(input.cursor);
  if (input.cursor !== undefined && !decoded) {
    throw new DirectMessageValidationError('Invalid pagination cursor.');
  }

  const conversations = await prisma.directMessageConversation.findMany({
    where: {
      workspaceId: input.workspaceId,
      participants: {
        some: { userId: input.userId },
      },
      ...(decoded
        ? {
            OR: [
              { updatedAt: { lt: new Date(decoded.updatedAt) } },
              { updatedAt: new Date(decoded.updatedAt), id: { lt: decoded.id } },
            ],
          }
        : {}),
    },
    include: {
      ...conversationInclude,
      _count: {
        select: { participants: true },
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = conversations.length > limit;
  const page = hasMore ? conversations.slice(0, limit) : conversations;
  const last = page[page.length - 1];

  const conversationIds = page.map((c) => c.id);
  const unreadMap = await getWorkspaceDirectConversationsUnreadMap(prisma, {
    userId: input.userId,
    conversationIds,
  });

  return {
    conversations: page.map((conv) =>
      toConversationResponse(conv, input.userId, unreadMap.get(conv.id)),
    ),
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeConversationCursor({
              updatedAt: last.updatedAt.toISOString(),
              id: last.id,
            })
          : null,
    },
  };
}

export async function getConversationParticipants(
  prisma: PrismaClient,
  input: { conversationId: string; userId: string },
): Promise<ParticipantProfile[]> {
  const authorized = await authorizeDirectConversationAccess(prisma, input);
  if (!authorized) {
    throw new DirectMessageNotFoundError();
  }

  const participants = await prisma.directMessageParticipant.findMany({
    where: { conversationId: input.conversationId },
    include: { user: { select: userProfileSelect } },
    orderBy: { joinedAt: 'asc' },
  });

  return participants.map((p) => ({
    ...p.user,
    role: p.role,
    joinedAt: p.joinedAt,
  }));
}

export interface CreateDirectMessageInput {
  conversationId: string;
  authorId: string;
  body: string;
}

/**
 * Persist a direct message in a conversation. Ensures author is a participant.
 */
export async function createDirectMessage(
  prisma: PrismaClient,
  input: CreateDirectMessageInput,
): Promise<MessageResponse> {
  const authorized = await authorizeDirectConversationAccess(prisma, {
    conversationId: input.conversationId,
    userId: input.authorId,
  });
  if (!authorized) {
    throw new DirectMessageNotFoundError();
  }

  const trimmedBody = input.body.trim();
  if (trimmedBody.length === 0) {
    throw new DirectMessageValidationError('Message cannot be empty.');
  }

  const now = new Date();
  const { message } = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        id: randomUUID(),
        directMessageConversationId: input.conversationId,
        authorId: input.authorId,
        body: trimmedBody,
        createdAt: now,
        updatedAt: now,
      },
      include: { author: { select: userProfileSelect } },
    });

    await tx.directMessageConversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: now },
    });

    return { message };
  });

  return {
    id: message.id,
    channelId: null,
    directMessageConversationId: message.directMessageConversationId,
    parentMessageId: null,
    body: message.body,
    replyCount: 0,
    latestReplyAt: null,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    editedAt: null,
    deletedAt: null,
    author: message.author,
  };
}

export interface ListDirectMessagesInput {
  conversationId: string;
  userId: string;
  limit?: number;
  cursor?: string;
}

/**
 * Keyset-paginated direct messages, newest first. Thread replies are excluded.
 */
export async function listDirectMessages(
  prisma: PrismaClient,
  input: ListDirectMessagesInput,
): Promise<MessagePage> {
  const authorized = await authorizeDirectConversationAccess(prisma, {
    conversationId: input.conversationId,
    userId: input.userId,
  });
  if (!authorized) {
    throw new DirectMessageNotFoundError();
  }

  const limit = input.limit ?? 50;
  const decoded = input.cursor === undefined ? null : decodeMessageCursor(input.cursor);
  if (input.cursor !== undefined && !decoded) {
    throw new DirectMessageValidationError('Invalid pagination cursor.');
  }

  const messages = await prisma.message.findMany({
    where: {
      directMessageConversationId: input.conversationId,
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
    include: { author: { select: userProfileSelect } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  const last = page[page.length - 1];

  return {
    messages: page.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      directMessageConversationId: m.directMessageConversationId,
      parentMessageId: m.parentMessageId ?? null,
      body: m.deletedAt ? null : m.body,
      replyCount: m.replyCount ?? 0,
      latestReplyAt: m.latestReplyAt ?? null,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      editedAt: m.editedAt,
      deletedAt: m.deletedAt,
      author: m.author,
    })),
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeMessageCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    },
  };
}

export async function getWorkspaceDirectConversationsUnreadMap(
  prisma: PrismaClient,
  input: { userId: string; conversationIds: string[] },
): Promise<Map<string, ConversationUnreadInfo>> {
  const result = new Map<string, ConversationUnreadInfo>();
  if (input.conversationIds.length === 0) {
    return result;
  }

  // 1. Fetch read states for the requested conversations
  const readStates = await prisma.directMessageReadState.findMany({
    where: {
      userId: input.userId,
      conversationId: { in: input.conversationIds },
    },
    include: {
      lastReadMessage: {
        select: { id: true, createdAt: true },
      },
    },
  });

  const readStateByConv = new Map<string, NonNullable<(typeof readStates)[number]>>();
  for (const rs of readStates ?? []) {
    readStateByConv.set(rs.conversationId, rs);
  }

  for (const cid of input.conversationIds) {
    const rs = readStateByConv.get(cid);
    result.set(cid, {
      conversationId: cid,
      unreadCount: 0,
      hasUnread: false,
      lastReadMessageId: rs?.lastReadMessageId ?? null,
    });
  }

  // 2. Fetch candidate root messages (not authored by current user, not soft-deleted)
  const unreadCandidates = await prisma.message.findMany({
    where: {
      directMessageConversationId: { in: input.conversationIds },
      parentMessageId: null,
      authorId: { not: input.userId },
      deletedAt: null,
    },
    select: {
      id: true,
      directMessageConversationId: true,
      authorId: true,
      createdAt: true,
    },
  });

  // 3. Compute unread count per conversation
  for (const msg of unreadCandidates) {
    if (msg.authorId === input.userId) continue;
    const cid = msg.directMessageConversationId!;
    const info = result.get(cid);
    if (!info) continue;

    const rs = readStateByConv.get(cid);
    let isUnread = false;

    if (!rs) {
      // No read state ever recorded: all non-self root messages are unread
      isUnread = true;
    } else if (rs.lastReadMessage) {
      const cur = rs.lastReadMessage;
      // Monotonic check: message is strictly newer than lastReadMessage
      if (
        msg.createdAt > cur.createdAt ||
        (msg.createdAt.getTime() === cur.createdAt.getTime() && msg.id > cur.id)
      ) {
        isUnread = true;
      }
    } else {
      // Read state exists with null messageId (e.g. marked read when conversation was empty)
      if (msg.createdAt > rs.lastReadAt) {
        isUnread = true;
      }
    }

    if (isUnread) {
      info.unreadCount += 1;
      info.hasUnread = true;
    }
  }

  return result;
}

export async function getDirectConversationUnread(
  prisma: PrismaClient,
  input: { conversationId: string; userId: string },
): Promise<ConversationUnreadInfo> {
  const map = await getWorkspaceDirectConversationsUnreadMap(prisma, {
    userId: input.userId,
    conversationIds: [input.conversationId],
  });
  return (
    map.get(input.conversationId) ?? {
      conversationId: input.conversationId,
      unreadCount: 0,
      hasUnread: false,
      lastReadMessageId: null,
    }
  );
}

export async function getWorkspaceDirectConversationsUnread(
  prisma: PrismaClient,
  input: { workspaceId: string; userId: string },
): Promise<WorkspaceDirectUnreadResponse> {
  const membership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (!membership) {
    throw new DirectMessageNotFoundError('Workspace not found.');
  }

  const userConversations = await prisma.directMessageConversation.findMany({
    where: {
      workspaceId: input.workspaceId,
      participants: {
        some: { userId: input.userId },
      },
    },
    select: { id: true },
  });

  const conversationIds = (userConversations ?? []).map((c) => c.id);
  const unreadMap = await getWorkspaceDirectConversationsUnreadMap(prisma, {
    userId: input.userId,
    conversationIds,
  });

  const conversations = Array.from(unreadMap.values());
  const totalUnreadCount = conversations.reduce((acc, c) => acc + c.unreadCount, 0);

  return {
    conversations,
    totalUnreadCount,
  };
}

export interface MarkDirectConversationReadInput {
  conversationId: string;
  userId: string;
  messageId?: string;
}

export async function markDirectConversationRead(
  prisma: PrismaClient,
  input: MarkDirectConversationReadInput,
): Promise<DirectMessageReadStateResponse> {
  const authorized = await authorizeDirectConversationAccess(prisma, {
    conversationId: input.conversationId,
    userId: input.userId,
  });
  if (!authorized) {
    throw new DirectMessageNotFoundError();
  }

  return await prisma.$transaction(async (tx) => {
    let candidateMessage: { id: string; createdAt: Date } | null = null;

    if (input.messageId !== undefined) {
      const msg = await tx.message.findUnique({
        where: { id: input.messageId },
        select: {
          id: true,
          directMessageConversationId: true,
          parentMessageId: true,
          createdAt: true,
        },
      });

      if (
        !msg ||
        msg.directMessageConversationId !== input.conversationId ||
        msg.parentMessageId !== null
      ) {
        throw new DirectMessageValidationError(
          'Read marker must be a valid root message belonging to this conversation.',
        );
      }

      candidateMessage = { id: msg.id, createdAt: msg.createdAt };
    } else {
      const latest = await tx.message.findFirst({
        where: {
          directMessageConversationId: input.conversationId,
          parentMessageId: null,
        },
        select: { id: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      if (latest) {
        candidateMessage = { id: latest.id, createdAt: latest.createdAt };
      }
    }

    if (candidateMessage) {
      const existing = await tx.directMessageReadState.findUnique({
        where: {
          userId_conversationId: {
            userId: input.userId,
            conversationId: input.conversationId,
          },
        },
        include: {
          lastReadMessage: { select: { id: true, createdAt: true } },
        },
      });

      if (existing) {
        const currentCreatedAt = existing.lastReadMessage?.createdAt ?? existing.lastReadAt;
        // Monotonicity check: if candidate is older than or equal to current pointer, do NOT move backward
        const isOlderOrEqual =
          candidateMessage.createdAt < currentCreatedAt ||
          (existing.lastReadMessage &&
            candidateMessage.createdAt.getTime() === currentCreatedAt.getTime() &&
            candidateMessage.id <= existing.lastReadMessage.id);

        if (isOlderOrEqual) {
          return {
            conversationId: existing.conversationId,
            userId: existing.userId,
            lastReadMessageId: existing.lastReadMessageId,
            lastReadAt: existing.lastReadAt,
          };
        }
      }

      const upserted = await tx.directMessageReadState.upsert({
        where: {
          userId_conversationId: {
            userId: input.userId,
            conversationId: input.conversationId,
          },
        },
        create: {
          id: randomUUID(),
          conversationId: input.conversationId,
          userId: input.userId,
          lastReadMessageId: candidateMessage.id,
          lastReadAt: candidateMessage.createdAt,
        },
        update: {
          lastReadMessageId: candidateMessage.id,
          lastReadAt: candidateMessage.createdAt,
        },
      });

      return {
        conversationId: upserted.conversationId,
        userId: upserted.userId,
        lastReadMessageId: upserted.lastReadMessageId,
        lastReadAt: upserted.lastReadAt,
      };
    }

    // Empty conversation with 0 messages
    const now = new Date();
    const upserted = await tx.directMessageReadState.upsert({
      where: {
        userId_conversationId: {
          userId: input.userId,
          conversationId: input.conversationId,
        },
      },
      create: {
        id: randomUUID(),
        conversationId: input.conversationId,
        userId: input.userId,
        lastReadMessageId: null,
        lastReadAt: now,
      },
      update: {
        lastReadAt: now,
      },
    });

    return {
      conversationId: upserted.conversationId,
      userId: upserted.userId,
      lastReadMessageId: upserted.lastReadMessageId,
      lastReadAt: upserted.lastReadAt,
    };
  });
}

export interface CreateGroupConversationInput {
  workspaceId: string;
  userId: string;
  participantIds: string[];
  name?: string;
}

export async function createGroupConversation(
  prisma: PrismaClient,
  input: CreateGroupConversationInput,
): Promise<DirectConversationResponse> {
  const callerMembership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (!callerMembership) {
    throw new DirectMessageNotFoundError('Workspace not found.');
  }

  const trimmedParticipantIds = Array.from(
    new Set(input.participantIds.map((id) => id.trim())),
  ).filter(Boolean);

  if (trimmedParticipantIds.includes(input.userId)) {
    throw new DirectMessageValidationError('Cannot include yourself in the participant list.');
  }

  if (trimmedParticipantIds.length < 2) {
    throw new DirectMessageValidationError(
      'At least 2 other participants are required for a group conversation.',
    );
  }

  if (trimmedParticipantIds.length > 19) {
    throw new DirectMessageValidationError('A group conversation cannot exceed 20 participants.');
  }

  const participantMemberships = await prisma.workspaceMembership.findMany({
    where: {
      workspaceId: input.workspaceId,
      userId: { in: trimmedParticipantIds },
    },
    select: { userId: true },
  });

  if (participantMemberships.length !== trimmedParticipantIds.length) {
    throw new DirectMessageValidationError(
      'One or more participants are not members of this workspace.',
    );
  }

  let trimmedName: string | null = null;
  if (input.name !== undefined) {
    const rawTrimmed = input.name.trim();
    if (rawTrimmed.length > 0) {
      if (rawTrimmed.length > 100 || hasControlCharacters(rawTrimmed)) {
        throw new DirectMessageValidationError('Invalid group name.');
      }
      trimmedName = rawTrimmed;
    }
  }

  const conversationId = randomUUID();
  const created = await prisma.$transaction(async (tx) => {
    return await tx.directMessageConversation.create({
      data: {
        id: conversationId,
        workspaceId: input.workspaceId,
        type: 'GROUP',
        name: trimmedName,
        participantAId: null,
        participantBId: null,
        participants: {
          create: [
            { id: randomUUID(), userId: input.userId, role: 'ADMIN' },
            ...trimmedParticipantIds.map((targetId) => ({
              id: randomUUID(),
              userId: targetId,
              role: 'MEMBER' as const,
            })),
          ],
        },
      },
      include: {
        ...conversationInclude,
        _count: {
          select: { participants: true },
        },
      },
    });
  });

  return toConversationResponse(created, input.userId);
}

export interface RenameGroupConversationInput {
  conversationId: string;
  userId: string;
  name: string;
}

export async function renameGroupConversation(
  prisma: PrismaClient,
  input: RenameGroupConversationInput,
): Promise<DirectConversationResponse> {
  const check = await authorizeDirectConversationAdmin(prisma, {
    conversationId: input.conversationId,
    userId: input.userId,
  });

  if (!check.ok) {
    if (check.reason === 'FORBIDDEN') {
      throw new DirectMessageForbiddenError('Only group admins can rename the conversation.');
    }
    throw new DirectMessageNotFoundError('Direct message conversation not found.');
  }

  if (check.conversation.type !== 'GROUP') {
    throw new DirectMessageConflictError('Only group conversations can be renamed.');
  }

  const trimmedName = input.name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 100 || hasControlCharacters(trimmedName)) {
    throw new DirectMessageValidationError('Invalid group name.');
  }

  const updated = await prisma.directMessageConversation.update({
    where: { id: input.conversationId },
    data: {
      name: trimmedName,
      updatedAt: new Date(),
    },
    include: {
      ...conversationInclude,
      _count: {
        select: { participants: true },
      },
    },
  });

  emitDirectConversationUpdated(updated.id, {
    conversationId: updated.id,
    name: updated.name,
    updatedAt: updated.updatedAt,
  });

  const unreadInfo = await getDirectConversationUnread(prisma, {
    conversationId: input.conversationId,
    userId: input.userId,
  });

  return toConversationResponse(updated, input.userId, unreadInfo);
}

export interface AddConversationParticipantInput {
  conversationId: string;
  adminUserId: string;
  userId: string;
}

export async function addConversationParticipant(
  prisma: PrismaClient,
  input: AddConversationParticipantInput,
): Promise<DirectConversationResponse> {
  const check = await authorizeDirectConversationAdmin(prisma, {
    conversationId: input.conversationId,
    userId: input.adminUserId,
  });

  if (!check.ok) {
    if (check.reason === 'FORBIDDEN') {
      throw new DirectMessageForbiddenError('Only group admins can add participants.');
    }
    throw new DirectMessageNotFoundError('Direct message conversation not found.');
  }

  if (check.conversation.type !== 'GROUP') {
    throw new DirectMessageConflictError('Participants can only be added to group conversations.');
  }

  const targetMembership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: check.conversation.workspaceId,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (!targetMembership) {
    throw new DirectMessageValidationError('User is not a member of this workspace.');
  }

  const existing = await prisma.directMessageParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: input.conversationId,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (existing) {
    throw new DirectMessageConflictError('User is already a participant in this conversation.');
  }

  const { newParticipant, updatedConversation } = await prisma.$transaction(async (tx) => {
    // 1. Acquire row lock on conversation to serialize concurrent participant additions
    await tx.directMessageConversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });

    const currentCount = await tx.directMessageParticipant.count({
      where: { conversationId: input.conversationId },
    });
    if (currentCount >= 20) {
      throw new DirectMessageConflictError('A group conversation cannot exceed 20 participants.');
    }

    const participant = await tx.directMessageParticipant.create({
      data: {
        id: randomUUID(),
        conversationId: input.conversationId,
        userId: input.userId,
        role: 'MEMBER',
      },
      include: {
        user: { select: userProfileSelect },
      },
    });

    const latestMessage = await tx.message.findFirst({
      where: { directMessageConversationId: input.conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });

    if (latestMessage) {
      await tx.directMessageReadState.upsert({
        where: {
          userId_conversationId: {
            userId: input.userId,
            conversationId: input.conversationId,
          },
        },
        create: {
          id: randomUUID(),
          userId: input.userId,
          conversationId: input.conversationId,
          lastReadMessageId: latestMessage.id,
          lastReadAt: new Date(),
        },
        update: {
          lastReadMessageId: latestMessage.id,
          lastReadAt: new Date(),
        },
      });
    }

    const updated = await tx.directMessageConversation.findUnique({
      where: { id: input.conversationId },
      include: {
        ...conversationInclude,
        _count: {
          select: { participants: true },
        },
      },
    });
    if (!updated) {
      throw new DirectMessageNotFoundError('Conversation not found.');
    }

    return { newParticipant: participant, updatedConversation: updated };
  });

  emitDirectParticipantAdded(input.conversationId, {
    conversationId: input.conversationId,
    participant: {
      id: newParticipant.user.id,
      name: newParticipant.user.name,
      email: newParticipant.user.email,
      image: newParticipant.user.image,
      role: newParticipant.role,
      joinedAt: newParticipant.joinedAt,
    },
  });

  const unreadInfo = await getDirectConversationUnread(prisma, {
    conversationId: input.conversationId,
    userId: input.adminUserId,
  });

  return toConversationResponse(updatedConversation, input.adminUserId, unreadInfo);
}

export interface RemoveConversationParticipantInput {
  conversationId: string;
  adminUserId: string;
  userId: string;
}

export async function removeConversationParticipant(
  prisma: PrismaClient,
  input: RemoveConversationParticipantInput,
): Promise<{ success: boolean }> {
  const check = await authorizeDirectConversationAdmin(prisma, {
    conversationId: input.conversationId,
    userId: input.adminUserId,
  });

  if (!check.ok) {
    if (check.reason === 'FORBIDDEN') {
      throw new DirectMessageForbiddenError('Only group admins can remove participants.');
    }
    throw new DirectMessageNotFoundError('Direct message conversation not found.');
  }

  if (check.conversation.type !== 'GROUP') {
    throw new DirectMessageConflictError(
      'Participants can only be removed from group conversations.',
    );
  }

  await prisma.$transaction(async (tx) => {
    // 1. Acquire row lock on conversation to serialize concurrent membership mutations
    await tx.directMessageConversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });

    const target = await tx.directMessageParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
      },
    });
    if (!target) {
      throw new DirectMessageNotFoundError('Participant not found in this conversation.');
    }

    if (target.role === 'ADMIN') {
      const adminCount = await tx.directMessageParticipant.count({
        where: { conversationId: input.conversationId, role: 'ADMIN' },
      });
      const totalCount = await tx.directMessageParticipant.count({
        where: { conversationId: input.conversationId },
      });
      if (adminCount <= 1 && totalCount > 1) {
        throw new DirectMessageConflictError(
          'Cannot remove the sole admin of a group conversation.',
        );
      }
    }

    await tx.directMessageParticipant.delete({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
      },
    });

    await tx.directMessageReadState.deleteMany({
      where: {
        conversationId: input.conversationId,
        userId: input.userId,
      },
    });
  });

  emitDirectParticipantRemoved(input.conversationId, {
    conversationId: input.conversationId,
    userId: input.userId,
  });
  removeUserFromDirectConversationRoom(input.conversationId, input.userId);

  return { success: true };
}

export interface LeaveGroupConversationInput {
  conversationId: string;
  userId: string;
}

export async function leaveGroupConversation(
  prisma: PrismaClient,
  input: LeaveGroupConversationInput,
): Promise<{ success: boolean }> {
  const authorized = await authorizeDirectConversationAccess(prisma, input);
  if (!authorized) {
    throw new DirectMessageNotFoundError('Direct message conversation not found.');
  }

  if (authorized.type !== 'GROUP') {
    throw new DirectMessageConflictError('Cannot leave a 1-to-1 direct message.');
  }

  let newAdminPromoted = false;
  await prisma.$transaction(async (tx) => {
    // 1. Acquire row lock on conversation to serialize concurrent departures and succession
    await tx.directMessageConversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });

    const leaving = await tx.directMessageParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
      },
    });
    if (!leaving) {
      throw new DirectMessageNotFoundError('Participant not found.');
    }

    await tx.directMessageParticipant.delete({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.userId,
        },
      },
    });

    await tx.directMessageReadState.deleteMany({
      where: {
        conversationId: input.conversationId,
        userId: input.userId,
      },
    });

    const remaining = await tx.directMessageParticipant.findMany({
      where: { conversationId: input.conversationId },
      orderBy: { joinedAt: 'asc' },
    });

    if (remaining.length > 0) {
      const hasAdmin = remaining.some((p) => p.role === 'ADMIN');
      if (!hasAdmin) {
        const oldest = remaining[0];
        await tx.directMessageParticipant.update({
          where: { id: oldest.id },
          data: { role: 'ADMIN' },
        });
        newAdminPromoted = true;
      }
    }
  });

  emitDirectParticipantRemoved(input.conversationId, {
    conversationId: input.conversationId,
    userId: input.userId,
  });
  if (newAdminPromoted) {
    emitDirectConversationUpdated(input.conversationId, {
      conversationId: input.conversationId,
      updatedAt: new Date(),
    });
  }
  removeUserFromDirectConversationRoom(input.conversationId, input.userId);

  return { success: true };
}

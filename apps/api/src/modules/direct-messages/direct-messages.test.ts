import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import type { PrismaClient } from '@teamflow/db';
import { createApp } from '../../app';
import {
  authorizeDirectConversationAccess,
  authorizeDirectConversationAdmin,
  canCreateDirectConversation,
} from './authorization';
import {
  addConversationParticipant,
  createDirectMessage,
  createGroupConversation,
  DirectMessageConflictError,
  DirectMessageForbiddenError,
  DirectMessageNotFoundError,
  DirectMessageValidationError,
  getConversationParticipants,
  getDirectConversation,
  getOrCreateDirectConversation,
  getWorkspaceDirectConversationsUnreadMap,
  leaveGroupConversation,
  listDirectMessages,
  listUserDirectConversations,
  markDirectConversationRead,
  removeConversationParticipant,
  renameGroupConversation,
} from './service';
import {
  addConversationParticipantSchema,
  createDirectConversationSchema,
  createDirectMessageSchema,
  createGroupConversationSchema,
  directConversationListQuerySchema,
  markDirectConversationReadSchema,
  renameGroupConversationSchema,
} from './validation';
import { decodeConversationCursor, encodeConversationCursor } from './cursor';
import {
  addMessageReaction,
  createMessage,
  createThreadReply,
  getMessageReactions,
  MessageConflictError,
  MessageNotFoundError,
} from '../messages/service';

const mockPrisma = {
  directMessageConversation: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  directMessageParticipant: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  workspaceMembership: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  message: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  messageReaction: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
  messageMention: {
    findMany: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  userNotificationPreference: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  notification: {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  directMessageReadState: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn((cb) => (typeof cb === 'function' ? cb(mockPrisma) : Promise.all(cb))),
};

const prisma = mockPrisma as unknown as PrismaClient;

vi.mock('../auth/prisma', () => ({
  getPrisma: () => mockPrisma,
}));

// Notification generation is a separate 4H.4 unit; service tests assert the
// message write path only.
vi.mock('../notifications/service', () => ({
  generateNotificationsForMessageSafely: vi.fn().mockResolvedValue(undefined),
}));

describe('direct-messages validation & cursor', () => {
  it('validates createDirectConversationSchema with recipientId or targetUserId', () => {
    expect(createDirectConversationSchema.safeParse({ recipientId: 'u-2' }).success).toBe(true);
    expect(createDirectConversationSchema.safeParse({ targetUserId: 'u-2' }).success).toBe(true);
    expect(createDirectConversationSchema.safeParse({ recipientId: '' }).success).toBe(false);
    expect(createDirectConversationSchema.safeParse({ targetUserId: '   ' }).success).toBe(false);
    expect(createDirectConversationSchema.safeParse({}).success).toBe(false);
    // Strictness rejects injected fields
    expect(
      createDirectConversationSchema.safeParse({ recipientId: 'u-2', authorId: 'u-1' }).success,
    ).toBe(false);
  });

  it('validates createDirectMessageSchema strictly', () => {
    expect(createDirectMessageSchema.safeParse({ body: 'Hello there' }).success).toBe(true);
    expect(createDirectMessageSchema.safeParse({ body: '' }).success).toBe(false);
    expect(createDirectMessageSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(createDirectMessageSchema.safeParse({}).success).toBe(false);
    expect(createDirectMessageSchema.safeParse({ body: 'a'.repeat(10001) }).success).toBe(false);
    expect(createDirectMessageSchema.safeParse({ body: 'a'.repeat(10000) }).success).toBe(true);
    // Strictness rejects smuggled fields like channelId / authorId
    expect(
      createDirectMessageSchema.safeParse({
        body: 'Hello',
        channelId: 'ch-1',
        authorId: 'u-1',
      }).success,
    ).toBe(false);
  });

  it('validates directConversationListQuerySchema with keyset cursor', () => {
    const validCursor = encodeConversationCursor({
      updatedAt: '2026-09-09T00:00:00.000Z',
      id: 'dm-1',
    });
    expect(directConversationListQuerySchema.safeParse({}).success).toBe(true);
    expect(directConversationListQuerySchema.safeParse({ limit: '20' }).success).toBe(true);
    expect(directConversationListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(directConversationListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(directConversationListQuerySchema.safeParse({ cursor: validCursor }).success).toBe(true);
    expect(directConversationListQuerySchema.safeParse({ cursor: 'invalid-cursor' }).success).toBe(
      false,
    );
  });

  it('encodes and decodes conversation cursors deterministically', () => {
    const input = { updatedAt: '2026-09-09T01:00:00.000Z', id: 'conv-123' };
    const encoded = encodeConversationCursor(input);
    expect(typeof encoded).toBe('string');
    const decoded = decodeConversationCursor(encoded);
    expect(decoded).toEqual(input);

    expect(decodeConversationCursor('not-base64-json')).toBeNull();
    expect(decodeConversationCursor(Buffer.from('{}').toString('base64url'))).toBeNull();
    expect(
      decodeConversationCursor(
        Buffer.from(JSON.stringify({ updatedAt: 'invalid-date', id: '123' })).toString('base64url'),
      ),
    ).toBeNull();
  });
});

describe('direct-messages authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('canCreateDirectConversation rejects self-DM', async () => {
    const result = await canCreateDirectConversation(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      targetUserId: 'u-1',
    });
    expect(result).toEqual({ ok: false, reason: 'SELF_DM' });
  });

  it('canCreateDirectConversation rejects if caller not in workspace', async () => {
    mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce(null);

    const result = await canCreateDirectConversation(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      targetUserId: 'u-2',
    });
    expect(result).toEqual({ ok: false, reason: 'USER_NOT_IN_WORKSPACE' });
  });

  it('canCreateDirectConversation rejects if target not in workspace', async () => {
    mockPrisma.workspaceMembership.findUnique
      .mockResolvedValueOnce({ id: 'mem-1' })
      .mockResolvedValueOnce(null);

    const result = await canCreateDirectConversation(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      targetUserId: 'u-2',
    });
    expect(result).toEqual({ ok: false, reason: 'TARGET_NOT_IN_WORKSPACE' });
  });

  it('canCreateDirectConversation allows when both users belong to workspace', async () => {
    mockPrisma.workspaceMembership.findUnique
      .mockResolvedValueOnce({ id: 'mem-1' })
      .mockResolvedValueOnce({ id: 'mem-2' });

    const result = await canCreateDirectConversation(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      targetUserId: 'u-2',
    });
    expect(result).toEqual({ ok: true });
  });

  it('authorizeDirectConversationAccess enforces workspace and participant membership', async () => {
    // 1. Conversation not found
    mockPrisma.directMessageConversation.findUnique.mockResolvedValueOnce(null);
    const res1 = await authorizeDirectConversationAccess(prisma, {
      conversationId: 'c-1',
      userId: 'u-1',
    });
    expect(res1).toBeNull();

    // 2. User not a workspace member
    mockPrisma.directMessageConversation.findUnique.mockResolvedValueOnce({
      id: 'c-1',
      workspaceId: 'ws-1',
    });
    mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce(null);
    const res2 = await authorizeDirectConversationAccess(prisma, {
      conversationId: 'c-1',
      userId: 'u-1',
    });
    expect(res2).toBeNull();

    // 3. User not a participant in the conversation
    mockPrisma.directMessageConversation.findUnique.mockResolvedValueOnce({
      id: 'c-1',
      workspaceId: 'ws-1',
    });
    mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
    mockPrisma.directMessageParticipant.findUnique.mockResolvedValueOnce(null);
    const res3 = await authorizeDirectConversationAccess(prisma, {
      conversationId: 'c-1',
      userId: 'u-3',
    });
    expect(res3).toBeNull();

    // 4. Authorized participant
    mockPrisma.directMessageConversation.findUnique.mockResolvedValueOnce({
      id: 'c-1',
      workspaceId: 'ws-1',
    });
    mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
    mockPrisma.directMessageParticipant.findUnique.mockResolvedValueOnce({ id: 'part-1' });
    const res4 = await authorizeDirectConversationAccess(prisma, {
      conversationId: 'c-1',
      userId: 'u-1',
    });
    expect(res4).toEqual({ id: 'c-1', workspaceId: 'ws-1' });
  });
});

describe('direct-messages domain & service logic', () => {
  const user1 = { id: 'u-1', name: 'Alice', email: 'alice@example.com', image: null };
  const user2 = { id: 'u-2', name: 'Bob', email: 'bob@example.com', image: null };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.directMessageReadState.findMany.mockResolvedValue([]);
    mockPrisma.directMessageReadState.findUnique.mockResolvedValue(null);
    mockPrisma.directMessageReadState.upsert.mockResolvedValue({
      id: 'rs-1',
      userId: 'u-1',
      conversationId: 'dm-1',
      lastReadMessageId: null,
      lastReadAt: new Date(),
    });
    mockPrisma.message.findMany.mockResolvedValue([]);
  });

  it('rejects self-DM with DirectMessageValidationError (400 contract)', async () => {
    await expect(
      getOrCreateDirectConversation(prisma, {
        workspaceId: 'ws-1',
        userId: 'u-1',
        recipientId: 'u-1',
      }),
    ).rejects.toThrow(DirectMessageValidationError);
  });

  it('rejects foreign recipient with DirectMessageValidationError (400 contract)', async () => {
    mockPrisma.workspaceMembership.findUnique
      .mockResolvedValueOnce({ id: 'mem-1' }) // caller is in workspace
      .mockResolvedValueOnce(null); // recipient is not in workspace

    await expect(
      getOrCreateDirectConversation(prisma, {
        workspaceId: 'ws-1',
        userId: 'u-1',
        recipientId: 'u-foreign',
      }),
    ).rejects.toThrow(DirectMessageValidationError);
  });

  it('normalizes pair ordering deterministically and sets participant/peer profiles', async () => {
    const mockConversation = {
      id: 'dm-conv-1',
      workspaceId: 'ws-1',
      type: 'DIRECT' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      participants: [{ user: user1 }, { user: user2 }],
    };

    mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem' });
    mockPrisma.directMessageConversation.findUnique.mockResolvedValue(mockConversation);

    // Call A -> B
    const res1 = await getOrCreateDirectConversation(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      recipientId: 'u-2',
    });

    expect(res1.id).toBe('dm-conv-1');
    expect(res1.participant).toEqual(user2);
    expect(res1.peer).toEqual(user2);

    // Call B -> A (inverted order)
    const res2 = await getOrCreateDirectConversation(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-2',
      recipientId: 'u-1',
    });

    expect(res2.id).toBe('dm-conv-1');
    expect(res2.participant).toEqual(user1);
    expect(res2.peer).toEqual(user1);
  });

  it('handles concurrent creation race (P2002 unique constraint)', async () => {
    const mockConversation = {
      id: 'dm-conv-1',
      workspaceId: 'ws-1',
      type: 'DIRECT' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      participants: [{ user: user1 }, { user: user2 }],
    };

    mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem' });
    mockPrisma.directMessageConversation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockConversation);

    mockPrisma.$transaction.mockImplementationOnce(async () => {
      const p2002 = new Error('Unique constraint failed');
      (p2002 as unknown as { code: string }).code = 'P2002';
      throw p2002;
    });

    const res = await getOrCreateDirectConversation(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      recipientId: 'u-2',
    });

    expect(res.id).toBe('dm-conv-1');
  });

  it('listUserDirectConversations implements keyset pagination on (updatedAt, id) DESC', async () => {
    const date1 = new Date('2026-09-09T01:00:00.000Z');
    const date2 = new Date('2026-09-09T00:30:00.000Z');

    mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
    mockPrisma.directMessageConversation.findMany.mockResolvedValueOnce([
      {
        id: 'dm-1',
        workspaceId: 'ws-1',
        type: 'DIRECT' as const,
        createdAt: date1,
        updatedAt: date1,
        participants: [{ user: user1 }, { user: user2 }],
      },
      {
        id: 'dm-2',
        workspaceId: 'ws-1',
        type: 'DIRECT' as const,
        createdAt: date2,
        updatedAt: date2,
        participants: [{ user: user1 }, { user: user2 }],
      },
    ]);

    const res = await listUserDirectConversations(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      limit: 1,
    });

    expect(res.conversations).toHaveLength(1);
    expect(res.conversations[0].id).toBe('dm-1');
    expect(res.pageInfo.hasMore).toBe(true);
    expect(res.pageInfo.nextCursor).toBeDefined();

    const decoded = decodeConversationCursor(res.pageInfo.nextCursor!);
    expect(decoded).toEqual({
      updatedAt: date1.toISOString(),
      id: 'dm-1',
    });
  });

  it('createDirectMessage validates trimmed body and sets container fields', async () => {
    mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
      id: 'dm-1',
      workspaceId: 'ws-1',
    });
    mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
    mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({ id: 'part-1' });

    // Empty body after trimming
    await expect(
      createDirectMessage(prisma, {
        conversationId: 'dm-1',
        authorId: 'u-1',
        body: '     ',
      }),
    ).rejects.toThrow(DirectMessageValidationError);

    // Valid send
    const now = new Date();
    mockPrisma.$transaction.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb({
          message: {
            create: vi.fn().mockResolvedValue({
              id: 'msg-dm-1',
              channelId: null,
              directMessageConversationId: 'dm-1',
              authorId: 'u-1',
              body: 'Hello direct message',
              createdAt: now,
              updatedAt: now,
              author: user1,
            }),
          },
          directMessageConversation: {
            update: vi.fn().mockResolvedValue({ id: 'dm-1' }),
          },
        });
      },
    );

    const msg = await createDirectMessage(prisma, {
      conversationId: 'dm-1',
      authorId: 'u-1',
      body: '   Hello direct message   ',
    });

    expect(msg.id).toBe('msg-dm-1');
    expect(msg.channelId).toBeNull();
    expect(msg.directMessageConversationId).toBe('dm-1');
  });

  it('getDirectConversation returns conversation for participant, throws for non-participant', async () => {
    mockPrisma.directMessageConversation.findUnique
      .mockResolvedValueOnce({ id: 'dm-1', workspaceId: 'ws-1' })
      .mockResolvedValueOnce({
        id: 'dm-1',
        workspaceId: 'ws-1',
        type: 'DIRECT',
        createdAt: new Date(),
        updatedAt: new Date(),
        participants: [{ user: user1 }, { user: user2 }],
      });
    mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
    mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({ id: 'part-1' });

    const conv = await getDirectConversation(prisma, { conversationId: 'dm-1', userId: 'u-1' });
    expect(conv.id).toBe('dm-1');
    expect(conv.participant).toEqual(user2);

    // Non-participant
    mockPrisma.directMessageConversation.findUnique.mockResolvedValueOnce({
      id: 'dm-1',
      workspaceId: 'ws-1',
    });
    mockPrisma.directMessageParticipant.findUnique.mockResolvedValueOnce(null);

    await expect(
      getDirectConversation(prisma, { conversationId: 'dm-1', userId: 'u-other' }),
    ).rejects.toThrow(DirectMessageNotFoundError);
  });

  it('getConversationParticipants returns participants for authorized user', async () => {
    mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
      id: 'dm-1',
      workspaceId: 'ws-1',
    });
    mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
    mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({ id: 'part-1' });
    mockPrisma.directMessageParticipant.findMany.mockResolvedValue([
      { user: user1 },
      { user: user2 },
    ]);

    const participants = await getConversationParticipants(prisma, {
      conversationId: 'dm-1',
      userId: 'u-1',
    });
    expect(participants).toEqual([user1, user2]);
  });

  it('listDirectMessages filters root-only messages and paginates', async () => {
    const now = new Date();
    mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
      id: 'dm-1',
      workspaceId: 'ws-1',
    });
    mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
    mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({ id: 'part-1' });

    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'msg-root-1',
        channelId: null,
        directMessageConversationId: 'dm-1',
        parentMessageId: null,
        body: 'Root DM message',
        replyCount: 0,
        latestReplyAt: null,
        createdAt: now,
        updatedAt: now,
        editedAt: null,
        deletedAt: null,
        author: user1,
      },
    ]);

    const page = await listDirectMessages(prisma, { conversationId: 'dm-1', userId: 'u-1' });
    expect(page.messages).toHaveLength(1);
    expect(page.messages[0].id).toBe('msg-root-1');
    expect(page.messages[0].parentMessageId).toBeNull();
  });
});

describe('direct-messages container invariant, threads & reactions', () => {
  const user1 = { id: 'u-1', name: 'Alice', email: 'alice@example.com', image: null };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enforces message container invariant: requires exactly one container', async () => {
    await expect(
      createMessage(prisma, {
        authorId: 'u-1',
        body: 'orphan message',
      }),
    ).rejects.toThrow(MessageConflictError);

    await expect(
      createMessage(prisma, {
        channelId: 'ch-1',
        directMessageConversationId: 'dm-1',
        authorId: 'u-1',
        body: 'ambiguous message',
      }),
    ).rejects.toThrow(MessageConflictError);
  });

  it('allows thread reply to DM message and inherits directMessageConversationId', async () => {
    const now = new Date();
    // Authorize container access for DM root
    mockPrisma.message.findUnique.mockResolvedValueOnce({
      id: 'dm-root-1',
      channelId: null,
      directMessageConversationId: 'dm-1',
      parentMessageId: null,
      deletedAt: null,
    });
    mockPrisma.directMessageConversation.findUnique.mockResolvedValueOnce({
      id: 'dm-1',
      workspaceId: 'ws-1',
    });
    mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
    mockPrisma.directMessageParticipant.findUnique.mockResolvedValueOnce({ id: 'part-1' });

    mockPrisma.$transaction.mockImplementationOnce(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        return cb({
          message: {
            create: vi.fn().mockResolvedValue({
              id: 'dm-reply-1',
              channelId: null,
              directMessageConversationId: 'dm-1',
              parentMessageId: 'dm-root-1',
              authorId: 'u-1',
              body: 'DM Thread Reply',
              replyCount: 0,
              latestReplyAt: null,
              createdAt: now,
              updatedAt: now,
              author: user1,
            }),
            update: vi.fn().mockResolvedValue({
              id: 'dm-root-1',
              channelId: null,
              directMessageConversationId: 'dm-1',
              authorId: 'u-1',
              body: 'DM Root',
              replyCount: 1,
              latestReplyAt: now,
              createdAt: now,
              updatedAt: now,
              author: user1,
            }),
          },
        });
      },
    );

    const replyResult = await createThreadReply(prisma, {
      messageId: 'dm-root-1',
      authorId: 'u-1',
      body: 'DM Thread Reply',
    });

    expect(replyResult.reply.directMessageConversationId).toBe('dm-1');
    expect(replyResult.reply.channelId).toBeNull();
    expect(replyResult.reply.parentMessageId).toBe('dm-root-1');
    expect(replyResult.parent.replyCount).toBe(1);
  });

  it('supports reactions on DM messages for authorized participants', async () => {
    const now = new Date();
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'dm-msg-1',
      channelId: null,
      directMessageConversationId: 'dm-1',
      deletedAt: null,
    });
    mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
      id: 'dm-1',
      workspaceId: 'ws-1',
    });
    mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
    mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({ id: 'part-1' });

    mockPrisma.messageReaction.create.mockResolvedValueOnce({
      id: 'rxn-1',
      messageId: 'dm-msg-1',
      userId: 'u-1',
      emoji: '👍',
      createdAt: now,
    });

    const rxn = await addMessageReaction(prisma, {
      messageId: 'dm-msg-1',
      userId: 'u-1',
      emoji: '👍',
    });

    expect(rxn.id).toBe('rxn-1');
    expect(rxn.directMessageConversationId).toBe('dm-1');
    expect(rxn.channelId).toBeNull();

    // Listing reactions
    mockPrisma.messageReaction.findMany.mockResolvedValueOnce([
      { id: 'rxn-1', messageId: 'dm-msg-1', userId: 'u-1', emoji: '👍', createdAt: now },
    ]);

    const summaries = await getMessageReactions(prisma, {
      messageId: 'dm-msg-1',
      userId: 'u-1',
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0].emoji).toBe('👍');
    expect(summaries[0].count).toBe(1);
    expect(summaries[0].reacted).toBe(true);
  });

  it('rejects reactions from unauthorized non-participants with MessageNotFoundError', async () => {
    mockPrisma.message.findUnique.mockResolvedValueOnce({
      id: 'dm-msg-1',
      channelId: null,
      directMessageConversationId: 'dm-1',
      deletedAt: null,
    });
    // Non-participant
    mockPrisma.directMessageConversation.findUnique.mockResolvedValueOnce({
      id: 'dm-1',
      workspaceId: 'ws-1',
    });
    mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-3' });
    mockPrisma.directMessageParticipant.findUnique.mockResolvedValueOnce(null);

    await expect(
      addMessageReaction(prisma, {
        messageId: 'dm-msg-1',
        userId: 'u-intruder',
        emoji: '👀',
      }),
    ).rejects.toThrow(MessageNotFoundError);
  });
});

describe('Phase 4F.2 - Direct Messages HTTP Endpoints', () => {
  const TEST_AUTH_URL = 'http://localhost:4000';
  let auth: ReturnType<typeof createTestAuth>;
  let app: ReturnType<typeof createApp>;

  function createTestAuth() {
    return betterAuth({
      secret: 'dm-test-secret-0123456789abcdef-0123456789abcdef',
      baseURL: TEST_AUTH_URL,
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      emailAndPassword: { enabled: true },
      rateLimit: { enabled: false },
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    auth = createTestAuth();
    app = createApp({ auth });
  });

  describe('unauthenticated requests return 401', () => {
    it('rejects POST /api/workspaces/:ws/direct-messages with 401', async () => {
      const res = await request(app)
        .post('/api/workspaces/ws-1/direct-messages')
        .send({ recipientId: 'u-2' });
      expect(res.status).toBe(401);
    });

    it('rejects GET /api/workspaces/:ws/direct-messages with 401', async () => {
      const res = await request(app).get('/api/workspaces/ws-1/direct-messages');
      expect(res.status).toBe(401);
    });

    it('rejects GET /api/direct-messages/:id with 401', async () => {
      const res = await request(app).get('/api/direct-messages/dm-1');
      expect(res.status).toBe(401);
    });

    it('rejects POST /api/direct-messages/:id/messages with 401', async () => {
      const res = await request(app)
        .post('/api/direct-messages/dm-1/messages')
        .send({ body: 'Hello' });
      expect(res.status).toBe(401);
    });

    it('rejects GET /api/direct-messages/:id/messages with 401', async () => {
      const res = await request(app).get('/api/direct-messages/dm-1/messages');
      expect(res.status).toBe(401);
    });
  });

  describe('authenticated DM operations', () => {
    let authCookie: string;
    let userId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/auth/sign-up/email')
        .set('Origin', TEST_AUTH_URL)
        .send({
          name: 'DM Tester',
          email: 'dm-tester@teamflow.local',
          password: 'dm-test-password-1234',
        });
      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      authCookie = Array.isArray(cookies) ? cookies.join('; ') : (cookies ?? '');
      userId = (res.body as { user: { id: string } }).user.id;
    });

    it('rejects field injection in POST /api/workspaces/:ws/direct-messages with 400', async () => {
      const res = await request(app)
        .post('/api/workspaces/ws-1/direct-messages')
        .set('Cookie', authCookie)
        .send({ recipientId: 'u-2', smuggledField: 'injected' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects self-DM with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/workspaces/ws-1/direct-messages')
        .set('Cookie', authCookie)
        .send({ recipientId: userId });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('Cannot start a direct message with yourself.');
    });

    it('returns 404 when workspace does not exist or caller is not a member', async () => {
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/workspaces/ws-foreign/direct-messages')
        .set('Cookie', authCookie)
        .send({ recipientId: 'u-2' });
      expect(res.status).toBe(404);
    });

    it('returns 400 when recipient is not a workspace member', async () => {
      mockPrisma.workspaceMembership.findUnique
        .mockResolvedValueOnce({ id: 'mem-1' }) // caller in workspace
        .mockResolvedValueOnce(null); // recipient NOT in workspace

      const res = await request(app)
        .post('/api/workspaces/ws-1/direct-messages')
        .set('Cookie', authCookie)
        .send({ recipientId: 'u-outsider' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('Recipient is not a member of this workspace.');
    });

    it('creates or returns DM conversation with 200 and safe serialization', async () => {
      const now = new Date();
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.directMessageConversation.findUnique.mockResolvedValueOnce({
        id: 'dm-1',
        workspaceId: 'ws-1',
        type: 'DIRECT',
        createdAt: now,
        updatedAt: now,
        participants: [
          {
            user: { id: userId, name: 'DM Tester', email: 'dm-tester@teamflow.local', image: null },
          },
          { user: { id: 'u-2', name: 'Partner', email: 'partner@teamflow.local', image: null } },
        ],
      });

      const res = await request(app)
        .post('/api/workspaces/ws-1/direct-messages')
        .set('Cookie', authCookie)
        .send({ recipientId: 'u-2' });

      expect(res.status).toBe(200);
      expect(res.body.conversation.id).toBe('dm-1');
      expect(res.body.conversation.participant.id).toBe('u-2');
      expect(res.body.conversation.participants).toHaveLength(2);
      // Verify safe serialization (no passwords, secrets)
      expect(res.body.conversation.participant).not.toHaveProperty('password');
      expect(res.body.conversation.participant).not.toHaveProperty('token');
    });

    it('rejects invalid cursor in GET /api/workspaces/:ws/direct-messages with 400', async () => {
      const res = await request(app)
        .get('/api/workspaces/ws-1/direct-messages?cursor=malformed-cursor')
        .set('Cookie', authCookie);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for GET /api/direct-messages/:id when caller is not a participant', async () => {
      mockPrisma.directMessageConversation.findUnique.mockResolvedValueOnce({
        id: 'dm-private',
        workspaceId: 'ws-1',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValueOnce({ id: 'mem-1' });
      mockPrisma.directMessageParticipant.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/direct-messages/dm-private')
        .set('Cookie', authCookie);
      expect(res.status).toBe(404);
    });

    it('rejects field injection in POST /api/direct-messages/:id/messages with 400', async () => {
      const res = await request(app)
        .post('/api/direct-messages/dm-1/messages')
        .set('Cookie', authCookie)
        .send({
          body: 'Smuggled message',
          channelId: 'ch-1',
          authorId: 'spoofed-user',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('sends direct message successfully with 201', async () => {
      const now = new Date();
      mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
        id: 'dm-1',
        workspaceId: 'ws-1',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({ id: 'part-1' });

      mockPrisma.$transaction.mockImplementationOnce(
        async (cb: (tx: unknown) => Promise<unknown>) => {
          return cb({
            message: {
              create: vi.fn().mockResolvedValue({
                id: 'msg-1',
                channelId: null,
                directMessageConversationId: 'dm-1',
                authorId: userId,
                body: 'Hello secure DM',
                createdAt: now,
                updatedAt: now,
                author: {
                  id: userId,
                  name: 'DM Tester',
                  email: 'dm-tester@teamflow.local',
                  image: null,
                },
              }),
            },
            directMessageConversation: {
              update: vi.fn().mockResolvedValue({ id: 'dm-1' }),
            },
          });
        },
      );

      const res = await request(app)
        .post('/api/direct-messages/dm-1/messages')
        .set('Cookie', authCookie)
        .send({ body: 'Hello secure DM' });

      expect(res.status).toBe(201);
      expect(res.body.message.id).toBe('msg-1');
      expect(res.body.message.directMessageConversationId).toBe('dm-1');
      expect(res.body.message.channelId).toBeNull();
      expect(res.body.message.author.id).toBe(userId);
    });

    it('rejects POST /api/direct-messages/:id/read when user is not a participant with 404', async () => {
      mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
        id: 'dm-1',
        workspaceId: 'ws-1',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.directMessageParticipant.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/direct-messages/dm-1/read')
        .set('Cookie', authCookie)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('marks conversation read with 200 and returns durable pointer', async () => {
      mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
        id: 'dm-1',
        workspaceId: 'ws-1',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({ id: 'part-1' });

      const date1 = new Date('2026-09-09T01:00:00.000Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'm-1',
        directMessageConversationId: 'dm-1',
        parentMessageId: null,
        createdAt: date1,
      });

      mockPrisma.directMessageReadState.findUnique.mockResolvedValue(null);
      mockPrisma.directMessageReadState.upsert.mockResolvedValue({
        id: 'rs-1',
        userId,
        conversationId: 'dm-1',
        lastReadMessageId: 'm-1',
        lastReadAt: date1,
      });

      const res = await request(app)
        .post('/api/direct-messages/dm-1/read')
        .set('Cookie', authCookie)
        .send({ messageId: 'm-1' });

      expect(res.status).toBe(200);
      expect(res.body.readState.conversationId).toBe('dm-1');
      expect(res.body.readState.userId).toBe(userId);
      expect(res.body.readState.lastReadMessageId).toBe('m-1');
    });

    it('returns workspace direct conversation unread map via GET /api/workspaces/:ws/direct-messages/unread', async () => {
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.directMessageConversation.findMany.mockResolvedValue([{ id: 'dm-1' }]);
      mockPrisma.directMessageReadState.findMany.mockResolvedValue([]);
      mockPrisma.message.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/workspaces/ws-1/direct-messages/unread')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.conversations).toBeDefined();
      expect(res.body.totalUnreadCount).toBeDefined();
    });
  });

  describe('Phase 4F.5 — Direct message unread & durable read pointers', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockPrisma.directMessageReadState.findMany.mockResolvedValue([]);
      mockPrisma.directMessageReadState.findUnique.mockResolvedValue(null);
      mockPrisma.directMessageReadState.upsert.mockResolvedValue({
        id: 'rs-1',
        userId: 'u-1',
        conversationId: 'dm-1',
        lastReadMessageId: null,
        lastReadAt: new Date(),
      });
      mockPrisma.message.findMany.mockResolvedValue([]);
    });

    it('validates markDirectConversationReadSchema strictly', () => {
      expect(markDirectConversationReadSchema.safeParse({}).success).toBe(true);
      expect(markDirectConversationReadSchema.safeParse({ messageId: 'm-1' }).success).toBe(true);
      expect(
        markDirectConversationReadSchema.safeParse({ messageId: 'm-1', extraField: true }).success,
      ).toBe(false);
      expect(markDirectConversationReadSchema.safeParse({ messageId: '' }).success).toBe(false);
    });

    it('markDirectConversationRead rejects non-participants with DirectMessageNotFoundError', async () => {
      mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
        id: 'dm-1',
        workspaceId: 'ws-1',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.directMessageParticipant.findUnique.mockResolvedValue(null);

      await expect(
        markDirectConversationRead(prisma, {
          conversationId: 'dm-1',
          userId: 'u-1',
        }),
      ).rejects.toThrow(DirectMessageNotFoundError);
    });

    it('markDirectConversationRead rejects thread replies with DirectMessageValidationError', async () => {
      mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
        id: 'dm-1',
        workspaceId: 'ws-1',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({ id: 'part-1' });

      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'reply-1',
        directMessageConversationId: 'dm-1',
        parentMessageId: 'root-1', // thread reply!
        createdAt: new Date(),
      });

      await expect(
        markDirectConversationRead(prisma, {
          conversationId: 'dm-1',
          userId: 'u-1',
          messageId: 'reply-1',
        }),
      ).rejects.toThrow(DirectMessageValidationError);
    });

    it('markDirectConversationRead rejects messages from another conversation', async () => {
      mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
        id: 'dm-1',
        workspaceId: 'ws-1',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({ id: 'part-1' });

      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'msg-foreign',
        directMessageConversationId: 'dm-OTHER',
        parentMessageId: null,
        createdAt: new Date(),
      });

      await expect(
        markDirectConversationRead(prisma, {
          conversationId: 'dm-1',
          userId: 'u-1',
          messageId: 'msg-foreign',
        }),
      ).rejects.toThrow(DirectMessageValidationError);
    });

    it('enforces monotonic read pointer (never moves backward)', async () => {
      mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
        id: 'dm-1',
        workspaceId: 'ws-1',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({ id: 'part-1' });

      const dateNewer = new Date('2026-09-09T02:00:00.000Z');
      const dateOlder = new Date('2026-09-09T01:00:00.000Z');

      // Candidate is older than current read pointer
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'm-older',
        directMessageConversationId: 'dm-1',
        parentMessageId: null,
        createdAt: dateOlder,
      });

      mockPrisma.directMessageReadState.findUnique.mockResolvedValue({
        id: 'rs-1',
        userId: 'u-1',
        conversationId: 'dm-1',
        lastReadMessageId: 'm-newer',
        lastReadAt: dateNewer,
        lastReadMessage: {
          id: 'm-newer',
          createdAt: dateNewer,
        },
      });

      const res = await markDirectConversationRead(prisma, {
        conversationId: 'dm-1',
        userId: 'u-1',
        messageId: 'm-older',
      });

      // Does not call upsert because candidate is older
      expect(mockPrisma.directMessageReadState.upsert).not.toHaveBeenCalled();
      expect(res.lastReadMessageId).toBe('m-newer');
      expect(res.lastReadAt).toEqual(dateNewer);
    });

    it('enforces monotonic read pointer when lastReadMessage is null but lastReadAt is set', async () => {
      mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
        id: 'dm-1',
        workspaceId: 'ws-1',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({ id: 'part-1' });

      const dateNewer = new Date('2026-09-09T02:00:00.000Z');
      const dateOlder = new Date('2026-09-09T01:00:00.000Z');

      // Candidate message timestamp is older than existing lastReadAt
      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'm-older',
        directMessageConversationId: 'dm-1',
        parentMessageId: null,
        createdAt: dateOlder,
      });

      mockPrisma.directMessageReadState.findUnique.mockResolvedValue({
        id: 'rs-1',
        userId: 'u-1',
        conversationId: 'dm-1',
        lastReadMessageId: null,
        lastReadAt: dateNewer,
        lastReadMessage: null,
      });

      const res = await markDirectConversationRead(prisma, {
        conversationId: 'dm-1',
        userId: 'u-1',
        messageId: 'm-older',
      });

      expect(mockPrisma.directMessageReadState.upsert).not.toHaveBeenCalled();
      expect(res.lastReadMessageId).toBeNull();
      expect(res.lastReadAt).toEqual(dateNewer);
    });

    it('advances read pointer when candidate message is newer', async () => {
      mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
        id: 'dm-1',
        workspaceId: 'ws-1',
      });
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'mem-1' });
      mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({ id: 'part-1' });

      const dateOlder = new Date('2026-09-09T01:00:00.000Z');
      const dateNewer = new Date('2026-09-09T02:00:00.000Z');

      mockPrisma.message.findUnique.mockResolvedValue({
        id: 'm-newer',
        directMessageConversationId: 'dm-1',
        parentMessageId: null,
        createdAt: dateNewer,
      });

      mockPrisma.directMessageReadState.findUnique.mockResolvedValue({
        id: 'rs-1',
        userId: 'u-1',
        conversationId: 'dm-1',
        lastReadMessageId: 'm-older',
        lastReadAt: dateOlder,
        lastReadMessage: {
          id: 'm-older',
          createdAt: dateOlder,
        },
      });

      mockPrisma.directMessageReadState.upsert.mockResolvedValue({
        id: 'rs-1',
        userId: 'u-1',
        conversationId: 'dm-1',
        lastReadMessageId: 'm-newer',
        lastReadAt: dateNewer,
      });

      const res = await markDirectConversationRead(prisma, {
        conversationId: 'dm-1',
        userId: 'u-1',
        messageId: 'm-newer',
      });

      expect(mockPrisma.directMessageReadState.upsert).toHaveBeenCalledTimes(1);
      expect(res.lastReadMessageId).toBe('m-newer');
      expect(res.lastReadAt).toEqual(dateNewer);
    });

    it('getWorkspaceDirectConversationsUnreadMap batch calculates unread counts accurately with zero N+1', async () => {
      const dateRead = new Date('2026-09-09T01:00:00.000Z');
      const dateUnread1 = new Date('2026-09-09T01:30:00.000Z');
      const dateUnread2 = new Date('2026-09-09T02:00:00.000Z');

      mockPrisma.directMessageReadState.findMany.mockResolvedValue([
        {
          userId: 'u-1',
          conversationId: 'dm-1',
          lastReadMessageId: 'm-read',
          lastReadAt: dateRead,
          lastReadMessage: {
            id: 'm-read',
            createdAt: dateRead,
          },
        },
      ]);

      mockPrisma.message.findMany.mockResolvedValue([
        // In dm-1: one unread message from peer, one from self (should be ignored)
        {
          id: 'm-unread-peer',
          directMessageConversationId: 'dm-1',
          authorId: 'u-2',
          createdAt: dateUnread2,
        },
        {
          id: 'm-self',
          directMessageConversationId: 'dm-1',
          authorId: 'u-1', // current user
          createdAt: dateUnread1,
        },
        {
          id: 'm-read',
          directMessageConversationId: 'dm-1',
          authorId: 'u-2',
          createdAt: dateRead,
        },
      ]);

      const map = await getWorkspaceDirectConversationsUnreadMap(prisma, {
        userId: 'u-1',
        conversationIds: ['dm-1'],
      });

      // Exactly 1 findMany for read states and 1 findMany for messages across all conversations
      expect(mockPrisma.directMessageReadState.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.message.findMany).toHaveBeenCalledTimes(1);

      expect(map.get('dm-1')).toEqual({
        conversationId: 'dm-1',
        unreadCount: 1, // Only peer's unread message, self-message excluded
        hasUnread: true,
        lastReadMessageId: 'm-read',
      });
    });
  });

  describe('Phase 4F.6 - Group DMs & Group Conversation Management', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe('validation schemas', () => {
      it('validates createGroupConversationSchema correctly', () => {
        // Valid: 2 other participants, no name
        expect(
          createGroupConversationSchema.safeParse({
            participantIds: ['u-2', 'u-3'],
          }).success,
        ).toBe(true);

        // Valid: with custom name
        expect(
          createGroupConversationSchema.safeParse({
            participantIds: ['u-2', 'u-3'],
            name: 'Core Team',
          }).success,
        ).toBe(true);

        // Invalid: less than 2 participants
        expect(
          createGroupConversationSchema.safeParse({
            participantIds: ['u-2'],
          }).success,
        ).toBe(false);

        // Invalid: more than 19 participants
        const twenty = Array.from({ length: 20 }, (_, i) => `u-${i + 2}`);
        expect(
          createGroupConversationSchema.safeParse({
            participantIds: twenty,
          }).success,
        ).toBe(false);

        // Invalid: duplicate participants
        expect(
          createGroupConversationSchema.safeParse({
            participantIds: ['u-2', 'u-2'],
          }).success,
        ).toBe(false);

        // Invalid: name > 100 chars or newlines
        expect(
          createGroupConversationSchema.safeParse({
            participantIds: ['u-2', 'u-3'],
            name: 'a'.repeat(101),
          }).success,
        ).toBe(false);

        expect(
          createGroupConversationSchema.safeParse({
            participantIds: ['u-2', 'u-3'],
            name: 'Line 1\nLine 2',
          }).success,
        ).toBe(false);

        // Strictness: rejects injected fields
        expect(
          createGroupConversationSchema.safeParse({
            participantIds: ['u-2', 'u-3'],
            isAdmin: true,
          }).success,
        ).toBe(false);
      });

      it('validates renameGroupConversationSchema correctly', () => {
        expect(renameGroupConversationSchema.safeParse({ name: 'Valid Name' }).success).toBe(true);
        expect(renameGroupConversationSchema.safeParse({ name: '' }).success).toBe(false);
        expect(renameGroupConversationSchema.safeParse({ name: '   ' }).success).toBe(false);
        expect(renameGroupConversationSchema.safeParse({ name: 'Has\nNewline' }).success).toBe(
          false,
        );
        expect(renameGroupConversationSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(
          false,
        );
        expect(renameGroupConversationSchema.safeParse({ name: 'Valid', extra: 1 }).success).toBe(
          false,
        );
      });

      it('validates addConversationParticipantSchema correctly', () => {
        expect(addConversationParticipantSchema.safeParse({ userId: 'u-target' }).success).toBe(
          true,
        );
        expect(addConversationParticipantSchema.safeParse({ userId: '' }).success).toBe(false);
        expect(addConversationParticipantSchema.safeParse({}).success).toBe(false);
        expect(
          addConversationParticipantSchema.safeParse({ userId: 'u-target', role: 'ADMIN' }).success,
        ).toBe(false);
      });
    });

    describe('domain authorization & service layer', () => {
      it('authorizeDirectConversationAdmin differentiates not found vs forbidden', async () => {
        // Conversation does not exist
        mockPrisma.directMessageConversation.findUnique.mockResolvedValue(null);
        const res1 = await authorizeDirectConversationAdmin(prisma, {
          conversationId: 'dm-1',
          userId: 'u-1',
        });
        expect(res1).toEqual({ ok: false, reason: 'NOT_FOUND' });

        // User not in workspace
        mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
          id: 'dm-1',
          workspaceId: 'ws-1',
        });
        mockPrisma.workspaceMembership.findUnique.mockResolvedValue(null);
        const res2 = await authorizeDirectConversationAdmin(prisma, {
          conversationId: 'dm-1',
          userId: 'u-1',
        });
        expect(res2).toEqual({ ok: false, reason: 'NOT_FOUND' });

        // User not participant
        mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'wm-1' });
        mockPrisma.directMessageParticipant.findUnique.mockResolvedValue(null);
        const res3 = await authorizeDirectConversationAdmin(prisma, {
          conversationId: 'dm-1',
          userId: 'u-1',
        });
        expect(res3).toEqual({ ok: false, reason: 'NOT_FOUND' });

        // User is MEMBER (not ADMIN)
        mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({
          id: 'p-1',
          role: 'MEMBER',
        });
        const res4 = await authorizeDirectConversationAdmin(prisma, {
          conversationId: 'dm-1',
          userId: 'u-1',
        });
        expect(res4).toEqual({ ok: false, reason: 'FORBIDDEN' });

        // User is ADMIN
        mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({
          id: 'p-1',
          role: 'ADMIN',
        });
        const res5 = await authorizeDirectConversationAdmin(prisma, {
          conversationId: 'dm-1',
          userId: 'u-1',
        });
        expect(res5.ok).toBe(true);
      });

      it('createGroupConversation rejects creator in participantIds', async () => {
        mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'wm-1' });
        await expect(
          createGroupConversation(prisma, {
            workspaceId: 'ws-1',
            userId: 'u-1',
            participantIds: ['u-1', 'u-2'],
          }),
        ).rejects.toThrow('Cannot include yourself in the participant list.');
      });

      it('createGroupConversation rejects participants not in workspace', async () => {
        mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'wm-1' });
        // Only 1 of 2 targets found in workspace
        mockPrisma.workspaceMembership.findMany.mockResolvedValue([{ userId: 'u-2' }]);

        await expect(
          createGroupConversation(prisma, {
            workspaceId: 'ws-1',
            userId: 'u-1',
            participantIds: ['u-2', 'u-3'],
          }),
        ).rejects.toThrow('One or more participants are not members of this workspace.');
      });

      it('createGroupConversation creates group with creator as ADMIN and others as MEMBER', async () => {
        mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'wm-1' });
        mockPrisma.workspaceMembership.findMany.mockResolvedValue([
          { userId: 'u-2' },
          { userId: 'u-3' },
        ]);

        const date = new Date('2026-09-08T00:00:00.000Z');
        mockPrisma.directMessageConversation.create.mockResolvedValue({
          id: 'grp-1',
          workspaceId: 'ws-1',
          type: 'GROUP',
          name: 'Project Delta',
          createdAt: date,
          updatedAt: date,
          participants: [
            {
              id: 'p-1',
              userId: 'u-1',
              role: 'ADMIN',
              joinedAt: date,
              user: { id: 'u-1', name: 'User 1', email: 'u1@test.com', image: null },
            },
            {
              id: 'p-2',
              userId: 'u-2',
              role: 'MEMBER',
              joinedAt: date,
              user: { id: 'u-2', name: 'User 2', email: 'u2@test.com', image: null },
            },
            {
              id: 'p-3',
              userId: 'u-3',
              role: 'MEMBER',
              joinedAt: date,
              user: { id: 'u-3', name: 'User 3', email: 'u3@test.com', image: null },
            },
          ],
          _count: { participants: 3 },
        });

        const created = await createGroupConversation(prisma, {
          workspaceId: 'ws-1',
          userId: 'u-1',
          participantIds: ['u-2', 'u-3'],
          name: 'Project Delta',
        });

        expect(created.type).toBe('GROUP');
        expect(created.name).toBe('Project Delta');
        expect(created.currentUserRole).toBe('ADMIN');
        expect(created.participantCount).toBe(3);
        expect(created.participants.find((p) => p.id === 'u-1')?.role).toBe('ADMIN');
        expect(created.participants.find((p) => p.id === 'u-2')?.role).toBe('MEMBER');
      });

      it('renameGroupConversation enforces admin and group type', async () => {
        // Not admin -> throws Forbidden
        mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
          id: 'grp-1',
          workspaceId: 'ws-1',
          type: 'GROUP',
        });
        mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'wm-2' });
        mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({
          id: 'p-2',
          role: 'MEMBER',
        });

        await expect(
          renameGroupConversation(prisma, {
            conversationId: 'grp-1',
            userId: 'u-2',
            name: 'New Name',
          }),
        ).rejects.toThrow(DirectMessageForbiddenError);

        // Admin caller on DIRECT conversation -> throws Conflict
        mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({
          id: 'p-1',
          role: 'ADMIN',
        });
        mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
          id: 'dm-1',
          workspaceId: 'ws-1',
          type: 'DIRECT',
        });

        await expect(
          renameGroupConversation(prisma, {
            conversationId: 'dm-1',
            userId: 'u-1',
            name: 'New Name',
          }),
        ).rejects.toThrow(DirectMessageConflictError);
      });

      it('addConversationParticipant enforces limit and initializes read state', async () => {
        mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
          id: 'grp-1',
          workspaceId: 'ws-1',
          type: 'GROUP',
        });
        mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'wm-1' });
        mockPrisma.directMessageParticipant.findUnique.mockImplementation(({ where }) => {
          if (where.conversationId_userId?.userId === 'u-1') {
            return Promise.resolve({ id: 'p-1', role: 'ADMIN' });
          }
          return Promise.resolve(null);
        });

        // Current count is 20 -> conflict
        mockPrisma.directMessageParticipant.count.mockResolvedValue(20);

        await expect(
          addConversationParticipant(prisma, {
            conversationId: 'grp-1',
            adminUserId: 'u-1',
            userId: 'u-new',
          }),
        ).rejects.toThrow(DirectMessageConflictError);

        // Current count is 10 -> succeeds and initializes read state to latest message
        mockPrisma.directMessageParticipant.count.mockResolvedValue(10);
        const date = new Date('2026-09-08T00:00:00.000Z');
        mockPrisma.directMessageParticipant.create.mockResolvedValue({
          id: 'p-new',
          userId: 'u-new',
          role: 'MEMBER',
          joinedAt: date,
          user: { id: 'u-new', name: 'New User', email: 'new@test.com', image: null },
        });
        mockPrisma.message.findFirst.mockResolvedValue({ id: 'm-latest' });
        mockPrisma.directMessageConversation.update.mockResolvedValue({
          id: 'grp-1',
          updatedAt: date,
        });
        mockPrisma.directMessageConversation.findUnique.mockImplementation(
          (args?: { include?: unknown }) => {
            if (args?.include) {
              return Promise.resolve({
                id: 'grp-1',
                workspaceId: 'ws-1',
                type: 'GROUP',
                createdAt: date,
                updatedAt: date,
                participants: [
                  {
                    id: 'p-1',
                    userId: 'u-1',
                    role: 'ADMIN',
                    joinedAt: date,
                    user: { id: 'u-1', name: 'User 1', email: 'u1@test.com', image: null },
                  },
                  {
                    id: 'p-new',
                    userId: 'u-new',
                    role: 'MEMBER',
                    joinedAt: date,
                    user: { id: 'u-new', name: 'New User', email: 'new@test.com', image: null },
                  },
                ],
                _count: { participants: 11 },
              });
            }
            return Promise.resolve({
              id: 'grp-1',
              workspaceId: 'ws-1',
              type: 'GROUP',
            });
          },
        );

        mockPrisma.directMessageReadState.findUnique.mockResolvedValue(null);
        mockPrisma.directMessageReadState.findMany.mockResolvedValue([]);
        mockPrisma.message.findMany.mockResolvedValue([]);

        const res = await addConversationParticipant(prisma, {
          conversationId: 'grp-1',
          adminUserId: 'u-1',
          userId: 'u-new',
        });

        expect(mockPrisma.directMessageReadState.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              userId: 'u-new',
              lastReadMessageId: 'm-latest',
            }),
          }),
        );
        expect(res.participants.some((p) => p.id === 'u-new')).toBe(true);
      });

      it('removeConversationParticipant protects sole admin', async () => {
        mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
          id: 'grp-1',
          workspaceId: 'ws-1',
          type: 'GROUP',
        });
        mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'wm-1' });
        mockPrisma.directMessageParticipant.findUnique.mockImplementation(({ where }) => {
          if (where.conversationId_userId?.userId === 'u-1') {
            return Promise.resolve({ id: 'p-1', role: 'ADMIN' });
          }
          if (where.conversationId_userId?.userId === 'u-sole-admin') {
            return Promise.resolve({ id: 'p-sole', role: 'ADMIN' });
          }
          return Promise.resolve(null);
        });

        // Sole admin check
        mockPrisma.directMessageParticipant.count.mockImplementation(({ where }) => {
          if (where?.role === 'ADMIN') return Promise.resolve(1);
          return Promise.resolve(3); // 3 total members
        });

        await expect(
          removeConversationParticipant(prisma, {
            conversationId: 'grp-1',
            adminUserId: 'u-1',
            userId: 'u-sole-admin',
          }),
        ).rejects.toThrow('Cannot remove the sole admin of a group conversation.');
      });

      it('leaveGroupConversation promotes oldest remaining participant when sole admin leaves', async () => {
        const dateOldest = new Date('2026-09-01T00:00:00.000Z');
        const dateNewer = new Date('2026-09-02T00:00:00.000Z');

        mockPrisma.directMessageConversation.findUnique.mockResolvedValue({
          id: 'grp-1',
          workspaceId: 'ws-1',
          type: 'GROUP',
        });
        mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ id: 'wm-1' });
        mockPrisma.directMessageParticipant.findUnique.mockResolvedValue({
          id: 'p-1',
          userId: 'u-1',
          role: 'ADMIN',
        });

        // After deleting p-1, remaining participants are queried
        mockPrisma.directMessageParticipant.findMany.mockResolvedValue([
          { id: 'p-oldest', userId: 'u-oldest', role: 'MEMBER', joinedAt: dateOldest },
          { id: 'p-newer', userId: 'u-newer', role: 'MEMBER', joinedAt: dateNewer },
        ]);

        const result = await leaveGroupConversation(prisma, {
          conversationId: 'grp-1',
          userId: 'u-1',
        });

        expect(result.success).toBe(true);
        expect(mockPrisma.directMessageParticipant.delete).toHaveBeenCalledWith({
          where: { conversationId_userId: { conversationId: 'grp-1', userId: 'u-1' } },
        });
        // Promoted oldest remaining participant
        expect(mockPrisma.directMessageParticipant.update).toHaveBeenCalledWith({
          where: { id: 'p-oldest' },
          data: { role: 'ADMIN' },
        });
      });
    });

    describe('HTTP Endpoints', () => {
      const auth = betterAuth({
        database: memoryAdapter({}),
      });

      const app = createApp({
        auth,
      });

      it('rejects unauthenticated requests to group DM endpoints with 401', async () => {
        await request(app)
          .post('/api/workspaces/ws-1/direct-messages/group')
          .send({ participantIds: ['u-2', 'u-3'] })
          .expect(401);

        await request(app)
          .patch('/api/direct-messages/grp-1')
          .send({ name: 'New Name' })
          .expect(401);

        await request(app)
          .post('/api/direct-messages/grp-1/participants')
          .send({ userId: 'u-4' })
          .expect(401);

        await request(app).delete('/api/direct-messages/grp-1/participants/u-4').expect(401);

        await request(app).post('/api/direct-messages/grp-1/leave').expect(401);
      });
    });
  });
});

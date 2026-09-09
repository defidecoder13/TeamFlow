/**
 * Notification generation tests (Phase 4H.4, mocked Prisma).
 *
 * Covers recipient rules per type, precedence collapse, actor exclusion,
 * snapshots, tombstone/missing skips, idempotent writes, and the safe
 * wrapper's log-and-continue semantics. Live persistence/security behavior
 * is covered in `notifications.generation.test.ts`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@teamflow/db';
import { generateNotificationsForMessage, generateNotificationsForMessageSafely } from './service';

const { emitNotificationNewMock } = vi.hoisted(() => ({ emitNotificationNewMock: vi.fn() }));

vi.mock('../realtime/index', () => ({
  emitNotificationNew: emitNotificationNewMock,
}));

function makePrisma() {
  return {
    message: { findUnique: vi.fn(), findMany: vi.fn() },
    messageMention: { findMany: vi.fn().mockResolvedValue([]) },
    channel: { findUnique: vi.fn() },
    workspaceMembership: { findMany: vi.fn().mockResolvedValue([]) },
    channelMembership: { findMany: vi.fn().mockResolvedValue([]) },
    directMessageParticipant: { findMany: vi.fn().mockResolvedValue([]) },
    userNotificationPreference: { findMany: vi.fn().mockResolvedValue([]) },
    notification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;

function channelMessage(prisma: MockPrisma, overrides: Record<string, unknown> = {}) {
  prisma.message.findUnique.mockResolvedValue({
    id: 'm-1',
    authorId: 'u-actor',
    author: { id: 'u-actor', name: 'Actor', image: 'img-a' },
    channelId: 'ch-1',
    directMessageConversationId: null,
    parentMessageId: null,
    deletedAt: null,
    channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC', name: 'general' },
    directMessageConversation: null,
    ...overrides,
  });
}

function channelOf(prisma: MockPrisma, type = 'PUBLIC') {
  return {
    id: 'ch-1',
    workspaceId: 'ws-1',
    type,
    name: 'general',
  };
}

describe('generateNotificationsForMessage', () => {
  let prisma: MockPrisma;
  let db: PrismaClient;
  beforeEach(() => {
    prisma = makePrisma();
    db = prisma as unknown as PrismaClient;
    emitNotificationNewMock.mockReset();
  });

  it('returns [] for missing or tombstoned messages without writing', async () => {
    prisma.message.findUnique.mockResolvedValue(null);
    await expect(generateNotificationsForMessage(db, 'm-gone')).resolves.toEqual([]);
    prisma.message.findUnique.mockResolvedValue({
      id: 'm-1',
      authorId: 'u-actor',
      deletedAt: new Date(),
    });
    await expect(generateNotificationsForMessage(db, 'm-1')).resolves.toEqual([]);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('creates MENTION rows with snapshots for a channel root message', async () => {
    channelMessage(prisma);
    prisma.channel.findUnique.mockResolvedValue(channelOf(prisma));
    prisma.messageMention.findMany.mockResolvedValue([{ mentionedUserId: 'u-b' }]);
    const out = await generateNotificationsForMessage(db, 'm-1');
    expect(out).toEqual([{ recipientUserId: 'u-b', type: 'MENTION' }]);
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          workspaceId: 'ws-1',
          recipientUserId: 'u-b',
          type: 'MENTION',
          actorUserId: 'u-actor',
          messageId: 'm-1',
          channelId: 'ch-1',
          conversationId: null,
          threadRootMessageId: null,
          actorName: 'Actor',
          actorImage: 'img-a',
          channelName: 'general',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('excludes the actor even when self-mentioned', async () => {
    channelMessage(prisma);
    prisma.channel.findUnique.mockResolvedValue(channelOf(prisma));
    prisma.messageMention.findMany.mockResolvedValue([{ mentionedUserId: 'u-actor' }]);
    await expect(generateNotificationsForMessage(db, 'm-1')).resolves.toEqual([]);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('notifies the peer (not sender) on DIRECT root messages', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'm-1',
      authorId: 'u-a',
      author: { id: 'u-a', name: 'A', image: null },
      channelId: null,
      directMessageConversationId: 'dm-1',
      parentMessageId: null,
      deletedAt: null,
      directMessageConversation: { id: 'dm-1', workspaceId: 'ws-1', type: 'DIRECT', name: null },
    });
    prisma.directMessageParticipant.findMany.mockResolvedValue([
      { userId: 'u-a' },
      { userId: 'u-b' },
    ]);
    const out = await generateNotificationsForMessage(db, 'm-1');
    expect(out).toEqual([{ recipientUserId: 'u-b', type: 'DM_MESSAGE' }]);
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          conversationId: 'dm-1',
          channelId: null,
          conversationName: 'A',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('notifies all other current GROUP participants', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'm-1',
      authorId: 'u-a',
      author: { id: 'u-a', name: 'A', image: null },
      channelId: null,
      directMessageConversationId: 'dm-1',
      parentMessageId: null,
      deletedAt: null,
      directMessageConversation: { id: 'dm-1', workspaceId: 'ws-1', type: 'GROUP', name: 'Crew' },
    });
    prisma.directMessageParticipant.findMany.mockResolvedValue([
      { userId: 'u-a' },
      { userId: 'u-b' },
      { userId: 'u-c' },
    ]);
    const out = await generateNotificationsForMessage(db, 'm-1');
    expect(out).toEqual([
      { recipientUserId: 'u-b', type: 'GROUP_MESSAGE' },
      { recipientUserId: 'u-c', type: 'GROUP_MESSAGE' },
    ]);
  });

  it('collapses MENTION over DM/GROUP/THREAD per user', async () => {
    // DM mention: MENTION wins over DM_MESSAGE.
    prisma.message.findUnique.mockResolvedValue({
      id: 'm-1',
      authorId: 'u-a',
      author: { id: 'u-a', name: 'A', image: null },
      channelId: null,
      directMessageConversationId: 'dm-1',
      parentMessageId: null,
      deletedAt: null,
      directMessageConversation: { id: 'dm-1', workspaceId: 'ws-1', type: 'DIRECT', name: null },
    });
    prisma.directMessageParticipant.findMany.mockResolvedValue([
      { userId: 'u-a' },
      { userId: 'u-b' },
    ]);
    prisma.messageMention.findMany.mockResolvedValue([{ mentionedUserId: 'u-b' }]);
    const out = await generateNotificationsForMessage(db, 'm-1');
    expect(out).toEqual([{ recipientUserId: 'u-b', type: 'MENTION' }]);
  });

  it('notifies root author and prior repliers on thread replies', async () => {
    const replyRow = {
      id: 'm-reply',
      authorId: 'u-c',
      author: { id: 'u-c', name: 'C', image: null },
      channelId: 'ch-1',
      directMessageConversationId: null,
      parentMessageId: 'm-root',
      deletedAt: null,
      channel: channelOf(prisma),
      directMessageConversation: null,
    };
    prisma.message.findUnique.mockImplementation((args: unknown) => {
      const where = (args as { where: { id: string } }).where;
      if (where.id === 'm-root') {
        return Promise.resolve({ id: 'm-root', authorId: 'u-a' });
      }
      return Promise.resolve(replyRow);
    });
    prisma.message.findMany.mockResolvedValue([{ authorId: 'u-a' }, { authorId: 'u-b' }]);
    prisma.channel.findUnique.mockResolvedValue({ workspaceId: 'ws-1', type: 'PUBLIC' });
    prisma.workspaceMembership.findMany.mockResolvedValue([{ userId: 'u-a' }, { userId: 'u-b' }]);
    const out = await generateNotificationsForMessage(db, 'm-reply');
    expect(out).toEqual([
      { recipientUserId: 'u-a', type: 'THREAD_REPLY' },
      { recipientUserId: 'u-b', type: 'THREAD_REPLY' },
    ]);
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ threadRootMessageId: 'm-root', type: 'THREAD_REPLY' }),
        expect.objectContaining({ threadRootMessageId: 'm-root', type: 'THREAD_REPLY' }),
      ],
      skipDuplicates: true,
    });
  });

  it('drops ineligible thread candidates (lost channel access)', async () => {
    const replyRow = {
      id: 'm-reply',
      authorId: 'u-c',
      author: { id: 'u-c', name: 'C', image: null },
      channelId: 'ch-1',
      directMessageConversationId: null,
      parentMessageId: 'm-root',
      deletedAt: null,
      channel: { id: 'ch-1', workspaceId: 'ws-1', type: 'PRIVATE', name: 'vault' },
      directMessageConversation: null,
    };
    prisma.message.findUnique.mockImplementation((args: unknown) => {
      const where = (args as { where: { id: string } }).where;
      if (where.id === 'm-root') {
        return Promise.resolve({ id: 'm-root', authorId: 'u-gone' });
      }
      return Promise.resolve(replyRow);
    });
    prisma.message.findMany.mockResolvedValue([]);
    prisma.workspaceMembership.findMany.mockResolvedValue([{ userId: 'u-gone' }]);
    prisma.channelMembership.findMany.mockResolvedValue([]);
    const out = await generateNotificationsForMessage(db, 'm-reply');
    expect(out).toEqual([]);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('throws a distinct error when the thread root is missing', async () => {
    const replyRow = {
      id: 'm-reply',
      authorId: 'u-c',
      author: { id: 'u-c', name: 'C', image: null },
      channelId: 'ch-1',
      directMessageConversationId: null,
      parentMessageId: 'm-root',
      deletedAt: null,
      channel: channelOf(prisma),
      directMessageConversation: null,
    };
    let calls = 0;
    prisma.message.findUnique.mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve(replyRow);
      }
      return Promise.resolve(null);
    });
    await expect(generateNotificationsForMessage(db, 'm-reply')).rejects.toThrow(
      'Thread root not found',
    );
  });
});

describe('generateNotificationsForMessageSafely', () => {
  it('logs loudly instead of rolling back the caller', async () => {
    const prisma = makePrisma() as unknown as PrismaClient;
    (prisma as unknown as { message: { findUnique: unknown } }).message = {
      findUnique: vi.fn().mockRejectedValue(new Error('db down')),
    } as never;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(generateNotificationsForMessageSafely(prisma, 'm-1')).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith(
        '[notifications] failed to generate notifications',
        expect.objectContaining({ messageId: 'm-1' }),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('realtime delivery gating (Phase 4H.6)', () => {
  let prisma: MockPrisma;
  let db: PrismaClient;
  beforeEach(() => {
    prisma = makePrisma();
    db = prisma as unknown as PrismaClient;
    emitNotificationNewMock.mockReset();
  });

  function mentionMessage() {
    channelMessage(prisma);
    prisma.messageMention.findMany.mockResolvedValue([{ mentionedUserId: 'u-b' }]);
  }

  it('emits notification:new with the 4H.5 shape when preference is ALL or absent', async () => {
    mentionMessage();
    await generateNotificationsForMessage(db, 'm-1');
    expect(emitNotificationNewMock).toHaveBeenCalledTimes(1);
    expect(emitNotificationNewMock).toHaveBeenCalledWith(
      'u-b',
      expect.objectContaining({
        type: 'MENTION',
        workspaceId: 'ws-1',
        recipientUserId: 'u-b',
        actorUserId: 'u-actor',
        actorName: 'Actor',
        actorImage: 'img-a',
        messageId: 'm-1',
        channelId: 'ch-1',
        conversationId: null,
        threadRootMessageId: null,
        channelName: 'general',
        readAt: null,
      }),
    );
    const payload = emitNotificationNewMock.mock.calls[0][1] as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toMatch(/email|password|token|secret/i);
    expect(typeof payload.createdAt).toBe('string');
  });

  it('persists the row but skips delivery when preference is NONE', async () => {
    mentionMessage();
    prisma.userNotificationPreference.findMany.mockResolvedValue([
      { userId: 'u-b', mentionDelivery: 'NONE', dmDelivery: 'ALL', threadReplyDelivery: 'ALL' },
    ]);
    const out = await generateNotificationsForMessage(db, 'm-1');
    expect(out).toEqual([{ recipientUserId: 'u-b', type: 'MENTION' }]);
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    expect(emitNotificationNewMock).not.toHaveBeenCalled();
  });

  it('gates GROUP_MESSAGE on dmDelivery (no separate group preference)', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'm-1',
      authorId: 'u-a',
      author: { id: 'u-a', name: 'A', image: null },
      channelId: null,
      directMessageConversationId: 'dm-1',
      parentMessageId: null,
      deletedAt: null,
      channel: null,
      directMessageConversation: { id: 'dm-1', workspaceId: 'ws-1', type: 'GROUP', name: 'Crew' },
    });
    prisma.directMessageParticipant.findMany.mockResolvedValue([
      { userId: 'u-a' },
      { userId: 'u-b' },
    ]);
    prisma.userNotificationPreference.findMany.mockResolvedValue([
      { userId: 'u-b', mentionDelivery: 'ALL', dmDelivery: 'NONE', threadReplyDelivery: 'ALL' },
    ]);
    await generateNotificationsForMessage(db, 'm-1');
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    expect(emitNotificationNewMock).not.toHaveBeenCalled();
  });

  it('gates THREAD_REPLY on threadReplyDelivery and delivers mixed batches per-recipient', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'm-1',
      authorId: 'u-a',
      author: { id: 'u-a', name: 'A', image: null },
      channelId: null,
      directMessageConversationId: 'dm-1',
      parentMessageId: null,
      deletedAt: null,
      channel: null,
      directMessageConversation: { id: 'dm-1', workspaceId: 'ws-1', type: 'GROUP', name: 'Crew' },
    });
    prisma.directMessageParticipant.findMany.mockResolvedValue([
      { userId: 'u-a' },
      { userId: 'u-b' },
      { userId: 'u-c' },
    ]);
    prisma.userNotificationPreference.findMany.mockResolvedValue([
      { userId: 'u-b', mentionDelivery: 'ALL', dmDelivery: 'NONE', threadReplyDelivery: 'ALL' },
    ]);
    await generateNotificationsForMessage(db, 'm-1');
    // Only u-c (default ALL) is emitted; u-b's NONE suppresses delivery only.
    expect(emitNotificationNewMock).toHaveBeenCalledTimes(1);
    expect(emitNotificationNewMock).toHaveBeenCalledWith(
      'u-c',
      expect.objectContaining({ type: 'GROUP_MESSAGE' }),
    );
    // Batch preference load happens once regardless of recipient count.
    expect(prisma.userNotificationPreference.findMany).toHaveBeenCalledTimes(1);
  });
});

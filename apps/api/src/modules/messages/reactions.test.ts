import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import type { PrismaClient } from '@teamflow/db';
import { createApp } from '../../app';
import {
  addMessageReaction,
  removeMessageReaction,
  getMessageReactions,
  MessageNotFoundError,
  MessageConflictError,
} from './service';

const mockPrisma = {
  message: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  messageReaction: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
};

const prisma = mockPrisma as unknown as PrismaClient;

const mockAuthorizeChannelAccess = vi.fn();

const {
  mockEmitMessageCreated,
  mockEmitMessageUpdated,
  mockEmitMessageDeleted,
  mockEmitReactionAdded,
  mockEmitReactionRemoved,
} = vi.hoisted(() => ({
  mockEmitMessageCreated: vi.fn(),
  mockEmitMessageUpdated: vi.fn(),
  mockEmitMessageDeleted: vi.fn(),
  mockEmitReactionAdded: vi.fn(),
  mockEmitReactionRemoved: vi.fn(),
}));

vi.mock('../realtime/index', () => ({
  emitMessageCreated: mockEmitMessageCreated,
  emitMessageUpdated: mockEmitMessageUpdated,
  emitMessageDeleted: mockEmitMessageDeleted,
  emitReactionAdded: mockEmitReactionAdded,
  emitReactionRemoved: mockEmitReactionRemoved,
}));

vi.mock('./authorization', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./authorization')>();
  return {
    ...actual,
    authorizeChannelAccess: (...args: unknown[]) => mockAuthorizeChannelAccess(...args),
  };
});

vi.mock('../auth/prisma', () => ({
  getPrisma: () => mockPrisma,
}));

describe('Phase 4E.1 - Message Reactions Domain & Service Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addMessageReaction', () => {
    it('persists reaction in PostgreSQL and returns reaction response', async () => {
      const now = new Date('2026-09-08T14:00:00.000Z');
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        channelId: 'ch-1',
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
      mockPrisma.messageReaction.create.mockResolvedValueOnce({
        id: 'rxn-1',
        messageId: 'msg-1',
        userId: 'user-1',
        emoji: '👍',
        createdAt: now,
      });

      const reaction = await addMessageReaction(prisma, {
        messageId: 'msg-1',
        userId: 'user-1',
        emoji: '👍',
      });

      expect(reaction).toEqual({
        id: 'rxn-1',
        messageId: 'msg-1',
        channelId: 'ch-1',
        userId: 'user-1',
        emoji: '👍',
        createdAt: now,
      });
      expect(mockPrisma.messageReaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          messageId: 'msg-1',
          userId: 'user-1',
          emoji: '👍',
        }),
      });
    });

    it('works identically for thread replies (generic message attachment)', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'reply-1',
        channelId: 'ch-1',
        parentMessageId: 'root-1',
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
      mockPrisma.messageReaction.create.mockResolvedValueOnce({
        id: 'rxn-reply-1',
        messageId: 'reply-1',
        userId: 'user-1',
        emoji: '🔥',
        createdAt: new Date(),
      });

      const reaction = await addMessageReaction(prisma, {
        messageId: 'reply-1',
        userId: 'user-1',
        emoji: '🔥',
      });

      expect(reaction.messageId).toBe('reply-1');
      expect(reaction.emoji).toBe('🔥');
    });

    it('throws MessageConflictError when database unique constraint (P2002) is violated', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        channelId: 'ch-1',
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
      mockPrisma.messageReaction.create.mockRejectedValueOnce({
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`messageId`,`userId`,`emoji`)',
      });

      await expect(
        addMessageReaction(prisma, {
          messageId: 'msg-1',
          userId: 'user-1',
          emoji: '👍',
        }),
      ).rejects.toThrow(MessageConflictError);
    });

    it('rejects adding a reaction to a soft-deleted message with 409 Conflict', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        channelId: 'ch-1',
        deletedAt: new Date(),
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });

      await expect(
        addMessageReaction(prisma, {
          messageId: 'msg-1',
          userId: 'user-1',
          emoji: '👍',
        }),
      ).rejects.toThrow(MessageConflictError);
    });

    it('throws MessageNotFoundError when target message does not exist', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce(null);

      await expect(
        addMessageReaction(prisma, {
          messageId: 'nonexistent',
          userId: 'user-1',
          emoji: '👍',
        }),
      ).rejects.toThrow(MessageNotFoundError);
    });

    it('throws MessageNotFoundError when channel authorization fails', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        channelId: 'ch-private',
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce(null);

      await expect(
        addMessageReaction(prisma, {
          messageId: 'msg-1',
          userId: 'outsider',
          emoji: '👍',
        }),
      ).rejects.toThrow(MessageNotFoundError);
    });
  });

  describe('removeMessageReaction', () => {
    it('deletes only the authenticated user reaction matching target message and emoji', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        channelId: 'ch-1',
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
      mockPrisma.messageReaction.deleteMany.mockResolvedValueOnce({ count: 1 });

      await removeMessageReaction(prisma, {
        messageId: 'msg-1',
        userId: 'user-1',
        emoji: '👍',
      });

      expect(mockPrisma.messageReaction.deleteMany).toHaveBeenCalledWith({
        where: {
          messageId: 'msg-1',
          userId: 'user-1',
          emoji: '👍',
        },
      });
    });

    it('throws MessageNotFoundError when the reaction does not exist or belongs to someone else', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        channelId: 'ch-1',
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
      mockPrisma.messageReaction.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        removeMessageReaction(prisma, {
          messageId: 'msg-1',
          userId: 'user-2',
          emoji: '👍',
        }),
      ).rejects.toThrow('Reaction not found.');
    });

    it('throws MessageNotFoundError when channel authorization fails', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        channelId: 'ch-private',
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce(null);

      await expect(
        removeMessageReaction(prisma, {
          messageId: 'msg-1',
          userId: 'user-1',
          emoji: '👍',
        }),
      ).rejects.toThrow(MessageNotFoundError);
    });
  });

  describe('getMessageReactions', () => {
    it('aggregates reactions by emoji with counts and user-specific reacted flag', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        channelId: 'ch-1',
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
      mockPrisma.messageReaction.findMany.mockResolvedValueOnce([
        {
          id: 'rxn-1',
          messageId: 'msg-1',
          userId: 'user-1',
          emoji: '👍',
          createdAt: new Date('2026-09-08T10:00:00Z'),
        },
        {
          id: 'rxn-2',
          messageId: 'msg-1',
          userId: 'user-2',
          emoji: '👍',
          createdAt: new Date('2026-09-08T10:01:00Z'),
        },
        {
          id: 'rxn-3',
          messageId: 'msg-1',
          userId: 'user-2',
          emoji: '❤️',
          createdAt: new Date('2026-09-08T10:02:00Z'),
        },
      ]);

      const summaries = await getMessageReactions(prisma, {
        messageId: 'msg-1',
        userId: 'user-1',
      });

      expect(summaries).toEqual([
        {
          emoji: '👍',
          count: 2,
          reacted: true,
          userIds: ['user-1', 'user-2'],
        },
        {
          emoji: '❤️',
          count: 1,
          reacted: false,
          userIds: ['user-2'],
        },
      ]);
    });

    it('returns empty array when message has zero reactions', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        channelId: 'ch-1',
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
      mockPrisma.messageReaction.findMany.mockResolvedValueOnce([]);

      const summaries = await getMessageReactions(prisma, {
        messageId: 'msg-1',
        userId: 'user-1',
      });

      expect(summaries).toEqual([]);
    });

    it('preserves and returns existing reactions on soft-deleted messages', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        channelId: 'ch-1',
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
      mockPrisma.messageReaction.findMany.mockResolvedValueOnce([
        {
          id: 'rxn-1',
          messageId: 'msg-1',
          userId: 'user-1',
          emoji: '🚀',
          createdAt: new Date(),
        },
      ]);

      const summaries = await getMessageReactions(prisma, {
        messageId: 'msg-1',
        userId: 'user-1',
      });

      expect(summaries).toHaveLength(1);
      expect(summaries[0].emoji).toBe('🚀');
      expect(summaries[0].count).toBe(1);
      expect(summaries[0].reacted).toBe(true);
    });
  });
});

describe('Phase 4E.1 - Message Reactions HTTP Endpoints (createMessagesRouter)', () => {
  const TEST_AUTH_URL = 'http://localhost:4000';
  let auth: ReturnType<typeof createTestAuth>;
  let app: ReturnType<typeof createApp>;

  function createTestAuth() {
    return betterAuth({
      secret: 'reactions-test-secret-0123456789abcdef-0123456789abcdef',
      baseURL: TEST_AUTH_URL,
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      emailAndPassword: { enabled: true },
      rateLimit: { enabled: false },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    auth = createTestAuth();
    app = createApp({ auth });
  });

  it('rejects unauthenticated requests with 401', async () => {
    const postRes = await request(app).post('/api/messages/msg-1/reactions').send({ emoji: '👍' });
    expect(postRes.status).toBe(401);

    const delRes = await request(app).delete('/api/messages/msg-1/reactions/%F0%9F%91%8D');
    expect(delRes.status).toBe(401);

    const getRes = await request(app).get('/api/messages/msg-1/reactions');
    expect(getRes.status).toBe(401);
  });

  describe('authenticated reaction operations', () => {
    let authCookieUserA: string;
    let userIdA: string;
    let authCookieUserB: string;
    let userIdB: string;

    beforeEach(async () => {
      // Create User A
      const resA = await request(app)
        .post('/api/auth/sign-up/email')
        .set('Origin', TEST_AUTH_URL)
        .send({
          name: 'Reaction User A',
          email: 'user-a@teamflow.local',
          password: 'password-123456',
        });
      expect(resA.status).toBe(200);
      const cookiesA = resA.headers['set-cookie'];
      authCookieUserA = Array.isArray(cookiesA) ? cookiesA.join('; ') : (cookiesA ?? '');
      userIdA = (resA.body as { user: { id: string } }).user.id;

      // Create User B
      const resB = await request(app)
        .post('/api/auth/sign-up/email')
        .set('Origin', TEST_AUTH_URL)
        .send({
          name: 'Reaction User B',
          email: 'user-b@teamflow.local',
          password: 'password-123456',
        });
      expect(resB.status).toBe(200);
      const cookiesB = resB.headers['set-cookie'];
      authCookieUserB = Array.isArray(cookiesB) ? cookiesB.join('; ') : (cookiesB ?? '');
      userIdB = (resB.body as { user: { id: string } }).user.id;
    });

    describe('POST /api/messages/:messageId/reactions validation', () => {
      it('rejects missing emoji with 400', async () => {
        const res = await request(app)
          .post('/api/messages/msg-1/reactions')
          .set('Cookie', authCookieUserA)
          .send({});
        expect(res.status).toBe(400);
        expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
      });

      it('rejects empty string emoji with 400', async () => {
        const res = await request(app)
          .post('/api/messages/msg-1/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '   ' });
        expect(res.status).toBe(400);
        expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
      });

      it('rejects emoji exceeding max character limit (16) with 400', async () => {
        const res = await request(app)
          .post('/api/messages/msg-1/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '👍'.repeat(20) });
        expect(res.status).toBe(400);
        expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
      });

      it('rejects emoji containing control characters or newlines with 400', async () => {
        const res = await request(app)
          .post('/api/messages/msg-1/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '👍\n' });
        expect(res.status).toBe(400);
        expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
      });

      it('rejects client-supplied unknown fields like userId with 400', async () => {
        const res = await request(app)
          .post('/api/messages/msg-1/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '👍', userId: 'spoofed-id' });
        expect(res.status).toBe(400);
        expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('POST /api/messages/:messageId/reactions authorization & functionality', () => {
      it('returns 404 when target message is in an unauthorized private channel', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-priv',
          channelId: 'ch-priv',
          deletedAt: null,
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce(null);

        const res = await request(app)
          .post('/api/messages/msg-priv/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '👍' });

        expect(res.status).toBe(404);
        expect((res.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
      });

      it('adds reaction successfully with 201', async () => {
        const now = new Date();
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-1',
          channelId: 'ch-1',
          deletedAt: null,
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.create.mockResolvedValueOnce({
          id: 'rxn-1',
          messageId: 'msg-1',
          userId: userIdA,
          emoji: '🚀',
          createdAt: now,
        });

        const res = await request(app)
          .post('/api/messages/msg-1/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '🚀' });

        expect(res.status).toBe(201);
        expect(res.body).toEqual({
          reaction: {
            id: 'rxn-1',
            messageId: 'msg-1',
            channelId: 'ch-1',
            userId: userIdA,
            emoji: '🚀',
            createdAt: now.toISOString(),
          },
        });
        expect(mockEmitMessageCreated).not.toHaveBeenCalled();
        expect(mockEmitMessageUpdated).not.toHaveBeenCalled();
        expect(mockEmitReactionAdded).toHaveBeenCalledWith('ch-1', 'msg-1', '🚀', userIdA);
      });

      it('returns 409 Conflict when duplicate reaction is attempted', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-1',
          channelId: 'ch-1',
          deletedAt: null,
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.create.mockRejectedValueOnce({
          code: 'P2002',
          message: 'Unique constraint failed on the fields: (`messageId`,`userId`,`emoji`)',
        });

        const res = await request(app)
          .post('/api/messages/msg-1/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '🚀' });

        expect(res.status).toBe(409);
        expect((res.body as { error: { code: string; message: string } }).error.code).toBe(
          'CONFLICT',
        );
        expect((res.body as { error: { message: string } }).error.message).toBe(
          'Reaction already exists.',
        );
      });

      it('returns 409 Conflict when reacting to a soft-deleted message', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-1',
          channelId: 'ch-1',
          deletedAt: new Date(),
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });

        const res = await request(app)
          .post('/api/messages/msg-1/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '👍' });

        expect(res.status).toBe(409);
        expect((res.body as { error: { code: string; message: string } }).error.code).toBe(
          'CONFLICT',
        );
      });
    });

    describe('DELETE /api/messages/:messageId/reactions/:emoji', () => {
      it('removes authenticated user reaction with 200', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-1',
          channelId: 'ch-1',
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.deleteMany.mockResolvedValueOnce({ count: 1 });

        const res = await request(app)
          .delete('/api/messages/msg-1/reactions/%F0%9F%91%8D')
          .set('Cookie', authCookieUserA);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, message: 'Reaction removed.' });
        expect(mockPrisma.messageReaction.deleteMany).toHaveBeenCalledWith({
          where: {
            messageId: 'msg-1',
            userId: userIdA,
            emoji: '👍',
          },
        });
        expect(mockEmitReactionRemoved).toHaveBeenCalledWith('ch-1', 'msg-1', '👍', userIdA);
      });

      it('returns 404 when user has not reacted with that emoji', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-1',
          channelId: 'ch-1',
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.deleteMany.mockResolvedValueOnce({ count: 0 });

        const res = await request(app)
          .delete('/api/messages/msg-1/reactions/%F0%9F%91%8D')
          .set('Cookie', authCookieUserB);

        expect(res.status).toBe(404);
        expect((res.body as { error: { code: string; message: string } }).error.message).toBe(
          'Reaction not found.',
        );
      });
    });

    describe('GET /api/messages/:messageId/reactions', () => {
      it('returns 404 when user is not authorized in the channel', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-priv',
          channelId: 'ch-priv',
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce(null);

        const res = await request(app)
          .get('/api/messages/msg-priv/reactions')
          .set('Cookie', authCookieUserA);

        expect(res.status).toBe(404);
      });

      it('returns aggregated reaction summaries with counts and calling user reacted state', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-1',
          channelId: 'ch-1',
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.findMany.mockResolvedValueOnce([
          {
            id: 'rxn-1',
            messageId: 'msg-1',
            userId: userIdA,
            emoji: '👍',
            createdAt: new Date('2026-09-08T10:00:00Z'),
          },
          {
            id: 'rxn-2',
            messageId: 'msg-1',
            userId: userIdB,
            emoji: '👍',
            createdAt: new Date('2026-09-08T10:01:00Z'),
          },
          {
            id: 'rxn-3',
            messageId: 'msg-1',
            userId: userIdB,
            emoji: '❤️',
            createdAt: new Date('2026-09-08T10:02:00Z'),
          },
        ]);

        const res = await request(app)
          .get('/api/messages/msg-1/reactions')
          .set('Cookie', authCookieUserA);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([
          {
            emoji: '👍',
            count: 2,
            reacted: true,
            userIds: [userIdA, userIdB],
          },
          {
            emoji: '❤️',
            count: 1,
            reacted: false,
            userIds: [userIdB],
          },
        ]);
      });

      it('returns empty array for message without reactions', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-empty',
          channelId: 'ch-1',
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.findMany.mockResolvedValueOnce([]);

        const res = await request(app)
          .get('/api/messages/msg-empty/reactions')
          .set('Cookie', authCookieUserA);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      });
    });

    describe('Thread reply reaction support and isolation', () => {
      it('allows independent reactions on root message and thread reply', async () => {
        const now = new Date();
        // Setup root message
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'root-msg',
          channelId: 'ch-1',
          parentMessageId: null,
          deletedAt: null,
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.create.mockResolvedValueOnce({
          id: 'rxn-root',
          messageId: 'root-msg',
          userId: userIdA,
          emoji: '👍',
          createdAt: now,
        });

        // Add reaction to root message
        const rootRes = await request(app)
          .post('/api/messages/root-msg/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '👍' });

        expect(rootRes.status).toBe(201);
        expect(rootRes.body.reaction.messageId).toBe('root-msg');
        expect(rootRes.body.reaction.channelId).toBe('ch-1');

        // Setup thread reply
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'reply-msg',
          channelId: 'ch-1',
          parentMessageId: 'root-msg',
          deletedAt: null,
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.create.mockResolvedValueOnce({
          id: 'rxn-reply',
          messageId: 'reply-msg',
          userId: userIdB,
          emoji: '❤️',
          createdAt: now,
        });

        // Add reaction to thread reply
        const replyRes = await request(app)
          .post('/api/messages/reply-msg/reactions')
          .set('Cookie', authCookieUserB)
          .send({ emoji: '❤️' });

        expect(replyRes.status).toBe(201);
        expect(replyRes.body.reaction.messageId).toBe('reply-msg');

        // Fetch reactions for thread reply only
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'reply-msg',
          channelId: 'ch-1',
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.findMany.mockResolvedValueOnce([
          {
            id: 'rxn-reply',
            messageId: 'reply-msg',
            userId: userIdB,
            emoji: '❤️',
            createdAt: now,
          },
        ]);

        const getReplyRes = await request(app)
          .get('/api/messages/reply-msg/reactions')
          .set('Cookie', authCookieUserB);

        expect(getReplyRes.status).toBe(200);
        expect(getReplyRes.body).toEqual([
          {
            emoji: '❤️',
            count: 1,
            reacted: true,
            userIds: [userIdB],
          },
        ]);
      });

      it('allows multiple different thread replies to have independent reactions', async () => {
        const now = new Date();
        // Reply 1
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'reply-1',
          channelId: 'ch-1',
          parentMessageId: 'root-1',
          deletedAt: null,
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.create.mockResolvedValueOnce({
          id: 'rxn-1',
          messageId: 'reply-1',
          userId: userIdA,
          emoji: '🎉',
          createdAt: now,
        });

        const r1 = await request(app)
          .post('/api/messages/reply-1/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '🎉' });
        expect(r1.status).toBe(201);

        // Reply 2
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'reply-2',
          channelId: 'ch-1',
          parentMessageId: 'root-1',
          deletedAt: null,
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.create.mockResolvedValueOnce({
          id: 'rxn-2',
          messageId: 'reply-2',
          userId: userIdA,
          emoji: '🚀',
          createdAt: now,
        });

        const r2 = await request(app)
          .post('/api/messages/reply-2/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '🚀' });
        expect(r2.status).toBe(201);
      });
    });

    describe('Multi-emoji and selective deletion', () => {
      it('allows a user to add multiple different emojis to the same message', async () => {
        const now = new Date();
        // Add 👍
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-1',
          channelId: 'ch-1',
          deletedAt: null,
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.create.mockResolvedValueOnce({
          id: 'rxn-1',
          messageId: 'msg-1',
          userId: userIdA,
          emoji: '👍',
          createdAt: now,
        });

        const res1 = await request(app)
          .post('/api/messages/msg-1/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '👍' });
        expect(res1.status).toBe(201);

        // Add ❤️
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-1',
          channelId: 'ch-1',
          deletedAt: null,
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.create.mockResolvedValueOnce({
          id: 'rxn-2',
          messageId: 'msg-1',
          userId: userIdA,
          emoji: '❤️',
          createdAt: now,
        });

        const res2 = await request(app)
          .post('/api/messages/msg-1/reactions')
          .set('Cookie', authCookieUserA)
          .send({ emoji: '❤️' });
        expect(res2.status).toBe(201);
      });

      it('deletes one emoji while retaining another emoji on the same message', async () => {
        // Delete 👍
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-1',
          channelId: 'ch-1',
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.deleteMany.mockResolvedValueOnce({ count: 1 });

        const delRes = await request(app)
          .delete('/api/messages/msg-1/reactions/%F0%9F%91%8D')
          .set('Cookie', authCookieUserA);
        expect(delRes.status).toBe(200);

        // Verify remaining reactions query returns only ❤️
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-1',
          channelId: 'ch-1',
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
        mockPrisma.messageReaction.findMany.mockResolvedValueOnce([
          {
            id: 'rxn-2',
            messageId: 'msg-1',
            userId: userIdA,
            emoji: '❤️',
            createdAt: new Date(),
          },
        ]);

        const getRes = await request(app)
          .get('/api/messages/msg-1/reactions')
          .set('Cookie', authCookieUserA);

        expect(getRes.status).toBe(200);
        expect(getRes.body).toHaveLength(1);
        expect(getRes.body[0].emoji).toBe('❤️');
      });

      it('rejects deletion when user is not authorized in a private channel with 404', async () => {
        mockPrisma.message.findUnique.mockResolvedValueOnce({
          id: 'msg-priv',
          channelId: 'ch-priv',
        });
        mockAuthorizeChannelAccess.mockResolvedValueOnce(null);

        const res = await request(app)
          .delete('/api/messages/msg-priv/reactions/%F0%9F%91%8D')
          .set('Cookie', authCookieUserA);

        expect(res.status).toBe(404);
      });
    });
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import type { PrismaClient } from '@teamflow/db';
import { createApp } from '../../app';
import {
  createThreadReply,
  listThreadReplies,
  listMessages,
  updateMessage,
  deleteMessage,
  MessageNotFoundError,
} from './service';

type TxCallback = (tx: {
  message: {
    create: (...args: unknown[]) => Promise<unknown>;
    update: (...args: unknown[]) => Promise<unknown>;
  };
}) => Promise<unknown>;

const mockPrisma = {
  message: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
};

const prisma = mockPrisma as unknown as PrismaClient;

const mockAuthorizeChannelAccess = vi.fn();

const { mockEmitMessageCreated, mockEmitMessageUpdated, mockEmitMessageDeleted } = vi.hoisted(
  () => ({
    mockEmitMessageCreated: vi.fn(),
    mockEmitMessageUpdated: vi.fn(),
    mockEmitMessageDeleted: vi.fn(),
  }),
);

vi.mock('../realtime/index', () => ({
  emitMessageCreated: mockEmitMessageCreated,
  emitMessageUpdated: mockEmitMessageUpdated,
  emitMessageDeleted: mockEmitMessageDeleted,
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

describe('Phase 4D.1 - Thread Domain & Service Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listMessages root-only filtering', () => {
    it('always passes parentMessageId: null to prisma query', async () => {
      mockPrisma.message.findMany.mockResolvedValueOnce([]);

      await listMessages(prisma, { channelId: 'ch-1', limit: 50 });

      expect(mockPrisma.message.findMany).toHaveBeenCalledTimes(1);
      const callArgs = mockPrisma.message.findMany.mock.calls[0][0] as {
        where: { channelId: string; parentMessageId: null };
      };
      expect(callArgs.where.channelId).toBe('ch-1');
      expect(callArgs.where.parentMessageId).toBeNull();
    });
  });

  describe('createThreadReply depth-1 root resolution and atomic counters', () => {
    it('creates reply to a root message, increments root replyCount, and sets latestReplyAt', async () => {
      const now = new Date('2026-09-08T12:00:00.000Z');
      const rootMsg = {
        id: 'root-1',
        channelId: 'ch-1',
        parentMessageId: null,
        deletedAt: null,
      };

      mockPrisma.message.findUnique.mockResolvedValueOnce(rootMsg);
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });

      const createdReply = {
        id: 'reply-1',
        channelId: 'ch-1',
        authorId: 'user-1',
        parentMessageId: 'root-1',
        body: 'First reply',
        replyCount: 0,
        latestReplyAt: null,
        createdAt: now,
        updatedAt: now,
        editedAt: null,
        deletedAt: null,
        author: { id: 'user-1', name: 'User 1', image: null },
      };

      mockPrisma.$transaction.mockImplementationOnce(async (callback: TxCallback) => {
        const tx = {
          message: {
            create: vi.fn().mockResolvedValueOnce(createdReply),
            update: vi.fn().mockResolvedValueOnce({
              ...rootMsg,
              replyCount: 1,
              latestReplyAt: now,
              createdAt: now,
              updatedAt: now,
              author: { id: 'user-1', name: 'User 1', image: null },
            }),
          },
        };
        return callback(tx);
      });

      const { reply, parent } = await createThreadReply(prisma, {
        messageId: 'root-1',
        authorId: 'user-1',
        body: 'First reply',
      });

      expect(reply.id).toBe('reply-1');
      expect(reply.parentMessageId).toBe('root-1');
      expect(parent.id).toBe('root-1');
      expect(parent.replyCount).toBe(1);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('enforces depth-1: replying to a reply resolves to root message', async () => {
      const replyMsg = {
        id: 'reply-1',
        channelId: 'ch-1',
        parentMessageId: 'root-1', // already a reply
        deletedAt: null,
      };

      mockPrisma.message.findUnique.mockResolvedValueOnce(replyMsg);
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });

      let createdWithParentId: string | undefined;
      let updatedRootId: string | undefined;

      mockPrisma.$transaction.mockImplementationOnce(async (callback: TxCallback) => {
        const tx = {
          message: {
            create: vi
              .fn()
              .mockImplementation(
                async (args: { data: { parentMessageId?: string; [key: string]: unknown } }) => {
                  createdWithParentId = args.data.parentMessageId;
                  return {
                    id: 'reply-2',
                    channelId: 'ch-1',
                    authorId: 'user-2',
                    parentMessageId: args.data.parentMessageId,
                    body: 'Replying to reply',
                    replyCount: 0,
                    latestReplyAt: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    editedAt: null,
                    deletedAt: null,
                    author: { id: 'user-2', name: 'User 2', image: null },
                  };
                },
              ),
            update: vi.fn().mockImplementation(async (args: { where: { id: string } }) => {
              updatedRootId = args.where.id;
              return {
                id: args.where.id,
                channelId: 'ch-1',
                authorId: 'user-1',
                parentMessageId: null,
                body: 'Root message',
                replyCount: 1,
                latestReplyAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
                editedAt: null,
                deletedAt: null,
                author: { id: 'user-1', name: 'User 1', image: null },
              };
            }),
          },
        };
        return callback(tx);
      });

      const { reply } = await createThreadReply(prisma, {
        messageId: 'reply-1',
        authorId: 'user-2',
        body: 'Replying to reply',
      });

      expect(reply.parentMessageId).toBe('root-1');
      expect(createdWithParentId).toBe('root-1');
      expect(updatedRootId).toBe('root-1');
    });

    it('throws MessageNotFoundError if target message does not exist', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce(null);

      await expect(
        createThreadReply(prisma, {
          messageId: 'non-existent',
          authorId: 'user-1',
          body: 'Hello',
        }),
      ).rejects.toThrow(MessageNotFoundError);
    });

    it('throws MessageNotFoundError if user does not have channel access', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'root-1',
        channelId: 'ch-1',
        parentMessageId: null,
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce(null);

      await expect(
        createThreadReply(prisma, {
          messageId: 'root-1',
          authorId: 'user-outsider',
          body: 'Hello',
        }),
      ).rejects.toThrow(MessageNotFoundError);
    });
  });

  describe('listThreadReplies pagination and root resolution', () => {
    it('lists replies for root message with keyset ordering', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'root-1',
        channelId: 'ch-1',
        parentMessageId: null,
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });

      const d1 = new Date('2026-09-08T13:00:00.000Z');
      const d2 = new Date('2026-09-08T12:00:00.000Z');

      mockPrisma.message.findMany.mockResolvedValueOnce([
        {
          id: 'reply-2',
          channelId: 'ch-1',
          authorId: 'u-1',
          parentMessageId: 'root-1',
          body: 'Second reply',
          replyCount: 0,
          latestReplyAt: null,
          createdAt: d1,
          updatedAt: d1,
          editedAt: null,
          deletedAt: null,
          author: { id: 'u-1', name: 'User 1', image: null },
        },
        {
          id: 'reply-1',
          channelId: 'ch-1',
          authorId: 'u-2',
          parentMessageId: 'root-1',
          body: 'First reply',
          replyCount: 0,
          latestReplyAt: null,
          createdAt: d2,
          updatedAt: d2,
          editedAt: null,
          deletedAt: null,
          author: { id: 'u-2', name: 'User 2', image: null },
        },
      ]);

      const result = await listThreadReplies(prisma, {
        messageId: 'root-1',
        userId: 'u-1',
        limit: 10,
      });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].id).toBe('reply-2');
      expect(result.messages[1].id).toBe('reply-1');
      expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            parentMessageId: 'root-1',
          }),
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });

    it('resolves root thread when given a reply ID', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'reply-1',
        channelId: 'ch-1',
        parentMessageId: 'root-1', // It's a reply
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });
      mockPrisma.message.findMany.mockResolvedValueOnce([]);

      await listThreadReplies(prisma, {
        messageId: 'reply-1',
        userId: 'u-1',
      });

      expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            parentMessageId: 'root-1',
          }),
        }),
      );
    });
  });

  describe('update and delete on replies', () => {
    it('preserves parentMessageId on update', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'reply-1',
        channelId: 'ch-1',
        authorId: 'u-1',
        parentMessageId: 'root-1',
        replyCount: 0,
        latestReplyAt: null,
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });

      mockPrisma.message.update.mockResolvedValueOnce({
        id: 'reply-1',
        channelId: 'ch-1',
        authorId: 'u-1',
        parentMessageId: 'root-1',
        body: 'Updated reply body',
        replyCount: 0,
        latestReplyAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        editedAt: new Date(),
        deletedAt: null,
        author: { id: 'u-1', name: 'User 1', image: null },
      });

      const updated = await updateMessage(prisma, {
        messageId: 'reply-1',
        userId: 'u-1',
        body: 'Updated reply body',
      });

      expect(updated.parentMessageId).toBe('root-1');
      expect(mockPrisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ parentMessageId: expect.anything() }),
        }),
      );
    });

    it('soft-deletes reply without decrementing parent replyCount', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'reply-1',
        channelId: 'ch-1',
        authorId: 'u-1',
        parentMessageId: 'root-1',
        replyCount: 0,
        latestReplyAt: null,
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });

      const delDate = new Date();
      mockPrisma.message.update.mockResolvedValueOnce({
        id: 'reply-1',
        channelId: 'ch-1',
        authorId: 'u-1',
        parentMessageId: 'root-1',
        body: null,
        replyCount: 0,
        latestReplyAt: null,
        createdAt: new Date(),
        updatedAt: delDate,
        editedAt: null,
        deletedAt: delDate,
        author: { id: 'u-1', name: 'User 1', image: null },
      });

      const deleted = await deleteMessage(prisma, {
        messageId: 'reply-1',
        userId: 'u-1',
      });

      expect(deleted.deletedAt).toEqual(delDate);
      expect(deleted.parentMessageId).toBe('root-1');
      // Verify no update on root replyCount
      expect(mockPrisma.message.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reply-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });
  });
});

describe('Phase 4D.1 - Thread HTTP Endpoints (createMessagesRouter)', () => {
  const TEST_AUTH_URL = 'http://localhost:4000';
  let auth: ReturnType<typeof createTestAuth>;
  let app: ReturnType<typeof createApp>;

  function createTestAuth() {
    return betterAuth({
      secret: 'thread-test-secret-0123456789abcdef-0123456789abcdef',
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

  it('rejects unauthenticated requests to replies endpoints with 401', async () => {
    const getRes = await request(app).get('/api/messages/msg-1/replies');
    expect(getRes.status).toBe(401);

    const postRes = await request(app).post('/api/messages/msg-1/replies').send({ body: 'Hi' });
    expect(postRes.status).toBe(401);
  });

  describe('authenticated reply operations', () => {
    let authCookie: string;
    let userId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/auth/sign-up/email')
        .set('Origin', TEST_AUTH_URL)
        .send({
          name: 'Thread Tester',
          email: 'thread-tester@teamflow.local',
          password: 'thread-test-pass-1234',
        });
      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      authCookie = Array.isArray(cookies) ? cookies.join('; ') : (cookies ?? '');
      userId = (res.body as { user: { id: string } }).user.id;
    });

    it('rejects invalid reply body with 400 validation error', async () => {
      const emptyRes = await request(app)
        .post('/api/messages/msg-1/replies')
        .set('Cookie', authCookie)
        .send({ body: '' });
      expect(emptyRes.status).toBe(400);

      const whitespaceRes = await request(app)
        .post('/api/messages/msg-1/replies')
        .set('Cookie', authCookie)
        .send({ body: '     ' });
      expect(whitespaceRes.status).toBe(400);

      const overlongRes = await request(app)
        .post('/api/messages/msg-1/replies')
        .set('Cookie', authCookie)
        .send({ body: 'x'.repeat(10001) });
      expect(overlongRes.status).toBe(400);
    });

    it('returns 404 when root message is not found', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/messages/nonexistent/replies')
        .set('Cookie', authCookie)
        .send({ body: 'Reply text' });

      expect(res.status).toBe(404);
      expect((res.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when user is not authorized in the channel to prevent channel leakage', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        channelId: 'ch-private',
        parentMessageId: null,
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/messages/msg-1/replies')
        .set('Cookie', authCookie)
        .send({ body: 'Reply text' });

      expect(res.status).toBe(404);
      expect((res.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    });

    it('creates reply successfully with 201', async () => {
      const now = new Date();
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'root-msg',
        channelId: 'ch-1',
        parentMessageId: null,
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });

      const createdReply = {
        id: 'reply-1',
        channelId: 'ch-1',
        authorId: userId,
        parentMessageId: 'root-msg',
        body: 'Valid reply',
        replyCount: 0,
        latestReplyAt: null,
        createdAt: now,
        updatedAt: now,
        editedAt: null,
        deletedAt: null,
        author: { id: userId, name: 'Thread Tester', image: null },
      };

      const updatedParent = {
        id: 'root-msg',
        channelId: 'ch-1',
        authorId: 'root-author',
        parentMessageId: null,
        body: 'Root message',
        replyCount: 1,
        latestReplyAt: now,
        createdAt: now,
        updatedAt: now,
        editedAt: null,
        deletedAt: null,
        author: { id: 'root-author', name: 'Root Author', image: null },
      };

      mockPrisma.$transaction.mockImplementationOnce(async (callback: TxCallback) => {
        const tx = {
          message: {
            create: vi.fn().mockResolvedValueOnce(createdReply),
            update: vi.fn().mockResolvedValueOnce(updatedParent),
          },
        };
        return callback(tx);
      });

      const res = await request(app)
        .post('/api/messages/root-msg/replies')
        .set('Cookie', authCookie)
        .send({ body: 'Valid reply' });

      expect(res.status).toBe(201);
      const resBody = res.body as {
        message: { id: string; parentMessageId: string; body: string };
      };
      expect(resBody.message.id).toBe('reply-1');
      expect(resBody.message.parentMessageId).toBe('root-msg');
      expect(resBody.message.body).toBe('Valid reply');

      // Realtime broadcasts
      expect(mockEmitMessageCreated).toHaveBeenCalledTimes(1);
      expect(mockEmitMessageCreated).toHaveBeenCalledWith(
        'ch-1',
        expect.objectContaining({
          id: 'reply-1',
          channelId: 'ch-1',
          parentMessageId: 'root-msg',
        }),
      );

      expect(mockEmitMessageUpdated).toHaveBeenCalledTimes(1);
      expect(mockEmitMessageUpdated).toHaveBeenCalledWith(
        'ch-1',
        expect.objectContaining({
          id: 'root-msg',
          channelId: 'ch-1',
          replyCount: 1,
        }),
      );
    });

    it('does not emit realtime events if reply creation fails validation', async () => {
      await request(app)
        .post('/api/messages/root-msg/replies')
        .set('Cookie', authCookie)
        .send({ body: '' });

      expect(mockEmitMessageCreated).not.toHaveBeenCalled();
      expect(mockEmitMessageUpdated).not.toHaveBeenCalled();
    });

    it('does not emit realtime events if root message is not found', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce(null);

      await request(app)
        .post('/api/messages/missing/replies')
        .set('Cookie', authCookie)
        .send({ body: 'Reply' });

      expect(mockEmitMessageCreated).not.toHaveBeenCalled();
      expect(mockEmitMessageUpdated).not.toHaveBeenCalled();
    });

    it('does not emit realtime events if channel authorization fails', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'root-msg',
        channelId: 'ch-secret',
        parentMessageId: null,
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce(null);

      await request(app)
        .post('/api/messages/root-msg/replies')
        .set('Cookie', authCookie)
        .send({ body: 'Reply' });

      expect(mockEmitMessageCreated).not.toHaveBeenCalled();
      expect(mockEmitMessageUpdated).not.toHaveBeenCalled();
    });

    it('gets thread replies with 200 and cursor pagination', async () => {
      const now = new Date('2026-09-08T14:00:00.000Z');
      mockPrisma.message.findUnique.mockResolvedValueOnce({
        id: 'root-msg',
        channelId: 'ch-1',
        parentMessageId: null,
        deletedAt: null,
      });
      mockAuthorizeChannelAccess.mockResolvedValueOnce({ id: 'ch-1', workspaceId: 'ws-1' });

      mockPrisma.message.findMany.mockResolvedValueOnce([
        {
          id: 'rep-1',
          channelId: 'ch-1',
          authorId: userId,
          parentMessageId: 'root-msg',
          body: 'Reply one',
          replyCount: 0,
          latestReplyAt: null,
          createdAt: now,
          updatedAt: now,
          editedAt: null,
          deletedAt: null,
          author: { id: userId, name: 'Thread Tester', image: null },
        },
      ]);

      const res = await request(app)
        .get('/api/messages/root-msg/replies?limit=10')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      const resBody = res.body as {
        messages: Array<{ id: string }>;
        pageInfo: { nextCursor: string | null; hasMore: boolean };
      };
      expect(resBody.messages).toHaveLength(1);
      expect(resBody.messages[0].id).toBe('rep-1');
      expect(resBody.pageInfo.nextCursor).toBeNull();
      expect(resBody.pageInfo.hasMore).toBe(false);
    });

    it('rejects invalid cursor with 400 validation error', async () => {
      const res = await request(app)
        .get('/api/messages/root-msg/replies?cursor=invalid-cursor')
        .set('Cookie', authCookie);

      expect(res.status).toBe(400);
      expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
    });
  });
});

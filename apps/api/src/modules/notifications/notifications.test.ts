/**
 * Notification read API tests (Phase 4H.5, mocked Prisma).
 *
 * Covers validation, cursor codec behavior via schemas, authorization
 * mapping, keyset predicate shape, atomic mark-one-read paths (including
 * idempotent re-mark and foreign-row 404s), and mark-all-read scoping.
 * Live persistence/security behavior is covered in
 * `notifications.routes.test.ts`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@teamflow/db';
import { createClerkFakes } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { decodeNotificationCursor, encodeNotificationCursor } from './cursor';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationNotFoundError,
} from './service';
import { notificationListQuerySchema } from './schemas';

const { mockGetPrisma, mockEmitNotificationRead, mockEmitNotificationReadAll } = vi.hoisted(() => ({
  mockGetPrisma: vi.fn(),
  mockEmitNotificationRead: vi.fn(),
  mockEmitNotificationReadAll: vi.fn(),
}));

vi.mock('../auth/prisma', () => ({
  getPrisma: (...args: unknown[]) => mockGetPrisma(...args),
}));

vi.mock('../realtime/index', () => ({
  emitNotificationRead: mockEmitNotificationRead,
  emitNotificationReadAll: mockEmitNotificationReadAll,
}));

const CANNED_USER = {
  id: 'u-clerk-1',
  name: 'Clerk User',
  email: 'clerk@example.invalid',
  image: null,
  emailVerified: false,
};

function makePrisma() {
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ ...CANNED_USER }) },
    workspaceMembership: { findUnique: vi.fn() },
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;

function member(prisma: MockPrisma) {
  prisma.workspaceMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
}

function notificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n-1',
    type: 'MENTION',
    workspaceId: 'ws-1',
    recipientUserId: 'u-1',
    actorUserId: 'u-2',
    actorName: 'Actor',
    actorImage: null,
    messageId: 'm-1',
    conversationId: null,
    channelId: 'ch-1',
    threadRootMessageId: null,
    channelName: 'general',
    conversationName: null,
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    readAt: null,
    ...overrides,
  };
}

describe('notification list query validation', () => {
  it('defaults limit to 50 and rejects out-of-range or malformed input', () => {
    expect(notificationListQuerySchema.safeParse({}).success).toBe(true);
    expect(notificationListQuerySchema.safeParse({}).data?.limit).toBe(50);
    expect(notificationListQuerySchema.safeParse({ limit: '100' }).success).toBe(true);
    for (const query of [
      { limit: '0' },
      { limit: '101' },
      { limit: 'abc' },
      { limit: '10.5' },
      { unreadOnly: 'yes' },
      { unreadOnly: '1' },
      { type: 'REACTION' },
      { type: 'mention' },
      { cursor: '!!!' },
      { limit: '10', unknownParam: 'x' },
    ]) {
      expect(notificationListQuerySchema.safeParse(query).success).toBe(false);
    }
  });

  it('accepts the documented filters', () => {
    const parsed = notificationListQuerySchema.safeParse({
      limit: '10',
      unreadOnly: 'true',
      type: 'THREAD_REPLY',
      cursor: encodeNotificationCursor({ createdAt: '2026-09-06T12:00:00.000Z', id: 'n-9' }),
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({ limit: 10, unreadOnly: true, type: 'THREAD_REPLY' });
    }
  });

  it('round-trips cursors opaquely and rejects malformed ones', () => {
    const cursor = { createdAt: '2026-09-06T12:00:00.000Z', id: 'abc-123' };
    const encoded = encodeNotificationCursor(cursor);
    expect(encoded).not.toContain('abc-123');
    expect(decodeNotificationCursor(encoded)).toEqual(cursor);
    expect(decodeNotificationCursor('!!!not-base64!!!')).toBeNull();
    expect(decodeNotificationCursor('')).toBeNull();
    expect(decodeNotificationCursor('a'.repeat(513))).toBeNull();
    expect(
      decodeNotificationCursor(
        Buffer.from(JSON.stringify({ createdAt: 'nope', id: 'x' }), 'utf8').toString('base64url'),
      ),
    ).toBeNull();
  });
});

describe('listNotifications service', () => {
  let prisma: MockPrisma;
  let db: PrismaClient;
  beforeEach(() => {
    prisma = makePrisma();
    db = prisma as unknown as PrismaClient;
  });

  it('rejects non-members without leaking workspace existence', async () => {
    prisma.workspaceMembership.findUnique.mockResolvedValue(null);
    await expect(listNotifications(db, { workspaceId: 'ws-1', userId: 'u-x' })).rejects.toThrow(
      'Workspace not found.',
    );
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('scopes by workspace+recipient and takes limit+1 newest-first', async () => {
    member(prisma);
    prisma.notification.findMany.mockResolvedValue([]);
    await listNotifications(db, { workspaceId: 'ws-1', userId: 'u-1', limit: 10 });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-1',
          recipientUserId: 'u-1',
        }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 11,
      }),
    );
  });

  it('applies unread, type, and cursor predicates inside the query', async () => {
    member(prisma);
    prisma.notification.findMany.mockResolvedValue([]);
    const cursor = encodeNotificationCursor({ createdAt: '2026-09-06T12:00:00.000Z', id: 'n-5' });
    await listNotifications(db, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      unreadOnly: true,
      type: 'MENTION',
      cursor,
    });
    const where = prisma.notification.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where).toMatchObject({ readAt: null, type: 'MENTION' });
    expect(JSON.stringify(where)).toContain('2026-09-06T12:00:00.000Z');
    // Source-accessibility predicates travel with the query, never post-hoc.
    expect(JSON.stringify(where)).toContain('memberships');
    expect(JSON.stringify(where)).toContain('participants');
  });

  it('returns pages with cursors only when more rows exist', async () => {
    member(prisma);
    prisma.notification.findMany.mockResolvedValue([
      notificationRow(),
      notificationRow({ id: 'n-2' }),
    ]);
    const full = await listNotifications(db, { workspaceId: 'ws-1', userId: 'u-1', limit: 1 });
    expect(full.notifications).toHaveLength(1);
    expect(full.pageInfo.hasMore).toBe(true);
    expect(typeof full.pageInfo.nextCursor).toBe('string');

    prisma.notification.findMany.mockResolvedValue([notificationRow()]);
    const last = await listNotifications(db, { workspaceId: 'ws-1', userId: 'u-1', limit: 5 });
    expect(last.pageInfo).toEqual({ hasMore: false, nextCursor: null });
  });
});

describe('markNotificationRead service', () => {
  let prisma: MockPrisma;
  let db: PrismaClient;
  beforeEach(() => {
    prisma = makePrisma();
    db = prisma as unknown as PrismaClient;
    member(prisma);
  });

  it('atomically updates only the owned unread row', async () => {
    prisma.notification.findUnique.mockResolvedValue(notificationRow({ readAt: new Date() }));
    const out = await markNotificationRead(db, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      notificationId: 'n-1',
    });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n-1', workspaceId: 'ws-1', recipientUserId: 'u-1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(out.notification.id).toBe('n-1');
    expect(out.updated).toBe(true);
  });

  it('succeeds idempotently on already-read rows without rewriting them', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    prisma.notification.findUnique.mockResolvedValue(notificationRow({ readAt: new Date() }));
    const out = await markNotificationRead(db, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      notificationId: 'n-1',
    });
    expect(out.notification.readAt).not.toBeNull();
    expect(out.updated).toBe(false);
  });

  it('returns indistinguishable 404s for missing, foreign, and other-user rows', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    prisma.notification.findUnique.mockResolvedValue(null);
    await expect(
      markNotificationRead(db, { workspaceId: 'ws-1', userId: 'u-1', notificationId: 'n-x' }),
    ).rejects.toThrow(NotificationNotFoundError);

    prisma.notification.findUnique.mockResolvedValue(
      notificationRow({ recipientUserId: 'u-other' }),
    );
    await expect(
      markNotificationRead(db, { workspaceId: 'ws-1', userId: 'u-1', notificationId: 'n-1' }),
    ).rejects.toThrow('Notification not found.');

    prisma.notification.findUnique.mockResolvedValue(notificationRow({ workspaceId: 'ws-other' }));
    await expect(
      markNotificationRead(db, { workspaceId: 'ws-1', userId: 'u-1', notificationId: 'n-1' }),
    ).rejects.toThrow('Notification not found.');
  });
});

describe('markAllNotificationsRead service', () => {
  it('updates only the caller’s unread rows in one bounded UPDATE', async () => {
    const prisma = makePrisma();
    const db = prisma as unknown as PrismaClient;
    member(prisma);
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });
    const out = await markAllNotificationsRead(db, { workspaceId: 'ws-1', userId: 'u-1' });
    expect(out).toEqual({ updatedCount: 3 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1', recipientUserId: 'u-1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('rejects non-members', async () => {
    const prisma = makePrisma();
    const db = prisma as unknown as PrismaClient;
    prisma.workspaceMembership.findUnique.mockResolvedValue(null);
    await expect(
      markAllNotificationsRead(db, { workspaceId: 'ws-1', userId: 'u-x' }),
    ).rejects.toThrow('Workspace not found.');
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });
});

describe('notification HTTP endpoints (mocked database)', () => {
  const fakes = createClerkFakes('notifications');
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = createApp(fakes.appDeps());
  });

  it('rejects unauthenticated access with 401', async () => {
    for (const [method, path] of [
      ['get', '/api/workspaces/ws-1/notifications'],
      ['post', '/api/workspaces/ws-1/notifications/n-1/read'],
      ['post', '/api/workspaces/ws-1/notifications/read-all'],
    ] as const) {
      const res = await (method === 'get' ? request(app).get(path) : request(app).post(path));
      expect(res.status).toBe(401);
    }
  });

  describe('realtime emission on read transitions (Phase 4H.6)', () => {
    let userId: string;
    let mockPrisma: MockPrisma;

    beforeEach(async () => {
      mockPrisma = makePrisma();
      mockGetPrisma.mockReturnValue(mockPrisma);
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      // Provisioned identity comes from the canned mock user.
      userId = CANNED_USER.id;
    });

    it('emits notification:read only on an actual unread → read transition', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.notification.findUnique.mockResolvedValue(
        notificationRow({ id: 'n-1', recipientUserId: userId, readAt: new Date() }),
      );
      const res = await request(app)
        .post('/api/workspaces/ws-1/notifications/n-1/read')
        .set(fakes.headersFor('reader'));
      expect(res.status).toBe(200);
      expect(mockEmitNotificationRead).toHaveBeenCalledTimes(1);
      expect(mockEmitNotificationRead).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ id: 'n-1', workspaceId: 'ws-1' }),
      );
      // readAt travels as the persisted Date; the emit layer serializes to ISO.
      expect(mockEmitNotificationRead.mock.calls[0][1].readAt).toBeInstanceOf(Date);

      // Idempotent re-mark succeeds with the same contract but emits nothing.
      mockEmitNotificationRead.mockClear();
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
      const retry = await request(app)
        .post('/api/workspaces/ws-1/notifications/n-1/read')
        .set(fakes.headersFor('reader'));
      expect(retry.status).toBe(200);
      expect(mockEmitNotificationRead).not.toHaveBeenCalled();
    });

    it('emits nothing on 404s', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.notification.findUnique.mockResolvedValue(null);
      const res = await request(app)
        .post('/api/workspaces/ws-1/notifications/n-missing/read')
        .set(fakes.headersFor('reader'));
      expect(res.status).toBe(404);
      expect(mockEmitNotificationRead).not.toHaveBeenCalled();
      expect(mockEmitNotificationReadAll).not.toHaveBeenCalled();
    });

    it('emits notification:read-all only when rows changed', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 });
      const res = await request(app)
        .post('/api/workspaces/ws-1/notifications/read-all')
        .set(fakes.headersFor('reader'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updatedCount: 2 });
      expect(mockEmitNotificationReadAll).toHaveBeenCalledTimes(1);
      expect(mockEmitNotificationReadAll).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ workspaceId: 'ws-1', updatedCount: 2 }),
      );
      expect(mockEmitNotificationReadAll.mock.calls[0][1].readAt).toBeInstanceOf(Date);

      mockEmitNotificationReadAll.mockClear();
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
      const noop = await request(app)
        .post('/api/workspaces/ws-1/notifications/read-all')
        .set(fakes.headersFor('reader'));
      expect(noop.status).toBe(200);
      expect(noop.body).toEqual({ updatedCount: 0 });
      expect(mockEmitNotificationReadAll).not.toHaveBeenCalled();
    });
  });
});

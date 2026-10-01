/**
 * Workspace threads listing service tests (Audit 11).
 *
 * Mock Prisma: membership gate, access filters, participation, keyset
 * cursor shape, latest-reply hydration. No live database required.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@teamflow/db';
import {
  listWorkspaceThreads,
  ThreadNotFoundError,
  ThreadValidationError,
} from './service';
import { decodeThreadCursor, encodeThreadCursor } from './cursor';

const mockPrisma = {
  workspaceMembership: { findUnique: vi.fn() },
  message: { findMany: vi.fn() },
} as unknown as {
  workspaceMembership: { findUnique: ReturnType<typeof vi.fn> };
  message: { findMany: ReturnType<typeof vi.fn> };
};

const prisma = mockPrisma as unknown as PrismaClient;

const author = { id: 'u-1', name: 'Ada', email: 'ada@example.com', image: null };

function rootRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'root-1',
    body: 'Root message',
    replyCount: 2,
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    latestReplyAt: new Date('2026-09-21T12:00:00.000Z'),
    author,
    channel: { id: 'ch-1', name: 'general', slug: 'general' },
    directMessageConversation: null,
    ...overrides,
  };
}

describe('listWorkspaceThreads (Audit 11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    mockPrisma.message.findMany.mockResolvedValue([]);
  });

  it('404s for non-members without querying messages', async () => {
    mockPrisma.workspaceMembership.findUnique.mockResolvedValue(null);

    await expect(
      listWorkspaceThreads(prisma, { workspaceId: 'ws-1', userId: 'u-1' }),
    ).rejects.toBeInstanceOf(ThreadNotFoundError);
    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
  });

  it('passes root + replyCount + access + participation filters', async () => {
    mockPrisma.message.findMany.mockResolvedValueOnce([]);

    await listWorkspaceThreads(prisma, { workspaceId: 'ws-1', userId: 'u-1', limit: 10 });

    const callArgs = mockPrisma.message.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
      take: number;
    };
    expect(callArgs.where.parentMessageId).toBeNull();
    expect(callArgs.where.deletedAt).toBeNull();
    expect(callArgs.where.replyCount).toEqual({ gt: 0 });
    expect(callArgs.where.latestReplyAt).toEqual({ not: null });
    expect(callArgs.orderBy).toEqual([{ latestReplyAt: 'desc' }, { id: 'desc' }]);
    expect(callArgs.take).toBe(11);
    expect(callArgs.where.OR).toEqual([
      { authorId: 'u-1' },
      { replies: { some: { authorId: 'u-1', deletedAt: null } } },
    ]);
    const and = callArgs.where.AND as unknown[];
    const access = and[0] as { OR: unknown[] };
    expect(access.OR).toHaveLength(2);
  });

  it('applies keyset cursor when provided', async () => {
    const cursor = encodeThreadCursor({
      latestReplyAt: '2026-09-21T12:00:00.000Z',
      id: 'root-1',
    });
    mockPrisma.message.findMany.mockResolvedValueOnce([]);

    await listWorkspaceThreads(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      cursor,
    });

    const callArgs = mockPrisma.message.findMany.mock.calls[0][0] as {
      where: { AND: unknown[] };
    };
    const and = callArgs.where.AND as unknown[];
    const cursorClause = and[and.length - 1] as { OR: unknown[] };
    expect(cursorClause.OR).toEqual([
      { latestReplyAt: { lt: new Date('2026-09-21T12:00:00.000Z') } },
      { latestReplyAt: new Date('2026-09-21T12:00:00.000Z'), id: { lt: 'root-1' } },
    ]);
  });

  it('rejects a malformed cursor before querying messages', async () => {
    await expect(
      listWorkspaceThreads(prisma, {
        workspaceId: 'ws-1',
        userId: 'u-1',
        cursor: 'not-a-cursor',
      }),
    ).rejects.toBeInstanceOf(ThreadValidationError);
    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
  });

  it('returns threads with container, reply count, and latest-reply preview', async () => {
    const pageRow = rootRow();
    // First call: page of roots; second call: latest replies.
    mockPrisma.message.findMany
      .mockResolvedValueOnce([pageRow])
      .mockResolvedValueOnce([
        {
          id: 'reply-2',
          parentMessageId: 'root-1',
          body: 'Newest reply',
          createdAt: new Date('2026-09-21T12:00:00.000Z'),
          author: { id: 'u-2', name: 'Grace', email: 'g@example.com', image: null },
        },
        {
          id: 'reply-1',
          parentMessageId: 'root-1',
          body: 'Older reply',
          createdAt: new Date('2026-09-21T11:00:00.000Z'),
          author,
        },
      ]);

    const page = await listWorkspaceThreads(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      limit: 10,
    });

    expect(page.threads).toHaveLength(1);
    const thread = page.threads[0];
    expect(thread.id).toBe('root-1');
    expect(thread.replyCount).toBe(2);
    expect(thread.container).toEqual({
      type: 'channel',
      id: 'ch-1',
      name: 'general',
      slug: 'general',
    });
    expect(thread.latestReply).toMatchObject({ id: 'reply-2', body: 'Newest reply' });
    expect(thread.latestReply?.author.id).toBe('u-2');
    expect(page.pageInfo).toEqual({ hasMore: false, nextCursor: null });
    expect(mockPrisma.message.findMany).toHaveBeenCalledTimes(2);
  });

  it('emits a nextCursor when a full page has more rows', async () => {
    const limit = 1;
    const pageRow = rootRow();
    mockPrisma.message.findMany
      .mockResolvedValueOnce([{ ...pageRow, id: 'root-a' }, { ...pageRow, id: 'root-b' }])
      .mockResolvedValueOnce([]);

    const page = await listWorkspaceThreads(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      limit,
    });

    expect(page.threads).toHaveLength(1);
    expect(page.pageInfo.hasMore).toBe(true);
    expect(page.pageInfo.nextCursor).toBeTruthy();
    const decoded = decodeThreadCursor(page.pageInfo.nextCursor!);
    expect(decoded?.id).toBe('root-a');
    expect(decoded?.latestReplyAt).toBe('2026-09-21T12:00:00.000Z');
  });

  it('maps a DM conversation root to a directMessage container', async () => {
    mockPrisma.message.findMany
      .mockResolvedValueOnce([
        rootRow({
          id: 'root-dm',
          channel: null,
          directMessageConversation: { id: 'dm-1', name: null },
        }),
      ])
      .mockResolvedValueOnce([]);

    const page = await listWorkspaceThreads(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
    });

    expect(page.threads[0].container).toEqual({
      type: 'directMessage',
      id: 'dm-1',
      name: 'Direct message',
    });
    expect(page.threads[0].latestReply).toBeNull();
  });
});

describe('thread cursor codec', () => {
  it('round-trips a valid cursor', () => {
    const cursor = encodeThreadCursor({
      latestReplyAt: '2026-09-21T12:00:00.000Z',
      id: 'root-1',
    });
    expect(decodeThreadCursor(cursor)).toEqual({
      latestReplyAt: '2026-09-21T12:00:00.000Z',
      id: 'root-1',
    });
  });

  it('rejects unknown keys and non-strings', () => {
    const smuggled = Buffer.from(
      JSON.stringify({ latestReplyAt: '2026-09-21T12:00:00.000Z', id: 'a', workspaceId: 'x' }),
      'utf8',
    ).toString('base64url');
    expect(decodeThreadCursor(smuggled)).toBeNull();
    expect(decodeThreadCursor(null)).toBeNull();
    expect(decodeThreadCursor('')).toBeNull();
    expect(decodeThreadCursor(encodeThreadCursor({ latestReplyAt: 'nope', id: 'a' }))).toBeNull();
  });
});

/**
 * Workspace mentions listing service tests (Audit 12).
 *
 * Mock Prisma: membership gate, access filters, mention-only filter, keyset
 * cursor shape, container hydration. No live database required.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@teamflow/db';
import {
  listWorkspaceMentions,
  MentionListNotFoundError,
  MentionListValidationError,
} from './list.service';
import { decodeMentionCursor, encodeMentionCursor } from './cursor';

const mockPrisma = {
  workspaceMembership: { findUnique: vi.fn() },
  messageMention: { findMany: vi.fn() },
} as unknown as {
  workspaceMembership: { findUnique: ReturnType<typeof vi.fn> };
  messageMention: { findMany: ReturnType<typeof vi.fn> };
};

const prisma = mockPrisma as unknown as PrismaClient;

const author = { id: 'u-2', name: 'Grace', email: 'g@example.com', image: null };

function mentionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    createdAt: new Date('2026-09-21T12:00:00.000Z'),
    messageId: 'msg-1',
    message: {
      id: 'msg-1',
      body: 'Hey @Ada look at this',
      createdAt: new Date('2026-09-21T12:00:00.000Z'),
      parentMessageId: null,
      author,
      channel: { id: 'ch-1', name: 'general', slug: 'general' },
      directMessageConversation: null,
      ...((overrides.message as Record<string, unknown>) ?? {}),
    },
    ...overrides,
  };
}

describe('listWorkspaceMentions (Audit 12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    mockPrisma.messageMention.findMany.mockResolvedValue([]);
  });

  it('404s for non-members without querying mentions', async () => {
    mockPrisma.workspaceMembership.findUnique.mockResolvedValue(null);

    await expect(
      listWorkspaceMentions(prisma, { workspaceId: 'ws-1', userId: 'u-1' }),
    ).rejects.toBeInstanceOf(MentionListNotFoundError);
    expect(mockPrisma.messageMention.findMany).not.toHaveBeenCalled();
  });

  it('filters by mentioned user + accessible container, newest first', async () => {
    mockPrisma.messageMention.findMany.mockResolvedValueOnce([]);

    await listWorkspaceMentions(prisma, { workspaceId: 'ws-1', userId: 'u-1', limit: 10 });

    const callArgs = mockPrisma.messageMention.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
      take: number;
    };
    expect(callArgs.where.mentionedUserId).toBe('u-1');
    expect(callArgs.orderBy).toEqual([{ createdAt: 'desc' }, { messageId: 'desc' }]);
    expect(callArgs.take).toBe(11);

    const messageWhere = callArgs.where.message as { deletedAt: null; OR: unknown[] };
    expect(messageWhere.deletedAt).toBeNull();
    expect(messageWhere.OR).toHaveLength(2);
    const [channelAccess, dmAccess] = messageWhere.OR as Array<Record<string, unknown>>;
    expect(channelAccess.channel).toMatchObject({ workspaceId: 'ws-1' });
    expect(dmAccess.directMessageConversation).toMatchObject({ workspaceId: 'ws-1' });
  });

  it('applies the keyset cursor clause on the mention row', async () => {
    const cursor = encodeMentionCursor({
      createdAt: '2026-09-20T10:00:00.000Z',
      messageId: 'msg-older',
    });
    mockPrisma.messageMention.findMany.mockResolvedValueOnce([]);

    await listWorkspaceMentions(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      cursor,
    });

    const callArgs = mockPrisma.messageMention.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArgs.where.OR).toEqual([
      { createdAt: { lt: new Date('2026-09-20T10:00:00.000Z') } },
      { createdAt: new Date('2026-09-20T10:00:00.000Z'), messageId: { lt: 'msg-older' } },
    ]);
  });

  it('rejects a malformed cursor', async () => {
    await expect(
      listWorkspaceMentions(prisma, {
        workspaceId: 'ws-1',
        userId: 'u-1',
        cursor: 'not-a-cursor',
      }),
    ).rejects.toBeInstanceOf(MentionListValidationError);
    expect(mockPrisma.messageMention.findMany).not.toHaveBeenCalled();
  });

  it('maps channel rows into channel containers with author', async () => {
    mockPrisma.messageMention.findMany.mockResolvedValueOnce([mentionRow()]);

    const page = await listWorkspaceMentions(prisma, { workspaceId: 'ws-1', userId: 'u-1' });

    expect(page.mentions).toHaveLength(1);
    const item = page.mentions[0];
    expect(item.id).toBe('msg-1');
    expect(item.body).toContain('@Ada');
    expect(item.parentMessageId).toBeNull();
    expect(item.author).toEqual(author);
    expect(item.container).toEqual({
      type: 'channel',
      id: 'ch-1',
      name: 'general',
      slug: 'general',
    });
    expect(page.pageInfo).toEqual({ hasMore: false, nextCursor: null });
  });

  it('hydrates DM containers from peer names when the conversation has no title', async () => {
    mockPrisma.messageMention.findMany.mockResolvedValueOnce([
      mentionRow({
        messageId: 'msg-dm',
        message: {
          id: 'msg-dm',
          body: 'ping @Ada',
          createdAt: new Date('2026-09-21T13:00:00.000Z'),
          parentMessageId: null,
          author,
          channel: null,
          directMessageConversation: {
            id: 'dm-1',
            name: null,
            participants: [
              { user: { id: 'u-1', name: 'Ada Lovelace' } },
              { user: { id: 'u-9', name: 'Bob' } },
            ],
          },
        },
      }),
    ]);

    const page = await listWorkspaceMentions(prisma, { workspaceId: 'ws-1', userId: 'u-1' });

    expect(page.mentions[0].container).toEqual({
      type: 'directMessage',
      id: 'dm-1',
      name: 'Bob',
    });
  });

  it('returns a nextCursor only when hasMore', async () => {
    mockPrisma.messageMention.findMany.mockResolvedValueOnce([
      mentionRow(),
      mentionRow({ messageId: 'msg-2', message: { ...mentionRow().message, id: 'msg-2' } }),
    ]);

    const page = await listWorkspaceMentions(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      limit: 1,
    });

    expect(page.pageInfo.hasMore).toBe(true);
    expect(page.pageInfo.nextCursor).toEqual(expect.any(String));
    const decoded = decodeMentionCursor(page.pageInfo.nextCursor);
    expect(decoded).not.toBeNull();
    expect(decoded?.messageId).toBe('msg-1');
  });
});

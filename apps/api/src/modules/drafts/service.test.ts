/**
 * Drafts service tests (Audit 13).
 *
 * Mock Prisma: membership gate, target access, upsert/clear, hydration.
 * No live database required.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@teamflow/db';
import {
  deleteWorkspaceDraft,
  DraftForbiddenError,
  DraftNotFoundError,
  DraftValidationError,
  listWorkspaceDrafts,
  upsertWorkspaceDraft,
} from './service';

const mockPrisma = {
  workspaceMembership: { findUnique: vi.fn() },
  draft: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  channel: { findFirst: vi.fn(), findMany: vi.fn() },
  directMessageConversation: { findFirst: vi.fn(), findMany: vi.fn() },
  message: { findFirst: vi.fn(), findMany: vi.fn() },
} as unknown as {
  workspaceMembership: { findUnique: ReturnType<typeof vi.fn> };
  draft: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  channel: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  directMessageConversation: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  message: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
};

const prisma = mockPrisma as unknown as PrismaClient;

function draftRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'draft-1',
    body: 'Unsent plan',
    targetKind: 'CHANNEL' as const,
    targetId: 'ch-1',
    createdAt: new Date('2026-09-23T12:00:00.000Z'),
    updatedAt: new Date('2026-09-23T12:00:00.000Z'),
    ...overrides,
  };
}

describe('drafts service (Audit 13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.workspaceMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    mockPrisma.draft.findMany.mockResolvedValue([]);
    mockPrisma.draft.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.draft.upsert.mockResolvedValue(draftRow());
    mockPrisma.draft.findFirst.mockResolvedValue(null);
    mockPrisma.draft.delete.mockResolvedValue(draftRow());
    mockPrisma.channel.findFirst.mockResolvedValue({ id: 'ch-1' });
    mockPrisma.channel.findMany.mockResolvedValue([
      { id: 'ch-1', name: 'general', slug: 'general' },
    ]);
    mockPrisma.directMessageConversation.findFirst.mockResolvedValue({ id: 'dm-1' });
    mockPrisma.directMessageConversation.findMany.mockResolvedValue([]);
    mockPrisma.message.findFirst.mockResolvedValue({ id: 'msg-root' });
    mockPrisma.message.findMany.mockResolvedValue([]);
  });

  it('404s for non-members without querying drafts', async () => {
    mockPrisma.workspaceMembership.findUnique.mockResolvedValue(null);

    await expect(
      listWorkspaceDrafts(prisma, { workspaceId: 'ws-1', userId: 'u-1' }),
    ).rejects.toBeInstanceOf(DraftNotFoundError);
    expect(mockPrisma.draft.findMany).not.toHaveBeenCalled();
  });

  it('lists only the caller drafts for the workspace, newest first', async () => {
    mockPrisma.draft.findMany.mockResolvedValueOnce([draftRow()]);

    const items = await listWorkspaceDrafts(prisma, { workspaceId: 'ws-1', userId: 'u-1' });

    const callArgs = mockPrisma.draft.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
    };
    expect(callArgs.where).toMatchObject({ userId: 'u-1', workspaceId: 'ws-1' });
    expect(callArgs.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'desc' }]);
    expect(items).toHaveLength(1);
    expect(items[0].container).toEqual({
      type: 'channel',
      id: 'ch-1',
      name: 'general',
      slug: 'general',
    });
  });

  it('skips drafts whose container is gone', async () => {
    mockPrisma.draft.findMany.mockResolvedValueOnce([draftRow()]);
    mockPrisma.channel.findMany.mockResolvedValueOnce([]);

    const items = await listWorkspaceDrafts(prisma, { workspaceId: 'ws-1', userId: 'u-1' });
    expect(items).toEqual([]);
  });

  it('clears the row when the body is empty', async () => {
    const result = await upsertWorkspaceDraft(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      targetKind: 'CHANNEL',
      targetId: 'ch-1',
      body: '   \n  ',
    });

    expect(result).toBeNull();
    expect(mockPrisma.draft.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', workspaceId: 'ws-1', targetId: 'ch-1' },
    });
    expect(mockPrisma.draft.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.channel.findFirst).not.toHaveBeenCalled();
  });

  it('rejects bodies over 10000 characters', async () => {
    await expect(
      upsertWorkspaceDraft(prisma, {
        workspaceId: 'ws-1',
        userId: 'u-1',
        targetKind: 'CHANNEL',
        targetId: 'ch-1',
        body: 'x'.repeat(10001),
      }),
    ).rejects.toBeInstanceOf(DraftValidationError);
    expect(mockPrisma.draft.upsert).not.toHaveBeenCalled();
  });

  it('403s when the channel is not accessible', async () => {
    mockPrisma.channel.findFirst.mockResolvedValue(null);

    await expect(
      upsertWorkspaceDraft(prisma, {
        workspaceId: 'ws-1',
        userId: 'u-1',
        targetKind: 'CHANNEL',
        targetId: 'ch-secret',
        body: 'hello',
      }),
    ).rejects.toBeInstanceOf(DraftForbiddenError);
    expect(mockPrisma.draft.upsert).not.toHaveBeenCalled();
  });

  it('403s when the DM conversation is not accessible', async () => {
    mockPrisma.directMessageConversation.findFirst.mockResolvedValue(null);

    await expect(
      upsertWorkspaceDraft(prisma, {
        workspaceId: 'ws-1',
        userId: 'u-1',
        targetKind: 'DIRECT_MESSAGE',
        targetId: 'dm-x',
        body: 'hello',
      }),
    ).rejects.toBeInstanceOf(DraftForbiddenError);
  });

  it('403s when the thread root message is not accessible', async () => {
    mockPrisma.message.findFirst.mockResolvedValue(null);

    await expect(
      upsertWorkspaceDraft(prisma, {
        workspaceId: 'ws-1',
        userId: 'u-1',
        targetKind: 'THREAD',
        targetId: 'msg-x',
        body: 'hello',
      }),
    ).rejects.toBeInstanceOf(DraftForbiddenError);
  });

  it('upserts on the user+workspace+target key with a trimmed body', async () => {
    await upsertWorkspaceDraft(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      targetKind: 'CHANNEL',
      targetId: 'ch-1',
      body: '  draft text  ',
    });

    expect(mockPrisma.draft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_workspaceId_targetId: {
            userId: 'u-1',
            workspaceId: 'ws-1',
            targetId: 'ch-1',
          },
        },
        create: expect.objectContaining({
          body: 'draft text',
          targetKind: 'CHANNEL',
          targetId: 'ch-1',
        }),
        update: expect.objectContaining({ body: 'draft text', targetKind: 'CHANNEL' }),
      }),
    );
  });

  it('hydrate DM drafts with the peer name when conversation has no title', async () => {
    mockPrisma.draft.findMany.mockResolvedValueOnce([
      draftRow({ targetKind: 'DIRECT_MESSAGE', targetId: 'dm-1' }),
    ]);
    mockPrisma.directMessageConversation.findMany.mockResolvedValueOnce([
      {
        id: 'dm-1',
        name: null,
        participants: [
          { user: { id: 'u-1', name: 'Ada Lovelace' } },
          { user: { id: 'u-9', name: 'Bob' } },
        ],
      },
    ]);

    const items = await listWorkspaceDrafts(prisma, { workspaceId: 'ws-1', userId: 'u-1' });
    expect(items[0].container).toEqual({
      type: 'directMessage',
      id: 'dm-1',
      name: 'Bob',
    });
  });

  it('hydrate thread drafts with the channel container', async () => {
    mockPrisma.draft.findMany.mockResolvedValueOnce([
      draftRow({ targetKind: 'THREAD', targetId: 'msg-root' }),
    ]);
    mockPrisma.message.findMany.mockResolvedValueOnce([
      {
        id: 'msg-root',
        channel: { id: 'ch-1', name: 'general', slug: 'general' },
        directMessageConversation: null,
      },
    ]);

    const items = await listWorkspaceDrafts(prisma, { workspaceId: 'ws-1', userId: 'u-1' });
    expect(items[0].container).toEqual({
      type: 'thread',
      id: 'ch-1',
      name: '#general',
      slug: 'general',
    });
  });

  it('deletes only the caller draft for that workspace', async () => {
    mockPrisma.draft.findFirst.mockResolvedValue({ id: 'draft-1' });

    await deleteWorkspaceDraft(prisma, {
      workspaceId: 'ws-1',
      userId: 'u-1',
      draftId: 'draft-1',
    });

    expect(mockPrisma.draft.findFirst).toHaveBeenCalledWith({
      where: { id: 'draft-1', userId: 'u-1', workspaceId: 'ws-1' },
      select: { id: true },
    });
    expect(mockPrisma.draft.delete).toHaveBeenCalledWith({ where: { id: 'draft-1' } });
  });

  it('404s when discarding a draft that is not the caller', async () => {
    mockPrisma.draft.findFirst.mockResolvedValue(null);

    await expect(
      deleteWorkspaceDraft(prisma, {
        workspaceId: 'ws-1',
        userId: 'u-1',
        draftId: 'someone-else',
      }),
    ).rejects.toBeInstanceOf(DraftNotFoundError);
    expect(mockPrisma.draft.delete).not.toHaveBeenCalled();
  });
});

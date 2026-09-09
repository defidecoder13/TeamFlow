/**
 * Mention resolution and persistence tests (Phase 4H.2, mocked Prisma).
 *
 * Covers eligibility branches (public/private/DM/group), exact matching
 * rules (case-insensitive, ambiguity, longest-prefix, duplicates,
 * self-mentions), and persistence diffing (create/edit/remove/no-op/
 * tombstone). Live database behavior (cascades, cross-workspace) is covered
 * in `mentions.routes.test.ts`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@teamflow/db';
import {
  createMentionsForMessage,
  matchMentionCandidates,
  normalizeMentionName,
  resolveMentionedUserIds,
  syncMessageMentions,
  MentionNotFoundError,
} from './service';

function makePrisma() {
  const messageMentionTx = {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const tx = { messageMention: messageMentionTx };
  return {
    message: { findUnique: vi.fn() },
    channel: { findUnique: vi.fn() },
    workspaceMembership: { findMany: vi.fn() },
    channelMembership: { findMany: vi.fn() },
    directMessageParticipant: { findMany: vi.fn() },
    messageMention: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    __tx: tx,
  };
}

type MockPrisma = ReturnType<typeof makePrisma>;

const ALICE = { id: 'u-alice', name: 'Alice' };
const BOB = { id: 'u-bob', name: 'Bob' };
const CAROL = { id: 'u-carol', name: 'Carol' };

function publicChannel(prisma: MockPrisma, members = [ALICE, BOB, CAROL]) {
  prisma.channel.findUnique.mockResolvedValue({ id: 'ch-1', workspaceId: 'ws-1', type: 'PUBLIC' });
  prisma.workspaceMembership.findMany.mockResolvedValue(
    members.map((user) => ({ userId: user.id, user })),
  );
}

describe('normalizeMentionName', () => {
  it('lowercases and collapses whitespace deterministically', () => {
    expect(normalizeMentionName('  Alice   Smith ')).toBe('alice smith');
    expect(normalizeMentionName('JOSÉ')).toBe('josé');
  });
});

describe('matchMentionCandidates', () => {
  const eligible = [ALICE, BOB];

  it('matches case-insensitively and collapses duplicates', () => {
    expect(matchMentionCandidates(['alice', 'ALICE', 'Alice'], eligible)).toEqual(['u-alice']);
  });

  it('resolves nobody for unknown or ambiguous names', () => {
    expect(matchMentionCandidates(['Zed'], eligible)).toEqual([]);
    const dupes = [
      { id: 'u-a1', name: 'Sam' },
      { id: 'u-a2', name: 'sam' },
    ];
    expect(matchMentionCandidates(['sam', 'Sam'], dupes)).toEqual([]);
  });

  it('prefers the longest exact match across prefixes', () => {
    const members = [
      { id: 'u-al', name: 'Alice' },
      { id: 'u-als', name: 'Alice Smith' },
    ];
    expect(matchMentionCandidates(['Alice', 'Alice Smith'], members)).toEqual(['u-al', 'u-als']);
  });

  it('returns sorted deterministic IDs', () => {
    expect(matchMentionCandidates(['Bob', 'Alice'], [BOB, ALICE])).toEqual(['u-alice', 'u-bob']);
  });
});

describe('resolveMentionedUserIds', () => {
  let prisma: MockPrisma;
  let db: PrismaClient;
  beforeEach(() => {
    prisma = makePrisma();
    db = prisma as unknown as PrismaClient;
  });

  it('returns [] without touching membership tables when no candidates exist', async () => {
    const ids = await resolveMentionedUserIds(db, { body: 'plain text', channelId: 'ch-1' });
    expect(ids).toEqual([]);
    expect(prisma.workspaceMembership.findMany).not.toHaveBeenCalled();
    expect(prisma.directMessageParticipant.findMany).not.toHaveBeenCalled();
  });

  it('resolves public-channel members', async () => {
    publicChannel(prisma);
    const ids = await resolveMentionedUserIds(db, {
      body: 'hi @alice and @BOB',
      channelId: 'ch-1',
    });
    expect(ids).toEqual(['u-alice', 'u-bob']);
    expect(prisma.channelMembership.findMany).not.toHaveBeenCalled();
  });

  it('restricts private channels to channel members', async () => {
    prisma.channel.findUnique.mockResolvedValue({
      id: 'ch-1',
      workspaceId: 'ws-1',
      type: 'PRIVATE',
    });
    prisma.channelMembership.findMany.mockResolvedValue([{ userId: 'u-alice', user: ALICE }]);
    const ids = await resolveMentionedUserIds(db, { body: '@alice @bob', channelId: 'ch-1' });
    expect(ids).toEqual(['u-alice']);
    expect(prisma.workspaceMembership.findMany).not.toHaveBeenCalled();
  });

  it('resolves only current DM participants', async () => {
    prisma.directMessageParticipant.findMany.mockResolvedValue([
      { userId: 'u-alice', user: ALICE },
      { userId: 'u-bob', user: BOB },
    ]);
    const ids = await resolveMentionedUserIds(db, {
      body: '@alice @carol',
      directMessageConversationId: 'dm-1',
    });
    expect(ids).toEqual(['u-alice']);
  });

  it('returns [] for missing containers', async () => {
    prisma.channel.findUnique.mockResolvedValue(null);
    const ids = await resolveMentionedUserIds(db, { body: '@alice', channelId: 'ch-gone' });
    expect(ids).toEqual([]);
  });

  it('keeps self-mentions (suppression belongs to notification generation)', async () => {
    publicChannel(prisma, [ALICE]);
    const ids = await resolveMentionedUserIds(db, { body: '@alice did this', channelId: 'ch-1' });
    expect(ids).toEqual(['u-alice']);
  });
});

describe('createMentionsForMessage', () => {
  let prisma: MockPrisma;
  let db: PrismaClient;
  beforeEach(() => {
    prisma = makePrisma();
    db = prisma as unknown as PrismaClient;
  });

  it('bulk-inserts one row per resolved user', async () => {
    publicChannel(prisma);
    const ids = await createMentionsForMessage(db, {
      messageId: 'm-1',
      body: '@alice and @bob',
      channelId: 'ch-1',
    });
    expect(ids).toEqual(['u-alice', 'u-bob']);
    expect(prisma.__tx.messageMention.createMany).toHaveBeenCalledWith({
      data: [
        { messageId: 'm-1', mentionedUserId: 'u-alice' },
        { messageId: 'm-1', mentionedUserId: 'u-bob' },
      ],
      skipDuplicates: true,
    });
  });

  it('collapses duplicate mentions to one row and skips DB work without candidates', async () => {
    publicChannel(prisma);
    const ids = await createMentionsForMessage(db, {
      messageId: 'm-1',
      body: '@alice @alice @ALICE',
      channelId: 'ch-1',
    });
    expect(ids).toEqual(['u-alice']);
    expect(prisma.__tx.messageMention.createMany).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    const empty = await createMentionsForMessage(db, {
      messageId: 'm-2',
      body: 'no mentions here',
      channelId: 'ch-1',
    });
    expect(empty).toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.messageMention.findMany).not.toHaveBeenCalled();
  });
});

describe('syncMessageMentions', () => {
  let prisma: MockPrisma;
  let db: PrismaClient;
  const liveMessage = {
    id: 'm-1',
    body: '@bob and @carol',
    channelId: 'ch-1',
    directMessageConversationId: null,
    deletedAt: null,
  };
  beforeEach(() => {
    prisma = makePrisma();
    db = prisma as unknown as PrismaClient;
    publicChannel(prisma);
  });

  it('throws for unknown messages without writing', async () => {
    prisma.message.findUnique.mockResolvedValue(null);
    await expect(syncMessageMentions(db, 'm-gone')).rejects.toBeInstanceOf(MentionNotFoundError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('adds new and removes stale mentions in one transaction', async () => {
    prisma.message.findUnique.mockResolvedValue(liveMessage);
    prisma.messageMention.findMany.mockResolvedValue([
      { mentionedUserId: 'u-alice' },
      { mentionedUserId: 'u-bob' },
    ]);
    const ids = await syncMessageMentions(db, 'm-1');
    expect(ids).toEqual(['u-bob', 'u-carol']);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.__tx.messageMention.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'm-1', mentionedUserId: { in: ['u-alice'] } },
    });
    expect(prisma.__tx.messageMention.createMany).toHaveBeenCalledWith({
      data: [{ messageId: 'm-1', mentionedUserId: 'u-carol' }],
      skipDuplicates: true,
    });
  });

  it('performs zero writes when the set already matches', async () => {
    prisma.message.findUnique.mockResolvedValue(liveMessage);
    prisma.messageMention.findMany.mockResolvedValue([
      { mentionedUserId: 'u-bob' },
      { mentionedUserId: 'u-carol' },
    ]);
    const ids = await syncMessageMentions(db, 'm-1');
    expect(ids).toEqual(['u-bob', 'u-carol']);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('clears all rows for tombstoned messages and creates none', async () => {
    prisma.message.findUnique.mockResolvedValue({ ...liveMessage, deletedAt: new Date() });
    const ids = await syncMessageMentions(db, 'm-1');
    expect(ids).toEqual([]);
    expect(prisma.__tx.messageMention.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'm-1' },
    });
    expect(prisma.__tx.messageMention.createMany).not.toHaveBeenCalled();
  });
});

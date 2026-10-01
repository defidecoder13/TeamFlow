/**
 * Search backend tests (Phase 4G.3).
 *
 * Pure unit + mocked-Prisma route tests (no live database): validation
 * mapping, authorization mapping, SQL shape (predicates inside the query,
 * bound parameters, no OFFSET), keyset pagination, serialization, snippets.
 * Live security/recall/ranking tests live in `search.routes.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@teamflow/db';
import { createClerkFakes } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { buildSnippet } from './service';
import { encodeSearchCursor } from './cursor';

const {
  mockTxQueryRawUnsafe,
  mockTxExecuteRawUnsafe,
  mockPrisma,
  mockGetMembershipRole,
  mockGetAccessibleChannel,
  mockAuthorizeDirectConversationAccess,
} = vi.hoisted(() => {
  const mockTxQueryRawUnsafe = vi.fn();
  const mockTxExecuteRawUnsafe = vi.fn().mockResolvedValue([]);
  const mockPrisma = {
    user: {
      // Deterministic clerk id mirrors createClerkFakes('search').
      findUnique: vi.fn(async ({ where }: { where: { clerkId: string } }) =>
        where.clerkId === 'clerk-test-search-user'
          ? {
              id: 'u-search-1',
              name: 'Search Tester',
              email: 'search@example.invalid',
              image: null,
              emailVerified: false,
            }
          : null,
      ),
    },
    workspaceMembership: { findUnique: vi.fn() },
    channel: { findMany: vi.fn() },
    channelMembership: { findMany: vi.fn() },
    directMessageParticipant: { findMany: vi.fn() },
    message: { findMany: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ $executeRawUnsafe: mockTxExecuteRawUnsafe, $queryRawUnsafe: mockTxQueryRawUnsafe }),
    ),
  };
  return {
    mockTxQueryRawUnsafe,
    mockTxExecuteRawUnsafe,
    mockPrisma,
    mockGetMembershipRole: vi.fn(),
    mockGetAccessibleChannel: vi.fn(),
    mockAuthorizeDirectConversationAccess: vi.fn(),
  };
});

const prisma = mockPrisma as unknown as PrismaClient;
void prisma;

vi.mock('../auth/prisma', () => ({
  getPrisma: () => mockPrisma,
}));

vi.mock('../workspaces/authorization', () => ({
  getMembershipRole: (...args: unknown[]) => mockGetMembershipRole(...args),
}));

vi.mock('../channels/authorization', () => ({
  getAccessibleChannel: (...args: unknown[]) => mockGetAccessibleChannel(...args),
}));

vi.mock('../direct-messages/authorization', () => ({
  authorizeDirectConversationAccess: (...args: unknown[]) =>
    mockAuthorizeDirectConversationAccess(...args),
}));

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    score: 0.9,
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    ...overrides,
  };
}

function hydratedMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    channelId: 'ch-1',
    directMessageConversationId: null,
    parentMessageId: null,
    body: 'Hello database world',
    replyCount: 0,
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    updatedAt: new Date('2026-09-06T12:00:00.000Z'),
    editedAt: null,
    deletedAt: null,
    author: { id: 'u-1', name: 'Ada Lovelace', image: null },
    channel: { id: 'ch-1', slug: 'engineering', name: 'Engineering' },
    directMessageConversation: null,
    ...overrides,
  };
}

describe('buildSnippet', () => {
  it('windows around the first hit with aligned offsets', () => {
    const body = `${'filler word '.repeat(30)}database migration guide${' tail word'.repeat(30)}`;
    const { snippet, matchOffsets } = buildSnippet(body, 'database migration');
    // ~200-char window plus word-boundary slack (<20) and ellipsis markers.
    expect(snippet.length).toBeLessThanOrEqual(222);
    expect(matchOffsets.length).toBeGreaterThan(0);
    for (const { start, length } of matchOffsets) {
      const hit = snippet.slice(start, start + length).toLowerCase();
      expect(['database', 'migration']).toContain(hit);
    }
  });

  it('returns the head with no offsets when nothing matches literally', () => {
    const { snippet, matchOffsets } = buildSnippet('completely unrelated text here', 'updatted');
    expect(snippet).toBe('completely unrelated text here');
    expect(matchOffsets).toEqual([]);
  });

  it('keeps emoji offsets aligned (UTF-16 units both sides)', () => {
    const body = 'Hello 🌍 database world, welcome to the database 🌍 party';
    const { snippet, matchOffsets } = buildSnippet(body, 'database');
    expect(matchOffsets.length).toBe(2);
    for (const { start, length } of matchOffsets) {
      expect(snippet.slice(start, start + length)).toBe('database');
      expect(length).toBe(8);
    }
  });

  it('never emits HTML', () => {
    const { snippet } = buildSnippet('<script>alert(1)</script> database', 'database');
    expect(snippet).not.toContain('<b>');
    expect(snippet).toContain('<script>');
  });
});

describe('search API (mocked database)', () => {
  let app: ReturnType<typeof createApp>;
  const fakes = createClerkFakes('search');

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTxExecuteRawUnsafe.mockResolvedValue([]);
    // Default: workspace member with one public channel, no DMs.
    mockGetMembershipRole.mockResolvedValue('MEMBER');
    mockPrisma.channel.findMany.mockResolvedValue([{ id: 'ch-1' }]);
    mockPrisma.channelMembership.findMany.mockResolvedValue([]);
    mockPrisma.directMessageParticipant.findMany.mockResolvedValue([]);
    mockTxQueryRawUnsafe.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);

    app = createApp(fakes.appDeps());
  });

  const search = (params: Record<string, string>) =>
    request(app)
      .get('/api/workspaces/ws-1/search')
      .set(fakes.headersFor('user'))
      .query(params);

  it('rejects unauthenticated search with 401', async () => {
    const res = await request(app).get('/api/workspaces/ws-1/search').query({ q: 'hi' });
    expect(res.status).toBe(401);
  });

  it('maps validation failures to 400', async () => {
    const cases: Record<string, string>[] = [
      { q: '' },
      { q: 'x'.repeat(201) },
      { q: 'hi', limit: '51' },
      { q: 'hi', type: 'everything' },
      { q: 'hi', thread: 'sometimes' },
      { q: 'hi', in: 'user:u-1' },
      { q: 'hi', cursor: 'bogus!!' },
      { q: 'hi', after: '2026-09-02T00:00:00.000Z', before: '2026-09-01T00:00:00.000Z' },
      { q: 'hi', authorId: 'u-1' },
    ];
    for (const params of cases) {
      const res = await search(params);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns 404 for forged workspaces without leaking existence', async () => {
    mockGetMembershipRole.mockResolvedValue(null);
    const res = await search({ q: 'hi' });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Workspace not found.');
  });

  it('returns 404 for inaccessible in: targets', async () => {
    mockGetAccessibleChannel.mockResolvedValue(null);
    const channelRes = await search({ q: 'hi', in: 'channel:vault' });
    expect(channelRes.status).toBe(404);

    mockAuthorizeDirectConversationAccess.mockResolvedValue(null);
    const dmRes = await search({ q: 'hi', in: 'dm:conv-1' });
    expect(dmRes.status).toBe(404);
  });

  it('rejects cross-workspace in:dm targets with 404', async () => {
    mockAuthorizeDirectConversationAccess.mockResolvedValue({
      id: 'conv-1',
      workspaceId: 'ws-other',
    });
    const res = await search({ q: 'hi', in: 'dm:conv-1' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for from: pointing at a non-member', async () => {
    mockPrisma.workspaceMembership.findUnique.mockResolvedValue(null);
    const res = await search({ q: 'hi', from: 'u-stranger' });
    expect(res.status).toBe(400);
  });

  it('rejects a cursor minted for another result type', async () => {
    const cursor = encodeSearchCursor({ kind: 'users', score: 0.5, tie: 'Ada', id: 'u-1' });
    const res = await search({ q: 'hi', cursor });
    expect(res.status).toBe(400);
  });

  it('returns the message contract without author email', async () => {
    mockTxQueryRawUnsafe.mockResolvedValueOnce([messageRow()]);
    mockPrisma.message.findMany.mockResolvedValueOnce([hydratedMessage()]);
    const res = await search({ q: 'database' });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('messages');
    expect(res.body.results).toHaveLength(1);
    const [result] = res.body.results;
    expect(result.id).toBe('m-1');
    expect(result.author).toEqual({ id: 'u-1', name: 'Ada Lovelace', image: null });
    expect(result.author.email).toBeUndefined();
    expect(result.container).toEqual({
      kind: 'channel',
      channelId: 'ch-1',
      channelSlug: 'engineering',
      channelName: 'Engineering',
    });
    expect(result.snippet).toContain('database');
    expect(result.parentMessageId).toBeNull();
    expect(result.threadRootId).toBeUndefined();
    expect(typeof result.score).toBe('number');
    expect(res.body.pageInfo).toEqual({ hasMore: false, nextCursor: null });
  });

  it('flags thread replies with their root id', async () => {
    mockTxQueryRawUnsafe.mockResolvedValueOnce([messageRow({ id: 'r-1' })]);
    mockPrisma.message.findMany.mockResolvedValueOnce([
      hydratedMessage({ id: 'r-1', parentMessageId: 'm-1', body: 'a database reply' }),
    ]);
    const res = await search({ q: 'database', thread: 'only' });
    expect(res.status).toBe(200);
    expect(res.body.results[0].parentMessageId).toBe('m-1');
    expect(res.body.results[0].threadRootId).toBe('m-1');
    const [sql] = mockTxQueryRawUnsafe.mock.calls[0] as [string];
    expect(sql).toContain(`"parentMessageId" IS NOT NULL`);
  });

  it('keeps authorization, deletion, ranking, and bound params inside SQL', async () => {
    mockTxQueryRawUnsafe.mockResolvedValueOnce([]);
    const res = await search({ q: 'a:&b' });
    expect(res.status).toBe(200);
    const [sql, ...params] = mockTxQueryRawUnsafe.mock.calls[0] as [string, ...unknown[]];
    expect(sql).toContain(`"deletedAt" IS NULL`);
    expect(sql).toContain('plainto_tsquery');
    expect(sql).toContain('ts_rank');
    expect(sql).toContain('similarity');
    expect(sql).toContain('phraseto_tsquery');
    expect(sql).not.toContain('OFFSET');
    expect(sql).not.toContain('a:&b');
    expect(params).toContain('a:&b');
  });

  it('paginates with limit+1 and opaque cursors', async () => {
    const rows = [
      messageRow({ id: 'm-1', score: 0.9 }),
      messageRow({ id: 'm-2', score: 0.8 }),
      messageRow({ id: 'm-3', score: 0.7 }),
    ];
    mockTxQueryRawUnsafe.mockResolvedValueOnce(rows);
    mockPrisma.message.findMany.mockResolvedValueOnce([
      hydratedMessage({ id: 'm-1' }),
      hydratedMessage({ id: 'm-2' }),
    ]);
    const first = await search({ q: 'database', limit: '2' });
    expect(first.status).toBe(200);
    expect(first.body.results.map((r: { id: string }) => r.id)).toEqual(['m-1', 'm-2']);
    expect(first.body.pageInfo.hasMore).toBe(true);
    expect(typeof first.body.pageInfo.nextCursor).toBe('string');

    // Second page consumes the cursor via a strict tuple predicate.
    mockTxQueryRawUnsafe.mockResolvedValueOnce([messageRow({ id: 'm-3', score: 0.7 })]);
    mockPrisma.message.findMany.mockResolvedValueOnce([hydratedMessage({ id: 'm-3' })]);
    const second = await search({
      q: 'database',
      limit: '2',
      cursor: first.body.pageInfo.nextCursor,
    });
    expect(second.status).toBe(200);
    expect(second.body.results.map((r: { id: string }) => r.id)).toEqual(['m-3']);
    const [sql] = mockTxQueryRawUnsafe.mock.calls[1] as [string];
    expect(sql).toContain('< (');
  });

  it('returns the directory contracts for users and channels', async () => {
    mockTxQueryRawUnsafe.mockResolvedValueOnce([
      { id: 'u-9', name: 'Ada Lovelace', image: null, score: 0.8, tie: 'Ada Lovelace' },
    ]);
    const users = await search({ q: 'ada', type: 'users' });
    expect(users.status).toBe(200);
    expect(users.body.results[0]).toEqual({
      id: 'u-9',
      name: 'Ada Lovelace',
      image: null,
      score: 0.8,
    });
    expect(users.body.results[0].email).toBeUndefined();

    mockTxQueryRawUnsafe.mockResolvedValueOnce([
      {
        kind: 'group_dm',
        id: 'conv-1',
        slug: null,
        name: 'Launch crew',
        description: null,
        channelType: null,
        conversationType: 'GROUP',
        score: 0.7,
        tie: 'Launch crew',
      },
    ]);
    const channels = await search({ q: 'launch', type: 'channels' });
    expect(channels.status).toBe(200);
    expect(channels.body.results[0]).toEqual({
      kind: 'group_dm',
      id: 'conv-1',
      name: 'Launch crew',
      conversationType: 'GROUP',
      score: 0.7,
    });
  });
});

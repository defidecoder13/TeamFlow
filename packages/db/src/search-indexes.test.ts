/**
 * Search index infrastructure tests (Phase 4G.2).
 *
 * Live-database tests: they are SKIPPED when DATABASE_URL is absent (same
 * convention as the API `*.routes.test.ts` LIVE suites) and never fake
 * results. Run with DATABASE_URL exported to verify a real database.
 *
 * Covers: pg_trgm extension, body_tsv generated column, backfill of existing
 * rows, vector tracking on UPDATE, soft-delete vector retention, FTS and
 * trigram matching, and the channel/user name indexes. No Search API/UI.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from './index';

const LIVE = !!process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0;
const liveDescribe = LIVE ? describe : describe.skip;

liveDescribe('search index infrastructure (Phase 4G.2)', () => {
  const prisma = LIVE ? createPrismaClient() : null;

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('has the pg_trgm extension installed', async () => {
    const rows = await prisma!.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
    `;
    expect(rows.map((r) => r.extname)).toContain('pg_trgm');
  });

  it('has the body_tsv generated column on message', async () => {
    const rows = await prisma!.$queryRaw<
      Array<{ column_name: string; data_type: string; is_generated: string }>
    >`
      SELECT column_name, data_type, is_generated
      FROM information_schema.columns
      WHERE table_name = 'message' AND column_name = 'body_tsv'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe('tsvector');
    expect(rows[0].is_generated).toBe('ALWAYS');
  });

  it('has all four search indexes', async () => {
    const rows = await prisma!.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'message_body_tsv_idx',
          'message_body_trgm_idx',
          'channel_name_trgm_idx',
          'user_name_trgm_idx'
        )
    `;
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      'channel_name_trgm_idx',
      'message_body_trgm_idx',
      'message_body_tsv_idx',
      'user_name_trgm_idx',
    ]);
  });

  it('backfills vectors for every existing message row', async () => {
    const rows = await prisma!.$queryRaw<Array<{ total: number; null_vectors: number }>>`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE body_tsv IS NULL)::int AS null_vectors
      FROM message
    `;
    // Zero rows is fine (empty database); any existing row must have a vector.
    expect(rows[0].null_vectors).toBe(0);
  });

  it('tracks body edits in body_tsv and retains the vector on soft-delete', async () => {
    const stamp = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
    const ids = {
      user: `search-idx-u-${stamp}`,
      workspace: `search-idx-w-${stamp}`,
      membership: `search-idx-m-${stamp}`,
      channel: `search-idx-c-${stamp}`,
      message: `search-idx-g-${stamp}`,
    };
    try {
      await prisma!.user.create({
        data: {
          id: ids.user,
          name: `Search Index Probe ${stamp}`,
          email: `search-idx-${stamp}@example.com`,
        },
      });
      await prisma!.workspace.create({
        data: { id: ids.workspace, name: `Search Idx WS ${stamp}`, slug: `search-idx-${stamp}` },
      });
      await prisma!.workspaceMembership.create({
        data: { id: ids.membership, workspaceId: ids.workspace, userId: ids.user, role: 'MEMBER' },
      });
      await prisma!.channel.create({
        data: {
          id: ids.channel,
          workspaceId: ids.workspace,
          name: `search-idx-channel-${stamp}`,
          slug: `search-idx-channel-${stamp}`,
          createdById: ids.user,
        },
      });
      await prisma!.message.create({
        data: { id: ids.message, channelId: ids.channel, authorId: ids.user, body: 'hello world' },
      });

      const inserted = await prisma!.$queryRaw<Array<{ v: string }>>`
        SELECT body_tsv::text AS v FROM message WHERE id = ${ids.message}
      `;
      expect(inserted[0].v).toContain("'hello'");
      expect(inserted[0].v).toContain("'world'");

      // Edit: the generated column must follow with no application indexing code.
      await prisma!.message.update({
        where: { id: ids.message },
        data: { body: 'updated search content', editedAt: new Date() },
      });
      const edited = await prisma!.$queryRaw<Array<{ v: string; body: string }>>`
        SELECT body_tsv::text AS v, body FROM message WHERE id = ${ids.message}
      `;
      expect(edited[0].body).toBe('updated search content');
      expect(edited[0].v).toContain("'updat'");
      expect(edited[0].v).not.toContain("'hello'");

      // FTS matches the edited content.
      const fts = await prisma!.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM message
        WHERE body_tsv @@ plainto_tsquery('english', 'updated')
          AND "deletedAt" IS NULL AND id = ${ids.message}
      `;
      expect(fts.map((r) => r.id)).toContain(ids.message);

      // Trigram operator matches near-identical content (proves the operator
      // and index path work). NOTE for 4G.3: bare `%` uses the default 0.3
      // similarity threshold, which short partial tokens against long bodies
      // may not reach — the search service must use an explicit similarity
      // threshold / word_similarity for the typo-tolerant branch.
      const trigram = await prisma!.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM message WHERE body % 'updated search content' AND id = ${ids.message}
      `;
      expect(trigram.map((r) => r.id)).toContain(ids.message);
      const similarity = await prisma!.$queryRaw<Array<{ s: number }>>`
        SELECT similarity(body, 'updat') AS s FROM message WHERE id = ${ids.message}
      `;
      expect(similarity[0].s).toBeGreaterThan(0);

      // Soft-delete: vector is retained by design; the deletedAt predicate
      // (not vector nulling) is what excludes the row from future search.
      await prisma!.message.update({
        where: { id: ids.message },
        data: { deletedAt: new Date() },
      });
      const deleted = await prisma!.$queryRaw<
        Array<{ v: string; is_deleted: boolean; visible: number }>
      >`
        SELECT body_tsv::text AS v,
               "deletedAt" IS NOT NULL AS is_deleted,
               COUNT(*) FILTER (
                 WHERE body_tsv @@ plainto_tsquery('english', 'updated')
                   AND "deletedAt" IS NULL
               )::int AS visible
        FROM message WHERE id = ${ids.message} GROUP BY body_tsv, "deletedAt"
      `;
      expect(deleted[0].is_deleted).toBe(true);
      expect(deleted[0].v).toContain("'updat'");
      expect(deleted[0].visible).toBe(0);
    } finally {
      // Hard-delete cascades: workspace removal clears memberships, channels,
      // and messages; the probe user is removed explicitly.
      await prisma!.workspace.deleteMany({ where: { id: ids.workspace } });
      await prisma!.user.deleteMany({ where: { id: ids.user } });
    }
    // Neon pooler round-trips are slow; allow headroom (queries are sequential).
  }, 60000);
});

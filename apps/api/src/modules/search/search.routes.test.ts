/**
 * Search API integration tests (Phase 4G.3, backend only).
 *
 * Real Better Auth sessions against the configured development database.
 * SKIPPED without auth/database env so `pnpm test` stays green everywhere.
 * Fixtures use unique run-scoped bodies and are removed in `afterAll`
 * (workspace deletion cascades channels, DMs, and messages).
 */

// Live-database roundtrips (Neon pooler) take seconds per request — mostly
// Better Auth session validation.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { getPrisma } from '../auth/prisma';

vi.setConfig({ testTimeout: 60000, hookTimeout: 300000 });

const LIVE =
  !!process.env.DATABASE_URL && !!process.env.BETTER_AUTH_SECRET && !!process.env.BETTER_AUTH_URL;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = process.env.BETTER_AUTH_URL ?? 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
const email = (who: string) => `search-${RUN}-${who}@example.invalid`;
const PASSWORD = 'search-test-password-0123456789';

liveDescribe('search API (live database)', () => {
  const app = createApp();
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let owner: ReturnType<typeof request.agent>;
  let author: ReturnType<typeof request.agent>;
  let other: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;

  let ws1 = '';
  let ws2 = '';
  let pubSlug = '';
  let privSlug = '';
  let dmOA = '';
  let groupId = '';
  let authorId = '';
  let otherId = '';
  let outsiderId = '';

  async function signUp(who: string, name: string): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name, email: email(who), password: PASSWORD });
    expect(res.status).toBeLessThan(300);
    createdEmails.push(email(who));
    return agent;
  }

  async function userIdFor(who: string): Promise<string> {
    const user = await getPrisma().user.findUniqueOrThrow({ where: { email: email(who) } });
    return user.id;
  }

  const searchAs = (
    agent: ReturnType<typeof request.agent>,
    workspaceId: string,
    params: Record<string, string>,
  ) => agent.get(`/api/workspaces/${workspaceId}/search`).query(params);

  // supertest agents keep cookies; searchAs must forward them — agents do.
  const ownerSearch = (params: Record<string, string>) => searchAs(owner, ws1, params);
  const authorSearch = (params: Record<string, string>) => searchAs(author, ws1, params);
  const otherSearch = (params: Record<string, string>) => searchAs(other, ws1, params);

  beforeAll(async () => {
    owner = await signUp('owner', `Search Owner ${RUN}`);
    author = await signUp('author', `Search Author ${RUN}`);
    other = await signUp('other', `Search Other ${RUN}`);
    outsider = await signUp('outsider', `Search Outsider ${RUN}`);
    authorId = await userIdFor('author');
    otherId = await userIdFor('other');
    outsiderId = await userIdFor('outsider');

    const ws = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Search HQ ${RUN}` });
    expect(ws.status).toBe(201);
    ws1 = ws.body.workspace.id as string;
    createdWorkspaceIds.push(ws1);

    const prisma = getPrisma();
    for (const id of [authorId, otherId]) {
      await prisma.workspaceMembership.create({
        data: { id: randomUUID(), workspaceId: ws1, userId: id, role: 'MEMBER' },
      });
    }

    const pub = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Searchpub ${RUN}`, type: 'PUBLIC' });
    expect(pub.status).toBe(201);
    const pubId = pub.body.channel.id as string;
    pubSlug = pub.body.channel.slug as string;

    const priv = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Searchvault ${RUN}`, type: 'PRIVATE' });
    expect(priv.status).toBe(201);
    const privId = priv.body.channel.id as string;
    privSlug = priv.body.channel.slug as string;
    await prisma.channelMembership.create({
      data: { id: randomUUID(), channelId: privId, userId: authorId },
    });

    const wsB = await outsider
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Search Far ${RUN}` });
    expect(wsB.status).toBe(201);
    ws2 = wsB.body.workspace.id as string;
    createdWorkspaceIds.push(ws2);
    const ws2pub = await outsider
      .post(`/api/workspaces/${ws2}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Elsewhere ${RUN}`, type: 'PUBLIC' });
    const ws2pubId = ws2pub.body.channel.id as string;

    const dm = await owner
      .post(`/api/workspaces/${ws1}/direct-messages`)
      .set('Origin', ORIGIN)
      .send({ recipientId: authorId });
    expect(dm.status).toBe(200);
    dmOA = dm.body.conversation.id as string;

    const group = await owner
      .post(`/api/workspaces/${ws1}/direct-messages/group`)
      .set('Origin', ORIGIN)
      .send({ participantIds: [authorId, otherId], name: `Search crew ${RUN}` });
    expect(group.status).toBe(201);
    groupId = group.body.conversation.id as string;

    const post = async (
      agent: ReturnType<typeof request.agent>,
      channelId: string,
      body: string,
    ) => {
      const res = await agent
        .post(`/api/channels/${channelId}/messages`)
        .set('Origin', ORIGIN)
        .send({ body });
      expect(res.status).toBe(201);
      return res.body.message.id as string;
    };
    const postDm = async (
      agent: ReturnType<typeof request.agent>,
      conversationId: string,
      body: string,
    ) => {
      const res = await agent
        .post(`/api/direct-messages/${conversationId}/messages`)
        .set('Origin', ORIGIN)
        .send({ body });
      expect(res.status).toBe(201);
      return res.body.message.id as string;
    };

    const m1 = await post(owner, pubId, `database migration guide ${RUN}`);
    await author
      .post(`/api/messages/${m1}/replies`)
      .set('Origin', ORIGIN)
      .send({ body: `database reply thread ${RUN}` });
    await post(author, pubId, `database database database ${RUN}`);
    await post(other, pubId, `databse checklist ${RUN}`);
    await post(owner, pubId, `message delivery report ${RUN}`);
    await post(author, pubId, `search architecture blueprint ${RUN}`);
    await post(owner, pubId, `launch party 🎉 ${RUN}`);
    await post(author, pubId, `café résumé notes ${RUN}`);
    await post(owner, pubId, `updated launch checklist ${RUN}`);
    await post(owner, pubId, `wassup celebration ${RUN}`);
    const doomed = await post(owner, pubId, `doomed database ${RUN}`);
    const delRes = await owner.delete(`/api/messages/${doomed}`).set('Origin', ORIGIN);
    expect(delRes.status).toBe(200);

    await post(author, privId, `vault secret database ${RUN}`);
    await postDm(owner, dmOA, `direct database note ${RUN}`);
    await postDm(owner, groupId, `group database huddle ${RUN}`);
    await post(outsider, ws2pubId, `faraway database ${RUN}`);
  }, 300000);

  afterAll(async () => {
    if (!LIVE) {
      return;
    }
    const prisma = getPrisma();
    for (const workspaceId of createdWorkspaceIds) {
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    }
    for (const userEmail of createdEmails) {
      await prisma.user.deleteMany({ where: { email: userEmail } });
    }
  });

  const idsOf = (res: { body: { results: Array<{ id: string }> } }) =>
    res.body.results.map((r) => r.id);
  const bodiesOf = async (res: { body: { results: Array<{ id: string }> } }) => {
    const rows = await getPrisma().message.findMany({
      where: { id: { in: idsOf(res) } },
      select: { id: true, body: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r.body] as const));
    return idsOf(res).map((id) => byId.get(id) ?? '');
  };

  // ---------- Recall (split: ~8 sequential live searches exceed one 60s budget) ----------

  it('recalls exact, partial, and prefix matches', async () => {
    const exact = await ownerSearch({ q: `database migration guide ${RUN}` });
    expect(exact.status).toBe(200);
    expect(await bodiesOf(exact)).toContain(`database migration guide ${RUN}`);

    const partial = await ownerSearch({ q: 'data' });
    expect(partial.status).toBe(200);
    expect(await bodiesOf(partial)).toContain(`database migration guide ${RUN}`);

    const prefix = await ownerSearch({ q: 'messag' });
    expect(prefix.status).toBe(200);
    expect(await bodiesOf(prefix)).toContain(`message delivery report ${RUN}`);
  });

  it('recalls typo, unicode, and emoji-adjacent matches', async () => {
    const typo = await ownerSearch({ q: 'updatted' });
    expect(typo.status).toBe(200);
    expect(await bodiesOf(typo)).toContain(`updated launch checklist ${RUN}`);

    const unicode = await ownerSearch({ q: 'café' });
    expect(unicode.status).toBe(200);
    expect(await bodiesOf(unicode)).toContain(`café résumé notes ${RUN}`);

    const words = await ownerSearch({ q: `party ${RUN}` });
    expect(words.status).toBe(200);
    expect(await bodiesOf(words)).toContain(`launch party 🎉 ${RUN}`);
  });

  it('recalls phrases first and matches case-insensitively', async () => {
    const phrase = await ownerSearch({ q: `search architecture ${RUN}` });
    expect(phrase.status).toBe(200);
    const phraseBodies = await bodiesOf(phrase);
    expect(phraseBodies[0]).toBe(`search architecture blueprint ${RUN}`);

    const cased = await ownerSearch({ q: 'WASSSUP' });
    expect(cased.status).toBe(200);
    expect(await bodiesOf(cased)).toContain(`wassup celebration ${RUN}`);
  });

  it('returns 200 with no results for pure-emoji queries (documented limitation)', async () => {
    const res = await ownerSearch({ q: '🎉' });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  // ---------- Ranking ----------

  it('ranks strong FTS matches above typo-only matches, deterministically', async () => {
    const first = await ownerSearch({ q: `database ${RUN}` });
    const second = await ownerSearch({ q: `database ${RUN}` });
    expect(first.status).toBe(200);
    const order = idsOf(first);
    expect(idsOf(second)).toEqual(order);
    const bodies = await bodiesOf(first);
    const exactIdx = bodies.findIndex((b) => b === `database database database ${RUN}`);
    const typoIdx = bodies.findIndex((b) => b === `databse checklist ${RUN}`);
    expect(exactIdx).toBeGreaterThanOrEqual(0);
    expect(typoIdx).toBeGreaterThanOrEqual(0);
    expect(exactIdx).toBeLessThan(typoIdx);
  });

  // ---------- Pagination ----------

  it('walks stable duplicate-free pages covering the full set', async () => {
    const full = await ownerSearch({ q: RUN, limit: '50' });
    expect(full.status).toBe(200);
    const fullIds = idsOf(full);
    expect(fullIds.length).toBeGreaterThan(3);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await ownerSearch({ q: RUN, limit: '2', ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      for (const id of idsOf(res)) {
        expect(seen).not.toContain(id);
        seen.push(id);
      }
      if (!res.body.pageInfo.hasMore) {
        break;
      }
      cursor = res.body.pageInfo.nextCursor as string;
    }
    expect([...seen].sort()).toEqual([...fullIds].sort());
  });

  it('keeps foreign cursors safe: still enforces the current query', async () => {
    const foreign = await ownerSearch({ q: RUN, limit: '2' });
    const foreignCursor = foreign.body.pageInfo.nextCursor as string;
    const res = await ownerSearch({ q: `database ${RUN}`, limit: '2', cursor: foreignCursor });
    expect(res.status).toBe(200);
    const full = await ownerSearch({ q: `database ${RUN}`, limit: '50' });
    for (const id of idsOf(res)) {
      expect(idsOf(full)).toContain(id);
    }
  });

  // ---------- Filters ----------

  it('combines from/in/date/thread filters', async () => {
    const from = await ownerSearch({ q: RUN, from: authorId, limit: '50' });
    expect(from.status).toBe(200);
    expect(from.body.results.length).toBeGreaterThan(0);
    const authors = await getPrisma().message.findMany({
      where: { id: { in: idsOf(from) } },
      select: { authorId: true },
    });
    expect(new Set(authors.map((a) => a.authorId))).toEqual(new Set([authorId]));

    const inChannel = await ownerSearch({ q: RUN, in: `channel:${pubSlug}`, limit: '50' });
    expect(inChannel.status).toBe(200);
    expect(inChannel.body.results.length).toBeGreaterThan(0);
    const containers = await getPrisma().message.findMany({
      where: { id: { in: idsOf(inChannel) } },
      select: { channelId: true, directMessageConversationId: true },
    });
    expect(containers.every((c) => c.directMessageConversationId === null)).toBe(true);

    const inDm = await ownerSearch({ q: RUN, in: `dm:${dmOA}`, limit: '50' });
    expect(inDm.status).toBe(200);
    expect(inDm.body.results.length).toBeGreaterThan(0);
    const dmContainers = await getPrisma().message.findMany({
      where: { id: { in: idsOf(inDm) } },
      select: { directMessageConversationId: true },
    });
    expect(new Set(dmContainers.map((c) => c.directMessageConversationId))).toEqual(
      new Set([dmOA]),
    );

    const repliesOnly = await ownerSearch({ q: RUN, thread: 'only', limit: '50' });
    expect(repliesOnly.status).toBe(200);
    expect(repliesOnly.body.results.length).toBeGreaterThan(0);
    expect(
      repliesOnly.body.results.every(
        (r: { parentMessageId: string | null }) => r.parentMessageId !== null,
      ),
    ).toBe(true);

    const rootsOnly = await ownerSearch({ q: RUN, thread: 'exclude', limit: '50' });
    expect(rootsOnly.status).toBe(200);
    expect(
      rootsOnly.body.results.every(
        (r: { parentMessageId: string | null }) => r.parentMessageId === null,
      ),
    ).toBe(true);

    const now = new Date();
    const past = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const future = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const windowed = await ownerSearch({ q: RUN, after: past, before: future, limit: '50' });
    expect(windowed.status).toBe(200);
    expect(windowed.body.results.length).toBeGreaterThan(0);
    const emptied = await ownerSearch({ q: RUN, after: future, limit: '50' });
    expect(emptied.status).toBe(200);
    expect(emptied.body.results).toEqual([]);

    const combo = await ownerSearch({
      q: RUN,
      from: authorId,
      in: `channel:${pubSlug}`,
      thread: 'exclude',
      after: past,
      before: future,
      limit: '50',
    });
    expect(combo.status).toBe(200);
    expect(combo.body.results.length).toBeGreaterThan(0);
  });

  // ---------- Directory search ----------

  it('searches members and channels with authorization', async () => {
    const users = await ownerSearch({ q: `Search Owner ${RUN}`, type: 'users' });
    expect(users.status).toBe(200);
    expect(users.body.results.map((r: { name: string }) => r.name)).toContain(
      `Search Owner ${RUN}`,
    );
    expect(JSON.stringify(users.body)).not.toContain('@example.invalid');

    const channels = await authorSearch({ q: `Searchvault ${RUN}`, type: 'channels' });
    expect(channels.status).toBe(200);
    expect(channels.body.results.map((r: { name: string }) => r.name)).toContain(
      `Searchvault ${RUN}`,
    );

    const leaked = await otherSearch({ q: `Searchvault ${RUN}`, type: 'channels' });
    expect(leaked.status).toBe(200);
    expect(leaked.body.results.map((r: { name: string }) => r.name)).not.toContain(
      `Searchvault ${RUN}`,
    );

    const groups = await ownerSearch({ q: `Search crew ${RUN}`, type: 'channels' });
    expect(groups.status).toBe(200);
    expect(groups.body.results.map((r: { name: string }) => r.name)).toContain(
      `Search crew ${RUN}`,
    );
  });

  // ---------- Security matrix ----------

  it('A: hides private-channel messages from non-members', async () => {
    const res = await otherSearch({ q: `vault secret ${RUN}`, limit: '50' });
    expect(res.status).toBe(200);
    expect(await bodiesOf(res)).not.toContain(`vault secret database ${RUN}`);

    const member = await authorSearch({ q: `vault secret ${RUN}`, limit: '50' });
    expect(await bodiesOf(member)).toContain(`vault secret database ${RUN}`);
  });

  it('B: hides DM messages from non-participants', async () => {
    const res = await otherSearch({ q: `direct database ${RUN}`, limit: '50' });
    expect(res.status).toBe(200);
    expect(await bodiesOf(res)).not.toContain(`direct database note ${RUN}`);
  });

  it('C: hides cross-workspace messages and rejects outsiders', async () => {
    const res = await ownerSearch({ q: 'faraway', limit: '50' });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);

    const forged = await searchAs(owner, randomUUID(), { q: RUN });
    expect(forged.status).toBe(404);

    const outsiderRes = await searchAs(outsider, ws1, { q: RUN });
    expect(outsiderRes.status).toBe(404);
  });

  it('F/G: rejects unauthorized in: targets with 404', async () => {
    const f = await otherSearch({ q: RUN, in: `channel:${privSlug}` });
    expect(f.status).toBe(404);
    const g = await otherSearch({ q: RUN, in: `dm:${dmOA}` });
    expect(g.status).toBe(404);
    const missing = await ownerSearch({ q: RUN, in: 'channel:no-such-channel' });
    expect(missing.status).toBe(404);
  });

  it('H: rejects from: pointing at non-members with 400', async () => {
    const res = await ownerSearch({ q: RUN, from: outsiderId });
    expect(res.status).toBe(400);
  });

  it('I: never resurrects deleted messages', async () => {
    const res = await ownerSearch({ q: 'doomed', limit: '50' });
    expect(res.status).toBe(200);
    expect(await bodiesOf(res)).not.toContain(`doomed database ${RUN}`);
  });

  it('J: treats tsquery metacharacters literally', async () => {
    const res = await ownerSearch({ q: ':&|!' });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(await getPrisma().message.count()).toBeGreaterThan(0);
  });

  it('K: rejects malformed cursors with 400', async () => {
    const res = await ownerSearch({
      q: RUN,
      cursor: Buffer.from("'; DROP TABLE message; --", 'utf8').toString('base64url'),
    });
    expect(res.status).toBe(400);
    expect(await getPrisma().message.count()).toBeGreaterThan(0);
  });

  // ---------- Group membership dynamics (run last: mutates fixtures) ----------

  // NOTE: remove + re-add + verification searches span several slow pooler
  // round trips; the extended timeout covers full-suite load (focused runs
  // take ~40s).
  it('D: removed group participants lose history, E: re-added regain it', async () => {
    const before = await otherSearch({ q: `group database huddle ${RUN}`, limit: '50' });
    expect(await bodiesOf(before)).toContain(`group database huddle ${RUN}`);

    const removed = await owner
      .delete(`/api/direct-messages/${groupId}/participants/${otherId}`)
      .set('Origin', ORIGIN);
    expect(removed.status).toBe(200);

    const after = await otherSearch({ q: `group database huddle ${RUN}`, limit: '50' });
    expect(after.status).toBe(200);
    expect(await bodiesOf(after)).not.toContain(`group database huddle ${RUN}`);

    const readded = await owner
      .post(`/api/direct-messages/${groupId}/participants`)
      .set('Origin', ORIGIN)
      .send({ userId: otherId });
    expect(readded.status).toBe(200);

    const restored = await otherSearch({ q: `group database huddle ${RUN}`, limit: '50' });
    expect(await bodiesOf(restored)).toContain(`group database huddle ${RUN}`);
  }, 180000);

  // ---------- Performance sanity ----------

  it('uses the search indexes for realistic predicates (supplementary proof)', async () => {
    const prisma = getPrisma();
    const plans = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL enable_seqscan = off`);
      const fts = await tx.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
        `EXPLAIN (COSTS OFF) SELECT id FROM message WHERE "deletedAt" IS NULL AND body_tsv @@ plainto_tsquery('english', 'database') LIMIT 20`,
      );
      return fts.map((r) => r['QUERY PLAN']).join(' | ');
    });
    expect(plans).toContain('message_body_tsv_idx');
  });
});

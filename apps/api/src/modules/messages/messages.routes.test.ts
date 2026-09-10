import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { getPrisma } from '../auth/prisma';

// Live-database roundtrips (Neon pooler) take seconds per request — mostly
// Better Auth session validation. Unit tests stay fast; only this file is slow.
vi.setConfig({ testTimeout: 45000, hookTimeout: 240000 });

/**
 * Message API integration tests (Phase 4A, backend only).
 *
 * Real Better Auth sessions against the configured development database.
 * SKIPPED without auth/database env so `pnpm test` stays green everywhere.
 * Fixtures use unique run-scoped bodies and are removed in `afterAll`
 * (workspace deletion cascades channels and messages).
 */

const LIVE =
  !!process.env.DATABASE_URL && !!process.env.BETTER_AUTH_SECRET && !!process.env.BETTER_AUTH_URL;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = process.env.BETTER_AUTH_URL ?? 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
const email = (who: string) => `ws4a-${RUN}-${who}@example.invalid`;
const PASSWORD = 'message-test-password-0123456789';

liveDescribe('message API (live database)', () => {
  const app = createApp();
  const api = () => request(app);
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let ws1 = '';
  let ws2 = '';
  let pubId = '';
  let privId = '';
  let ws2PubId = '';

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

  let owner: ReturnType<typeof request.agent>;
  let author: ReturnType<typeof request.agent>;
  let other: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;

  async function userIdFor(who: string): Promise<string> {
    const user = await getPrisma().user.findUniqueOrThrow({ where: { email: email(who) } });
    return user.id;
  }

  async function postMessage(
    agent: ReturnType<typeof request.agent>,
    channelId: string,
    body: Record<string, unknown>,
  ) {
    return agent.post(`/api/channels/${channelId}/messages`).set('Origin', ORIGIN).send(body);
  }

  beforeAll(async () => {
    owner = await signUp('owner', 'Msg Owner');
    author = await signUp('author', 'Msg Author');
    other = await signUp('other', 'Msg Other');
    outsider = await signUp('outsider', 'Msg Outsider');

    const ws = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Message HQ ${RUN}` });
    expect(ws.status).toBe(201);
    ws1 = ws.body.workspace.id as string;
    createdWorkspaceIds.push(ws1);

    const prisma = getPrisma();
    await prisma.workspaceMembership.create({
      data: {
        id: randomUUID(),
        workspaceId: ws1,
        userId: await userIdFor('author'),
        role: 'MEMBER',
      },
    });
    await prisma.workspaceMembership.create({
      data: {
        id: randomUUID(),
        workspaceId: ws1,
        userId: await userIdFor('other'),
        role: 'MEMBER',
      },
    });

    const pub = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `General ${RUN}`, type: 'PUBLIC' });
    expect(pub.status).toBe(201);
    pubId = pub.body.channel.id as string;

    const priv = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Vault ${RUN}`, type: 'PRIVATE' });
    expect(priv.status).toBe(201);
    privId = priv.body.channel.id as string;

    const wsB = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Message Far ${RUN}` });
    expect(wsB.status).toBe(201);
    ws2 = wsB.body.workspace.id as string;
    createdWorkspaceIds.push(ws2);

    const ws2pub = await owner
      .post(`/api/workspaces/${ws2}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Elsewhere ${RUN}`, type: 'PUBLIC' });
    expect(ws2pub.status).toBe(201);
    ws2PubId = ws2pub.body.channel.id as string;
  }, 240000);

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

  // ---------- Data model ----------

  it('links messages to their channel and author with cascading relations', async () => {
    const res = await postMessage(author, pubId, { body: `relational ${RUN}` });
    expect(res.status).toBe(201);
    const row = await getPrisma().message.findUniqueOrThrow({
      where: { id: res.body.message.id as string },
      include: { channel: true, author: true },
    });
    expect(row.channelId).toBe(pubId);
    expect(row.author.email).toBe(email('author'));
  });

  it('cascades message deletion with its channel', async () => {
    const prisma = getPrisma();
    const channel = await prisma.channel.create({
      data: {
        id: randomUUID(),
        workspaceId: ws1,
        name: `Doomed ${RUN}`,
        slug: `doomed-${RUN.toLowerCase()}`,
        type: 'PUBLIC',
        createdById: await userIdFor('owner'),
      },
    });
    await prisma.message.create({
      data: {
        id: randomUUID(),
        channelId: channel.id,
        authorId: await userIdFor('owner'),
        body: 'doomed body',
      },
    });
    await prisma.channel.delete({ where: { id: channel.id } });
    expect(await prisma.message.count({ where: { channelId: channel.id } })).toBe(0);
  });

  it('has the channel-chronological and author indexes', async () => {
    const rows = (await getPrisma().$queryRaw`
      SELECT indexname FROM pg_indexes WHERE tablename = 'message' ORDER BY indexname
    `) as { indexname: string }[];
    const names = rows.map((r) => r.indexname);
    expect(names).toContain('message_channelId_createdAt_id_idx');
    expect(names).toContain('message_authorId_idx');
  });

  // ---------- Creation ----------

  it('lets members create messages with server-set identity', async () => {
    const res = await postMessage(author, pubId, { body: `hello ${RUN}` });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({
      channelId: pubId,
      body: `hello ${RUN}`,
      editedAt: null,
      deletedAt: null,
    });
    expect(res.body.message.author).toMatchObject({ name: 'Msg Author' });

    const ownerId = await userIdFor('owner');
    const priv = await postMessage(owner, privId, { body: `secret ${RUN}` });
    expect(priv.status).toBe(201);
    expect(priv.body.message.author.id).toBe(ownerId);
  });

  it('rejects private-channel writes from non-members and outsiders', async () => {
    expect((await postMessage(author, privId, { body: `nope ${RUN}` })).status).toBe(404);
    expect((await postMessage(outsider, pubId, { body: `nope ${RUN}` })).status).toBe(404);
    expect(
      (
        await api()
          .post(`/api/channels/${pubId}/messages`)
          .set('Origin', ORIGIN)
          .send({
            body: `nope ${RUN}`,
          })
      ).status,
    ).toBe(401);
  });

  it('validates message bodies strictly', async () => {
    for (const body of [{}, { body: '' }, { body: '   ' }, { body: 'a'.repeat(10001) }]) {
      const res = await postMessage(author, pubId, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const trimmed = await postMessage(author, pubId, { body: `  padded ${RUN}  ` });
    expect(trimmed.status).toBe(201);
    expect(trimmed.body.message.body).toBe(`padded ${RUN}`);
  });

  it('rejects authority-field injection', async () => {
    const authorId = await userIdFor('author');
    for (const body of [
      { body: `x ${RUN}`, authorId: 'someone-else' },
      { body: `x ${RUN}`, userId: 'someone-else' },
      { body: `x ${RUN}`, workspaceId: ws2 },
      { body: `x ${RUN}`, channelId: ws2PubId },
      { body: `x ${RUN}`, createdAt: new Date().toISOString() },
      { body: `x ${RUN}`, deletedAt: null },
    ]) {
      expect((await postMessage(author, pubId, body)).status).toBe(400);
    }
    expect(authorId).toBe(await userIdFor('author'));
  });

  // ---------- Listing ----------

  it('lists newest-first with default limit and cursor pages without gaps', async () => {
    const channel = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Pages ${RUN}`, type: 'PUBLIC' });
    expect(channel.status).toBe(201);
    const channelId = channel.body.channel.id as string;

    const bodies = Array.from({ length: 5 }, (_, i) => `pageable ${RUN} ${i}`);
    for (const body of bodies) {
      const res = await postMessage(author, channelId, { body });
      expect(res.status).toBe(201);
    }

    const unpaged = await author.get(`/api/channels/${channelId}/messages`);
    expect(unpaged.status).toBe(200);
    expect((unpaged.body.messages as { body: string }[]).map((m) => m.body)).toEqual(
      bodies.slice().reverse(),
    );

    const first = await author.get(`/api/channels/${channelId}/messages`).query({ limit: '2' });
    expect(first.status).toBe(200);
    expect(first.body.messages).toHaveLength(2);
    expect(first.body.pageInfo.hasMore).toBe(true);
    expect(typeof first.body.pageInfo.nextCursor).toBe('string');
    expect(first.body.messages[0].body).toBe(`pageable ${RUN} 4`);
    expect(first.body.messages[1].body).toBe(`pageable ${RUN} 3`);

    const second = await author
      .get(`/api/channels/${channelId}/messages`)
      .query({ limit: '2', cursor: first.body.pageInfo.nextCursor });
    expect(second.body.messages.map((m: { body: string }) => m.body)).toEqual([
      `pageable ${RUN} 2`,
      `pageable ${RUN} 1`,
    ]);
    expect(second.body.pageInfo.hasMore).toBe(true);

    const third = await author
      .get(`/api/channels/${channelId}/messages`)
      .query({ limit: '2', cursor: second.body.pageInfo.nextCursor });
    expect((third.body.messages as { body: string }[]).map((m) => m.body)).toEqual([
      `pageable ${RUN} 0`,
    ]);
    expect(third.body.pageInfo.hasMore).toBe(false);
    expect(third.body.pageInfo.nextCursor).toBeNull();

    const seen = new Set(
      [...first.body.messages, ...second.body.messages, ...third.body.messages].map(
        (m: { id: string }) => m.id,
      ),
    );
    expect(seen.size).toBe(5);
  });

  it('enforces limit bounds and rejects bad cursors', async () => {
    expect(
      (await author.get(`/api/channels/${pubId}/messages`).query({ limit: '100' })).status,
    ).toBe(200);
    for (const query of [
      { limit: '0' },
      { limit: '-1' },
      { limit: '101' },
      { limit: 'abc' },
      { limit: '10.5' },
      { limit: '10', unexpected: 'x' },
      { cursor: '!!!' },
      { cursor: Buffer.from('{}', 'utf8').toString('base64url') },
    ]) {
      const res = await author.get(`/api/channels/${pubId}/messages`).query(query);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('isolates channels and hides deleted bodies in place', async () => {
    const created = await postMessage(author, pubId, { body: `ephemeral ${RUN}` });
    const id = created.body.message.id as string;
    const deleted = await author.delete(`/api/messages/${id}`).set('Origin', ORIGIN);
    expect(deleted.status).toBe(200);

    const listed = await author.get(`/api/channels/${pubId}/messages`).query({ limit: '100' });
    const tombstone = (listed.body.messages as Record<string, unknown>[]).find((m) => m.id === id);
    expect(tombstone).toMatchObject({ id, body: null });
    expect(tombstone?.deletedAt).not.toBeNull();

    const other = await owner.get(`/api/channels/${ws2PubId}/messages`);
    expect(other.status).toBe(200);
    expect((other.body.messages as { id: string }[]).map((m) => m.id)).not.toContain(id);

    expect((await author.get(`/api/channels/${privId}/messages`)).status).toBe(404);
    expect((await outsider.get(`/api/channels/${pubId}/messages`)).status).toBe(404);
    expect((await api().get(`/api/channels/${pubId}/messages`)).status).toBe(401);
  });

  // ---------- Edit ----------

  it('lets authors edit with editedAt tracking', async () => {
    const created = await postMessage(author, pubId, { body: `draft ${RUN}` });
    const id = created.body.message.id as string;
    const before: string = created.body.message.updatedAt as string;

    const res = await author
      .patch(`/api/messages/${id}`)
      .set('Origin', ORIGIN)
      .send({ body: `final ${RUN}` });
    expect(res.status).toBe(200);
    expect(res.body.message.body).toBe(`final ${RUN}`);
    expect(res.body.message.editedAt).not.toBeNull();
    expect(new Date(res.body.message.updatedAt as string).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime(),
    );
  });

  it('restricts editing to the original author', async () => {
    const created = await postMessage(author, pubId, { body: `mine ${RUN}` });
    const id = created.body.message.id as string;

    expect(
      (await other.patch(`/api/messages/${id}`).set('Origin', ORIGIN).send({ body: 'hijack' }))
        .status,
    ).toBe(403);
    expect(
      (await owner.patch(`/api/messages/${id}`).set('Origin', ORIGIN).send({ body: 'hijack' }))
        .status,
    ).toBe(403);
    expect(
      (await outsider.patch(`/api/messages/${id}`).set('Origin', ORIGIN).send({ body: 'hijack' }))
        .status,
    ).toBe(404);
    expect(
      (await api().patch(`/api/messages/${id}`).set('Origin', ORIGIN).send({ body: 'hijack' }))
        .status,
    ).toBe(401);
    expect(
      (
        await author
          .patch(`/api/messages/${id}`)
          .set('Origin', ORIGIN)
          .send({ body: 'ok', channelId: ws2PubId })
      ).status,
    ).toBe(400);
  });

  it('refuses to edit deleted messages', async () => {
    const created = await postMessage(author, pubId, { body: `gone ${RUN}` });
    const id = created.body.message.id as string;
    expect((await author.delete(`/api/messages/${id}`).set('Origin', ORIGIN)).status).toBe(200);
    const res = await author
      .patch(`/api/messages/${id}`)
      .set('Origin', ORIGIN)
      .send({ body: 'resurrect' });
    expect(res.status).toBe(409);
  });

  // ---------- Delete ----------

  it('soft-deletes for authors while keeping the row', async () => {
    const created = await postMessage(author, pubId, { body: `bye ${RUN}` });
    const id = created.body.message.id as string;

    const res = await author.delete(`/api/messages/${id}`).set('Origin', ORIGIN);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatchObject({ id, body: null });
    expect(res.body.message.deletedAt).not.toBeNull();

    const row = await getPrisma().message.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row?.body).toBe(`bye ${RUN}`);
  });

  it('restricts deletion to the original author', async () => {
    const created = await postMessage(author, pubId, { body: `keep ${RUN}` });
    const id = created.body.message.id as string;

    expect((await other.delete(`/api/messages/${id}`).set('Origin', ORIGIN)).status).toBe(403);
    expect((await owner.delete(`/api/messages/${id}`).set('Origin', ORIGIN)).status).toBe(403);
    expect((await outsider.delete(`/api/messages/${id}`).set('Origin', ORIGIN)).status).toBe(404);
    expect((await api().delete(`/api/messages/${id}`).set('Origin', ORIGIN)).status).toBe(401);

    const repeat = await author.delete(`/api/messages/${id}`).set('Origin', ORIGIN);
    expect(repeat.status).toBe(200);
    const again = await author.delete(`/api/messages/${id}`).set('Origin', ORIGIN);
    expect(again.status).toBe(200);
    expect(again.body.message.body).toBeNull();
  });

  // ---------- Security ----------

  it('denies cross-workspace access by message id alone', async () => {
    const created = await postMessage(author, pubId, { body: `silo ${RUN}` });
    const id = created.body.message.id as string;

    expect(
      (await other.patch(`/api/messages/${id}`).set('Origin', ORIGIN).send({ body: 'x' })).status,
    ).toBe(403);
    // other is a member of ws1 but PATCHing through no channel context must
    // still resolve tenant scope from the message itself (covered above).
    const ws2listed = await owner.get(`/api/channels/${ws2PubId}/messages`);
    expect((ws2listed.body.messages as { id: string }[]).map((m) => m.id)).not.toContain(id);
  });

  it('leaks no account, session, credential, or query internals', async () => {
    const created = await postMessage(author, pubId, { body: `clean ${RUN}` });
    const listed = await author.get(`/api/channels/${pubId}/messages`).query({ limit: '5' });
    const edited = await author
      .patch(`/api/messages/${created.body.message.id as string}`)
      .set('Origin', ORIGIN)
      .send({ body: `cleaner ${RUN}` });
    const deleted = await author
      .delete(`/api/messages/${created.body.message.id as string}`)
      .set('Origin', ORIGIN);

    // Key set covers the thread (4D), DM-container (4F), and attachments
    // (4J) fields added after Phase 4A; the leak assertions below remain the
    // security check.
    expect(Object.keys(created.body.message).sort()).toEqual([
      'attachments',
      'author',
      'body',
      'channelId',
      'createdAt',
      'deletedAt',
      'directMessageConversationId',
      'editedAt',
      'id',
      'latestReplyAt',
      'parentMessageId',
      'replyCount',
      'updatedAt',
    ]);
    for (const body of [created.body, listed.body, edited.body, deleted.body]) {
      const serialized = JSON.stringify(body).toLowerCase();
      for (const leaked of ['password', 'token', 'secret', 'hash', 'session', 'account']) {
        expect(serialized).not.toContain(leaked);
      }
    }

    const badCursor = await author
      .get(`/api/channels/${pubId}/messages`)
      .query({ cursor: Buffer.from("'; DROP TABLE message; --", 'utf8').toString('base64url') });
    expect(badCursor.status).toBe(400);
    expect(await getPrisma().message.count({ where: { channelId: pubId } })).toBeGreaterThan(0);
  });

  it('creates concurrent messages as separate durable rows', async () => {
    const bodies = Array.from({ length: 5 }, (_, i) => `race ${RUN} ${i}`);
    const results = await Promise.all(bodies.map((body) => postMessage(author, pubId, { body })));
    for (const res of results) {
      expect(res.status).toBe(201);
    }
    const ids = results.map((res) => res.body.message.id as string);
    expect(new Set(ids).size).toBe(5);
    const rows = await getPrisma().message.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    expect(rows).toHaveLength(5);

    const soloBody = `solo ${RUN}`;
    await postMessage(author, pubId, { body: soloBody });
    expect(
      await getPrisma().message.count({
        where: { channelId: pubId, authorId: await userIdFor('author'), body: soloBody },
      }),
    ).toBe(1);
  });
});

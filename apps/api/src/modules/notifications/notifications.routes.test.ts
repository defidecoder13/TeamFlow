/**
 * Notification read API integration tests (Phase 4H.5, live database).
 *
 * Real Better Auth sessions against the configured development database.
 * SKIPPED without auth/database env so `pnpm test` stays green everywhere.
 * Notification rows are produced by real 4H.4 generation through message
 * creation endpoints (plus a few direct inserts where the read path — not
 * generation — is under test). Fixtures are removed in `afterAll`
 * (workspace deletion cascades channels, DMs, messages, and notifications).
 */

// Live-database roundtrips (Neon pooler) take seconds per request — mostly
// Better Auth session validation.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClerkFakes, requestAs } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { getPrisma } from '../auth/prisma';

vi.setConfig({ testTimeout: 90000, hookTimeout: 300000 });

const LIVE = !!process.env.DATABASE_URL && !!process.env.CLERK_SECRET_KEY;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
const fakes = createClerkFakes('notifications-routes');
const email = (who: string) => fakes.emailFor(who);

liveDescribe('notification read API (live database)', () => {
  const app = createApp(fakes.appDeps());
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let owner: ReturnType<typeof requestAs>;
  let rita: ReturnType<typeof requestAs>;
  let omar: ReturnType<typeof requestAs>;
  let xena: ReturnType<typeof requestAs>;

  let ws1 = '';
  let ws2 = '';
  let pubId = '';
  let privId = '';
  let dmId = '';
  let groupId = '';
  let ritaId = '';
  let omarId = '';
  let xenaId = '';
  let rootId = '';

  async function signUp(who: string, name: string): Promise<ReturnType<typeof requestAs>> {
    fakes.setProfile(who, { name });
    createdEmails.push(email(who));
    // First sight provisions the local user row through the fake directory.
    const me = await request(app).get('/api/me').set(fakes.headersFor(who));
    expect(me.status).toBe(200);
    return requestAs(app, fakes, who);
  }

  async function userIdFor(who: string): Promise<string> {
    const user = await getPrisma().user.findUniqueOrThrow({ where: { email: email(who) } });
    return user.id;
  }

  const listAs = (
    agent: ReturnType<typeof requestAs>,
    workspaceId: string,
    params: Record<string, string> = {},
  ) => agent.get(`/api/workspaces/${workspaceId}/notifications`).query(params);

  const ritaList = (params: Record<string, string> = {}) => listAs(rita, ws1, params);

  async function ritaIds(params: Record<string, string> = {}): Promise<string[]> {
    const res = await ritaList(params);
    expect(res.status).toBe(200);
    return (res.body.notifications as Array<{ id: string }>).map((n) => n.id);
  }

  beforeAll(async () => {
    owner = await signUp('owner', 'Owen');
    rita = await signUp('rita', 'Rita');
    omar = await signUp('omar', 'Omar');
    xena = await signUp('xena', 'Xena');
    ritaId = await userIdFor('rita');
    omarId = await userIdFor('omar');
    xenaId = await userIdFor('xena');

    const ws = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `NotifAPI HQ ${RUN}` });
    expect(ws.status).toBe(201);
    ws1 = ws.body.workspace.id as string;
    createdWorkspaceIds.push(ws1);

    const wsB = await xena
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `NotifAPI Far ${RUN}` });
    expect(wsB.status).toBe(201);
    ws2 = wsB.body.workspace.id as string;
    createdWorkspaceIds.push(ws2);

    const prisma = getPrisma();
    for (const id of [ritaId, omarId]) {
      await prisma.workspaceMembership.create({
        data: { id: randomUUID(), workspaceId: ws1, userId: id, role: 'MEMBER' },
      });
    }

    const pub = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Notifpub ${RUN}`, type: 'PUBLIC' });
    expect(pub.status).toBe(201);
    pubId = pub.body.channel.id as string;

    const priv = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Notifvault ${RUN}`, type: 'PRIVATE' });
    expect(priv.status).toBe(201);
    privId = priv.body.channel.id as string;
    await prisma.channelMembership.create({
      data: { id: randomUUID(), channelId: privId, userId: ritaId },
    });

    const dm = await owner
      .post(`/api/workspaces/${ws1}/direct-messages`)
      .set('Origin', ORIGIN)
      .send({ recipientId: ritaId });
    expect(dm.status).toBe(200);
    dmId = dm.body.conversation.id as string;

    const group = await owner
      .post(`/api/workspaces/${ws1}/direct-messages/group`)
      .set('Origin', ORIGIN)
      .send({ participantIds: [ritaId, omarId], name: `Notif crew ${RUN}` });
    expect(group.status).toBe(201);
    groupId = group.body.conversation.id as string;

    async function postChannel(
      agent: ReturnType<typeof requestAs>,
      channelId: string,
      body: string,
    ): Promise<string> {
      const res = await agent
        .post(`/api/channels/${channelId}/messages`)
        .set('Origin', ORIGIN)
        .send({ body });
      expect(res.status).toBe(201);
      return res.body.message.id as string;
    }

    // Fixtures (each generates real 4H.4 notifications for Rita unless noted).
    await postChannel(owner, pubId, `hello @Rita ${RUN}`);
    await postChannel(owner, pubId, `second ping @Rita ${RUN}`);
    await owner
      .post(`/api/direct-messages/${dmId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: `direct hello ${RUN}` });
    await owner
      .post(`/api/direct-messages/${groupId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: `group hello ${RUN}` });
    rootId = await postChannel(rita, pubId, `root thread ${RUN}`);
    const reply = await owner
      .post(`/api/messages/${rootId}/replies`)
      .set('Origin', ORIGIN)
      .send({ body: `reply hello ${RUN}` });
    expect(reply.status).toBe(201);
    // A mention row for Omar (used by isolation assertions).
    await postChannel(owner, pubId, `hello @Omar ${RUN}`);
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

  // ---------- LIST ----------

  it('lists own notifications newest-first with page envelope', async () => {
    const res = await ritaList({ limit: '50' });
    expect(res.status).toBe(200);
    const items = res.body.notifications as Array<{
      id: string;
      recipientUserId: string;
      createdAt: string;
    }>;
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.every((n) => n.recipientUserId === ritaId)).toBe(true);
    expect(res.body.pageInfo).toEqual({ hasMore: false, nextCursor: null });
    const times = items.map((n) => n.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('rejects non-members and cross-workspace access with 404', async () => {
    const outsiderRes = await listAs(xena, ws1);
    expect(outsiderRes.status).toBe(404);
    const forgedRes = await listAs(rita, ws2);
    expect(forgedRes.status).toBe(404);
    const missingRes = await listAs(rita, randomUUID());
    expect(missingRes.status).toBe(404);
  });

  it('never exposes another user’s notifications', async () => {
    const omarRows = await getPrisma().notification.findMany({
      where: { recipientUserId: omarId },
      select: { id: true },
    });
    expect(omarRows.length).toBeGreaterThan(0);
    const xenaRows = await getPrisma().notification.findMany({
      where: { recipientUserId: xenaId },
      select: { id: true },
    });
    const res = await ritaList({ limit: '50' });
    const ids = new Set((res.body.notifications as Array<{ id: string }>).map((n) => n.id));
    for (const row of [...omarRows, ...xenaRows]) {
      expect(ids.has(row.id)).toBe(false);
    }
  });

  it('validates limit bounds strictly', async () => {
    for (const params of [{ limit: '0' }, { limit: '101' }, { limit: 'abc' }, { limit: '10.5' }]) {
      const res = await ritaList(params);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const ok = await ritaList({ limit: '100' });
    expect(ok.status).toBe(200);
  });

  it('filters unreadOnly without DM read state', async () => {
    const all = await ritaList({ limit: '50' });
    expect(all.status).toBe(200);
    const unread = await ritaList({ limit: '50', unreadOnly: 'true' });
    expect(unread.status).toBe(200);
    expect(
      (unread.body.notifications as Array<{ readAt: string | null }>).every(
        (n) => n.readAt === null,
      ),
    ).toBe(true);
    expect(unread.body.notifications.length).toBeLessThanOrEqual(
      (all.body.notifications as unknown[]).length,
    );
    for (const params of [{ unreadOnly: 'yes' }, { unreadOnly: '1' }]) {
      expect((await ritaList(params)).status).toBe(400);
    }
  });

  it('filters each notification type and rejects unknown types', async () => {
    for (const type of ['MENTION', 'DM_MESSAGE', 'GROUP_MESSAGE', 'THREAD_REPLY']) {
      const res = await ritaList({ type, limit: '50' });
      expect(res.status).toBe(200);
      expect(
        (res.body.notifications as Array<{ type: string }>).every((n) => n.type === type),
      ).toBe(true);
    }
    expect((await ritaList({ type: 'REACTION' })).status).toBe(400);
    expect((await ritaList({ type: 'mention' })).status).toBe(400);
  });

  it('walks stable duplicate-free pages covering the full set', async () => {
    const full = await ritaList({ limit: '50' });
    const fullIds = (full.body.notifications as Array<{ id: string }>).map((n) => n.id);
    expect(fullIds.length).toBeGreaterThan(3);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await ritaList({ limit: '2', ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      for (const item of res.body.notifications as Array<{ id: string }>) {
        expect(seen).not.toContain(item.id);
        seen.push(item.id);
      }
      if (!res.body.pageInfo.hasMore) {
        break;
      }
      cursor = res.body.pageInfo.nextCursor as string;
    }
    expect([...seen].sort()).toEqual([...fullIds].sort());
  });

  it('rejects malformed cursors and keeps foreign cursors safe', async () => {
    const bad = await ritaList({
      cursor: Buffer.from("'; DROP TABLE notification; --", 'utf8').toString('base64url'),
    });
    expect(bad.status).toBe(400);
    expect(await getPrisma().notification.count()).toBeGreaterThan(0);

    const foreign = await ritaList({ limit: '2' });
    const foreignCursor = foreign.body.pageInfo.nextCursor as string;
    // A valid-shape cursor from another query still only returns own rows.
    const res = await ritaList({ limit: '2', cursor: foreignCursor, type: 'MENTION' });
    expect(res.status).toBe(200);
    expect(
      (res.body.notifications as Array<{ recipientUserId: string; type: string }>).every(
        (n) => n.recipientUserId === ritaId && n.type === 'MENTION',
      ),
    ).toBe(true);
  });

  it('returns the documented shape without sensitive fields', async () => {
    const res = await ritaList({ limit: '1' });
    const [item] = res.body.notifications as Array<Record<string, unknown>>;
    for (const key of [
      'id',
      'type',
      'workspaceId',
      'recipientUserId',
      'actorUserId',
      'actorName',
      'actorImage',
      'messageId',
      'conversationId',
      'channelId',
      'threadRootMessageId',
      'channelName',
      'conversationName',
      'createdAt',
      'readAt',
    ]) {
      expect(item).toHaveProperty(key);
    }
    expect(JSON.stringify(item)).not.toMatch(/email|password|token|secret|hash|session/i);
  });

  // ---------- SOURCE ACCESS ----------

  it('hides private-channel notifications after membership loss', async () => {
    const priv = await owner
      .post(`/api/channels/${privId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: `vault ping @Rita ${RUN}` });
    expect(priv.status).toBe(201);
    const privMsgId = priv.body.message.id as string;

    let visible = await ritaList({ limit: '50' });
    expect(
      (visible.body.notifications as Array<{ messageId: string | null }>).some(
        (n) => n.messageId === privMsgId,
      ),
    ).toBe(true);

    await getPrisma().channelMembership.deleteMany({
      where: { channelId: privId, userId: ritaId },
    });
    visible = await ritaList({ limit: '50' });
    expect(
      (visible.body.notifications as Array<{ messageId: string | null }>).some(
        (n) => n.messageId === privMsgId,
      ),
    ).toBe(false);

    // Restore membership for later tests that post in priv (none depend on it,
    // but leave fixtures consistent).
    await getPrisma().channelMembership.create({
      data: { id: randomUUID(), channelId: privId, userId: ritaId },
    });
  });

  it('hides notifications after group removal', async () => {
    const before = await ritaList({ limit: '50' });
    const groupMsgIds = new Set(
      (
        before.body.notifications as Array<{
          conversationId: string | null;
          messageId: string | null;
        }>
      )
        .filter((n) => n.conversationId === groupId && n.messageId)
        .map((n) => n.messageId as string),
    );
    expect(groupMsgIds.size).toBeGreaterThan(0);

    const removed = await owner
      .delete(`/api/direct-messages/${groupId}/participants/${ritaId}`)
      .set('Origin', ORIGIN);
    expect(removed.status).toBe(200);

    const after = await ritaList({ limit: '50' });
    for (const n of after.body.notifications as Array<{ messageId: string | null }>) {
      expect(n.messageId === null || !groupMsgIds.has(n.messageId)).toBe(true);
    }

    // Re-add for remaining tests (DM read-state checks below use the group).
    const readded = await owner
      .post(`/api/direct-messages/${groupId}/participants`)
      .set('Origin', ORIGIN)
      .send({ userId: ritaId });
    expect(readded.status).toBe(200);
  });

  it('hides cross-workspace sources without leaking', async () => {
    const prisma = getPrisma();
    const ws2channel = await prisma.channel.create({
      data: {
        id: randomUUID(),
        workspaceId: ws2,
        name: `leak ${RUN}`,
        slug: `leak-${RUN}`,
        createdById: xenaId,
      },
    });
    const planted = await prisma.notification.create({
      data: {
        id: randomUUID(),
        workspaceId: ws1,
        recipientUserId: ritaId,
        type: 'MENTION',
        actorUserId: xenaId,
        channelId: ws2channel.id,
        actorName: 'Xena',
      },
    });
    try {
      const res = await ritaList({ limit: '50' });
      expect(
        (res.body.notifications as Array<{ id: string }>).some((n) => n.id === planted.id),
      ).toBe(false);
    } finally {
      await prisma.notification.delete({ where: { id: planted.id } });
      await prisma.channel.delete({ where: { id: ws2channel.id } });
    }
  });

  // ---------- DELETED SOURCE ----------

  it('returns nulled-message history while the container stays accessible', async () => {
    const id = await owner
      .post(`/api/channels/${pubId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: `doomed ping @Rita ${RUN}` })
      .then((res) => {
        expect(res.status).toBe(201);
        return res.body.message.id as string;
      });
    await getPrisma().message.delete({ where: { id } });
    const res = await ritaList({ limit: '50' });
    const found = (
      res.body.notifications as Array<{ messageId: string | null; type: string }>
    ).filter((n) => n.messageId === null && n.type === 'MENTION');
    // At least the nulled row exists and listing did not crash.
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  // ---------- MARK ONE ----------

  it('marks own notifications read idempotently and isolates others', async () => {
    const ids = await ritaIds({ limit: '1', unreadOnly: 'true' });
    expect(ids.length).toBeGreaterThan(0);
    const target = ids[0];

    const first = await rita.post(`/api/workspaces/${ws1}/notifications/${target}/read`);
    expect(first.status).toBe(200);
    expect(first.body.notification.id).toBe(target);
    expect(first.body.notification.readAt).not.toBeNull();

    const row = await getPrisma().notification.findUniqueOrThrow({ where: { id: target } });
    expect(row.readAt).not.toBeNull();

    const second = await rita.post(`/api/workspaces/${ws1}/notifications/${target}/read`);
    expect(second.status).toBe(200);
    expect(second.body.notification.id).toBe(target);

    // Another user's row is indistinguishable from missing.
    const omarRow = await getPrisma().notification.findFirstOrThrow({
      where: { recipientUserId: omarId },
    });
    expect(
      (await rita.post(`/api/workspaces/${ws1}/notifications/${omarRow.id}/read`)).status,
    ).toBe(404);
    expect(
      (
        await omar.post(
          `/api/workspaces/${ws1}/notifications/${(await ritaIds({ limit: '1' }))[0]}/read`,
        )
      ).status,
    ).toBe(404);

    // Forged workspace + malformed id share the same 404.
    expect((await rita.post(`/api/workspaces/${ws2}/notifications/${target}/read`)).status).toBe(
      404,
    );
    expect((await rita.post(`/api/workspaces/${ws1}/notifications/not-a-uuid/read`)).status).toBe(
      404,
    );
  });

  it('leaves DM read state untouched when marking read', async () => {
    const prisma = getPrisma();
    const before = await prisma.directMessageReadState.findMany({
      where: { conversationId: { in: [dmId, groupId] } },
    });
    const ids = await ritaIds({ limit: '1', unreadOnly: 'true' });
    if (ids.length > 0) {
      await rita.post(`/api/workspaces/${ws1}/notifications/${ids[0]}/read`);
    }
    const after = await prisma.directMessageReadState.findMany({
      where: { conversationId: { in: [dmId, groupId] } },
    });
    expect(after).toEqual(before);
  });

  // ---------- MARK ALL (mutates Rita's unread set: keep last) ----------

  it('marks only the caller’s unread rows in the requested workspace', async () => {
    const prisma = getPrisma();
    // Seed an unread row for Omar and one in ws2 for Xena.
    const omarRow = await prisma.notification.create({
      data: {
        id: randomUUID(),
        workspaceId: ws1,
        recipientUserId: omarId,
        type: 'MENTION',
        actorUserId: await userIdFor('owner'),
        actorName: 'Owen',
      },
    });
    const xenaRow = await prisma.notification.create({
      data: {
        id: randomUUID(),
        workspaceId: ws2,
        recipientUserId: xenaId,
        type: 'MENTION',
        actorUserId: xenaId,
        actorName: 'Xena',
      },
    });
    const before = await ritaList({ limit: '50', unreadOnly: 'true' });
    const expected = (before.body.notifications as unknown[]).length;
    expect(expected).toBeGreaterThan(0);

    const res = await rita.post(`/api/workspaces/${ws1}/notifications/read-all`);
    expect(res.status).toBe(200);
    expect(res.body.updatedCount).toBe(expected);

    const after = await ritaList({ limit: '50', unreadOnly: 'true' });
    expect(after.body.notifications).toEqual([]);

    // Untouched: Omar's row, Xena's ws2 row, and already-read rows.
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: omarRow.id } })).readAt,
    ).toBeNull();
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: xenaRow.id } })).readAt,
    ).toBeNull();
    await prisma.notification.deleteMany({ where: { id: { in: [omarRow.id, xenaRow.id] } } });

    const statesBefore = await prisma.directMessageReadState.findMany({
      where: { conversationId: { in: [dmId, groupId] } },
    });
    await rita.post(`/api/workspaces/${ws1}/notifications/read-all`);
    const statesAfter = await prisma.directMessageReadState.findMany({
      where: { conversationId: { in: [dmId, groupId] } },
    });
    expect(statesAfter).toEqual(statesBefore);
  });
});

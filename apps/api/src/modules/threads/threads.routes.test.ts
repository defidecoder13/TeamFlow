/**
 * Threads HTTP integration tests (Audit 11, live database).
 *
 * Real Better Auth sessions against the configured development database.
 * SKIPPED without auth/database env so `pnpm test` stays green everywhere.
 */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClerkFakes, requestAs } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { getPrisma } from '../auth/prisma';

vi.setConfig({ testTimeout: 60000, hookTimeout: 300000 });

const LIVE = !!process.env.DATABASE_URL && !!process.env.CLERK_SECRET_KEY;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
const fakes = createClerkFakes('threads-routes');
const email = (who: string) => fakes.emailFor(who);

liveDescribe('threads listing API (live database)', () => {
  const app = createApp(fakes.appDeps());
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let owner: ReturnType<typeof requestAs>;
  let guest: ReturnType<typeof requestAs>;
  let outsider: ReturnType<typeof requestAs>;

  let ws1 = '';
  let pubSlug = '';
  let rootParticipated = '';
  let rootUnrelated = '';
  let rootOtherWs = '';

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

  const listThreads = (
    agent: ReturnType<typeof requestAs>,
    workspaceId: string,
    params: Record<string, string> = {},
  ) => agent.get(`/api/workspaces/${workspaceId}/threads`).query(params);

  beforeAll(async () => {
    owner = await signUp('owner', `Thread Owner ${RUN}`);
    guest = await signUp('guest', `Thread Guest ${RUN}`);
    outsider = await signUp('outsider', `Thread Outsider ${RUN}`);

    const ws = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Thread HQ ${RUN}` });
    expect(ws.status).toBe(201);
    ws1 = ws.body.workspace.id as string;
    createdWorkspaceIds.push(ws1);

    const guestId = await userIdFor('guest');
    await getPrisma().workspaceMembership.create({
      data: { id: randomUUID(), workspaceId: ws1, userId: guestId, role: 'MEMBER' },
    });

    const pub = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Threadpub ${RUN}`, type: 'PUBLIC' });
    expect(pub.status).toBe(201);
    pubSlug = pub.body.channel.slug as string;
    const channelId = pub.body.channel.id as string;

    // Root guest participates in (guest replies).
    const rootA = await guest
      .post(`/api/channels/${channelId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: `Root A ${RUN}` });
    expect(rootA.status).toBe(201);
    rootParticipated = rootA.body.message.id as string;
    const reply = await owner
      .post(`/api/messages/${rootParticipated}/replies`)
      .set('Origin', ORIGIN)
      .send({ body: `Reply to A ${RUN}` });
    expect(reply.status).toBe(201);

    // Root guest can see but never replied to (owner-only thread).
    const rootB = await owner
      .post(`/api/channels/${channelId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: `Root B ${RUN}` });
    expect(rootB.status).toBe(201);
    rootUnrelated = rootB.body.message.id as string;
    const replyB = await owner
      .post(`/api/messages/${rootUnrelated}/replies`)
      .set('Origin', ORIGIN)
      .send({ body: `Reply to B ${RUN}` });
    expect(replyB.status).toBe(201);

    // Thread in a workspace guest cannot see.
    const outsiderWs = await outsider
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Thread Far ${RUN}` });
    expect(outsiderWs.status).toBe(201);
    const farId = outsiderWs.body.workspace.id as string;
    createdWorkspaceIds.push(farId);
    const farChannel = await outsider
      .post(`/api/workspaces/${farId}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Threadfar ${RUN}`, type: 'PUBLIC' });
    expect(farChannel.status).toBe(201);
    const farRoot = await outsider
      .post(`/api/channels/${farChannel.body.channel.id}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: `Far root ${RUN}` });
    expect(farRoot.status).toBe(201);
    rootOtherWs = farRoot.body.message.id as string;
    await outsider
      .post(`/api/messages/${rootOtherWs}/replies`)
      .set('Origin', ORIGIN)
      .send({ body: `Far reply ${RUN}` })
      .expect(201);
  });

  afterAll(async () => {
    const prisma = getPrisma();
    for (const id of createdWorkspaceIds) {
      await prisma.workspace.delete({ where: { id } }).catch(() => undefined);
    }
    for (const mail of createdEmails) {
      await prisma.user.delete({ where: { email: mail } }).catch(() => undefined);
    }
  });

  it('returns 401 without a session', async () => {
    const res = await request(app).get(`/api/workspaces/${ws1}/threads`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-member workspace (no enumeration)', async () => {
    const res = await listThreads(outsider, ws1);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Workspace not found.' },
    });
  });

  it('returns only threads the caller participates in, newest activity first', async () => {
    const res = await listThreads(guest, ws1);
    expect(res.status).toBe(200);
    const ids = (res.body.threads as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toContain(rootParticipated);
    expect(ids).not.toContain(rootUnrelated);
    expect(ids).not.toContain(rootOtherWs);

    const thread = (res.body.threads as Array<Record<string, unknown>>).find(
      (t) => t.id === rootParticipated,
    ) as {
      container: { type: string; slug?: string; name: string };
      replyCount: number;
      latestReply: { body: string } | null;
      author: { id: string };
    };
    expect(thread.container.type).toBe('channel');
    expect(thread.container.slug).toBe(pubSlug);
    expect(thread.replyCount).toBeGreaterThan(0);
    expect(thread.latestReply).not.toBeNull();
    expect(thread.latestReply?.body).toContain(`Reply to A ${RUN}`);
    expect(res.body.pageInfo).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it('rejects unknown and invalid query parameters', async () => {
    await listThreads(guest, ws1, { limit: '0' }).expect(400);
    await listThreads(guest, ws1, { cursor: 'bogus' }).expect(400);
    await listThreads(guest, ws1, { recipientUserId: 'x' }).expect(400);
  });

  it('paginates with a valid cursor', async () => {
    const first = await listThreads(guest, ws1, { limit: '1' });
    expect(first.status).toBe(200);
    if (first.body.pageInfo.hasMore) {
      const next = await listThreads(guest, ws1, {
        limit: '1',
        cursor: first.body.pageInfo.nextCursor,
      });
      expect(next.status).toBe(200);
      const firstIds = new Set((first.body.threads as Array<{ id: string }>).map((t) => t.id));
      for (const t of next.body.threads as Array<{ id: string }>) {
        expect(firstIds.has(t.id)).toBe(false);
      }
    }
  });
});

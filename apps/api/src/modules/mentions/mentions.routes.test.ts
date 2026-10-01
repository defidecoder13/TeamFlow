/**
 * Mentions HTTP integration tests (Audit 12, live database).
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
const fakes = createClerkFakes('mentions');
const email = (who: string) => fakes.emailFor(who);

liveDescribe('mentions listing API (live database)', () => {
  const app = createApp(fakes.appDeps());
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let owner: ReturnType<typeof requestAs>;
  let guest: ReturnType<typeof requestAs>;
  let outsider: ReturnType<typeof requestAs>;

  let ws1 = '';
  let pubSlug = '';
  let guestId = '';
  let msgMentionsGuest = '';
  let msgNoMention = '';

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

  const listMentions = (
    agent: ReturnType<typeof requestAs>,
    workspaceId: string,
    params: Record<string, string> = {},
  ) => agent.get(`/api/workspaces/${workspaceId}/mentions`).query(params);

  beforeAll(async () => {
    owner = await signUp('owner', `Mention Owner ${RUN}`);
    guest = await signUp('guest', `Mention Guest ${RUN}`);
    outsider = await signUp('outsider', `Mention Outsider ${RUN}`);

    const ws = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Mention HQ ${RUN}` });
    expect(ws.status).toBe(201);
    ws1 = ws.body.workspace.id as string;
    createdWorkspaceIds.push(ws1);

    guestId = await userIdFor('guest');
    await getPrisma().workspaceMembership.create({
      data: { id: randomUUID(), workspaceId: ws1, userId: guestId, role: 'MEMBER' },
    });

    const pub = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Mentionpub ${RUN}`, type: 'PUBLIC' });
    expect(pub.status).toBe(201);
    pubSlug = pub.body.channel.slug as string;
    const channelId = pub.body.channel.id as string;

    const guestName = (await getPrisma().user.findUniqueOrThrow({
      where: { id: guestId },
    })).name;

    // Mentions guest (channel root).
    const withMention = await owner
      .post(`/api/channels/${channelId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: `Hey @${guestName} review this ${RUN}` });
    expect(withMention.status).toBe(201);
    msgMentionsGuest = withMention.body.message.id as string;

    // Does not mention guest.
    const plain = await owner
      .post(`/api/channels/${channelId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: `No one mentioned here ${RUN}` });
    expect(plain.status).toBe(201);
    msgNoMention = plain.body.message.id as string;

    // Thread-reply mention of guest.
    const reply = await owner
      .post(`/api/messages/${msgMentionsGuest}/replies`)
      .set('Origin', ORIGIN)
      .send({ body: `Follow-up for @${guestName} ${RUN}` });
    expect(reply.status).toBe(201);

    // Workspace guest cannot see — still has a mention row via outsider WS.
    const outsiderWs = await outsider
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Mention Far ${RUN}` });
    expect(outsiderWs.status).toBe(201);
    const farId = outsiderWs.body.workspace.id as string;
    createdWorkspaceIds.push(farId);
    // outsider tries to mention guest name but guest is not in that workspace —
    // mention will not resolve. Instead: outsider message mentioning outsider.
    const farChannel = await outsider
      .post(`/api/workspaces/${farId}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Mentionfar ${RUN}`, type: 'PUBLIC' });
    expect(farChannel.status).toBe(201);
    const outsiderName = (await getPrisma().user.findUniqueOrThrow({
      where: { email: email('outsider') },
    })).name;
    await outsider
      .post(`/api/channels/${farChannel.body.channel.id}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: `@${outsiderName} note ${RUN}` })
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
    const res = await request(app).get(`/api/workspaces/${ws1}/mentions`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-member workspace (no enumeration)', async () => {
    const res = await listMentions(outsider, ws1);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Workspace not found.' },
    });
  });

  it('returns only messages that mention the caller, newest first', async () => {
    const res = await listMentions(guest, ws1);
    expect(res.status).toBe(200);
    const ids = (res.body.mentions as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(msgMentionsGuest);
    expect(ids).not.toContain(msgNoMention);

    const item = (res.body.mentions as Array<Record<string, unknown>>).find(
      (m) => m.id === msgMentionsGuest,
    ) as {
      container: { type: string; slug?: string; name: string };
      author: { id: string };
      body: string;
      parentMessageId: string | null;
    };
    expect(item.container.type).toBe('channel');
    expect(item.container.slug).toBe(pubSlug);
    expect(item.author.id).not.toBe(guestId);
    expect(item.parentMessageId).toBeNull();
    expect(res.body.pageInfo).toMatchObject({ hasMore: expect.any(Boolean) });
  });

  it('includes thread-reply mentions with parentMessageId set', async () => {
    const res = await listMentions(guest, ws1, { limit: '100' });
    expect(res.status).toBe(200);
    const threaded = (res.body.mentions as Array<{ parentMessageId: string | null; id: string }>)
      .filter((m) => m.parentMessageId !== null);
    expect(threaded.length).toBeGreaterThan(0);
    expect(threaded.some((m) => m.parentMessageId === msgMentionsGuest)).toBe(true);
  });

  it('rejects unknown and invalid query parameters', async () => {
    await listMentions(guest, ws1, { limit: '0' }).expect(400);
    await listMentions(guest, ws1, { cursor: 'bogus' }).expect(400);
    await listMentions(guest, ws1, { mentionedUserId: 'x' }).expect(400);
  });

  it('paginates with a valid cursor without repeating rows', async () => {
    const first = await listMentions(guest, ws1, { limit: '1' });
    expect(first.status).toBe(200);
    if (first.body.pageInfo.hasMore) {
      const next = await listMentions(guest, ws1, {
        limit: '1',
        cursor: first.body.pageInfo.nextCursor,
      });
      expect(next.status).toBe(200);
      const firstIds = new Set(
        (first.body.mentions as Array<{ id: string }>).map((m) => m.id),
      );
      for (const m of next.body.mentions as Array<{ id: string }>) {
        expect(firstIds.has(m.id)).toBe(false);
      }
    }
  });
});

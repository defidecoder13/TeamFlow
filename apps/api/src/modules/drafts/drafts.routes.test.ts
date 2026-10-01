/**
 * Drafts HTTP integration tests (Audit 13, live database).
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

const fakes = createClerkFakes(`drafts-${RUN}`);
const email = (who: string) => fakes.emailFor(who);

liveDescribe('drafts API (live database)', () => {
  const app = createApp(fakes.appDeps());
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let owner: ReturnType<typeof requestAs>;
  let guest: ReturnType<typeof requestAs>;
  let outsider: ReturnType<typeof requestAs>;

  let ws1 = '';
  let channelId = '';
  let channelSlug = '';

  async function signUp(who: string, name: string): Promise<ReturnType<typeof requestAs>> {
    fakes.setProfile(who, { name });
    createdEmails.push(email(who));
    // First sight provisions the local user row through the fake directory.
    const me = await request(app).get('/api/me').set(fakes.headersFor(who));
    expect(me.status).toBe(200);
    return requestAs(app, fakes, who);
  }

  const draftsUrl = (workspaceId: string) => `/api/workspaces/${workspaceId}/drafts`;

  const putDraft = (
    agent: ReturnType<typeof requestAs>,
    workspaceId: string,
    body: unknown,
  ) =>
    agent
      .put(draftsUrl(workspaceId))
      .set('Origin', ORIGIN)
      .send(body as Record<string, unknown>);

  beforeAll(async () => {
    owner = await signUp('owner', `Draft Owner ${RUN}`);
    guest = await signUp('guest', `Draft Guest ${RUN}`);
    outsider = await signUp('outsider', `Draft Outsider ${RUN}`);

    const ws = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Draft HQ ${RUN}` });
    expect(ws.status).toBe(201);
    ws1 = ws.body.workspace.id as string;
    createdWorkspaceIds.push(ws1);

    const guestUser = await getPrisma().user.findUniqueOrThrow({
      where: { email: email('guest') },
    });
    await getPrisma().workspaceMembership.create({
      data: { id: randomUUID(), workspaceId: ws1, userId: guestUser.id, role: 'MEMBER' },
    });

    const pub = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Draftpub ${RUN}`, type: 'PUBLIC' });
    expect(pub.status).toBe(201);
    channelId = pub.body.channel.id as string;
    channelSlug = pub.body.channel.slug as string;
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
    const res = await request(app).get(draftsUrl(ws1));
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-member workspace (no enumeration)', async () => {
    const res = await outsider.get(draftsUrl(ws1)).set('Origin', ORIGIN);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Workspace not found.' },
    });
  });

  it('rejects invalid draft bodies', async () => {
    await putDraft(owner, ws1, { targetKind: 'NOPE', targetId: 'x', body: 'hi' }).expect(400);
    await putDraft(owner, ws1, { targetKind: 'CHANNEL', targetId: '', body: 'hi' }).expect(400);
    await putDraft(owner, ws1, {
      targetKind: 'CHANNEL',
      targetId: channelId,
      body: 'x'.repeat(10001),
    }).expect(400);
    await putDraft(owner, ws1, {
      targetKind: 'CHANNEL',
      targetId: channelId,
      body: 'hi',
      unexpected: true,
    }).expect(400);
  });

  it('403s when writing a draft for an inaccessible channel', async () => {
    const res = await putDraft(guest, ws1, {
      targetKind: 'CHANNEL',
      targetId: randomUUID(),
      body: 'nope',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('saves, lists, updates, and clears a channel draft', async () => {
    const saved = await putDraft(owner, ws1, {
      targetKind: 'CHANNEL',
      targetId: channelId,
      body: '  Ship the drafts page  ',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.draft).toMatchObject({
      body: 'Ship the drafts page',
      targetKind: 'CHANNEL',
      targetId: channelId,
      container: { type: 'channel', id: channelId, slug: channelSlug },
    });

    const list = await owner.get(draftsUrl(ws1)).set('Origin', ORIGIN);
    expect(list.status).toBe(200);
    const rows = list.body.drafts as Array<{ id: string; body: string }>;
    expect(rows.some((d) => d.body === 'Ship the drafts page')).toBe(true);

    // Same target upserts (no second row for same key).
    const updated = await putDraft(owner, ws1, {
      targetKind: 'CHANNEL',
      targetId: channelId,
      body: 'Ship the drafts page today',
    });
    expect(updated.status).toBe(200);

    const afterUpdate = await owner.get(draftsUrl(ws1)).set('Origin', ORIGIN);
    const channelRows = (
      afterUpdate.body.drafts as Array<{ targetId: string; body: string }>
    ).filter((d) => d.targetId === channelId);
    expect(channelRows).toHaveLength(1);
    expect(channelRows[0].body).toBe('Ship the drafts page today');

    // Empty body clears without creating a row.
    const cleared = await putDraft(owner, ws1, {
      targetKind: 'CHANNEL',
      targetId: channelId,
      body: '   ',
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.draft).toBeNull();

    const afterClear = await owner.get(draftsUrl(ws1)).set('Origin', ORIGIN);
    expect(
      (afterClear.body.drafts as Array<{ targetId: string }>).filter(
        (d) => d.targetId === channelId,
      ),
    ).toHaveLength(0);
  });

  it('scopes drafts per user', async () => {
    await putDraft(owner, ws1, {
      targetKind: 'CHANNEL',
      targetId: channelId,
      body: 'owner private draft',
    }).expect(200);

    const guestList = await guest.get(draftsUrl(ws1)).set('Origin', ORIGIN);
    expect(guestList.status).toBe(200);
    expect(guestList.body.drafts).toHaveLength(0);

    await putDraft(guest, ws1, {
      targetKind: 'CHANNEL',
      targetId: channelId,
      body: 'guest private draft',
    }).expect(200);

    const ownerList = await owner.get(draftsUrl(ws1)).set('Origin', ORIGIN);
    const ownerBodies = (ownerList.body.drafts as Array<{ body: string }>).map((d) => d.body);
    expect(ownerBodies).toContain('owner private draft');
    expect(ownerBodies).not.toContain('guest private draft');
  });

  it('discards a caller draft and 404s for unknown ids', async () => {
    const saved = await putDraft(owner, ws1, {
      targetKind: 'CHANNEL',
      targetId: channelId,
      body: 'discard me',
    });
    const draftId = saved.body.draft.id as string;

    // Guest cannot discard owner's draft.
    await guest
      .delete(`${draftsUrl(ws1)}/${draftId}`)
      .set('Origin', ORIGIN)
      .expect(404);

    await owner.delete(`${draftsUrl(ws1)}/${draftId}`).set('Origin', ORIGIN).expect(204);
    await owner.delete(`${draftsUrl(ws1)}/${draftId}`).set('Origin', ORIGIN).expect(404);

    const list = await owner.get(draftsUrl(ws1)).set('Origin', ORIGIN);
    expect((list.body.drafts as Array<{ id: string }>).some((d) => d.id === draftId)).toBe(
      false,
    );
  });

  it('ships a channel slug the drafts Resume path can navigate to', async () => {
    // Guards the DraftsView resumePath contract: channel drafts carry a slug.
    const saved = await putDraft(owner, ws1, {
      targetKind: 'CHANNEL',
      targetId: channelId,
      body: 'resume me',
    });
    expect(saved.body.draft.container.slug).toBe(channelSlug);
    await owner
      .delete(`${draftsUrl(ws1)}/${saved.body.draft.id as string}`)
      .set('Origin', ORIGIN)
      .expect(204);
  });
});

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { getPrisma } from '../auth/prisma';

// Live-database roundtrips (Neon pooler) take seconds per request — mostly
// Better Auth session validation. Unit tests stay fast; only this file is slow.
vi.setConfig({ testTimeout: 45000, hookTimeout: 180000 });

/**
 * Channel API integration tests (Phase 3A, backend only).
 *
 * Real Better Auth sessions against the configured development database.
 * SKIPPED without auth/database env so `pnpm test` stays green everywhere.
 * Fixtures use unique run-scoped names and are removed in `afterAll`.
 */

const LIVE =
  !!process.env.DATABASE_URL && !!process.env.BETTER_AUTH_SECRET && !!process.env.BETTER_AUTH_URL;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = process.env.BETTER_AUTH_URL ?? 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
const email = (who: string) => `ws3a-${RUN}-${who}@example.invalid`;
const PASSWORD = 'channel-test-password-0123456789';

liveDescribe('channel API (live database)', () => {
  const app = createApp();
  const api = () => request(app);
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let ws1 = '';
  let ws2 = '';

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
  let admin: ReturnType<typeof request.agent>;
  let member: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;
  let second: ReturnType<typeof request.agent>;

  async function userIdFor(who: string): Promise<string> {
    const user = await getPrisma().user.findUniqueOrThrow({ where: { email: email(who) } });
    return user.id;
  }

  async function createChannel(
    agent: ReturnType<typeof request.agent>,
    workspaceId: string,
    body: Record<string, unknown>,
  ) {
    return agent.post(`/api/workspaces/${workspaceId}/channels`).set('Origin', ORIGIN).send(body);
  }

  beforeAll(async () => {
    owner = await signUp('owner', 'Ch Owner');
    admin = await signUp('admin', 'Ch Admin');
    member = await signUp('member', 'Ch Member');
    outsider = await signUp('outsider', 'Ch Outsider');
    second = await signUp('second', 'Ch Second');

    const res = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Channel HQ ${RUN}` });
    expect(res.status).toBe(201);
    ws1 = res.body.workspace.id as string;
    createdWorkspaceIds.push(ws1);

    const prisma = getPrisma();
    await prisma.workspaceMembership.create({
      data: { id: randomUUID(), workspaceId: ws1, userId: await userIdFor('admin'), role: 'ADMIN' },
    });
    await prisma.workspaceMembership.create({
      data: {
        id: randomUUID(),
        workspaceId: ws1,
        userId: await userIdFor('member'),
        role: 'MEMBER',
      },
    });

    const other = await second
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Channel Far ${RUN}` });
    expect(other.status).toBe(201);
    ws2 = other.body.workspace.id as string;
    createdWorkspaceIds.push(ws2);
  }, 180000);

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

  it('creates public channels in the correct workspace', async () => {
    const res = await createChannel(owner, ws1, { name: `Engineering ${RUN}`, type: 'PUBLIC' });
    expect(res.status).toBe(201);
    expect(res.body.channel).toMatchObject({
      name: `Engineering ${RUN}`,
      slug: `engineering-${RUN.toLowerCase()}`,
      type: 'PUBLIC',
    });

    const listed = await owner.get(`/api/workspaces/${ws1}/channels`);
    expect((listed.body.channels as { id: string }[]).map((c) => c.id)).toContain(
      res.body.channel.id as string,
    );
    const other = await second.get(`/api/workspaces/${ws2}/channels`);
    expect((other.body.channels as { id: string }[]).map((c) => c.id)).not.toContain(
      res.body.channel.id as string,
    );
  });

  it('creates private channels with the creator as member', async () => {
    const res = await createChannel(owner, ws1, { name: `Secret ${RUN}`, type: 'PRIVATE' });
    expect(res.status).toBe(201);
    expect(res.body.channel.type).toBe('PRIVATE');

    const memberships = await getPrisma().channelMembership.findMany({
      where: { channelId: res.body.channel.id as string },
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.userId).toBe(await userIdFor('owner'));
  });

  it('allows the same channel name in different workspaces', async () => {
    const name = `Shared ${RUN}`;
    const first = await createChannel(owner, ws1, { name, type: 'PUBLIC' });
    const secondRes = await createChannel(second, ws2, { name, type: 'PUBLIC' });
    expect(first.status).toBe(201);
    expect(secondRes.status).toBe(201);
    expect(first.body.channel.slug).toBe(secondRes.body.channel.slug);
  });

  it('rejects duplicate channel names in the same workspace with 409', async () => {
    const name = `Taken ${RUN}`;
    const first = await createChannel(owner, ws1, { name });
    expect(first.status).toBe(201);
    const secondRes = await createChannel(owner, ws1, { name });
    expect(secondRes.status).toBe(409);
    expect(secondRes.body.error.code).toBe('CONFLICT');
  });

  // ---------- Creation ----------

  it('lets OWNER, ADMIN, and MEMBER create public channels', async () => {
    for (const [agent, tag] of [
      [owner, 'own'],
      [admin, 'adm'],
      [member, 'mem'],
    ] as const) {
      const res = await createChannel(agent, ws1, { name: `By ${tag} ${RUN}` });
      expect(res.status).toBe(201);
    }
    const row = await getPrisma().channel.findFirstOrThrow({
      where: { workspaceId: ws1, name: `By mem ${RUN}` },
    });
    expect(row.createdById).toBe(await userIdFor('member'));
  });

  it('rejects creation for outsiders and strangers', async () => {
    expect((await createChannel(outsider, ws1, { name: `Nope ${RUN}` })).status).toBe(404);
    expect((await createChannel(member, ws2, { name: `Nope ${RUN}` })).status).toBe(404);
    expect(
      (
        await api()
          .post(`/api/workspaces/${ws1}/channels`)
          .set('Origin', ORIGIN)
          .send({ name: `Nope ${RUN}` })
      ).status,
    ).toBe(401);
  });

  it('validates channel names and types', async () => {
    for (const body of [
      {},
      { name: '' },
      { name: '   ' },
      { name: 'a'.repeat(81) },
      { name: `Ok ${RUN}`, type: 'SECRET' },
      { name: `Ok ${RUN}`, description: 'a'.repeat(251) },
      { name: 42 },
    ]) {
      const res = await createChannel(owner, ws1, body as Record<string, unknown>);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('rejects client-supplied identity and addressing fields', async () => {
    for (const payload of [
      { name: `Hijack ${RUN}`, slug: 'hijacked' },
      { name: `Hijack ${RUN}`, createdById: 'someone-else' },
      { name: `Hijack ${RUN}`, workspaceId: ws2 },
      { name: `Hijack ${RUN}`, userId: 'someone-else' },
      { name: `Hijack ${RUN}`, role: 'OWNER' },
    ]) {
      const res = await createChannel(owner, ws1, payload);
      expect(res.status).toBe(400);
    }
  });

  // ---------- Listing ----------

  it('lists public channels deterministically without leaking private ones', async () => {
    const ws = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({
        name: `Order ${RUN}`,
      });
    expect(ws.status).toBe(201);
    const orderWs = ws.body.workspace.id as string;
    createdWorkspaceIds.push(orderWs);

    for (const name of [`Zulu ${RUN}`, `Alpha ${RUN}`, `Mike ${RUN}`]) {
      const res = await createChannel(owner, orderWs, { name });
      expect(res.status).toBe(201);
    }
    const secret = await createChannel(owner, orderWs, {
      name: `Hidden ${RUN}`,
      type: 'PRIVATE',
    });
    expect(secret.status).toBe(201);

    const listed = await member.get(`/api/workspaces/${orderWs}/channels`);
    expect(listed.status).toBe(404);

    const ownerList = await owner.get(`/api/workspaces/${orderWs}/channels`);
    const names = (ownerList.body.channels as { name: string }[]).map((c) => c.name);
    expect(names).toEqual([`Alpha ${RUN}`, `Hidden ${RUN}`, `Mike ${RUN}`, `Zulu ${RUN}`]);
  });

  it('rejects listing for outsiders and strangers', async () => {
    expect((await outsider.get(`/api/workspaces/${ws1}/channels`)).status).toBe(404);
    expect((await api().get(`/api/workspaces/${ws1}/channels`)).status).toBe(401);
  });

  // ---------- Detail ----------

  it('retrieves public channels for members and 404s everyone else', async () => {
    const created = await createChannel(owner, ws1, { name: `Open ${RUN}` });
    const slug = created.body.channel.slug as string;

    expect((await member.get(`/api/workspaces/${ws1}/channels/${slug}`)).status).toBe(200);
    expect((await outsider.get(`/api/workspaces/${ws1}/channels/${slug}`)).status).toBe(404);
    expect((await api().get(`/api/workspaces/${ws1}/channels/${slug}`)).status).toBe(401);
    expect((await second.get(`/api/workspaces/${ws2}/channels/${slug}`)).status).toBe(404);
  });

  it('restricts private channels to channel members without leaking', async () => {
    const created = await createChannel(owner, ws1, {
      name: `Vault ${RUN}`,
      type: 'PRIVATE',
    });
    const slug = created.body.channel.slug as string;

    expect((await owner.get(`/api/workspaces/${ws1}/channels/${slug}`)).status).toBe(200);
    expect((await member.get(`/api/workspaces/${ws1}/channels/${slug}`)).status).toBe(404);
    expect((await admin.get(`/api/workspaces/${ws1}/channels/${slug}`)).status).toBe(404);

    const listed = await member.get(`/api/workspaces/${ws1}/channels`);
    const slugs = (listed.body.channels as { slug: string }[]).map((c) => c.slug);
    expect(slugs).not.toContain(slug);
  });

  // ---------- Update ----------

  it('lets OWNER, ADMIN, and creators update; blocks everyone else', async () => {
    const created = await createChannel(member, ws1, { name: `Mine ${RUN}` });
    const slug = created.body.channel.slug as string;
    const other = await createChannel(owner, ws1, { name: `Theirs ${RUN}` });
    const otherSlug = other.body.channel.slug as string;

    const byOwner = await owner
      .patch(`/api/workspaces/${ws1}/channels/${slug}`)
      .set('Origin', ORIGIN)
      .send({ description: 'Touched by owner' });
    expect(byOwner.status).toBe(200);

    const byAdmin = await admin
      .patch(`/api/workspaces/${ws1}/channels/${otherSlug}`)
      .set('Origin', ORIGIN)
      .send({ name: `Theirs Renamed ${RUN}` });
    expect(byAdmin.status).toBe(200);
    const renamedOtherSlug = byAdmin.body.channel.slug as string;

    const byCreator = await member
      .patch(`/api/workspaces/${ws1}/channels/${slug}`)
      .set('Origin', ORIGIN)
      .send({ description: 'Touched by creator' });
    expect(byCreator.status).toBe(200);

    expect(
      (
        await member
          .patch(`/api/workspaces/${ws1}/channels/${renamedOtherSlug}`)
          .set('Origin', ORIGIN)
          .send({ description: 'Nope' })
      ).status,
    ).toBe(403);
    expect(
      (
        await outsider
          .patch(`/api/workspaces/${ws1}/channels/${slug}`)
          .set('Origin', ORIGIN)
          .send({ description: 'Nope' })
      ).status,
    ).toBe(404);
  });

  it('regenerates slugs on rename and rejects taken names with 409', async () => {
    const first = await createChannel(owner, ws1, { name: `First ${RUN}` });
    const clash = await createChannel(owner, ws1, { name: `Clash ${RUN}` });

    const renamed = await owner
      .patch(`/api/workspaces/${ws1}/channels/${first.body.channel.slug as string}`)
      .set('Origin', ORIGIN)
      .send({ name: `Renamed ${RUN}` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.channel.slug).toBe(`renamed-${RUN.toLowerCase()}`);

    const conflicted = await owner
      .patch(`/api/workspaces/${ws1}/channels/${renamed.body.channel.slug as string}`)
      .set('Origin', ORIGIN)
      .send({ name: `Clash ${RUN}` });
    expect(conflicted.status).toBe(409);
    expect(conflicted.body.error.code).toBe('CONFLICT');

    // The failed rename left the channel untouched.
    const unchanged = await owner.get(
      `/api/workspaces/${ws1}/channels/${renamed.body.channel.slug as string}`,
    );
    expect(unchanged.status).toBe(200);
    expect(unchanged.body.channel.name).toBe(`Renamed ${RUN}`);

    // The conflicting channel is intact under its own slug.
    const intact = await owner.get(
      `/api/workspaces/${ws1}/channels/${clash.body.channel.slug as string}`,
    );
    expect(intact.status).toBe(200);

    expect(
      (
        await owner
          .patch(`/api/workspaces/${ws1}/channels/${renamed.body.channel.slug as string}`)
          .set('Origin', ORIGIN)
          .send({ name: `Renamed ${RUN}`, type: 'PRIVATE', workspaceId: ws2 })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner
          .patch(`/api/workspaces/${ws1}/channels/${renamed.body.channel.slug as string}`)
          .set('Origin', ORIGIN)
          .send({})
      ).status,
    ).toBe(400);
  });

  // ---------- Security ----------

  it('exposes only safe channel fields', async () => {
    const created = await createChannel(owner, ws1, {
      name: `Safe ${RUN}`,
      description: 'Just a channel',
    });
    const slug = created.body.channel.slug as string;
    const detail = await member.get(`/api/workspaces/${ws1}/channels/${slug}`);
    expect(Object.keys(detail.body.channel).sort()).toEqual([
      'createdAt',
      'description',
      'id',
      'name',
      'slug',
      'type',
      'updatedAt',
    ]);
    const serialized = JSON.stringify(detail.body).toLowerCase();
    for (const leaked of ['createdby', 'password', 'token', 'secret', 'membership']) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it('enforces tenant isolation on private channel updates', async () => {
    const created = await createChannel(owner, ws1, {
      name: `Walled ${RUN}`,
      type: 'PRIVATE',
    });
    const slug = created.body.channel.slug as string;
    expect(
      (
        await second
          .patch(`/api/workspaces/${ws2}/channels/${slug}`)
          .set('Origin', ORIGIN)
          .send({ description: 'Nope' })
      ).status,
    ).toBe(404);
  });

  it('prevents duplicate channel memberships at the database level', async () => {
    const created = await createChannel(owner, ws1, {
      name: `Solo ${RUN}`,
      type: 'PRIVATE',
    });
    const channelId = created.body.channel.id as string;
    await expect(
      getPrisma().channelMembership.create({
        data: { id: randomUUID(), channelId, userId: await userIdFor('owner') },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await getPrisma().channelMembership.count({ where: { channelId } })).toBe(1);
  });
});

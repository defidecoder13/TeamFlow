import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { getPrisma } from '../auth/prisma';

// Live-database roundtrips (Neon pooler) take seconds per request — mostly
// Better Auth session validation. Unit tests stay fast; only this file is slow.
vi.setConfig({ testTimeout: 30000, hookTimeout: 120000 });

/**
 * Workspace API integration tests (Phase 2A).
 *
 * These run against the configured development database (the same Neon
 * database the migration was applied to) with real Better Auth sessions.
 * They are SKIPPED when auth/database env is absent (e.g. CI without secrets)
 * so `pnpm test` stays green everywhere. Run locally with the project `.env`
 * exported: `set -a; source .env; set +a; pnpm --filter @teamflow/api test`.
 *
 * All fixtures use unique run-scoped emails and are removed in `afterAll`.
 */

const LIVE =
  !!process.env.DATABASE_URL && !!process.env.BETTER_AUTH_SECRET && !!process.env.BETTER_AUTH_URL;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = process.env.BETTER_AUTH_URL ?? 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const email = (who: string) => `ws2a-${RUN}-${who}@example.invalid`;
const PASSWORD = 'workspace-test-password-0123456789';

liveDescribe('workspace API (live database)', () => {
  const app = createApp();
  const api = () => request(app);
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let ws1 = '';
  let ws1Slug = '';

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
  let otherOwner: ReturnType<typeof request.agent>;

  async function userIdFor(who: string): Promise<string> {
    const user = await getPrisma().user.findUniqueOrThrow({ where: { email: email(who) } });
    return user.id;
  }

  beforeAll(async () => {
    owner = await signUp('owner', 'Ws Owner');
    admin = await signUp('admin', 'Ws Admin');
    member = await signUp('member', 'Ws Member');
    outsider = await signUp('outsider', 'Ws Outsider');
    otherOwner = await signUp('other', 'Ws Other');

    const res = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Acme Studio ${RUN}` });
    expect(res.status).toBe(201);
    ws1 = res.body.workspace.id as string;
    ws1Slug = res.body.workspace.slug as string;
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

    const other = await otherOwner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Other Place ${RUN}` });
    expect(other.status).toBe(201);
    createdWorkspaceIds.push(other.body.workspace.id as string);
  }, 60000);

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

  it('rejects unauthenticated workspace creation with 401', async () => {
    const res = await api().post('/api/workspaces').set('Origin', ORIGIN).send({ name: 'Nope' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
    });
  });

  it('creates a workspace with the creator as OWNER and a slug', async () => {
    const res = await owner.post('/api/workspaces').set('Origin', ORIGIN).send({ name: 'New Co' });
    expect(res.status).toBe(201);
    expect(res.body.workspace).toMatchObject({ name: 'New Co', role: 'OWNER' });
    expect(typeof res.body.workspace.slug).toBe('string');
    createdWorkspaceIds.push(res.body.workspace.id as string);

    const membership = await getPrisma().workspaceMembership.findFirstOrThrow({
      where: { workspaceId: res.body.workspace.id as string },
    });
    expect(membership.role).toBe('OWNER');
    const user = await getPrisma().user.findUniqueOrThrow({
      where: { email: email('owner') },
    });
    expect(membership.userId).toBe(user.id);
  });

  it('rejects session-identity override fields instead of applying them', async () => {
    const res = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: 'Hijack Attempt', userId: 'someone-else', role: 'ADMIN' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
    });
  });

  it('validates workspace names', async () => {
    for (const name of ['', '   ', 'a'.repeat(101)]) {
      const res = await owner.post('/api/workspaces').set('Origin', ORIGIN).send({ name });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const missing = await owner.post('/api/workspaces').set('Origin', ORIGIN).send({});
    expect(missing.status).toBe(400);
  });

  it('handles slug collisions with numeric suffixes', async () => {
    const name = `Collision ${RUN}`;
    const first = await owner.post('/api/workspaces').set('Origin', ORIGIN).send({ name });
    const second = await owner.post('/api/workspaces').set('Origin', ORIGIN).send({ name });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.workspace.slug).toBe(`${first.body.workspace.slug as string}-2`);
    createdWorkspaceIds.push(first.body.workspace.id as string, second.body.workspace.id as string);
  });

  it('lists only the caller’s workspaces with their roles', async () => {
    const mine = await owner.get('/api/workspaces');
    expect(mine.status).toBe(200);
    const ids = (mine.body.workspaces as { id: string }[]).map((w) => w.id);
    expect(ids).toContain(ws1);
    expect(mine.body.workspaces.find((w: { id: string }) => w.id === ws1)).toMatchObject({
      role: 'OWNER',
      slug: ws1Slug,
    });

    const others = await otherOwner.get('/api/workspaces');
    const otherIds = (others.body.workspaces as { id: string }[]).map((w) => w.id);
    expect(otherIds).not.toContain(ws1);

    const stranger = await outsider.get('/api/workspaces');
    expect(stranger.body).toEqual({ workspaces: [] });

    const unauthenticated = await api().get('/api/workspaces');
    expect(unauthenticated.status).toBe(401);
  });

  it('retrieves workspaces for members but 404s non-members without leaking', async () => {
    for (const agent of [owner, admin, member]) {
      const res = await agent.get(`/api/workspaces/${ws1}`);
      expect(res.status).toBe(200);
      expect(res.body.workspace.id).toBe(ws1);
    }
    expect((await outsider.get(`/api/workspaces/${ws1}`)).status).toBe(404);
    expect((await outsider.get(`/api/workspaces/${ws1}`)).body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Workspace not found.' },
    });
    expect((await api().get(`/api/workspaces/${ws1}`)).status).toBe(401);
    expect((await owner.get(`/api/workspaces/${randomUUID()}`)).status).toBe(404);
  });

  it('lets OWNER and ADMIN rename, but not MEMBER or outsiders', async () => {
    const renamed = await owner
      .patch(`/api/workspaces/${ws1}`)
      .set('Origin', ORIGIN)
      .send({ name: 'Acme Renamed' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.workspace.name).toBe('Acme Renamed');
    expect(renamed.body.workspace.slug).toBe(ws1Slug);

    const byAdmin = await admin
      .patch(`/api/workspaces/${ws1}`)
      .set('Origin', ORIGIN)
      .send({ name: 'Acme By Admin' });
    expect(byAdmin.status).toBe(200);

    expect(
      (await member.patch(`/api/workspaces/${ws1}`).set('Origin', ORIGIN).send({ name: 'Nope' }))
        .status,
    ).toBe(403);
    expect(
      (await outsider.patch(`/api/workspaces/${ws1}`).set('Origin', ORIGIN).send({ name: 'Nope' }))
        .status,
    ).toBe(404);
    expect(
      (await api().patch(`/api/workspaces/${ws1}`).set('Origin', ORIGIN).send({ name: 'Nope' }))
        .status,
    ).toBe(401);
    expect(
      (await owner.patch(`/api/workspaces/${ws1}`).set('Origin', ORIGIN).send({ name: '   ' }))
        .status,
    ).toBe(400);
    expect(
      (
        await owner
          .patch(`/api/workspaces/${ws1}`)
          .set('Origin', ORIGIN)
          .send({ name: 'Acme', role: 'MEMBER' })
      ).status,
    ).toBe(400);
  });

  it('lets only OWNER delete, cascades memberships, keeps users', async () => {
    const target = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({
        name: `Doomed ${RUN}`,
      });
    expect(target.status).toBe(201);
    const doomedId = target.body.workspace.id as string;
    createdWorkspaceIds.push(doomedId);

    await getPrisma().workspaceMembership.create({
      data: {
        id: randomUUID(),
        workspaceId: doomedId,
        userId: await userIdFor('member'),
        role: 'MEMBER',
      },
    });
    await getPrisma().workspaceMembership.create({
      data: {
        id: randomUUID(),
        workspaceId: doomedId,
        userId: await userIdFor('admin'),
        role: 'ADMIN',
      },
    });

    expect((await member.delete(`/api/workspaces/${doomedId}`).set('Origin', ORIGIN)).status).toBe(
      403,
    );
    expect((await admin.delete(`/api/workspaces/${doomedId}`).set('Origin', ORIGIN)).status).toBe(
      403,
    );
    expect(
      (await outsider.delete(`/api/workspaces/${doomedId}`).set('Origin', ORIGIN)).status,
    ).toBe(404);

    const deleted = await owner.delete(`/api/workspaces/${doomedId}`).set('Origin', ORIGIN);
    expect(deleted.status).toBe(204);
    expect((await owner.get(`/api/workspaces/${doomedId}`)).status).toBe(404);

    const prisma = getPrisma();
    expect(await prisma.workspaceMembership.count({ where: { workspaceId: doomedId } })).toBe(0);
    expect(await prisma.user.count({ where: { email: email('owner') } })).toBe(1);
    expect(await prisma.user.count({ where: { email: email('member') } })).toBe(1);
  });

  it('lets members list workspace members with roles in deterministic order', async () => {
    const res = await owner.get(`/api/workspaces/${ws1}/members`);
    expect(res.status).toBe(200);

    const members = res.body.members as {
      id: string;
      role: string;
      createdAt: string;
      user: { id: string; name: string; email: string; image: string | null };
    }[];
    expect(members.map((m) => m.role)).toEqual(['OWNER', 'ADMIN', 'MEMBER']);
    expect(members.map((m) => m.user.email)).toEqual([
      email('owner'),
      email('admin'),
      email('member'),
    ]);
    const self = members.find((m) => m.user.email === email('owner'));
    expect(self?.role).toBe('OWNER');
    expect(typeof self?.id).toBe('string');

    const asAdmin = await admin.get(`/api/workspaces/${ws1}/members`);
    expect(asAdmin.status).toBe(200);
    expect((asAdmin.body.members as unknown[]).length).toBe(3);

    const asMember = await member.get(`/api/workspaces/${ws1}/members`);
    expect(asMember.status).toBe(200);
  });

  it('exposes only safe member fields', async () => {
    const res = await owner.get(`/api/workspaces/${ws1}/members`);
    expect(res.status).toBe(200);

    for (const membership of res.body.members as Record<string, unknown>[]) {
      expect(Object.keys(membership).sort()).toEqual(['createdAt', 'id', 'role', 'user']);
      expect(Object.keys(membership.user as Record<string, unknown>).sort()).toEqual([
        'email',
        'id',
        'image',
        'name',
      ]);
    }
    const serialized = JSON.stringify(res.body).toLowerCase();
    for (const leaked of ['password', 'token', 'secret', 'hash']) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it('rejects member listing for outsiders, strangers, and ghosts', async () => {
    expect((await outsider.get(`/api/workspaces/${ws1}/members`)).status).toBe(404);
    expect((await outsider.get(`/api/workspaces/${ws1}/members`)).body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Workspace not found.' },
    });
    expect((await owner.get(`/api/workspaces/${randomUUID()}/members`)).status).toBe(404);
    expect((await api().get(`/api/workspaces/${ws1}/members`)).status).toBe(401);
  });
});

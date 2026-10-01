import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClerkFakes, requestAs } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { getPrisma } from '../auth/prisma';

vi.setConfig({ testTimeout: 45000, hookTimeout: 180000 });

const LIVE = !!process.env.DATABASE_URL && !!process.env.CLERK_SECRET_KEY;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
const fakes = createClerkFakes('wsmembers');
const email = (who: string) => fakes.emailFor(who);

liveDescribe('workspace members (live database)', () => {
  const app = createApp(fakes.appDeps());
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let ws1 = '';
  let ws2 = '';

  let owner: ReturnType<typeof requestAs>;
  let admin: ReturnType<typeof requestAs>;
  let member: ReturnType<typeof requestAs>;
  let second: ReturnType<typeof requestAs>;

  async function signUp(who: string, name: string): Promise<ReturnType<typeof requestAs>> {
    fakes.setProfile(who, { name });
    createdEmails.push(email(who));
    // First sight provisions the local user row through the fake directory.
    const me = await request(app).get('/api/me').set(fakes.headersFor(who));
    expect(me.status).toBe(200);
    return requestAs(app, fakes, who);
  }

  async function userIdFor(who: string) {
    const user = await getPrisma().user.findUniqueOrThrow({ where: { email: email(who) } });
    return user.id;
  }

  beforeAll(async () => {
    owner = await signUp('owner', 'Wsm Owner');
    admin = await signUp('admin', 'Wsm Admin');
    member = await signUp('member', 'Wsm Member');
    await signUp('outsider', 'Wsm Outsider');
    second = await signUp('second', 'Wsm Second');

    const res = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Wsm HQ ${RUN}` });
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
      .send({ name: `Wsm Far ${RUN}` });
    expect(other.status).toBe(201);
    ws2 = other.body.workspace.id as string;
    createdWorkspaceIds.push(ws2);
  }, 180000);

  afterAll(async () => {
    if (!LIVE) return;
    const prisma = getPrisma();
    for (const workspaceId of createdWorkspaceIds) {
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    }
    for (const userEmail of createdEmails) {
      await prisma.user.deleteMany({ where: { email: userEmail } });
    }
  });

  const patchRole = (
    agent: ReturnType<typeof requestAs>,
    ws: string,
    userId: string,
    role: string,
  ) => agent.patch(`/api/workspaces/${ws}/members/${userId}`).set('Origin', ORIGIN).send({ role });
  const deleteMember = (agent: ReturnType<typeof requestAs>, ws: string, userId: string) =>
    agent.delete(`/api/workspaces/${ws}/members/${userId}`).set('Origin', ORIGIN);

  it('allows OWNER to change ADMIN→MEMBER and MEMBER→ADMIN', async () => {
    const adminId = await userIdFor('admin');
    const memberId = await userIdFor('member');
    // ADMIN → MEMBER
    expect((await patchRole(owner, ws1, adminId, 'MEMBER')).status).toBe(200);
    // MEMBER → ADMIN
    expect((await patchRole(owner, ws1, memberId, 'ADMIN')).status).toBe(200);
    // Verify via list
    const list = await owner.get(`/api/workspaces/${ws1}/members`);
    const roles = new Map(
      (list.body.members as { user: { id: string }; role: string }[]).map((m) => [
        m.user.id,
        m.role,
      ]),
    );
    expect(roles.get(adminId)).toBe('MEMBER');
    expect(roles.get(memberId)).toBe('ADMIN');
    // Restore: ADMIN back to ADMIN, MEMBER back to MEMBER for later tests
    expect((await patchRole(owner, ws1, adminId, 'ADMIN')).status).toBe(200);
    expect((await patchRole(owner, ws1, memberId, 'MEMBER')).status).toBe(200);
  });

  it('rejects MEMBER unauthorized and ADMIN cannot touch OWNER', async () => {
    const adminId = await userIdFor('admin');
    const memberId = await userIdFor('member');
    const ownerId = await userIdFor('owner');
    expect((await patchRole(member, ws1, adminId, 'MEMBER')).status).toBe(403);
    expect((await patchRole(admin, ws1, ownerId, 'ADMIN')).status).toBe(403);
    expect((await patchRole(admin, ws1, memberId, 'ADMIN')).status).toBe(403);
  });

  it('protects the only OWNER from demotion and removal', async () => {
    const ownerId = await userIdFor('owner');
    expect((await patchRole(owner, ws1, ownerId, 'ADMIN')).status).toBe(409);
    expect((await deleteMember(owner, ws1, ownerId)).status).toBe(409);
  });

  it('validates role enum and strict body', async () => {
    const memberId = await userIdFor('member');
    expect((await patchRole(owner, ws1, memberId, 'OWNER')).status).toBe(400);
    expect((await patchRole(owner, ws1, memberId, 'SUPERADMIN')).status).toBe(400);
    expect(
      (
        await owner
          .patch(`/api/workspaces/${ws1}/members/${memberId}`)
          .set('Origin', ORIGIN)
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await owner
          .patch(`/api/workspaces/${ws1}/members/${memberId}`)
          .set('Origin', ORIGIN)
          .send({ role: 'ADMIN', extra: 'x' })
      ).status,
    ).toBe(400);
  });

  it('rejects cross-workspace and nonexistent targets', async () => {
    const outsiderId = await userIdFor('outsider');
    expect((await patchRole(owner, ws1, outsiderId, 'ADMIN')).status).toBe(404);
    const secondId = await userIdFor('second');
    expect((await patchRole(owner, ws1, secondId, 'ADMIN')).status).toBe(404);
    expect((await patchRole(owner, ws1, randomUUID(), 'ADMIN')).status).toBe(404);
    expect((await patchRole(owner, ws2, await userIdFor('member'), 'ADMIN')).status).toBe(404);
  });

  it('allows OWNER to remove MEMBER and ADMIN, and protects OWNER', async () => {
    await signUp('temp', 'Temp User');
    const tempId = await userIdFor('temp');
    await getPrisma().workspaceMembership.create({
      data: { id: randomUUID(), workspaceId: ws1, userId: tempId, role: 'MEMBER' },
    });
    // Promote temp to ADMIN then remove
    expect((await patchRole(owner, ws1, tempId, 'ADMIN')).status).toBe(200);
    expect((await deleteMember(owner, ws1, tempId)).status).toBe(204);
    const list = await owner.get(`/api/workspaces/${ws1}/members`);
    expect(
      (list.body.members as { user: { id: string } }[]).some((m) => m.user.id === tempId),
    ).toBe(false);

    // Remove MEMBER
    const memberId = await userIdFor('member');
    // Ensure member exists
    const before = await owner.get(`/api/workspaces/${ws1}/members`);
    if (!(before.body.members as { user: { id: string } }[]).some((m) => m.user.id === memberId)) {
      await getPrisma().workspaceMembership.create({
        data: { id: randomUUID(), workspaceId: ws1, userId: memberId, role: 'MEMBER' },
      });
    }
    expect((await deleteMember(owner, ws1, memberId)).status).toBe(204);
    // Re-add for cleanup
    await getPrisma().workspaceMembership.create({
      data: { id: randomUUID(), workspaceId: ws1, userId: memberId, role: 'MEMBER' },
    });
  });

  it('rejects unauthorized removal and unauthenticated', async () => {
    const memberId = await userIdFor('member');
    expect((await deleteMember(member, ws1, memberId)).status).toBe(403);
    expect((await deleteMember(admin, ws1, await userIdFor('owner'))).status).toBe(403);
    expect((await request(app).delete(`/api/workspaces/${ws1}/members/${memberId}`)).status).toBe(
      401,
    );
    expect((await deleteMember(owner, ws1, await userIdFor('outsider'))).status).toBe(404);
  });

  it('ensures removed member loses workspace and private channel access', async () => {
    // Create private channel and add member
    const priv = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `PrivWsm ${RUN}`, type: 'PRIVATE' });
    expect(priv.status).toBe(201);
    const privSlug = priv.body.channel.slug as string;
    const privId = priv.body.channel.id as string;
    const memberId = await userIdFor('member');
    // Ensure member is in workspace and private channel
    const add = await owner
      .post(`/api/workspaces/${ws1}/channels/${privSlug}/members`)
      .set('Origin', ORIGIN)
      .send({ userId: memberId });
    // May be 201 or 409 if already member
    expect([201, 409]).toContain(add.status);
    // Create a message as owner in private channel
    const msg = await owner
      .post(`/api/channels/${privId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: 'secret workspace test' });
    expect(msg.status).toBe(201);
    // Remove member from workspace
    expect((await deleteMember(owner, ws1, memberId)).status).toBe(204);
    // Member should now get 404 for workspace
    expect((await member.get(`/api/workspaces/${ws1}`)).status).toBe(404);
    // Private channel access should be 404
    expect((await member.get(`/api/workspaces/${ws1}/channels/${privSlug}`)).status).toBe(404);
    // Message fetch should be 404
    expect((await member.get(`/api/channels/${privId}/messages`)).status).toBe(404);
    // Re-add for cleanup
    await getPrisma().workspaceMembership.create({
      data: { id: randomUUID(), workspaceId: ws1, userId: memberId, role: 'MEMBER' },
    });
    // Re-add to private channel if needed
    await owner
      .post(`/api/workspaces/${ws1}/channels/${privSlug}/members`)
      .set('Origin', ORIGIN)
      .send({ userId: memberId });
  });
});

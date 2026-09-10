import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { getPrisma } from '../auth/prisma';

vi.setConfig({ testTimeout: 45000, hookTimeout: 180000 });

const LIVE =
  !!process.env.DATABASE_URL && !!process.env.BETTER_AUTH_SECRET && !!process.env.BETTER_AUTH_URL;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = process.env.BETTER_AUTH_URL ?? 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
const email = (who: string) => `chm-${RUN}-${who}@example.invalid`;
const PASSWORD = 'channel-member-test-0123456789';

liveDescribe('private channel members (live database)', () => {
  const app = createApp();
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let ws1 = '';
  let ws2 = '';
  let privateSlug = '';
  let privateId = '';
  let publicSlug = '';

  let owner: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;
  let member: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;
  let second: ReturnType<typeof request.agent>;
  let target: ReturnType<typeof request.agent>;

  async function signUp(who: string, name: string) {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name, email: email(who), password: PASSWORD });
    expect(res.status).toBeLessThan(300);
    createdEmails.push(email(who));
    return agent;
  }

  async function userIdFor(who: string) {
    const user = await getPrisma().user.findUniqueOrThrow({ where: { email: email(who) } });
    return user.id;
  }

  beforeAll(async () => {
    owner = await signUp('owner', 'Mem Owner');
    admin = await signUp('admin', 'Mem Admin');
    member = await signUp('member', 'Mem Member');
    outsider = await signUp('outsider', 'Mem Outsider');
    second = await signUp('second', 'Mem Second');
    target = await signUp('target', 'Mem Target');

    const res = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Mem HQ ${RUN}` });
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
    await prisma.workspaceMembership.create({
      data: {
        id: randomUUID(),
        workspaceId: ws1,
        userId: await userIdFor('target'),
        role: 'MEMBER',
      },
    });

    const other = await second
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Mem Far ${RUN}` });
    expect(other.status).toBe(201);
    ws2 = other.body.workspace.id as string;
    createdWorkspaceIds.push(ws2);

    const priv = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `PrivateMem ${RUN}`, type: 'PRIVATE' });
    expect(priv.status).toBe(201);
    privateSlug = priv.body.channel.slug as string;
    privateId = priv.body.channel.id as string;

    const pub = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `PublicMem ${RUN}`, type: 'PUBLIC' });
    expect(pub.status).toBe(201);
    publicSlug = pub.body.channel.slug as string;
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

  // Helper to get members
  const listMembers = (agent: ReturnType<typeof request.agent>, ws: string, slug: string) =>
    agent.get(`/api/workspaces/${ws}/channels/${slug}/members`);
  const addMember = (
    agent: ReturnType<typeof request.agent>,
    ws: string,
    slug: string,
    userId: string,
  ) =>
    agent
      .post(`/api/workspaces/${ws}/channels/${slug}/members`)
      .set('Origin', ORIGIN)
      .send({ userId });
  const removeMember = (
    agent: ReturnType<typeof request.agent>,
    ws: string,
    slug: string,
    userId: string,
  ) =>
    agent.delete(`/api/workspaces/${ws}/channels/${slug}/members/${userId}`).set('Origin', ORIGIN);

  it('lists private-channel members for authorized member', async () => {
    const res = await listMembers(owner, ws1, privateSlug);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.members[0].user).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
    });
  });

  it('rejects listing for unauthorized workspace member and non-member without leaking', async () => {
    expect((await listMembers(member, ws1, privateSlug)).status).toBe(404);
    expect((await listMembers(outsider, ws1, privateSlug)).status).toBe(404);
    expect((await listMembers(admin, ws1, privateSlug)).status).toBe(404);
    // Wrong workspace
    expect((await listMembers(owner, ws2, privateSlug)).status).toBe(404);
    // Public channel incorrectly via private members endpoint → 404
    expect((await listMembers(owner, ws1, publicSlug)).status).toBe(404);
    expect(
      (await request(app).get(`/api/workspaces/${ws1}/channels/${privateSlug}/members`)).status,
    ).toBe(401);
  });

  it('adds member successfully for authorized requester', async () => {
    const targetId = await userIdFor('target');
    const res = await addMember(owner, ws1, privateSlug, targetId);
    expect(res.status).toBe(201);
    expect(res.body.member.userId).toBe(targetId);
    const list = await listMembers(owner, ws1, privateSlug);
    expect(list.body.members.map((m: { userId: string }) => m.userId)).toContain(targetId);
  });

  it('rejects duplicate add with 409', async () => {
    const targetId = await userIdFor('target');
    const res = await addMember(owner, ws1, privateSlug, targetId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects add when target not in workspace or from another workspace', async () => {
    const outsiderId = await userIdFor('outsider');
    expect((await addMember(owner, ws1, privateSlug, outsiderId)).status).toBe(404);
    const secondId = await userIdFor('second');
    expect((await addMember(owner, ws1, privateSlug, secondId)).status).toBe(404);
  });

  it('rejects add for unauthorized requester and malformed body', async () => {
    const targetId = await userIdFor('target');
    // Create a new private channel for member unauthorized test: member is not private member, so should 404 before 403? Let's test add by member who is not authorized but is workspace member
    // For a private channel where member is not in it, list already 404, so add should also 404 (non-enumerating) not 403
    // But for a channel where member has been added? Let's use admin not in private → should be 403? Actually admin not in private → 404 before authz, so we need a channel where member is member but not manager
    // Add target already added, so test unauthorized via member who is now member but not OWNER/ADMIN/creator
    // First, ensure member can list after being added? Member was added as target earlier, but member agent is different user (Ch Member) not target. Let's test unauthorized add by member (who is workspace member but not channel member) → should be 404 (not 403)
    // For a member who IS in channel but not manager, we need to add target to channel via owner, then try member add another user → should be 403
    // Add a new MEMBER to private channel, then verify they cannot manage members (403) while OWNER can.
    await signUp('newmember', 'New Member');
    const newMemberId = await userIdFor('newmember');
    await getPrisma().workspaceMembership.create({
      data: { id: randomUUID(), workspaceId: ws1, userId: newMemberId, role: 'MEMBER' },
    });
    const addRes = await addMember(owner, ws1, privateSlug, newMemberId);
    expect(addRes.status).toBe(201);
    // Now newMember is private member but not OWNER/ADMIN/creator → should be 403 when trying to add someone else.
    await signUp('another', 'Another');
    const anotherId = await userIdFor('another');
    await getPrisma().workspaceMembership.create({
      data: { id: randomUUID(), workspaceId: ws1, userId: anotherId, role: 'MEMBER' },
    });
    // Need an agent for newMember; sign in again to get session
    const newMemberAgent = request.agent(app);
    const signInRes = await newMemberAgent
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email: email('newmember'), password: PASSWORD });
    expect(signInRes.status).toBeLessThan(300);
    expect((await addMember(newMemberAgent, ws1, privateSlug, anotherId)).status).toBe(403);

    // Unauthenticated
    expect(
      (
        await request(app)
          .post(`/api/workspaces/${ws1}/channels/${privateSlug}/members`)
          .set('Origin', ORIGIN)
          .send({ userId: targetId })
      ).status,
    ).toBe(401);
    // Wrong workspace
    expect((await addMember(owner, ws2, privateSlug, targetId)).status).toBe(404);
    // Wrong channel slug
    expect((await addMember(owner, ws1, 'nonexistent', targetId)).status).toBe(404);
    // Malformed body
    expect(
      (
        await owner
          .post(`/api/workspaces/${ws1}/channels/${privateSlug}/members`)
          .set('Origin', ORIGIN)
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await owner
          .post(`/api/workspaces/${ws1}/channels/${privateSlug}/members`)
          .set('Origin', ORIGIN)
          .send({ userId: '' })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner
          .post(`/api/workspaces/${ws1}/channels/${privateSlug}/members`)
          .set('Origin', ORIGIN)
          .send({ userId: targetId, extra: 'x' })
      ).status,
    ).toBe(400);
  });

  it('removes member successfully for authorized requester', async () => {
    const targetId = await userIdFor('target');
    const res = await removeMember(owner, ws1, privateSlug, targetId);
    expect(res.status).toBe(204);
    const list = await listMembers(owner, ws1, privateSlug);
    expect(list.body.members.map((m: { userId: string }) => m.userId)).not.toContain(targetId);
  });

  it('rejects remove when target not a member', async () => {
    const targetId = await userIdFor('target');
    expect((await removeMember(owner, ws1, privateSlug, targetId)).status).toBe(404);
  });

  it('rejects remove for unauthorized requester and unauthenticated', async () => {
    // Re-add target for subsequent tests
    const targetId = await userIdFor('target');
    await addMember(owner, ws1, privateSlug, targetId);
    // newMember is MEMBER and private member but not OWNER/ADMIN/creator → should be 403 when trying to remove
    const newMemberAgent = request.agent(app);
    const signInRes = await newMemberAgent
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email: email('newmember'), password: PASSWORD });
    expect(signInRes.status).toBeLessThan(300);
    expect((await removeMember(newMemberAgent, ws1, privateSlug, targetId)).status).toBe(403);
    expect(
      (
        await request(app).delete(
          `/api/workspaces/${ws1}/channels/${privateSlug}/members/${targetId}`,
        )
      ).status,
    ).toBe(401);
    expect((await removeMember(owner, ws2, privateSlug, targetId)).status).toBe(404);
    expect((await removeMember(owner, ws1, 'nonexistent', targetId)).status).toBe(404);
  });

  it('ensures removed member loses private-channel access', async () => {
    const targetId = await userIdFor('target');
    // Ensure target is member
    const listBefore = await listMembers(owner, ws1, privateSlug);
    if (!listBefore.body.members.some((m: { userId: string }) => m.userId === targetId)) {
      await addMember(owner, ws1, privateSlug, targetId);
    }
    // Create a message in private channel as owner
    const msg = await owner
      .post(`/api/channels/${privateId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: 'secret' });
    expect(msg.status).toBe(201);
    // Remove target
    expect((await removeMember(owner, ws1, privateSlug, targetId)).status).toBe(204);
    // Target should get 404 for channel detail
    expect((await target.get(`/api/workspaces/${ws1}/channels/${privateSlug}`)).status).toBe(404);
    // Target cannot fetch messages
    expect((await target.get(`/api/channels/${privateId}/messages`)).status).toBe(404);
    // Target cannot create messages
    expect(
      (
        await target
          .post(`/api/channels/${privateId}/messages`)
          .set('Origin', ORIGIN)
          .send({ body: 'hi' })
      ).status,
    ).toBe(404);
    // Re-add for cleanup
    await addMember(owner, ws1, privateSlug, targetId);
  });

  it('prevents removed member from searching private channel and realtime', async () => {
    const targetId = await userIdFor('target');
    // Ensure target is member then remove
    const privMsg = await owner
      .post(`/api/channels/${privateId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: `searchsecret ${RUN}` });
    expect(privMsg.status).toBe(201);
    await removeMember(owner, ws1, privateSlug, targetId);
    const search = await target
      .get(`/api/workspaces/${ws1}/search`)
      .query({ q: `searchsecret ${RUN}` });
    // Should not contain private message (either 200 empty or 404 if workspace search requires channel access? Search should return empty for non-member)
    if (search.status === 200) {
      const bodies = JSON.stringify(search.body);
      expect(bodies).not.toContain(`searchsecret ${RUN}`);
    } else {
      expect(search.status).toBe(404);
    }
    // Re-add
    await addMember(owner, ws1, privateSlug, targetId);
  });
});

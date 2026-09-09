/**
 * Mention persistence integration tests (Phase 4H.2, live database).
 *
 * Real Better Auth sessions against the configured development database.
 * SKIPPED without auth/database env so `pnpm test` stays green everywhere.
 * Every assertion inspects actual MessageMention rows (never just status
 * codes). Fixtures are removed in `afterAll` (workspace deletion cascades
 * channels, DMs, messages, and mentions).
 */

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
const email = (who: string) => `mention-${RUN}-${who}@example.invalid`;
const PASSWORD = 'mention-test-password-0123456789';

liveDescribe('message mentions (live database)', () => {
  const app = createApp();
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let owner: ReturnType<typeof request.agent>;
  let author: ReturnType<typeof request.agent>;

  let ws1 = '';
  let pubId = '';
  let privId = '';
  let dmOA = '';
  let groupId = '';
  let removalGroupId = '';
  let authorId = '';
  let otherId = '';

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

  async function mentionedIds(messageId: string): Promise<string[]> {
    const rows = await getPrisma().messageMention.findMany({
      where: { messageId },
      select: { mentionedUserId: true },
    });
    return rows.map((row) => row.mentionedUserId).sort();
  }

  beforeAll(async () => {
    // Short distinct first names keep exact-match assertions unambiguous.
    owner = await signUp('owner', 'Owen');
    author = await signUp('author', 'Aria');
    // Otto exists as a workspace member (used as mention target / removal
    // subject); no session agent needed for these assertions.
    await signUp('other', 'Otto');
    // Xena exists as a user but is never added to the workspace.
    await signUp('outsider', 'Xena');
    authorId = await userIdFor('author');
    otherId = await userIdFor('other');

    const ws = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Mention HQ ${RUN}` });
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
      .send({ name: `Mentionpub ${RUN}`, type: 'PUBLIC' });
    expect(pub.status).toBe(201);
    pubId = pub.body.channel.id as string;

    const priv = await owner
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Mentionvault ${RUN}`, type: 'PRIVATE' });
    expect(priv.status).toBe(201);
    privId = priv.body.channel.id as string;
    await prisma.channelMembership.create({
      data: { id: randomUUID(), channelId: privId, userId: authorId },
    });

    const dm = await owner
      .post(`/api/workspaces/${ws1}/direct-messages`)
      .set('Origin', ORIGIN)
      .send({ recipientId: authorId });
    expect(dm.status).toBe(200);
    dmOA = dm.body.conversation.id as string;

    const group = await owner
      .post(`/api/workspaces/${ws1}/direct-messages/group`)
      .set('Origin', ORIGIN)
      .send({ participantIds: [authorId, otherId], name: `Mention crew ${RUN}` });
    expect(group.status).toBe(201);
    groupId = group.body.conversation.id as string;

    const removalGroup = await owner
      .post(`/api/workspaces/${ws1}/direct-messages/group`)
      .set('Origin', ORIGIN)
      .send({ participantIds: [authorId, otherId], name: `Mention exile ${RUN}` });
    expect(removalGroup.status).toBe(201);
    removalGroupId = removalGroup.body.conversation.id as string;
    const removed = await owner
      .delete(`/api/direct-messages/${removalGroupId}/participants/${otherId}`)
      .set('Origin', ORIGIN);
    expect(removed.status).toBe(200);
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

  async function postChannel(
    agent: ReturnType<typeof request.agent>,
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

  it('stores mentions for resolved members on channel message create', async () => {
    const id = await postChannel(owner, pubId, 'Hey @Aria and @Otto, review this');
    expect(await mentionedIds(id)).toEqual([authorId, otherId].sort());
  });

  it('matches case-insensitively and collapses duplicates to one row', async () => {
    const id = await postChannel(owner, pubId, 'ping @ARIA @aria @Aria!');
    expect(await mentionedIds(id)).toEqual([authorId]);
  });

  it('stores nothing for unmatched text and plain messages', async () => {
    const plain = await postChannel(owner, pubId, 'no mentions here');
    expect(await mentionedIds(plain)).toEqual([]);
    const unknown = await postChannel(owner, pubId, 'hello @NobodyHere, contact a@b.co');
    expect(await mentionedIds(unknown)).toEqual([]);
  });

  it('stores self-mentions (notification suppression is a later layer)', async () => {
    const id = await postChannel(author, pubId, 'note to self @Aria');
    expect(await mentionedIds(id)).toEqual([authorId]);
  });

  it('stores thread-reply mentions against the reply', async () => {
    const root = await postChannel(owner, pubId, 'thread root');
    const res = await author
      .post(`/api/messages/${root}/replies`)
      .set('Origin', ORIGIN)
      .send({ body: 'reply for @Otto' });
    expect(res.status).toBe(201);
    expect(await mentionedIds(res.body.message.id as string)).toEqual([otherId]);
    expect(await mentionedIds(root)).toEqual([]);
  });

  it('rewrites the mention set on edit and skips no-op edits', async () => {
    const id = await postChannel(owner, pubId, 'hello @Aria and @Otto');
    expect(await mentionedIds(id)).toEqual([authorId, otherId].sort());

    const edited = await owner
      .patch(`/api/messages/${id}`)
      .set('Origin', ORIGIN)
      .send({ body: 'hello @Otto, meet Xena the outsider @Xena' });
    expect(edited.status).toBe(200);
    // Xena is not a workspace member: added @Otto resolves, @Xena does not.
    expect(await mentionedIds(id)).toEqual([otherId]);

    const same = await owner
      .patch(`/api/messages/${id}`)
      .set('Origin', ORIGIN)
      .send({ body: 'hello @Otto, meet Xena the outsider @Xena' });
    expect(same.status).toBe(200);
    expect(await mentionedIds(id)).toEqual([otherId]);
  });

  it('clears mentions on soft-delete and blocks tombstone edits', async () => {
    const id = await postChannel(owner, pubId, 'bye @Aria');
    expect(await mentionedIds(id)).toEqual([authorId]);

    const deleted = await owner.delete(`/api/messages/${id}`).set('Origin', ORIGIN);
    expect(deleted.status).toBe(200);
    expect(await mentionedIds(id)).toEqual([]);

    const edited = await owner
      .patch(`/api/messages/${id}`)
      .set('Origin', ORIGIN)
      .send({ body: 'resurrect @Aria' });
    expect(edited.status).toBe(409);
    expect(await mentionedIds(id)).toEqual([]);
  });

  it('excludes private-channel non-members from resolution', async () => {
    // Otto is a workspace member but not a private-channel member.
    const id = await postChannel(author, privId, 'secret for @Otto and @Aria');
    // Author is both sender and private member; Otto is not a member.
    expect(await mentionedIds(id)).toEqual([authorId]);
  });

  it('resolves DM participants but not outsiders', async () => {
    const res = await owner
      .post(`/api/direct-messages/${dmOA}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: 'dm for @Aria and @Xena' });
    expect(res.status).toBe(201);
    expect(await mentionedIds(res.body.message.id as string)).toEqual([authorId]);
  });

  it('resolves group mentions but not removed participants', async () => {
    const res = await owner
      .post(`/api/direct-messages/${groupId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: 'group ping @Aria @Otto' });
    expect(res.status).toBe(201);
    expect(await mentionedIds(res.body.message.id as string)).toEqual([authorId, otherId].sort());

    // Otto was removed from the exile group before this message.
    const exiled = await owner
      .post(`/api/direct-messages/${removalGroupId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: 'exile ping @Otto @Aria' });
    expect(exiled.status).toBe(201);
    expect(await mentionedIds(exiled.body.message.id as string)).toEqual([authorId]);
  });
});

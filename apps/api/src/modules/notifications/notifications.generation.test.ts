/**
 * Notification generation tests (Phase 4H.4, live database).
 *
 * Real Better Auth sessions against the configured development database.
 * SKIPPED without auth/database env so `pnpm test` stays green everywhere.
 * Messages are created through the real HTTP endpoints; every assertion
 * inspects actual Notification rows. Fixtures are removed in `afterAll`
 * (workspace deletion cascades channels, DMs, messages, mentions, and
 * notifications).
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClerkFakes, requestAs } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { getPrisma } from '../auth/prisma';
import { generateNotificationsForMessage } from '../notifications/service';

vi.setConfig({ testTimeout: 90000, hookTimeout: 300000 });

const LIVE = !!process.env.DATABASE_URL && !!process.env.CLERK_SECRET_KEY;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
const fakes = createClerkFakes('notifgen');
const email = (who: string) => fakes.emailFor(who);

liveDescribe('notification generation (live database)', () => {
  const app = createApp(fakes.appDeps());
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let owner: ReturnType<typeof requestAs>;
  let actor: ReturnType<typeof requestAs>;
  let other: ReturnType<typeof requestAs>;

  let ws1 = '';
  let pubId = '';
  let privId = '';
  let dmId = '';
  let groupId = '';
  let actorId = '';
  let ottoId = '';
  let miaId = '';

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

  async function signIn(who: string): Promise<ReturnType<typeof requestAs>> {
    // Stateless Bearer auth needs no second session: reuse the identity.
    return requestAs(app, fakes, who);
  }

  async function rowsFor(messageId: string) {
    return getPrisma().notification.findMany({
      where: { messageId },
      orderBy: [{ recipientUserId: 'asc' }, { type: 'asc' }],
    });
  }

  async function rowsForRecipient(userId: string) {
    return getPrisma().notification.findMany({ where: { recipientUserId: userId } });
  }

  beforeAll(async () => {
    owner = await signUp('owner', 'Owen');
    actor = await signUp('actor', 'Aria');
    await signUp('other', 'Otto');
    other = await signIn('other');
    await signUp('fourth', 'Mia');
    await signUp('outsider', 'Xena');
    actorId = await userIdFor('actor');
    ottoId = await userIdFor('other');
    miaId = await userIdFor('fourth');

    const ws = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `NotifGen HQ ${RUN}` });
    expect(ws.status).toBe(201);
    ws1 = ws.body.workspace.id as string;
    createdWorkspaceIds.push(ws1);

    const prisma = getPrisma();
    for (const id of [actorId, ottoId, miaId]) {
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
      data: { id: randomUUID(), channelId: privId, userId: actorId },
    });

    const dm = await actor
      .post(`/api/workspaces/${ws1}/direct-messages`)
      .set('Origin', ORIGIN)
      .send({ recipientId: ottoId });
    expect(dm.status).toBe(200);
    dmId = dm.body.conversation.id as string;

    const group = await owner
      .post(`/api/workspaces/${ws1}/direct-messages/group`)
      .set('Origin', ORIGIN)
      .send({ participantIds: [actorId, ottoId], name: `Notif crew ${RUN}` });
    expect(group.status).toBe(201);
    groupId = group.body.conversation.id as string;
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

  async function postDm(
    agent: ReturnType<typeof requestAs>,
    conversationId: string,
    body: string,
  ): Promise<string> {
    const res = await agent
      .post(`/api/direct-messages/${conversationId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body });
    expect(res.status).toBe(201);
    return res.body.message.id as string;
  }

  async function postReply(agent: ReturnType<typeof requestAs>, rootId: string, body: string) {
    const res = await agent
      .post(`/api/messages/${rootId}/replies`)
      .set('Origin', ORIGIN)
      .send({ body });
    expect(res.status).toBe(201);
    return res.body.message.id as string;
  }

  it('creates MENTION with snapshots for channel roots, nothing without mentions', async () => {
    const id = await postChannel(actor, pubId, 'hey @Otto review this');
    const rows = await rowsFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientUserId: ottoId,
      type: 'MENTION',
      actorUserId: actorId,
      workspaceId: ws1,
      channelId: pubId,
      conversationId: null,
      threadRootMessageId: null,
      actorName: 'Aria',
      channelName: expect.stringContaining('Notifpub'),
    });

    const plain = await postChannel(actor, pubId, 'no mentions here');
    expect(await rowsFor(plain)).toEqual([]);
  });

  it('restricts private-channel mentions to channel members', async () => {
    // Otto is a workspace member but not a private-channel member.
    const id = await postChannel(actor, privId, 'secret for @Otto');
    expect(await rowsFor(id)).toEqual([]);
  });

  it('notifies the DM peer only, and MENTION wins on DM mentions', async () => {
    const plain = await postDm(actor, dmId, 'hello there');
    const plainRows = await rowsFor(plain);
    expect(plainRows).toHaveLength(1);
    expect(plainRows[0]).toMatchObject({
      recipientUserId: ottoId,
      type: 'DM_MESSAGE',
      conversationId: dmId,
      channelId: null,
      conversationName: 'Aria',
    });
    // No row for the sender.
    expect(await rowsForRecipient(actorId)).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ messageId: plain })]),
    );

    const mentioned = await postDm(actor, dmId, 'hey @Otto look');
    const mentionedRows = await rowsFor(mentioned);
    expect(mentionedRows).toHaveLength(1);
    expect(mentionedRows[0].type).toBe('MENTION');
  });

  it('notifies all other GROUP participants, with MENTION precedence', async () => {
    const id = await postDm(actor, groupId, 'hi crew');
    const rows = await rowsFor(id);
    const recipients = rows.map((r) => [r.recipientUserId, r.type] as const);
    expect(recipients).toHaveLength(2);
    expect(recipients).toContainEqual([ottoId, 'GROUP_MESSAGE']);
    expect(recipients).toContainEqual([await userIdFor('owner'), 'GROUP_MESSAGE']);
    expect(rows.find((r) => r.recipientUserId === ottoId)?.conversationName).toContain(
      'Notif crew',
    );

    // Mentioning one participant upgrades only theirs; other participants
    // still get their GROUP_MESSAGE.
    const mentioned = await postDm(actor, groupId, 'hey @Otto');
    const mentionedRows = await rowsFor(mentioned);
    expect(mentionedRows).toHaveLength(2);
    expect(mentionedRows).toContainEqual(
      expect.objectContaining({ recipientUserId: ottoId, type: 'MENTION' }),
    );
    expect(mentionedRows).toContainEqual(
      expect.objectContaining({
        recipientUserId: await userIdFor('owner'),
        type: 'GROUP_MESSAGE',
      }),
    );
  });

  it('notifies root author and prior repliers on thread replies', async () => {
    const root = await postChannel(actor, pubId, 'deployment thread');
    const reply1 = await postReply(owner, root, 'first reply');
    const r1rows = await rowsFor(reply1);
    // Root author Aria gets THREAD_REPLY; Owen (actor) gets nothing.
    expect(r1rows).toHaveLength(1);
    expect(r1rows[0]).toMatchObject({
      recipientUserId: actorId,
      type: 'THREAD_REPLY',
      threadRootMessageId: root,
    });

    // Otto replies: Aria (root author) and Owen (prior replier) notified.
    const reply2 = await postReply(other, root, 'second reply');
    const r2rows = await rowsFor(reply2);
    const recipients = r2rows.map((r) => [r.recipientUserId, r.type] as const);
    expect(recipients).toHaveLength(2);
    expect(recipients).toContainEqual([actorId, 'THREAD_REPLY']);
    expect(recipients).toContainEqual([await userIdFor('owner'), 'THREAD_REPLY']);
  });

  it('gives mentioned thread participants MENTION instead of THREAD_REPLY', async () => {
    const root = await postChannel(actor, pubId, 'review thread');
    await postReply(owner, root, 'owner notes here');
    // Otto replies mentioning Aria: Aria gets MENTION only (not THREAD_REPLY),
    // while Owen — a prior replier with no mention — gets THREAD_REPLY.
    const mentionReply = await postReply(other, root, '@Aria please check this');
    const rows = await rowsFor(mentionReply);
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual(
      expect.objectContaining({ recipientUserId: actorId, type: 'MENTION' }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        recipientUserId: await userIdFor('owner'),
        type: 'THREAD_REPLY',
      }),
    );

    // Mia is a workspace member but never participated: nothing for her.
    const miaRows = await rowsForRecipient(miaId);
    expect(miaRows.filter((r) => r.messageId === mentionReply)).toEqual([]);
  });

  it('handles DM thread replies with conversation context', async () => {
    const root = await postDm(actor, dmId, 'dm thread root');
    const reply = await postReply(other, root, 'dm reply here');
    const rows = await rowsFor(reply);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientUserId: actorId,
      type: 'THREAD_REPLY',
      conversationId: dmId,
      channelId: null,
      threadRootMessageId: root,
    });
  });

  it('creates nothing on edit and preserves history across delete', async () => {
    const id = await postChannel(actor, pubId, 'edit me @Otto');
    expect(await rowsFor(id)).toHaveLength(1);

    const edited = await actor
      .patch(`/api/messages/${id}`)
      .set('Origin', ORIGIN)
      .send({ body: 'edited @Otto twice' });
    expect(edited.status).toBe(200);
    expect(await rowsFor(id)).toHaveLength(1);

    const deleted = await actor.delete(`/api/messages/${id}`).set('Origin', ORIGIN);
    expect(deleted.status).toBe(200);
    // Soft-delete keeps the row (durability): the notification survives WITH
    // its message link intact. Only hard deletion nulls the link.
    const survived = await rowsFor(id);
    expect(survived).toHaveLength(1);
    expect(survived[0].messageId).toBe(id);
    await getPrisma().message.delete({ where: { id } });
    const nulled = await rowsForRecipient(ottoId);
    expect(
      nulled.filter((r) => r.messageId === null && r.type === 'MENTION').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('persists rows despite NONE preferences', async () => {
    const prisma = getPrisma();
    await prisma.userNotificationPreference.upsert({
      where: { userId: ottoId },
      create: {
        userId: ottoId,
        mentionDelivery: 'NONE',
        dmDelivery: 'NONE',
        threadReplyDelivery: 'NONE',
      },
      update: { mentionDelivery: 'NONE', dmDelivery: 'NONE', threadReplyDelivery: 'NONE' },
    });
    const mentioned = await postChannel(actor, pubId, 'prefs @Otto test');
    expect((await rowsFor(mentioned)).map((r) => r.type)).toEqual(['MENTION']);
    const dm = await postDm(actor, dmId, 'prefs dm test');
    expect((await rowsFor(dm)).map((r) => r.type)).toEqual(['DM_MESSAGE']);
    const root = await postChannel(actor, pubId, 'prefs thread root');
    const reply = await postReply(owner, root, 'prefs thread reply');
    expect((await rowsFor(reply)).map((r) => r.type)).toEqual(['THREAD_REPLY']);
    await prisma.userNotificationPreference.deleteMany({ where: { userId: ottoId } });
  });

  it('is idempotent across duplicate generation runs', async () => {
    const id = await postChannel(actor, pubId, 'idempotent @Otto check');
    expect(await rowsFor(id)).toHaveLength(1);
    await generateNotificationsForMessage(getPrisma(), id);
    await generateNotificationsForMessage(getPrisma(), id);
    expect(await rowsFor(id)).toHaveLength(1);
  });

  it('notifies nothing for removed participants and no backlog for joiners', async () => {
    const removed = await owner
      .delete(`/api/direct-messages/${groupId}/participants/${ottoId}`)
      .set('Origin', ORIGIN);
    expect(removed.status).toBe(200);

    const afterRemoval = await postDm(actor, groupId, 'after removal @Otto');
    const ottoRows = await rowsForRecipient(ottoId);
    expect(ottoRows.filter((r) => r.messageId === afterRemoval)).toEqual([]);

    // Mia joins after history exists: no backlog rows reference her.
    const readd = await owner
      .post(`/api/direct-messages/${groupId}/participants`)
      .set('Origin', ORIGIN)
      .send({ userId: miaId });
    expect(readd.status).toBe(200);
    expect((await rowsForRecipient(miaId)).filter((r) => r.messageId === afterRemoval)).toEqual([]);
  });

  it('never notifies cross-workspace users', async () => {
    const xenaRows = await getPrisma().notification.findMany({
      where: { recipientUserId: await userIdFor('outsider') },
    });
    expect(xenaRows).toEqual([]);
  });
});

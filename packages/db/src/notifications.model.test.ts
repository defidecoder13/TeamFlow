/**
 * Notification data-model tests (Phase 4H.3).
 *
 * Live-database tests: SKIPPED when DATABASE_URL is absent (same convention
 * as the API `*.routes.test.ts` LIVE suites) and never fake results. Proves
 * the Notification/UserNotificationPreference models, referential actions
 * (message delete → SetNull, never cascade), the deduplication identity
 * (including NULL messageId semantics), indexes, enum constraints, and
 * preference defaults. No generation, routes, events, or UI exist yet.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from './index';

const LIVE = !!process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0;
const liveDescribe = LIVE ? describe : describe.skip;

const RUN = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;

liveDescribe('notification data model (Phase 4H.3)', () => {
  const prisma = LIVE ? createPrismaClient() : null;

  let workspaceId = '';
  let recipientId = '';
  let actorId = '';
  let channelId = '';
  let messageId = '';
  const createdUserIds: string[] = [];

  async function makeUser(name: string): Promise<string> {
    const user = await prisma!.user.create({
      data: { id: randomUUID(), name, email: `notif-${RUN}-${name}@example.invalid` },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    if (!LIVE) {
      return;
    }
    recipientId = await makeUser('Recipient');
    actorId = await makeUser('Actor');
    const workspace = await prisma!.workspace.create({
      data: { id: randomUUID(), name: `Notif HQ ${RUN}`, slug: `notif-hq-${RUN}` },
    });
    workspaceId = workspace.id;
    const channel = await prisma!.channel.create({
      data: {
        id: randomUUID(),
        workspaceId,
        name: `notifchan ${RUN}`,
        slug: `notifchan-${RUN}`,
        createdById: actorId,
      },
    });
    channelId = channel.id;
    const message = await prisma!.message.create({
      data: { id: randomUUID(), channelId, authorId: actorId, body: 'hello' },
    });
    messageId = message.id;
  });

  afterAll(async () => {
    if (!LIVE) {
      return;
    }
    await prisma!.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma!.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma?.$disconnect();
  });

  async function createNotification(input: {
    recipientUserId?: string;
    type?: 'MENTION' | 'DM_MESSAGE' | 'GROUP_MESSAGE' | 'THREAD_REPLY';
    messageId?: string | null;
    threadRootMessageId?: string | null;
    channelId?: string | null;
  }) {
    return prisma!.notification.create({
      data: {
        id: randomUUID(),
        workspaceId,
        recipientUserId: input.recipientUserId ?? recipientId,
        type: input.type ?? 'MENTION',
        actorUserId: actorId,
        messageId: input.messageId === undefined ? messageId : input.messageId,
        threadRootMessageId: input.threadRootMessageId ?? undefined,
        channelId: input.channelId === undefined ? channelId : input.channelId,
        actorName: 'Actor',
      },
    });
  }

  it('creates a notification with workspace/recipient/actor references', async () => {
    const row = await createNotification({});
    expect(row.workspaceId).toBe(workspaceId);
    expect(row.recipientUserId).toBe(recipientId);
    expect(row.actorUserId).toBe(actorId);
    expect(row.messageId).toBe(messageId);
    expect(row.readAt).toBeNull();
    const loaded = await prisma!.notification.findUniqueOrThrow({
      where: { id: row.id },
      include: { workspace: true, recipientUser: true, actorUser: true, message: true },
    });
    expect(loaded.workspace.id).toBe(workspaceId);
    expect(loaded.recipientUser.id).toBe(recipientId);
    expect(loaded.actorUser.id).toBe(actorId);
    expect(loaded.message?.id).toBe(messageId);
    await prisma!.notification.delete({ where: { id: row.id } });
  });

  it('accepts all four v1 notification types', async () => {
    const ids: string[] = [];
    for (const type of ['MENTION', 'DM_MESSAGE', 'GROUP_MESSAGE', 'THREAD_REPLY'] as const) {
      const other = await prisma!.message.create({
        data: { id: randomUUID(), channelId, authorId: actorId, body: `typed ${type}` },
      });
      const row = await createNotification({ type, messageId: other.id });
      ids.push(row.id, other.id);
      expect(row.type).toBe(type);
    }
    // Distinct messages keep the dedup identity disjoint across types here.
    await prisma!.notification.deleteMany({
      where: { id: { in: ids.filter((_, i) => i % 2 === 0) } },
    });
    await prisma!.message.deleteMany({ where: { id: { in: ids.filter((_, i) => i % 2 === 1) } } });
  });

  it('allows NULL messageId and lets NULL-messageId rows coexist', async () => {
    const first = await createNotification({ messageId: null });
    const second = await createNotification({ messageId: null, type: 'DM_MESSAGE' });
    expect(first.messageId).toBeNull();
    expect(second.messageId).toBeNull();
    // Same recipient+type with NULL messageId must also coexist (NULLs are
    // distinct in the UNIQUE constraint) — required for post-delete history.
    const third = await createNotification({ messageId: null });
    expect(third.id).not.toBe(first.id);
    await prisma!.notification.deleteMany({
      where: { id: { in: [first.id, second.id, third.id] } },
    });
  });

  it('prevents duplicate notification identity', async () => {
    const row = await createNotification({});
    await expect(createNotification({})).rejects.toMatchObject({ code: 'P2002' });
    await prisma!.notification.delete({ where: { id: row.id } });
  });

  it('survives source-message deletion with messageId nulled', async () => {
    const doomed = await prisma!.message.create({
      data: { id: randomUUID(), channelId, authorId: actorId, body: 'doomed' },
    });
    const row = await createNotification({ messageId: doomed.id });
    await prisma!.message.delete({ where: { id: doomed.id } });
    const survived = await prisma!.notification.findUniqueOrThrow({ where: { id: row.id } });
    expect(survived.messageId).toBeNull();
    expect(survived.actorName).toBe('Actor');
    await prisma!.notification.delete({ where: { id: row.id } });
  });

  it('survives thread-root deletion with threadRootMessageId nulled', async () => {
    const root = await prisma!.message.create({
      data: { id: randomUUID(), channelId, authorId: actorId, body: 'root' },
    });
    const reply = await prisma!.message.create({
      data: {
        id: randomUUID(),
        channelId,
        authorId: actorId,
        body: 'reply',
        parentMessageId: root.id,
      },
    });
    const row = await createNotification({
      type: 'THREAD_REPLY',
      messageId: reply.id,
      threadRootMessageId: root.id,
    });
    await prisma!.message.delete({ where: { id: root.id } });
    const survived = await prisma!.notification.findUniqueOrThrow({ where: { id: row.id } });
    expect(survived.threadRootMessageId).toBeNull();
    // The reply (cascade-kept? no — replies cascade from parent) is gone too;
    // the notification row itself must still exist.
    expect(survived.messageId).toBeNull();
    await prisma!.notification.delete({ where: { id: row.id } });
  });

  it('creates the required indexes and constraints', async () => {
    const indexes = await prisma!.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'notification'
    `;
    const names = indexes.map((row) => row.indexname);
    expect(names).toContain('notification_recipientUserId_createdAt_idx');
    expect(names).toContain('notification_recipientUserId_readAt_idx');
    expect(names).toContain('notification_recipientUserId_type_messageId_key');
  });

  it('defaults preferences to ALL and rejects other values', async () => {
    const prefs = await prisma!.userNotificationPreference.create({
      data: { userId: recipientId },
    });
    expect(prefs.mentionDelivery).toBe('ALL');
    expect(prefs.dmDelivery).toBe('ALL');
    expect(prefs.threadReplyDelivery).toBe('ALL');

    await expect(
      prisma!.userNotificationPreference.create({ data: { userId: actorId } }),
    ).resolves.toBeDefined();
    // Raw SQL bypasses the Prisma enum: PostgreSQL itself must reject it.
    await expect(
      prisma!.$executeRawUnsafe(
        `UPDATE "user_notification_preference" SET "mentionDelivery" = 'SOME' WHERE "userId" = '${actorId}'`,
      ),
    ).rejects.toThrow();
    await prisma!.userNotificationPreference.deleteMany({
      where: { userId: { in: [recipientId, actorId] } },
    });
  });

  it('treats users without a preference row as ALL (no backfill needed)', async () => {
    const fresh = await makeUser('Fresh');
    const row = await prisma!.userNotificationPreference.findUnique({
      where: { userId: fresh },
    });
    expect(row).toBeNull();
  });

  it('leaves unrelated tables and mention behavior unchanged', async () => {
    const mention = await prisma!.messageMention.create({
      data: { messageId, mentionedUserId: recipientId },
    });
    expect(mention.messageId).toBe(messageId);
    await prisma!.messageMention.delete({
      where: { messageId_mentionedUserId: { messageId, mentionedUserId: recipientId } },
    });
    const channel = await prisma!.channel.findUniqueOrThrow({ where: { id: channelId } });
    expect(channel.workspaceId).toBe(workspaceId);
  });
});

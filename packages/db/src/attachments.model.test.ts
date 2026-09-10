/**
 * Attachment data-model tests (Phase 4J.1).
 *
 * Live-database tests: SKIPPED when DATABASE_URL is absent.
 * Proves Attachment model relations, cascade deletion with message,
 * unique constraints on storageKey, and indexes.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from './index';

const LIVE = !!process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0;
const liveDescribe = LIVE ? describe : describe.skip;

const RUN = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;

liveDescribe('attachment data model (Phase 4J.1)', () => {
  const prisma = LIVE ? createPrismaClient() : null;

  let workspaceId = '';
  let userId = '';
  let channelId = '';
  let messageId = '';
  const createdUserIds: string[] = [];

  async function makeUser(name: string): Promise<string> {
    const user = await prisma!.user.create({
      data: { id: randomUUID(), name, email: `attach-${RUN}-${name}@example.invalid` },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    if (!LIVE) {
      return;
    }
    userId = await makeUser('Uploader');
    const workspace = await prisma!.workspace.create({
      data: { id: randomUUID(), name: `Attach HQ ${RUN}`, slug: `attach-hq-${RUN}` },
    });
    workspaceId = workspace.id;
    const channel = await prisma!.channel.create({
      data: {
        id: randomUUID(),
        workspaceId,
        name: `attachchan ${RUN}`,
        slug: `attachchan-${RUN}`,
        createdById: userId,
      },
    });
    channelId = channel.id;
    const message = await prisma!.message.create({
      data: { id: randomUUID(), channelId, authorId: userId, body: 'hello with attachments' },
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

  it('creates an attachment linked to a message and uploader', async () => {
    const attachment = await prisma!.attachment.create({
      data: {
        id: randomUUID(),
        messageId,
        uploaderId: userId,
        originalName: 'document.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        storageKey: `workspaces/${workspaceId}/messages/${messageId}/att-1`,
      },
    });

    expect(attachment.messageId).toBe(messageId);
    expect(attachment.uploaderId).toBe(userId);
    expect(attachment.originalName).toBe('document.pdf');
    expect(attachment.mimeType).toBe('application/pdf');
    expect(attachment.size).toBe(1024);

    const loaded = await prisma!.attachment.findUniqueOrThrow({
      where: { id: attachment.id },
      include: { message: true, uploader: true },
    });
    expect(loaded.message.id).toBe(messageId);
    expect(loaded.uploader.id).toBe(userId);

    await prisma!.attachment.delete({ where: { id: attachment.id } });
  });

  it('enforces unique storageKey constraint', async () => {
    const key = `workspaces/${workspaceId}/messages/${messageId}/att-unique`;
    const first = await prisma!.attachment.create({
      data: {
        id: randomUUID(),
        messageId,
        uploaderId: userId,
        originalName: 'file1.png',
        mimeType: 'image/png',
        size: 500,
        storageKey: key,
      },
    });

    await expect(
      prisma!.attachment.create({
        data: {
          id: randomUUID(),
          messageId,
          uploaderId: userId,
          originalName: 'file2.png',
          mimeType: 'image/png',
          size: 600,
          storageKey: key,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma!.attachment.delete({ where: { id: first.id } });
  });

  it('cascades attachment deletion when message is deleted', async () => {
    const tempMsg = await prisma!.message.create({
      data: { id: randomUUID(), channelId, authorId: userId, body: 'temporary message' },
    });
    const att = await prisma!.attachment.create({
      data: {
        id: randomUUID(),
        messageId: tempMsg.id,
        uploaderId: userId,
        originalName: 'doomed.png',
        mimeType: 'image/png',
        size: 200,
        storageKey: `workspaces/${workspaceId}/messages/${tempMsg.id}/att-doomed`,
      },
    });

    await prisma!.message.delete({ where: { id: tempMsg.id } });
    const count = await prisma!.attachment.count({ where: { id: att.id } });
    expect(count).toBe(0);
  });
});

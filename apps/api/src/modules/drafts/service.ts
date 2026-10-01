/**
 * Workspace draft domain logic (Audit 13).
 *
 * One body per (user, workspace, targetId). Empty bodies delete the row.
 * Membership is enforced first; non-members and unknown workspaces share
 * one 404. Target access is re-checked on write (channel/DM still open to
 * the caller) and on list hydration so a draft never outlives its container.
 */

import type { PrismaClient } from '@teamflow/db';
import { getMembershipRole } from '../workspaces/authorization';

export type DraftTargetKind = 'CHANNEL' | 'DIRECT_MESSAGE' | 'THREAD';

export interface DraftListItem {
  id: string;
  body: string;
  targetKind: DraftTargetKind;
  targetId: string;
  createdAt: Date;
  updatedAt: Date;
  container: {
    type: 'channel' | 'directMessage' | 'thread';
    id: string;
    name: string;
    slug?: string;
  };
}

export class DraftNotFoundError extends Error {
  constructor(message = 'Workspace not found.') {
    super(message);
    this.name = 'DraftNotFoundError';
  }
}

export class DraftValidationError extends Error {
  constructor(message = 'Invalid request.') {
    super(message);
    this.name = 'DraftValidationError';
  }
}

export class DraftForbiddenError extends Error {
  constructor(message = 'You do not have permission to save a draft here.') {
    super(message);
    this.name = 'DraftForbiddenError';
  }
}

export interface ListWorkspaceDraftsInput {
  workspaceId: string;
  userId: string;
}

export interface UpsertDraftInput {
  workspaceId: string;
  userId: string;
  targetKind: DraftTargetKind;
  targetId: string;
  body: string;
}

async function assertWorkspaceMember(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const role = await getMembershipRole(prisma, workspaceId, userId);
  if (!role) {
    throw new DraftNotFoundError('Workspace not found.');
  }
}

async function assertTargetAccessible(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
  targetKind: DraftTargetKind,
  targetId: string,
): Promise<void> {
  if (targetKind === 'CHANNEL') {
    const channel = await prisma.channel.findFirst({
      where: {
        id: targetId,
        workspaceId,
        OR: [
          { type: 'PUBLIC' },
          { type: 'PRIVATE', memberships: { some: { userId } } },
        ],
      },
      select: { id: true },
    });
    if (!channel) {
      throw new DraftForbiddenError('Channel not found or not accessible.');
    }
    return;
  }
  if (targetKind === 'DIRECT_MESSAGE') {
    const conversation = await prisma.directMessageConversation.findFirst({
      where: {
        id: targetId,
        workspaceId,
        participants: { some: { userId } },
      },
      select: { id: true },
    });
    if (!conversation) {
      throw new DraftForbiddenError('Conversation not found or not accessible.');
    }
    return;
  }
  // THREAD: target is a root message in an accessible container.
  const message = await prisma.message.findFirst({
    where: {
      id: targetId,
      deletedAt: null,
      OR: [
        {
          channel: {
            workspaceId,
            OR: [
              { type: 'PUBLIC' },
              { type: 'PRIVATE', memberships: { some: { userId } } },
            ],
          },
        },
        {
          directMessageConversation: {
            workspaceId,
            participants: { some: { userId } },
          },
        },
      ],
    },
    select: { id: true },
  });
  if (!message) {
    throw new DraftForbiddenError('Thread not found or not accessible.');
  }
}

async function hydrateContainers(
  prisma: PrismaClient,
  workspaceId: string,
  userId: string,
  rows: Array<{
    id: string;
    body: string;
    targetKind: DraftTargetKind;
    targetId: string;
    createdAt: Date;
    updatedAt: Date;
  }>,
): Promise<DraftListItem[]> {
  const channelIds = rows.filter((r) => r.targetKind === 'CHANNEL').map((r) => r.targetId);
  const conversationIds = rows
    .filter((r) => r.targetKind === 'DIRECT_MESSAGE')
    .map((r) => r.targetId);
  const threadIds = rows.filter((r) => r.targetKind === 'THREAD').map((r) => r.targetId);

  const [channels, conversations, threads] = await Promise.all([
    channelIds.length > 0
      ? prisma.channel.findMany({
          where: { id: { in: channelIds }, workspaceId },
          select: { id: true, name: true, slug: true },
        })
      : [],
    conversationIds.length > 0
      ? prisma.directMessageConversation.findMany({
          where: { id: { in: conversationIds }, workspaceId },
          select: {
            id: true,
            name: true,
            participants: { select: { user: { select: { id: true, name: true } } } },
          },
        })
      : [],
    threadIds.length > 0
      ? prisma.message.findMany({
          where: { id: { in: threadIds }, deletedAt: null },
          select: {
            id: true,
            channel: { select: { id: true, name: true, slug: true } },
            directMessageConversation: {
              select: {
                id: true,
                name: true,
                participants: { select: { user: { select: { id: true, name: true } } } },
              },
            },
          },
        })
      : [],
  ]);

  const channelById = new Map(channels.map((c) => [c.id, c]));
  const conversationById = new Map(conversations.map((c) => [c.id, c]));
  const threadById = new Map(threads.map((t) => [t.id, t]));

  const items: DraftListItem[] = [];
  for (const row of rows) {
    if (row.targetKind === 'CHANNEL') {
      const channel = channelById.get(row.targetId);
      if (!channel) continue;
      items.push({
        ...row,
        container: {
          type: 'channel',
          id: channel.id,
          name: channel.name,
          slug: channel.slug,
        },
      });
      continue;
    }
    if (row.targetKind === 'DIRECT_MESSAGE') {
      const conversation = conversationById.get(row.targetId);
      if (!conversation) continue;
      const peer = conversation.participants.find((p) => p.user.id !== userId)?.user;
      items.push({
        ...row,
        container: {
          type: 'directMessage',
          id: conversation.id,
          name: conversation.name?.trim() || peer?.name || 'Direct message',
        },
      });
      continue;
    }
    const thread = threadById.get(row.targetId);
    if (!thread) continue;
    if (thread.channel) {
      items.push({
        ...row,
        container: {
          type: 'thread',
          id: thread.channel.id,
          name: `#${thread.channel.name}`,
          slug: thread.channel.slug,
        },
      });
      continue;
    }
    const conversation = thread.directMessageConversation;
    if (!conversation) continue;
    const peer = conversation.participants.find((p) => p.user.id !== userId)?.user;
    items.push({
      ...row,
      container: {
        type: 'thread',
        id: conversation.id,
        name: conversation.name?.trim() || peer?.name || 'Direct message',
      },
    });
  }
  return items;
}

export async function listWorkspaceDrafts(
  prisma: PrismaClient,
  input: ListWorkspaceDraftsInput,
): Promise<DraftListItem[]> {
  await assertWorkspaceMember(prisma, input.workspaceId, input.userId);

  const rows = await prisma.draft.findMany({
    where: { userId: input.userId, workspaceId: input.workspaceId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      body: true,
      targetKind: true,
      targetId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return hydrateContainers(prisma, input.workspaceId, input.userId, rows);
}

/**
 * Upsert a draft. An empty/whitespace body deletes any existing row for
 * that target (idempotent clear). Returns the saved draft or null on clear.
 */
export async function upsertWorkspaceDraft(
  prisma: PrismaClient,
  input: UpsertDraftInput,
): Promise<DraftListItem | null> {
  await assertWorkspaceMember(prisma, input.workspaceId, input.userId);

  const body = input.body.trim();
  if (body.length === 0) {
    await prisma.draft.deleteMany({
      where: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        targetId: input.targetId,
      },
    });
    return null;
  }
  if (body.length > 10000) {
    throw new DraftValidationError('Drafts cannot exceed 10000 characters.');
  }

  await assertTargetAccessible(
    prisma,
    input.workspaceId,
    input.userId,
    input.targetKind,
    input.targetId,
  );

  const row = await prisma.draft.upsert({
    where: {
      userId_workspaceId_targetId: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        targetId: input.targetId,
      },
    },
    create: {
      id: crypto.randomUUID(),
      userId: input.userId,
      workspaceId: input.workspaceId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      body,
    },
    update: {
      targetKind: input.targetKind,
      body,
    },
    select: {
      id: true,
      body: true,
      targetKind: true,
      targetId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const [item] = await hydrateContainers(prisma, input.workspaceId, input.userId, [row]);
  if (!item) {
    // Container vanished between access check and hydrate — treat as cleared.
    await prisma.draft.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }
  return item;
}

export async function deleteWorkspaceDraft(
  prisma: PrismaClient,
  input: { workspaceId: string; userId: string; draftId: string },
): Promise<void> {
  await assertWorkspaceMember(prisma, input.workspaceId, input.userId);
  const existing = await prisma.draft.findFirst({
    where: {
      id: input.draftId,
      userId: input.userId,
      workspaceId: input.workspaceId,
    },
    select: { id: true },
  });
  if (!existing) {
    throw new DraftNotFoundError('Draft not found.');
  }
  await prisma.draft.delete({ where: { id: existing.id } });
}

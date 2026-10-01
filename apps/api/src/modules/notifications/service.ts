/**
 * Notification generation service (Phase 4H.4).
 *
 * Derives recipients exclusively from authoritative database state for an
 * already-committed message — never from client input (entry takes only a
 * messageId). Recipients collapse by precedence (MENTION > THREAD_REPLY >
 * DM/GROUP_MESSAGE) so each user gets at most one row per message, and
 * persistence is a single bulk idempotent insert. Preferences are
 * deliberately NOT read: rows are always persisted; preferences will gate
 * realtime delivery only (4H.6).
 */

import { randomUUID } from 'node:crypto';
import type { NotificationDelivery, NotificationType, PrismaClient } from '@teamflow/db';
import { getMembershipRole } from '../workspaces/authorization';
import { decodeNotificationCursor, encodeNotificationCursor } from './cursor';
import { emitNotificationNew, type NotificationPayload } from '../realtime/index';

export class NotificationNotFoundError extends Error {
  constructor(message = 'Notification not found.') {
    super(message);
    this.name = 'NotificationNotFoundError';
  }
}

export class NotificationValidationError extends Error {
  constructor(message = 'Invalid request.') {
    super(message);
    this.name = 'NotificationValidationError';
  }
}

export class NotificationGenerationError extends Error {
  constructor(message = 'Notification generation failed.') {
    super(message);
    this.name = 'NotificationGenerationError';
  }
}

type RecipientKind = 'MENTION' | 'THREAD_REPLY' | 'DM_MESSAGE' | 'GROUP_MESSAGE';

/** Higher number wins when one user qualifies several ways for one message. */
const PRECEDENCE: Record<RecipientKind, number> = {
  MENTION: 3,
  THREAD_REPLY: 2,
  DM_MESSAGE: 1,
  GROUP_MESSAGE: 1,
};

export interface GeneratedNotification {
  recipientUserId: string;
  type: NotificationType;
}

interface LoadedMessage {
  id: string;
  authorId: string;
  author: { id: string; name: string; image: string | null };
  channelId: string | null;
  directMessageConversationId: string | null;
  parentMessageId: string | null;
  deletedAt: Date | null;
  channel: { id: string; workspaceId: string; type: string; name: string } | null;
  directMessageConversation: {
    id: string;
    workspaceId: string;
    type: string;
    name: string | null;
  } | null;
}

/**
 * Generate notification rows for an already-committed message. Safe to retry:
 * the unique identity (recipientUserId, type, messageId) plus
 * `skipDuplicates` makes duplicate invocation converge. Throws on corrupt
 * state (callers decide failure semantics; message creation wraps this in
 * the non-rolling-back safe variant below).
 */
export async function generateNotificationsForMessage(
  prisma: PrismaClient,
  messageId: string,
): Promise<GeneratedNotification[]> {
  const message = (await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      author: { select: { id: true, name: true, image: true } },
      channel: { select: { id: true, workspaceId: true, type: true, name: true } },
      directMessageConversation: {
        select: { id: true, workspaceId: true, type: true, name: true },
      },
    },
  })) as LoadedMessage | null;
  if (!message || message.deletedAt) {
    // Generation triggers on creation only; a missing or tombstoned message
    // here means nothing to notify (deletes never generate).
    return [];
  }

  const actorId = message.authorId;
  const byUser = new Map<string, RecipientKind>();
  const consider = (userId: string, type: RecipientKind): void => {
    if (userId === actorId) {
      return;
    }
    const current = byUser.get(userId);
    if (!current || PRECEDENCE[type] > PRECEDENCE[current]) {
      byUser.set(userId, type);
    }
  };

  // Mentions are authoritative rows resolved at 4H.2 (already access-filtered).
  const mentionRows = await prisma.messageMention.findMany({
    where: { messageId },
    select: { mentionedUserId: true },
  });
  for (const row of mentionRows) {
    consider(row.mentionedUserId, 'MENTION');
  }

  let threadRootMessageId: string | null = null;
  const channel = message.channelId ? message.channel : null;
  const conversation = message.directMessageConversationId
    ? message.directMessageConversation
    : null;

  if (message.parentMessageId) {
    const root = await prisma.message.findUnique({
      where: { id: message.parentMessageId },
      select: { id: true, authorId: true },
    });
    if (!root) {
      throw new NotificationGenerationError('Thread root not found.');
    }
    threadRootMessageId = root.id;
    // Distinct authors only: long threads must not stream every reply row
    // just to build the THREAD_REPLY candidate set.
    const priorReplies = await prisma.message.findMany({
      where: { parentMessageId: root.id, id: { not: messageId } },
      select: { authorId: true },
      distinct: ['authorId'],
    });
    const candidates = new Set<string>([root.authorId]);
    for (const reply of priorReplies) {
      candidates.add(reply.authorId);
    }
    candidates.delete(actorId);
    const eligible = await filterThreadEligible(prisma, message, [...candidates]);
    for (const userId of eligible) {
      consider(userId, 'THREAD_REPLY');
    }
  } else if (conversation) {
    const participations = await prisma.directMessageParticipant.findMany({
      where: { conversationId: conversation.id },
      select: { userId: true },
    });
    const others = participations.map((p) => p.userId).filter((id) => id !== actorId);
    if (conversation.type === 'DIRECT') {
      for (const userId of others) {
        consider(userId, 'DM_MESSAGE');
      }
    } else {
      for (const userId of others) {
        consider(userId, 'GROUP_MESSAGE');
      }
    }
  } else if (!channel) {
    throw new NotificationGenerationError('Message has no container.');
  }
  // Channel root messages notify mentions only (already considered above).

  if (byUser.size === 0) {
    return [];
  }

  const workspaceId = channel ? channel.workspaceId : conversation?.workspaceId;
  if (!workspaceId) {
    throw new NotificationGenerationError('Message has no container.');
  }
  const channelName = channel ? channel.name : null;
  // DIRECT conversations carry no explicit name; snapshot what the recipient
  // sees as the conversation label — the peer, i.e. the actor. GROUP uses
  // the conversation name (nullable, UI falls back to participant names).
  const conversationName = conversation
    ? conversation.type === 'GROUP'
      ? (conversation.name ?? null)
      : message.author.name
    : null;

  const rows = [...byUser].map(([recipientUserId, type]) => ({
    id: randomUUID(),
    workspaceId,
    recipientUserId,
    type,
    actorUserId: actorId,
    messageId,
    conversationId: conversation ? conversation.id : null,
    channelId: channel ? channel.id : null,
    threadRootMessageId,
    actorName: message.author.name,
    actorImage: message.author.image,
    channelName,
    conversationName,
  }));

  await prisma.notification.createMany({ data: rows, skipDuplicates: true });
  // Awaited (still post-commit): keeps delivery strictly ordered after
  // persistence and deterministic under test. Failures propagate to the safe
  // wrapper, which logs without rolling back the message.
  await emitEligibleNotifications(prisma, rows);
  return rows.map((row) => ({ recipientUserId: row.recipientUserId, type: row.type }));
}

/**
 * Preference field governing realtime delivery for each notification type.
 * GROUP_MESSAGE shares dmDelivery by design (no separate group preference).
 */
function deliveryFieldFor(
  type: NotificationType,
): 'mentionDelivery' | 'dmDelivery' | 'threadReplyDelivery' {
  switch (type) {
    case 'MENTION':
      return 'mentionDelivery';
    case 'THREAD_REPLY':
      return 'threadReplyDelivery';
    case 'DM_MESSAGE':
    case 'GROUP_MESSAGE':
      return 'dmDelivery';
  }
}

/**
 * Emit one `notification:new` per row whose recipient allows realtime
 * delivery. Runs strictly after the createMany above has committed; a
 * missing preference row means ALL. Payload `createdAt` uses the emit-time
 * clock (millisecond skew vs the DB default is harmless: clients merge by
 * id and REST remains authoritative).
 */
async function emitEligibleNotifications(
  prisma: PrismaClient,
  rows: Array<{
    id: string;
    type: NotificationType;
    workspaceId: string;
    recipientUserId: string;
    actorUserId: string;
    actorName: string;
    actorImage: string | null;
    messageId: string;
    conversationId: string | null;
    channelId: string | null;
    threadRootMessageId: string | null;
    channelName: string | null;
    conversationName: string | null;
  }>,
): Promise<void> {
  const recipientIds = [...new Set(rows.map((row) => row.recipientUserId))];
  const preferences = await prisma.userNotificationPreference.findMany({
    where: { userId: { in: recipientIds } },
    select: { userId: true, mentionDelivery: true, dmDelivery: true, threadReplyDelivery: true },
  });
  const deliveryFor = new Map<string, Record<string, NotificationDelivery>>();
  for (const preference of preferences) {
    deliveryFor.set(preference.userId, {
      mentionDelivery: preference.mentionDelivery,
      dmDelivery: preference.dmDelivery,
      threadReplyDelivery: preference.threadReplyDelivery,
    });
  }
  const emittedAt = new Date().toISOString();
  for (const row of rows) {
    const preference = deliveryFor.get(row.recipientUserId);
    // Absent row behaves as ALL (safe default for existing users).
    if (preference && preference[deliveryFieldFor(row.type)] === 'NONE') {
      continue;
    }
    const payload: NotificationPayload = {
      id: row.id,
      type: row.type,
      workspaceId: row.workspaceId,
      recipientUserId: row.recipientUserId,
      actorUserId: row.actorUserId,
      actorName: row.actorName,
      actorImage: row.actorImage,
      messageId: row.messageId,
      conversationId: row.conversationId,
      channelId: row.channelId,
      threadRootMessageId: row.threadRootMessageId,
      channelName: row.channelName,
      conversationName: row.conversationName,
      createdAt: emittedAt,
      readAt: null,
    };
    emitNotificationNew(row.recipientUserId, payload);
  }
}

/**
 * Thread candidates must remain eligible at generation time (root author or
 * prior replier may since have lost access). Batched: one membership query,
 * plus one channel-membership query for PRIVATE channels; DM eligibility is
 * the current participant set.
 */
async function filterThreadEligible(
  prisma: PrismaClient,
  message: { channelId: string | null; directMessageConversationId: string | null },
  candidateIds: string[],
): Promise<Set<string>> {
  if (candidateIds.length === 0) {
    return new Set();
  }
  if (message.directMessageConversationId) {
    const participations = await prisma.directMessageParticipant.findMany({
      where: {
        conversationId: message.directMessageConversationId,
        userId: { in: candidateIds },
      },
      select: { userId: true },
    });
    return new Set(participations.map((p) => p.userId));
  }
  const channel = await prisma.channel.findUnique({
    where: { id: message.channelId as string },
    select: { workspaceId: true, type: true },
  });
  if (!channel) {
    return new Set();
  }
  const memberships = await prisma.workspaceMembership.findMany({
    where: { workspaceId: channel.workspaceId, userId: { in: candidateIds } },
    select: { userId: true },
  });
  const eligible = new Set(memberships.map((m) => m.userId));
  if (channel.type === 'PRIVATE') {
    const channelMemberships = await prisma.channelMembership.findMany({
      where: { channelId: message.channelId as string, userId: { in: candidateIds } },
      select: { userId: true },
    });
    const allowed = new Set(channelMemberships.map((m) => m.userId));
    for (const id of [...eligible]) {
      if (!allowed.has(id)) {
        eligible.delete(id);
      }
    }
  }
  return eligible;
}

/**
 * Post-commit wrapper: a notification failure must never roll back an
 * already-successful message, but it must stay observable — log loudly
 * (matching the repo's console.error convention) instead of swallowing.
 */
export async function generateNotificationsForMessageSafely(
  prisma: PrismaClient,
  messageId: string,
): Promise<void> {
  try {
    await generateNotificationsForMessage(prisma, messageId);
  } catch (error) {
    console.error('[notifications] failed to generate notifications', { messageId, error });
  }
}

// ---------------------------------------------------------------------------
// Read/update API (Phase 4H.5). Reads and mutates existing rows created by
// generation above; nothing here creates notifications.
// ---------------------------------------------------------------------------

export interface NotificationItem {
  id: string;
  type: NotificationType;
  workspaceId: string;
  recipientUserId: string;
  actorUserId: string;
  actorName: string;
  actorImage: string | null;
  messageId: string | null;
  conversationId: string | null;
  channelId: string | null;
  threadRootMessageId: string | null;
  channelName: string | null;
  conversationName: string | null;
  createdAt: Date;
  readAt: Date | null;
}

export interface NotificationPage {
  notifications: NotificationItem[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
}

const notificationSelect = {
  id: true,
  type: true,
  workspaceId: true,
  recipientUserId: true,
  actorUserId: true,
  actorName: true,
  actorImage: true,
  messageId: true,
  conversationId: true,
  channelId: true,
  threadRootMessageId: true,
  channelName: true,
  conversationName: true,
  createdAt: true,
  readAt: true,
} as const;

export interface ListNotificationsInput {
  workspaceId: string;
  userId: string;
  limit?: number;
  cursor?: string;
  unreadOnly?: boolean;
  type?: NotificationType;
}

/**
 * Workspace member's own notifications, newest first ((createdAt, id) DESC).
 * Source accessibility is part of the WHERE clause: channel rows require a
 * currently accessible channel (public, or private with membership) in this
 * workspace; conversation rows require current participation. Deleted-source
 * rows (messageId NULL) remain visible while their container is accessible.
 */
export async function listNotifications(
  prisma: PrismaClient,
  input: ListNotificationsInput,
): Promise<NotificationPage> {
  const role = await getMembershipRole(prisma, input.workspaceId, input.userId);
  if (!role) {
    throw new NotificationNotFoundError('Workspace not found.');
  }

  const limit = input.limit ?? 50;
  let cursor: { createdAt: Date; id: string } | undefined;
  if (input.cursor !== undefined) {
    const decoded = decodeNotificationCursor(input.cursor);
    if (!decoded) {
      throw new NotificationValidationError('Invalid pagination cursor.');
    }
    cursor = { createdAt: new Date(decoded.createdAt), id: decoded.id };
  }

  const rows = await prisma.notification.findMany({
    where: {
      workspaceId: input.workspaceId,
      recipientUserId: input.userId,
      ...(input.unreadOnly ? { readAt: null } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
      AND: [
        {
          OR: [
            { channelId: null },
            { channel: { workspaceId: input.workspaceId, type: 'PUBLIC' } },
            { channel: { memberships: { some: { userId: input.userId } } } },
          ],
        },
        {
          OR: [
            { conversationId: null },
            {
              conversation: {
                workspaceId: input.workspaceId,
                participants: { some: { userId: input.userId } },
              },
            },
          ],
        },
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: notificationSelect,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    notifications: page.map(toItem),
    pageInfo: {
      hasMore,
      nextCursor:
        hasMore && last
          ? encodeNotificationCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
          : null,
    },
  };
}

function toItem(row: {
  id: string;
  type: NotificationType;
  workspaceId: string;
  recipientUserId: string;
  actorUserId: string;
  actorName: string;
  actorImage: string | null;
  messageId: string | null;
  conversationId: string | null;
  channelId: string | null;
  threadRootMessageId: string | null;
  channelName: string | null;
  conversationName: string | null;
  createdAt: Date;
  readAt: Date | null;
}): NotificationItem {
  return { ...row };
}

export interface MarkNotificationReadInput {
  workspaceId: string;
  userId: string;
  notificationId: string;
}

/**
 * Mark one notification read. Atomic authorization-safe update: only a row
 * matching id + workspace + recipient can change, and already-read rows are
 * left untouched (re-mark succeeds idempotently by returning the row).
 * Returns whether an actual unread → read transition occurred so callers
 * emit realtime events only for real transitions. REST contract unchanged.
 */
export async function markNotificationRead(
  prisma: PrismaClient,
  input: MarkNotificationReadInput,
): Promise<{ notification: NotificationItem; updated: boolean }> {
  const role = await getMembershipRole(prisma, input.workspaceId, input.userId);
  if (!role) {
    throw new NotificationNotFoundError('Workspace not found.');
  }
  const updated = await prisma.notification.updateMany({
    where: {
      id: input.notificationId,
      workspaceId: input.workspaceId,
      recipientUserId: input.userId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  if (updated.count === 0) {
    const existing = await prisma.notification.findUnique({
      where: { id: input.notificationId },
      select: { id: true, workspaceId: true, recipientUserId: true },
    });
    if (
      !existing ||
      existing.workspaceId !== input.workspaceId ||
      existing.recipientUserId !== input.userId
    ) {
      // Missing, foreign-workspace, or another user's row: indistinguishable.
      throw new NotificationNotFoundError('Notification not found.');
    }
    // Already read — idempotent success below, no transition to emit.
  }
  const row = await prisma.notification.findUnique({
    where: { id: input.notificationId },
    select: notificationSelect,
  });
  if (!row || row.workspaceId !== input.workspaceId || row.recipientUserId !== input.userId) {
    throw new NotificationNotFoundError('Notification not found.');
  }
  return { notification: toItem(row), updated: updated.count > 0 };
}

export interface MarkAllNotificationsReadInput {
  workspaceId: string;
  userId: string;
}

/**
 * Mark all unread notifications read for this user in this workspace.
 * One bounded UPDATE; already-read rows are not touched.
 */
export async function markAllNotificationsRead(
  prisma: PrismaClient,
  input: MarkAllNotificationsReadInput,
): Promise<{ updatedCount: number }> {
  const role = await getMembershipRole(prisma, input.workspaceId, input.userId);
  if (!role) {
    throw new NotificationNotFoundError('Workspace not found.');
  }
  const updated = await prisma.notification.updateMany({
    where: { workspaceId: input.workspaceId, recipientUserId: input.userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updatedCount: updated.count };
}

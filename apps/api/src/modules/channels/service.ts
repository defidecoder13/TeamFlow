/**
 * Channel domain operations (Phase 3A).
 *
 * Pure database logic — no Express, no session handling. Every function takes
 * an explicit PrismaClient. Authorization lives in `authorization.ts` and the
 * routes; listing/creation assume the caller already verified workspace
 * membership, except where noted.
 */

import { randomUUID } from 'node:crypto';
import type { ChannelType, PrismaClient } from '@teamflow/db';
import { slugify } from '../workspaces/slug';

/** Safe channel representation returned by the API. */
export interface ChannelResponse {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  topic: string | null;
  type: ChannelType;
  createdAt: Date;
  updatedAt: Date;
}

/** Per-caller channel UI state (unread/star/mute) attached to list rows. */
export interface ChannelUserStateResponse {
  unreadCount: number;
  hasUnread: boolean;
  lastReadMessageId: string | null;
  isStarred: boolean;
  isMuted: boolean;
}

export interface ChannelWithUserState extends ChannelResponse {
  userState: ChannelUserStateResponse;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  );
}

export class ChannelNotFoundError extends Error {
  constructor() {
    super('Channel not found.');
    this.name = 'ChannelNotFoundError';
  }
}

export class ChannelSlugConflictError extends Error {
  constructor() {
    super('A channel with this name already exists. Please try a different name.');
    this.name = 'ChannelSlugConflictError';
  }
}

export class ChannelMembershipConflictError extends Error {
  constructor(message = 'User is already a member of this channel.') {
    super(message);
    this.name = 'ChannelMembershipConflictError';
  }
}

export class ChannelMembershipNotFoundError extends Error {
  constructor(message = 'Channel member not found.') {
    super(message);
    this.name = 'ChannelMembershipNotFoundError';
  }
}

export class ChannelValidationError extends Error {
  constructor(message = 'Validation failed.') {
    super(message);
    this.name = 'ChannelValidationError';
  }
}

export class ChannelForbiddenError extends Error {
  constructor(message = 'You do not have permission.') {
    super(message);
    this.name = 'ChannelForbiddenError';
  }
}

function toResponse(channel: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  topic?: string | null;
  type: ChannelType;
  createdAt: Date;
  updatedAt: Date;
}): ChannelResponse {
  return {
    id: channel.id,
    name: channel.name,
    slug: channel.slug,
    description: channel.description,
    topic: channel.topic ?? null,
    type: channel.type,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
  };
}

/**
 * Create a channel with the creator recorded. PRIVATE channels additionally
 * record the creator's channel membership — atomically in the same
 * transaction, so no partially-created private channel can exist. A taken
 * slug is an explicit conflict (409): unlike workspace names, channel names
 * are typed identifiers (#slug), so the caller chooses a new name instead of
 * receiving a silently suffixed one. The workspace-scoped unique constraint
 * is the final backstop.
 */
export async function createChannel(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    userId: string;
    name: string;
    description?: string | null;
    topic?: string | null;
    type: ChannelType;
  },
): Promise<ChannelResponse> {
  try {
    const channel = await prisma.$transaction(async (tx) => {
      const created = await tx.channel.create({
        data: {
          id: randomUUID(),
          workspaceId: input.workspaceId,
          name: input.name,
          slug: slugify(input.name),
          description: input.description ?? null,
          topic: input.topic ?? null,
          type: input.type,
          createdById: input.userId,
        },
      });
      if (input.type === 'PRIVATE') {
        await tx.channelMembership.create({
          data: { id: randomUUID(), channelId: created.id, userId: input.userId },
        });
      }
      return created;
    });
    return toResponse(channel);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ChannelSlugConflictError();
    }
    throw error;
  }
}

/**
 * Channels visible to a workspace member: all PUBLIC channels plus PRIVATE
 * channels with membership. Deterministic order: name ascending, id tiebreak.
 * Each row includes the caller's ChannelUserState (unread/star/mute).
 * The caller must have verified workspace membership first.
 */
export async function listAccessibleChannels(
  prisma: PrismaClient,
  input: { workspaceId: string; userId: string },
): Promise<ChannelWithUserState[]> {
  const channels = await prisma.channel.findMany({
    where: {
      workspaceId: input.workspaceId,
      OR: [{ type: 'PUBLIC' }, { memberships: { some: { userId: input.userId } } }],
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    include: {
      userStates: { where: { userId: input.userId } },
    },
  });
  if (channels.length === 0) {
    return [];
  }

  const channelIds = channels.map((c) => c.id);
  const stateByChannel = new Map(
    channels.flatMap((c) => c.userStates.map((s) => [c.id, s] as const)),
  );
  const unreadMap = await getChannelUnreadMap(prisma, {
    userId: input.userId,
    channelIds,
  });

  return channels.map((channel) => {
    const state = stateByChannel.get(channel.id);
    const unread = unreadMap.get(channel.id) ?? {
      unreadCount: 0,
      hasUnread: false,
      lastReadMessageId: null as string | null,
    };
    return {
      ...toResponse(channel),
      userState: {
        unreadCount: unread.unreadCount,
        hasUnread: unread.hasUnread,
        lastReadMessageId: unread.lastReadMessageId,
        isStarred: state?.isStarred ?? false,
        isMuted: state?.isMuted ?? false,
      },
    };
  });
}

export interface ChannelUnreadInfo {
  unreadCount: number;
  hasUnread: boolean;
  lastReadMessageId: string | null;
}

/**
 * Unread root-message counts per channel for one user. Mirrors the DM
 * unread map: no read state → all non-self root messages count; with a
 * lastReadMessage → strictly newer by (createdAt, id); with null message
 * id → newer than lastReadAt. Thread replies never count.
 */
export async function getChannelUnreadMap(
  prisma: PrismaClient,
  input: { userId: string; channelIds: string[] },
): Promise<Map<string, ChannelUnreadInfo>> {
  const result = new Map<string, ChannelUnreadInfo>();
  if (input.channelIds.length === 0) {
    return result;
  }
  for (const id of input.channelIds) {
    result.set(id, { unreadCount: 0, hasUnread: false, lastReadMessageId: null });
  }

  const states = await prisma.channelUserState.findMany({
    where: { userId: input.userId, channelId: { in: input.channelIds } },
    include: { lastReadMessage: { select: { createdAt: true, id: true } } },
  });
  const stateByChannel = new Map(states.map((s) => [s.channelId, s]));

  const withoutState: string[] = [];
  let minCutoff: number | null = null;
  for (const cid of input.channelIds) {
    const rs = stateByChannel.get(cid);
    if (!rs) {
      withoutState.push(cid);
      continue;
    }
    const info = result.get(cid)!;
    info.lastReadMessageId = rs.lastReadMessageId;
    const cutoff = rs.lastReadMessage?.createdAt ?? rs.lastReadAt;
    const time = cutoff instanceof Date ? cutoff.getTime() : new Date(cutoff).getTime();
    minCutoff = minCutoff === null ? time : Math.min(minCutoff, time);
  }

  const sharedClauses = {
    parentMessageId: null,
    authorId: { not: input.userId },
    deletedAt: null,
  } as const;
  const or: Array<Record<string, unknown>> = [];
  if (withoutState.length > 0) {
    or.push({ channelId: { in: withoutState }, ...sharedClauses });
  }
  const withStateIds = input.channelIds.filter((cid) => !withoutState.includes(cid));
  if (withStateIds.length > 0 && minCutoff !== null) {
    or.push({
      channelId: { in: withStateIds },
      ...sharedClauses,
      createdAt: { gte: new Date(minCutoff) },
    });
  }
  const unreadCandidates =
    or.length === 0
      ? []
      : await prisma.message.findMany({
          where: { OR: or as never },
          select: {
            id: true,
            channelId: true,
            authorId: true,
            createdAt: true,
          },
        });

  for (const msg of unreadCandidates) {
    if (msg.authorId === input.userId || !msg.channelId) continue;
    const info = result.get(msg.channelId);
    if (!info) continue;
    const rs = stateByChannel.get(msg.channelId);
    let isUnread = false;
    if (!rs) {
      isUnread = true;
    } else if (rs.lastReadMessage) {
      const cur = rs.lastReadMessage;
      if (
        msg.createdAt > cur.createdAt ||
        (msg.createdAt.getTime() === cur.createdAt.getTime() && msg.id > cur.id)
      ) {
        isUnread = true;
      }
    } else if (msg.createdAt > rs.lastReadAt) {
      isUnread = true;
    }
    if (isUnread) {
      info.unreadCount += 1;
      info.hasUnread = true;
    }
  }
  return result;
}

/** Upsert star/mute flags for the caller's channel user state. */
export async function updateChannelUserState(
  prisma: PrismaClient,
  input: {
    channelId: string;
    userId: string;
    isStarred?: boolean;
    isMuted?: boolean;
  },
): Promise<ChannelUserStateResponse> {
  const data: { isStarred?: boolean; isMuted?: boolean } = {};
  if (input.isStarred !== undefined) data.isStarred = input.isStarred;
  if (input.isMuted !== undefined) data.isMuted = input.isMuted;

  const upserted = await prisma.channelUserState.upsert({
    where: { channelId_userId: { channelId: input.channelId, userId: input.userId } },
    create: {
      id: randomUUID(),
      channelId: input.channelId,
      userId: input.userId,
      isStarred: data.isStarred ?? false,
      isMuted: data.isMuted ?? false,
    },
    update: data,
    include: { lastReadMessage: { select: { createdAt: true, id: true } } },
  });

  const unreadMap = await getChannelUnreadMap(prisma, {
    userId: input.userId,
    channelIds: [input.channelId],
  });
  const unread = unreadMap.get(input.channelId) ?? {
    unreadCount: 0,
    hasUnread: false,
    lastReadMessageId: null,
  };
  return {
    unreadCount: unread.unreadCount,
    hasUnread: unread.hasUnread,
    lastReadMessageId: upserted.lastReadMessageId ?? unread.lastReadMessageId,
    isStarred: upserted.isStarred,
    isMuted: upserted.isMuted,
  };
}

/**
 * Mark a channel read for the caller. With lastReadMessageId, validates the
 * message belongs to this channel; without it, stamps lastReadAt = now and
 * clears the message pointer (empty-channel / mark-all-read).
 */
export async function markChannelRead(
  prisma: PrismaClient,
  input: {
    channelId: string;
    userId: string;
    lastReadMessageId?: string;
  },
): Promise<ChannelUserStateResponse> {
  let lastReadMessageId: string | null = null;
  if (input.lastReadMessageId) {
    const message = await prisma.message.findUnique({
      where: { id: input.lastReadMessageId },
      select: { id: true, channelId: true },
    });
    if (!message || message.channelId !== input.channelId) {
      throw new ChannelNotFoundError();
    }
    lastReadMessageId = message.id;
  }

  const upserted = await prisma.channelUserState.upsert({
    where: { channelId_userId: { channelId: input.channelId, userId: input.userId } },
    create: {
      id: randomUUID(),
      channelId: input.channelId,
      userId: input.userId,
      lastReadMessageId,
      lastReadAt: new Date(),
    },
    update: {
      lastReadMessageId,
      lastReadAt: new Date(),
    },
  });

  const unreadMap = await getChannelUnreadMap(prisma, {
    userId: input.userId,
    channelIds: [input.channelId],
  });
  const unread = unreadMap.get(input.channelId) ?? {
    unreadCount: 0,
    hasUnread: false,
    lastReadMessageId: null,
  };
  return {
    unreadCount: unread.unreadCount,
    hasUnread: unread.hasUnread,
    lastReadMessageId: lastReadMessageId ?? unread.lastReadMessageId,
    isStarred: upserted.isStarred,
    isMuted: upserted.isMuted,
  };
}

export interface ChannelMember {
  id: string;
  channelId: string;
  userId: string;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

/**
 * List private-channel members. Caller must have verified access via
 * getAccessibleChannel and the channel must be PRIVATE — otherwise
 * ChannelNotFoundError preserves non-enumeration for callers without access.
 * The service double-checks membership so direct callers cannot bypass routes.
 */
export async function listChannelMembers(
  prisma: PrismaClient,
  input: { channelId: string; workspaceId: string; userId: string },
): Promise<ChannelMember[]> {
  const channel = await prisma.channel.findUnique({
    where: { id: input.channelId },
    select: { id: true, type: true, workspaceId: true },
  });
  if (!channel || channel.type !== 'PRIVATE' || channel.workspaceId !== input.workspaceId) {
    throw new ChannelNotFoundError();
  }
  const membership = await prisma.channelMembership.findUnique({
    where: { channelId_userId: { channelId: channel.id, userId: input.userId } },
    select: { id: true },
  });
  if (!membership) {
    throw new ChannelNotFoundError();
  }
  // Deterministic order mirrors listWorkspaceMembers: createdAt asc, id asc
  const members = await prisma.channelMembership.findMany({
    where: { channelId: channel.id },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return members.map((m) => ({
    id: m.id,
    channelId: m.channelId,
    userId: m.userId,
    createdAt: m.createdAt,
    user: m.user,
  }));
}

/**
 * Add an existing workspace member to a private channel. Validates channel
 * is PRIVATE and target belongs to same workspace; idempotency is enforced
 * by the DB unique constraint.
 */
export async function addChannelMember(
  prisma: PrismaClient,
  input: { channelId: string; workspaceId: string; targetUserId: string },
): Promise<ChannelMember> {
  const channel = await prisma.channel.findUnique({
    where: { id: input.channelId },
    select: { type: true, workspaceId: true },
  });
  if (!channel || channel.type !== 'PRIVATE' || channel.workspaceId !== input.workspaceId) {
    throw new ChannelNotFoundError();
  }
  const targetMembership = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.targetUserId } },
    select: { id: true },
  });
  if (!targetMembership) {
    throw new ChannelNotFoundError();
  }
  const existing = await prisma.channelMembership.findUnique({
    where: { channelId_userId: { channelId: input.channelId, userId: input.targetUserId } },
    select: { id: true },
  });
  if (existing) {
    throw new ChannelMembershipConflictError();
  }
  try {
    const created = await prisma.channelMembership.create({
      data: { id: randomUUID(), channelId: input.channelId, userId: input.targetUserId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    });
    return {
      id: created.id,
      channelId: created.channelId,
      userId: created.userId,
      createdAt: created.createdAt,
      user: created.user,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ChannelMembershipConflictError();
    }
    throw error;
  }
}

/**
 * Remove a member from a private channel. Validates channel is PRIVATE and
 * target is a member.
 */
export async function removeChannelMember(
  prisma: PrismaClient,
  input: { channelId: string; workspaceId: string; userId: string },
): Promise<void> {
  const channel = await prisma.channel.findUnique({
    where: { id: input.channelId },
    select: { type: true, workspaceId: true },
  });
  if (!channel || channel.type !== 'PRIVATE' || channel.workspaceId !== input.workspaceId) {
    throw new ChannelNotFoundError();
  }
  const existing = await prisma.channelMembership.findUnique({
    where: { channelId_userId: { channelId: input.channelId, userId: input.userId } },
    select: { id: true },
  });
  if (!existing) {
    throw new ChannelMembershipNotFoundError();
  }
  await prisma.channelMembership.delete({
    where: { channelId_userId: { channelId: input.channelId, userId: input.userId } },
  });
}

/**
 * Rename and/or re-describe a channel by id. The slug regenerates from the
 * new name; a taken slug is an explicit conflict (409), mirroring creation.
 * Type/workspace/creator are immutable here. Throws ChannelNotFoundError on
 * races.
 */
export async function updateChannel(
  prisma: PrismaClient,
  input: {
    channelId: string;
    name?: string;
    description?: string | null;
    topic?: string | null;
  },
): Promise<ChannelResponse> {
  try {
    const updated = await prisma.channel.update({
      where: { id: input.channelId },
      data: {
        ...(input.name !== undefined ? { name: input.name, slug: slugify(input.name) } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.topic !== undefined ? { topic: input.topic } : {}),
      },
    });
    return toResponse(updated);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ChannelSlugConflictError();
    }
    if (isRecordNotFoundError(error)) {
      throw new ChannelNotFoundError();
    }
    throw error;
  }
}

/**
 * Delete a channel by id. Cascades to messages/memberships at DB level.
 * Throws ChannelNotFoundError on races.
 */
export async function deleteChannel(
  prisma: PrismaClient,
  input: { channelId: string },
): Promise<void> {
  try {
    await prisma.channel.delete({ where: { id: input.channelId } });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      throw new ChannelNotFoundError();
    }
    throw error;
  }
}

/**
 * Self-leave a channel. For PRIVATE channels, removes ChannelMembership.
 * For PUBLIC channels, there is no membership to remove — succeeds as no-op
 * if the user is a workspace member (verified by route via getAccessibleChannel).
 * Throws ChannelMembershipNotFoundError when PRIVATE membership missing.
 */
export async function leaveChannel(
  prisma: PrismaClient,
  input: { channelId: string; userId: string },
): Promise<void> {
  const channel = await prisma.channel.findUnique({
    where: { id: input.channelId },
    select: { type: true },
  });
  if (!channel) throw new ChannelNotFoundError();
  if (channel.type === 'PUBLIC') {
    // Public channels have no membership rows; leaving is a no-op success.
    // If a stray PRIVATE-style membership exists, clean it.
    const existing = await prisma.channelMembership.findUnique({
      where: { channelId_userId: { channelId: input.channelId, userId: input.userId } },
      select: { id: true },
    });
    if (existing) {
      await prisma.channelMembership.delete({
        where: { channelId_userId: { channelId: input.channelId, userId: input.userId } },
      });
    }
    return;
  }
  const existing = await prisma.channelMembership.findUnique({
    where: { channelId_userId: { channelId: input.channelId, userId: input.userId } },
    select: { id: true },
  });
  if (!existing) throw new ChannelMembershipNotFoundError();
  await prisma.channelMembership.delete({
    where: { channelId_userId: { channelId: input.channelId, userId: input.userId } },
  });
}

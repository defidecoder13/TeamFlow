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
  type: ChannelType;
  createdAt: Date;
  updatedAt: Date;
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
  type: ChannelType;
  createdAt: Date;
  updatedAt: Date;
}): ChannelResponse {
  return {
    id: channel.id,
    name: channel.name,
    slug: channel.slug,
    description: channel.description,
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
 * The caller must have verified workspace membership first.
 */
export async function listAccessibleChannels(
  prisma: PrismaClient,
  input: { workspaceId: string; userId: string },
): Promise<ChannelResponse[]> {
  const channels = await prisma.channel.findMany({
    where: {
      workspaceId: input.workspaceId,
      OR: [{ type: 'PUBLIC' }, { memberships: { some: { userId: input.userId } } }],
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return channels.map(toResponse);
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
  input: { channelId: string; name?: string; description?: string | null },
): Promise<ChannelResponse> {
  try {
    const updated = await prisma.channel.update({
      where: { id: input.channelId },
      data: {
        ...(input.name !== undefined ? { name: input.name, slug: slugify(input.name) } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
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

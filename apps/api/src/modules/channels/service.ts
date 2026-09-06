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

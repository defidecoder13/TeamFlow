/**
 * Channel authorization (Phase 3A).
 *
 * Pattern: requireAuth → workspace membership → channel access → controller.
 * - PUBLIC channels: any workspace member.
 * - PRIVATE channels: channel members only (creator is auto-added at
 *   creation; ChannelMembership has no roles by design).
 * - Missing workspace, missing channel, non-membership, and unauthorized
 *   private access are all indistinguishable (null → 404 downstream), so
 *   private channel existence never leaks.
 */

import type { Channel, PrismaClient, WorkspaceRole } from '@teamflow/db';

export interface AccessibleChannel {
  channel: Channel;
  workspaceRole: WorkspaceRole;
}

/**
 * Resolve a channel for a user within a workspace, or null when the
 * workspace/channel is missing, the user is not a workspace member, or the
 * channel is private without channel membership.
 */
export async function getAccessibleChannel(
  prisma: PrismaClient,
  input: { workspaceId: string; channelSlug: string; userId: string },
): Promise<AccessibleChannel | null> {
  const [membership, channel] = await Promise.all([
    prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
      select: { role: true },
    }),
    prisma.channel.findUnique({
      where: { workspaceId_slug: { workspaceId: input.workspaceId, slug: input.channelSlug } },
    }),
  ]);
  if (!membership || !channel) {
    return null;
  }
  if (channel.type === 'PRIVATE') {
    const channelMembership = await prisma.channelMembership.findUnique({
      where: { channelId_userId: { channelId: channel.id, userId: input.userId } },
      select: { id: true },
    });
    if (!channelMembership) {
      return null;
    }
  }
  return { channel, workspaceRole: membership.role };
}

/**
 * Metadata updates: OWNER/ADMIN anywhere in the workspace; MEMBER only on
 * channels they created. Slug/type/workspace/creator are never mutable
 * through update (enforced by validation + service).
 */
export function canUpdateChannel(input: {
  workspaceRole: WorkspaceRole;
  isCreator: boolean;
}): boolean {
  return input.workspaceRole === 'OWNER' || input.workspaceRole === 'ADMIN' || input.isCreator;
}

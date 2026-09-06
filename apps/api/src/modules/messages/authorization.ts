/**
 * Message authorization (Phase 4A).
 *
 * Message access always resolves through the channel: workspace membership
 * first, then channel membership for PRIVATE channels. Message ID secrecy is
 * never authorization — PATCH/DELETE re-verify channel access on top of
 * authorship. Missing/inaccessible resources are indistinguishable (null).
 */

import type { Channel, PrismaClient } from '@teamflow/db';

/**
 * Resolve a channel by id for a user: null unless the channel exists, the
 * user is a workspace member, and (for PRIVATE) a channel member.
 */
export async function authorizeChannelAccess(
  prisma: PrismaClient,
  input: { channelId: string; userId: string },
): Promise<Channel | null> {
  const channel = await prisma.channel.findUnique({ where: { id: input.channelId } });
  if (!channel) {
    return null;
  }
  const membership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: { workspaceId: channel.workspaceId, userId: input.userId },
    },
    select: { id: true },
  });
  if (!membership) {
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
  return channel;
}

/** Authorship check: only the original author may edit or delete. */
export function isMessageAuthor(message: { authorId: string }, userId: string): boolean {
  return message.authorId === userId;
}

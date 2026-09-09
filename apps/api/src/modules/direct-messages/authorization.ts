/**
 * Direct Message authorization (Phase 4F.1).
 *
 * Scopes DMs to workspace boundaries. Both participants must belong to the
 * workspace. Missing or unauthorized conversations return null to prevent
 * conversation enumeration.
 */

import type { DirectMessageConversation, PrismaClient } from '@teamflow/db';

export async function authorizeDirectConversationAccess(
  prisma: PrismaClient,
  input: { conversationId: string; userId: string },
): Promise<DirectMessageConversation | null> {
  const conversation = await prisma.directMessageConversation.findUnique({
    where: { id: input.conversationId },
  });
  if (!conversation) {
    return null;
  }

  // Caller must be an active member of the workspace
  const workspaceMembership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: conversation.workspaceId,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (!workspaceMembership) {
    return null;
  }

  // Caller must be an active participant in this conversation
  const participant = await prisma.directMessageParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: conversation.id,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (!participant) {
    return null;
  }

  return conversation;
}

export type CanCreateDirectConversationResult =
  | { ok: true }
  | { ok: false; reason: 'SELF_DM' | 'USER_NOT_IN_WORKSPACE' | 'TARGET_NOT_IN_WORKSPACE' };

export async function canCreateDirectConversation(
  prisma: PrismaClient,
  input: { workspaceId: string; userId: string; targetUserId: string },
): Promise<CanCreateDirectConversationResult> {
  if (input.userId === input.targetUserId) {
    return { ok: false, reason: 'SELF_DM' };
  }

  const callerMembership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (!callerMembership) {
    return { ok: false, reason: 'USER_NOT_IN_WORKSPACE' };
  }

  const targetMembership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId: input.targetUserId,
      },
    },
    select: { id: true },
  });
  if (!targetMembership) {
    return { ok: false, reason: 'TARGET_NOT_IN_WORKSPACE' };
  }

  return { ok: true };
}

export type AuthorizeDirectConversationAdminResult =
  | { ok: true; conversation: DirectMessageConversation }
  | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' };

export async function authorizeDirectConversationAdmin(
  prisma: PrismaClient,
  input: { conversationId: string; userId: string },
): Promise<AuthorizeDirectConversationAdminResult> {
  const conversation = await prisma.directMessageConversation.findUnique({
    where: { id: input.conversationId },
  });
  if (!conversation) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const workspaceMembership = await prisma.workspaceMembership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: conversation.workspaceId,
        userId: input.userId,
      },
    },
    select: { id: true },
  });
  if (!workspaceMembership) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  const participant = await prisma.directMessageParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId: conversation.id,
        userId: input.userId,
      },
    },
    select: { id: true, role: true },
  });
  if (!participant) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  if (participant.role !== 'ADMIN') {
    return { ok: false, reason: 'FORBIDDEN' };
  }

  return { ok: true, conversation };
}

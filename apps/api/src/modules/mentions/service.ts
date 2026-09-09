/**
 * Server-side mention resolution and persistence (Phase 4H.2).
 *
 * Mention eligibility is derived entirely server-side from the message's
 * container — never from client-supplied user IDs (there is no such input;
 * sync functions take only a messageId). Resolution is exact,
 * case-insensitive name matching against eligible users; ambiguous names
 * resolve to nobody. Persistence represents CURRENT mention truth and runs
 * in its own short transaction AFTER the message create/edit commit, keeping
 * the hot message transactions untouched (4H.1 §13/§16).
 *
 * Deliberately no notifications, no realtime, no routes here (4H.4+).
 */

import type { PrismaClient } from '@teamflow/db';
import { candidateNames } from './parser';

export class MentionNotFoundError extends Error {
  constructor(message = 'Message not found.') {
    super(message);
    this.name = 'MentionNotFoundError';
  }
}

interface EligibleUser {
  id: string;
  name: string;
}

/** Deterministic name key: case-insensitive, collapsed whitespace. */
export function normalizeMentionName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

interface MessageContainer {
  channelId: string | null;
  directMessageConversationId: string | null;
}

/**
 * Load the users eligible to be mentioned in a message inside `container`.
 * Channel messages: workspace members, intersected with channel members for
 * PRIVATE channels. DM/group messages: current participants only (removed
 * participants have no row and are therefore ineligible).
 */
async function loadEligibleUsers(
  prisma: PrismaClient,
  container: MessageContainer,
): Promise<EligibleUser[]> {
  if (container.channelId) {
    const channel = await prisma.channel.findUnique({
      where: { id: container.channelId },
      select: { id: true, workspaceId: true, type: true },
    });
    if (!channel) {
      return [];
    }
    if (channel.type === 'PRIVATE') {
      const memberships = await prisma.channelMembership.findMany({
        where: { channelId: channel.id },
        include: { user: { select: { id: true, name: true } } },
      });
      return memberships.map((membership) => ({
        id: membership.user.id,
        name: membership.user.name,
      }));
    }
    const memberships = await prisma.workspaceMembership.findMany({
      where: { workspaceId: channel.workspaceId },
      include: { user: { select: { id: true, name: true } } },
    });
    return memberships.map((membership) => ({
      id: membership.user.id,
      name: membership.user.name,
    }));
  }
  if (container.directMessageConversationId) {
    const participations = await prisma.directMessageParticipant.findMany({
      where: { conversationId: container.directMessageConversationId },
      include: { user: { select: { id: true, name: true } } },
    });
    return participations.map((participation) => ({
      id: participation.user.id,
      name: participation.user.name,
    }));
  }
  return [];
}

/**
 * Resolve a body to mentioned user IDs against an eligible user list.
 * Longest exact (normalized) match wins per candidate; a normalized name
 * shared by several eligible users resolves to nobody. Pure function of its
 * inputs — unit-testable without a database.
 */
export function matchMentionCandidates(candidates: string[], eligible: EligibleUser[]): string[] {
  const byName = new Map<string, EligibleUser[]>();
  for (const user of eligible) {
    const key = normalizeMentionName(user.name);
    const group = byName.get(key);
    if (group) {
      group.push(user);
    } else {
      byName.set(key, [user]);
    }
  }
  const resolved = new Set<string>();
  const ordered = [...candidates].sort((a, b) => b.length - a.length);
  for (const candidate of ordered) {
    const group = byName.get(normalizeMentionName(candidate));
    if (group && group.length === 1) {
      resolved.add(group[0].id);
    }
  }
  return [...resolved].sort();
}

export interface ResolveMentionsInput {
  body: string;
  channelId?: string | null;
  directMessageConversationId?: string | null;
}

/**
 * Resolve the mentioned user IDs for a message body + container.
 * Returns deterministic sorted IDs. Never touches notifications.
 */
export async function resolveMentionedUserIds(
  prisma: PrismaClient,
  input: ResolveMentionsInput,
): Promise<string[]> {
  const candidates = candidateNames(input.body);
  if (candidates.length === 0) {
    return [];
  }
  const eligible = await loadEligibleUsers(prisma, {
    channelId: input.channelId ?? null,
    directMessageConversationId: input.directMessageConversationId ?? null,
  });
  if (eligible.length === 0) {
    return [];
  }
  return matchMentionCandidates(candidates, eligible);
}

async function loadMessageForMentions(
  prisma: PrismaClient,
  messageId: string,
): Promise<{
  id: string;
  body: string;
  channelId: string | null;
  directMessageConversationId: string | null;
  deletedAt: Date | null;
}> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      body: true,
      channelId: true,
      directMessageConversationId: true,
      deletedAt: true,
    },
  });
  if (!message) {
    throw new MentionNotFoundError();
  }
  return message;
}

/**
 * Persist mentions for a freshly created message. New rows cannot have stale
 * mentions, so this skips the existing-row read that `syncMessageMentions`
 * performs for edits.
 */
export async function createMentionsForMessage(
  prisma: PrismaClient,
  input: {
    messageId: string;
    body: string;
    channelId?: string | null;
    directMessageConversationId?: string | null;
  },
): Promise<string[]> {
  const targetIds = await resolveMentionedUserIds(prisma, {
    body: input.body,
    channelId: input.channelId,
    directMessageConversationId: input.directMessageConversationId,
  });
  if (targetIds.length === 0) {
    return [];
  }
  await prisma.$transaction(async (tx) => {
    await tx.messageMention.createMany({
      data: targetIds.map((mentionedUserId) => ({ messageId: input.messageId, mentionedUserId })),
      skipDuplicates: true,
    });
  });
  return targetIds;
}

/**
 * Reconcile stored mentions with the message's current body. Used after
 * edits (added users stored, removed users deleted, unchanged rows
 * untouched) and after soft-delete (all rows cleared, none created).
 * Performs zero writes when the set already matches.
 */
export async function syncMessageMentions(
  prisma: PrismaClient,
  messageId: string,
): Promise<string[]> {
  const message = await loadMessageForMentions(prisma, messageId);
  if (message.deletedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.messageMention.deleteMany({ where: { messageId } });
    });
    return [];
  }
  const targetIds = await resolveMentionedUserIds(prisma, {
    body: message.body,
    channelId: message.channelId,
    directMessageConversationId: message.directMessageConversationId,
  });
  const existing = await prisma.messageMention.findMany({
    where: { messageId },
    select: { mentionedUserId: true },
  });
  const existingIds = new Set(existing.map((row) => row.mentionedUserId));
  const targetSet = new Set(targetIds);
  const toDelete = [...existingIds].filter((id) => !targetSet.has(id));
  const toAdd = targetIds.filter((id) => !existingIds.has(id));
  if (toDelete.length === 0 && toAdd.length === 0) {
    return targetIds;
  }
  await prisma.$transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx.messageMention.deleteMany({
        where: { messageId, mentionedUserId: { in: toDelete } },
      });
    }
    if (toAdd.length > 0) {
      await tx.messageMention.createMany({
        data: toAdd.map((mentionedUserId) => ({ messageId, mentionedUserId })),
        skipDuplicates: true,
      });
    }
  });
  return targetIds;
}

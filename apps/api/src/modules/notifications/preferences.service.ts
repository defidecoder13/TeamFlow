/**
 * User notification preference domain service (Phase 4H.8).
 *
 * Provides safe fetching with fallback defaults (ALL, ALL, ALL) and atomic
 * concurrency-safe upsert on the user's primary key without race conditions.
 */

import type { NotificationDelivery, PrismaClient } from '@teamflow/db';
import type { UpdateNotificationPreferencesInput } from './preferences.schemas';

export interface UserNotificationPreferencesResponse {
  mentionDelivery: NotificationDelivery;
  dmDelivery: NotificationDelivery;
  threadReplyDelivery: NotificationDelivery;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: UserNotificationPreferencesResponse = {
  mentionDelivery: 'ALL',
  dmDelivery: 'ALL',
  threadReplyDelivery: 'ALL',
};

export async function getNotificationPreferences(
  prisma: PrismaClient,
  userId: string,
): Promise<UserNotificationPreferencesResponse> {
  const pref = await prisma.userNotificationPreference.findUnique({
    where: { userId },
    select: {
      mentionDelivery: true,
      dmDelivery: true,
      threadReplyDelivery: true,
    },
  });

  if (!pref) {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  return {
    mentionDelivery: pref.mentionDelivery,
    dmDelivery: pref.dmDelivery,
    threadReplyDelivery: pref.threadReplyDelivery,
  };
}

export async function updateNotificationPreferences(
  prisma: PrismaClient,
  userId: string,
  patch: UpdateNotificationPreferencesInput,
): Promise<UserNotificationPreferencesResponse> {
  const updated = await prisma.userNotificationPreference.upsert({
    where: { userId },
    create: {
      userId,
      mentionDelivery: patch.mentionDelivery ?? 'ALL',
      dmDelivery: patch.dmDelivery ?? 'ALL',
      threadReplyDelivery: patch.threadReplyDelivery ?? 'ALL',
    },
    update: {
      ...(patch.mentionDelivery !== undefined && { mentionDelivery: patch.mentionDelivery }),
      ...(patch.dmDelivery !== undefined && { dmDelivery: patch.dmDelivery }),
      ...(patch.threadReplyDelivery !== undefined && {
        threadReplyDelivery: patch.threadReplyDelivery,
      }),
    },
    select: {
      mentionDelivery: true,
      dmDelivery: true,
      threadReplyDelivery: true,
    },
  });

  return {
    mentionDelivery: updated.mentionDelivery,
    dmDelivery: updated.dmDelivery,
    threadReplyDelivery: updated.threadReplyDelivery,
  };
}

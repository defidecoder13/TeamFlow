/**
 * Notification preferences API client (Phase 4H.8).
 *
 * REST client for GET/PATCH /api/users/me/notification-preferences.
 * Strict typing and runtime parsing.
 */

import type { ApiResult } from './messages';

export type NotificationDelivery = 'ALL' | 'NONE';

export interface NotificationPreferences {
  mentionDelivery: NotificationDelivery;
  dmDelivery: NotificationDelivery;
  threadReplyDelivery: NotificationDelivery;
}

export interface UpdateNotificationPreferencesInput {
  mentionDelivery?: NotificationDelivery;
  dmDelivery?: NotificationDelivery;
  threadReplyDelivery?: NotificationDelivery;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNotificationDelivery(value: unknown): value is NotificationDelivery {
  return value === 'ALL' || value === 'NONE';
}

export function notificationPreferencesFromJson(value: unknown): NotificationPreferences | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    !isNotificationDelivery(value.mentionDelivery) ||
    !isNotificationDelivery(value.dmDelivery) ||
    !isNotificationDelivery(value.threadReplyDelivery)
  ) {
    return null;
  }
  return {
    mentionDelivery: value.mentionDelivery,
    dmDelivery: value.dmDelivery,
    threadReplyDelivery: value.threadReplyDelivery,
  };
}

export async function fetchNotificationPreferences(
  apiBase: string,
): Promise<ApiResult<NotificationPreferences>> {
  try {
    const res = await fetch(`${apiBase}/api/users/me/notification-preferences`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });

    if (res.status === 401) {
      return {
        ok: false,
        unauthenticated: true,
        kind: 'UNAUTHENTICATED',
        message: 'You must be signed in.',
      };
    }

    const json = (await res.json().catch(() => null)) as unknown;

    if (!res.ok) {
      const err = isRecord(json) && isRecord(json.error) ? json.error : null;
      return {
        ok: false,
        kind: typeof err?.code === 'string' ? err.code : 'HTTP_ERROR',
        message:
          typeof err?.message === 'string'
            ? err.message
            : `Request failed with status ${res.status}`,
      };
    }

    const preferences = notificationPreferencesFromJson(json);
    if (!preferences) {
      return {
        ok: false,
        kind: 'MALFORMED_RESPONSE',
        message: 'Server returned an invalid notification preferences payload.',
      };
    }

    return { ok: true, data: preferences };
  } catch (error) {
    return {
      ok: false,
      kind: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Network request failed',
    };
  }
}

export async function updateNotificationPreferences(
  apiBase: string,
  patch: UpdateNotificationPreferencesInput,
): Promise<ApiResult<NotificationPreferences>> {
  try {
    const res = await fetch(`${apiBase}/api/users/me/notification-preferences`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(patch),
    });

    if (res.status === 401) {
      return {
        ok: false,
        unauthenticated: true,
        kind: 'UNAUTHENTICATED',
        message: 'You must be signed in.',
      };
    }

    const json = (await res.json().catch(() => null)) as unknown;

    if (!res.ok) {
      const err = isRecord(json) && isRecord(json.error) ? json.error : null;
      return {
        ok: false,
        kind: typeof err?.code === 'string' ? err.code : 'HTTP_ERROR',
        message:
          typeof err?.message === 'string'
            ? err.message
            : `Request failed with status ${res.status}`,
      };
    }

    const preferences = notificationPreferencesFromJson(json);
    if (!preferences) {
      return {
        ok: false,
        kind: 'MALFORMED_RESPONSE',
        message: 'Server returned an invalid notification preferences payload.',
      };
    }

    return { ok: true, data: preferences };
  } catch (error) {
    return {
      ok: false,
      kind: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Network request failed',
    };
  }
}

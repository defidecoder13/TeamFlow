/**
 * Notification preferences API client tests (Phase 4H.8).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchNotificationPreferences,
  notificationPreferencesFromJson,
  updateNotificationPreferences,
} from './notification-preferences';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('notificationPreferencesFromJson', () => {
  it('parses valid preferences payload', () => {
    const data = {
      mentionDelivery: 'ALL' as const,
      dmDelivery: 'NONE' as const,
      threadReplyDelivery: 'ALL' as const,
    };
    const parsed = notificationPreferencesFromJson(data);
    expect(parsed).toEqual(data);
  });

  it('rejects invalid or incomplete payloads', () => {
    expect(notificationPreferencesFromJson(null)).toBeNull();
    expect(notificationPreferencesFromJson({})).toBeNull();
    expect(
      notificationPreferencesFromJson({
        mentionDelivery: 'INVALID',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'ALL',
      }),
    ).toBeNull();
    expect(
      notificationPreferencesFromJson({
        mentionDelivery: 'ALL',
        dmDelivery: 'ALL',
      }),
    ).toBeNull();
  });
});

describe('fetchNotificationPreferences', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and returns preferences successfully', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        mentionDelivery: 'ALL',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'NONE',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchNotificationPreferences('http://localhost:4000');
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/users/me/notification-preferences',
      expect.objectContaining({ method: 'GET' }),
    );
    if (res.ok) {
      expect(res.data).toEqual({
        mentionDelivery: 'ALL',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'NONE',
      });
    }
  });

  it('handles server errors gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(500, {
          error: { code: 'INTERNAL_ERROR', message: 'Something broke' },
        }),
      ),
    );

    const res = await fetchNotificationPreferences('http://localhost:4000');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('INTERNAL_ERROR');
    }
  });

  it('handles network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')));

    const res = await fetchNotificationPreferences('http://localhost:4000');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.kind).toBe('NETWORK_ERROR');
    }
  });
});

describe('updateNotificationPreferences', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends PATCH request with payload and returns updated preferences', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        mentionDelivery: 'NONE',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'ALL',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await updateNotificationPreferences('http://localhost:4000', {
      mentionDelivery: 'NONE',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.mentionDelivery).toBe('NONE');
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/users/me/notification-preferences',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ mentionDelivery: 'NONE' }),
      }),
    );
  });

  it('never uses a relative URL (split-origin regression)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        mentionDelivery: 'ALL',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'ALL',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchNotificationPreferences('https://api.example.com');
    await updateNotificationPreferences('https://api.example.com', { dmDelivery: 'NONE' });

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      expect(url.startsWith('https://api.example.com/api/')).toBe(true);
      expect(url).not.toContain('/api/api/');
    }
  });
});

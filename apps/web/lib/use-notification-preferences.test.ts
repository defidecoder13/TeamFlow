/**
 * User Notification Preferences hook tests (Phase 4H.8).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './notification-preferences';
import { useNotificationPreferences } from './use-notification-preferences';

vi.mock('./notification-preferences', async () => {
  const actual = await vi.importActual<typeof import('./notification-preferences')>(
    './notification-preferences',
  );
  return {
    ...actual,
    fetchNotificationPreferences: vi.fn(),
    updateNotificationPreferences: vi.fn(),
  };
});

describe('useNotificationPreferences', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads preferences on mount', async () => {
    vi.mocked(api.fetchNotificationPreferences).mockResolvedValue({
      ok: true,
      data: {
        mentionDelivery: 'ALL',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'ALL',
      },
    });

    const { result } = renderHook(() => useNotificationPreferences());

    expect(result.current.state.status).toBe('loading');

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.preferences).toEqual({
        mentionDelivery: 'ALL',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'ALL',
      });
    }
  });

  it('handles initial load error with retry capability', async () => {
    vi.mocked(api.fetchNotificationPreferences).mockResolvedValueOnce({
      ok: false,
      kind: 'NETWORK_ERROR',
      message: 'Failed to load',
    });

    const { result } = renderHook(() => useNotificationPreferences());

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    if (result.current.state.status === 'error') {
      expect(result.current.state.message).toBe('Failed to load');
    }

    // Now mock success and trigger retry
    vi.mocked(api.fetchNotificationPreferences).mockResolvedValueOnce({
      ok: true,
      data: {
        mentionDelivery: 'ALL',
        dmDelivery: 'NONE',
        threadReplyDelivery: 'ALL',
      },
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.preferences.dmDelivery).toBe('NONE');
    }
  });

  it('surfaces expired sessions distinctly from load errors', async () => {
    vi.mocked(api.fetchNotificationPreferences).mockResolvedValueOnce({
      ok: false,
      unauthenticated: true,
      kind: 'UNAUTHENTICATED',
      message: 'You must be signed in.',
    });

    const { result } = renderHook(() => useNotificationPreferences());

    await waitFor(() => {
      expect(result.current.state.status).toBe('unauthenticated');
    });
  });

  it('optimistically updates preference and persists', async () => {
    vi.mocked(api.fetchNotificationPreferences).mockResolvedValue({
      ok: true,
      data: {
        mentionDelivery: 'ALL',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'ALL',
      },
    });

    vi.mocked(api.updateNotificationPreferences).mockResolvedValue({
      ok: true,
      data: {
        mentionDelivery: 'NONE',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'ALL',
      },
    });

    const { result } = renderHook(() => useNotificationPreferences());

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    let success = false;
    await act(async () => {
      success = await result.current.updatePreference('mentionDelivery', 'NONE');
    });

    expect(success).toBe(true);
    expect(api.updateNotificationPreferences).toHaveBeenCalledWith('http://localhost:4000', {
      mentionDelivery: 'NONE',
    });

    if (result.current.state.status === 'ready') {
      expect(result.current.state.preferences.mentionDelivery).toBe('NONE');
    }
  });

  it('rolls back optimistic update on API error', async () => {
    vi.mocked(api.fetchNotificationPreferences).mockResolvedValue({
      ok: true,
      data: {
        mentionDelivery: 'ALL',
        dmDelivery: 'ALL',
        threadReplyDelivery: 'ALL',
      },
    });

    vi.mocked(api.updateNotificationPreferences).mockResolvedValue({
      ok: false,
      kind: 'HTTP_ERROR',
      message: 'Failed to update',
    });

    const { result } = renderHook(() => useNotificationPreferences());

    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    let success = false;
    await act(async () => {
      success = await result.current.updatePreference('dmDelivery', 'NONE');
    });

    expect(success).toBe(false);
    expect(result.current.saveError).toBe('Failed to update');

    // Preference rolled back to ALL
    if (result.current.state.status === 'ready') {
      expect(result.current.state.preferences.dmDelivery).toBe('ALL');
    }
  });
});

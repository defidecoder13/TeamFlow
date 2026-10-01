import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMentions } from './use-mentions';
import type { MentionListItem, MentionPage } from './workspace-mentions';

const { fetchMentionsMock } = vi.hoisted(() => ({ fetchMentionsMock: vi.fn() }));

vi.mock('./workspace-mentions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./workspace-mentions')>()),
  fetchWorkspaceMentions: fetchMentionsMock,
}));

const MENTION: MentionListItem = {
  id: 'msg-1',
  body: 'Hey @Ada look at this',
  createdAt: new Date('2026-09-21T12:00:00.000Z'),
  parentMessageId: null,
  author: { id: 'u-2', name: 'Grace', email: 'g@example.com', image: null },
  container: { type: 'channel', id: 'ch-1', name: 'general', slug: 'general' },
};

function page(
  mentions: MentionListItem[],
  pageInfo = { hasMore: false, nextCursor: null as string | null },
): { ok: true; data: MentionPage } {
  return { ok: true, data: { mentions, pageInfo } };
}

beforeEach(() => {
  fetchMentionsMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('useMentions', () => {
  it('stays idle without a workspace', () => {
    const { result } = renderHook(() => useMentions(null));
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchMentionsMock).not.toHaveBeenCalled();
  });

  it('loads mentions for a workspace', async () => {
    fetchMentionsMock.mockResolvedValue(page([MENTION]));
    const { result } = renderHook(() => useMentions('ws-1'));

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        mentions: [MENTION],
        hasMore: false,
        nextCursor: null,
      });
    });
    expect(fetchMentionsMock).toHaveBeenCalledWith(
      'http://localhost:4000',
      'ws-1',
      expect.objectContaining({ limit: 30 }),
    );
  });

  it('maps unauthenticated responses', async () => {
    fetchMentionsMock.mockResolvedValue({ ok: false, unauthenticated: true });
    const { result } = renderHook(() => useMentions('ws-1'));

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'unauthenticated' });
    });
  });

  it('maps failures to an error with retry', async () => {
    fetchMentionsMock.mockResolvedValue({ ok: false, kind: 'error', message: 'boom' });
    const { result } = renderHook(() => useMentions('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    fetchMentionsMock.mockResolvedValue(page([MENTION]));
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
  });

  it('appends the next page without duplicating rows', async () => {
    const second: MentionListItem = { ...MENTION, id: 'msg-2' };
    fetchMentionsMock.mockResolvedValueOnce(
      page([MENTION], { hasMore: true, nextCursor: 'c1' }),
    );
    const { result } = renderHook(() => useMentions('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    fetchMentionsMock.mockResolvedValueOnce(
      page([MENTION, second], { hasMore: false, nextCursor: null }),
    );
    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      if (result.current.state.status !== 'ready') return;
      expect(result.current.state.mentions.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
      expect(result.current.state.hasMore).toBe(false);
    });
    expect(fetchMentionsMock).toHaveBeenLastCalledWith(
      'http://localhost:4000',
      'ws-1',
      expect.objectContaining({ cursor: 'c1' }),
    );
  });

  it('ignores loadMore when there is no cursor', async () => {
    fetchMentionsMock.mockResolvedValue(page([MENTION]));
    const { result } = renderHook(() => useMentions('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    fetchMentionsMock.mockClear();
    act(() => {
      result.current.loadMore();
    });
    expect(fetchMentionsMock).not.toHaveBeenCalled();
  });

  it('resets when the workspace changes', async () => {
    fetchMentionsMock.mockResolvedValue(page([MENTION]));
    const { result, rerender } = renderHook(({ id }) => useMentions(id), {
      initialProps: { id: 'ws-1' as string | null },
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    fetchMentionsMock.mockResolvedValue(page([]));
    rerender({ id: 'ws-2' });
    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        mentions: [],
        hasMore: false,
        nextCursor: null,
      });
    });
    expect(fetchMentionsMock).toHaveBeenLastCalledWith(
      'http://localhost:4000',
      'ws-2',
      expect.anything(),
    );
  });
});

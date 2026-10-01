import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrafts } from './use-drafts';
import type { DraftListItem } from './drafts';

const { fetchDraftsMock, deleteDraftMock } = vi.hoisted(() => ({
  fetchDraftsMock: vi.fn(),
  deleteDraftMock: vi.fn(),
}));

vi.mock('./drafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./drafts')>()),
  fetchWorkspaceDrafts: fetchDraftsMock,
  deleteWorkspaceDraft: deleteDraftMock,
}));

const DRAFT: DraftListItem = {
  id: 'draft-1',
  body: 'Ship the drafts page',
  targetKind: 'CHANNEL',
  targetId: 'ch-1',
  createdAt: new Date('2026-09-23T12:00:00.000Z'),
  updatedAt: new Date('2026-09-23T12:00:00.000Z'),
  container: { type: 'channel', id: 'ch-1', name: 'general', slug: 'general' },
};

function page(drafts: DraftListItem[]): { ok: true; data: { drafts: DraftListItem[] } } {
  return { ok: true, data: { drafts } };
}

beforeEach(() => {
  fetchDraftsMock.mockReset();
  deleteDraftMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('useDrafts', () => {
  it('stays idle without a workspace', () => {
    const { result } = renderHook(() => useDrafts(null));
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchDraftsMock).not.toHaveBeenCalled();
  });

  it('loads drafts for a workspace', async () => {
    fetchDraftsMock.mockResolvedValue(page([DRAFT]));
    const { result } = renderHook(() => useDrafts('ws-1'));

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', drafts: [DRAFT] });
    });
    expect(fetchDraftsMock).toHaveBeenCalledWith('http://localhost:4000', 'ws-1');
  });

  it('maps unauthenticated responses', async () => {
    fetchDraftsMock.mockResolvedValue({ ok: false, unauthenticated: true });
    const { result } = renderHook(() => useDrafts('ws-1'));

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'unauthenticated' });
    });
  });

  it('maps failures to an error with retry', async () => {
    fetchDraftsMock.mockResolvedValue({ ok: false, kind: 'error', message: 'boom' });
    const { result } = renderHook(() => useDrafts('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    fetchDraftsMock.mockResolvedValue(page([DRAFT]));
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
  });

  it('resets when the workspace changes', async () => {
    fetchDraftsMock.mockResolvedValue(page([DRAFT]));
    const { result, rerender } = renderHook(({ id }) => useDrafts(id), {
      initialProps: { id: 'ws-1' as string | null },
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    fetchDraftsMock.mockResolvedValue(page([]));
    rerender({ id: 'ws-2' });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'ready', drafts: [] });
    });
    expect(fetchDraftsMock).toHaveBeenLastCalledWith('http://localhost:4000', 'ws-2');
  });

  it('removes a draft locally after a successful discard', async () => {
    fetchDraftsMock.mockResolvedValue(page([DRAFT, { ...DRAFT, id: 'draft-2' }]));
    deleteDraftMock.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useDrafts('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.discard('draft-1');
    });

    expect(ok).toBe(true);
    expect(deleteDraftMock).toHaveBeenCalledWith(
      'http://localhost:4000',
      'ws-1',
      'draft-1',
    );
    if (result.current.state.status === 'ready') {
      expect(result.current.state.drafts.map((d) => d.id)).toEqual(['draft-2']);
    } else {
      throw new Error('expected ready');
    }
  });

  it('surfaces a discard error without removing the row', async () => {
    fetchDraftsMock.mockResolvedValue(page([DRAFT]));
    deleteDraftMock.mockResolvedValue({ ok: false, message: 'Failed to discard draft.' });
    const { result } = renderHook(() => useDrafts('ws-1'));
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.discard('draft-1');
    });

    expect(ok).toBe(false);
    expect(result.current.discardError).toBe('Failed to discard draft.');
    if (result.current.state.status === 'ready') {
      expect(result.current.state.drafts).toHaveLength(1);
    }
  });

  it('is a no-op discard without a workspace', async () => {
    const { result } = renderHook(() => useDrafts(null));
    let ok = true;
    await act(async () => {
      ok = await result.current.discard('draft-1');
    });
    expect(ok).toBe(false);
    expect(deleteDraftMock).not.toHaveBeenCalled();
  });
});

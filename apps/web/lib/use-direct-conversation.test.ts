import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDirectConversation } from './use-direct-conversation';
import type { DirectConversation } from './messages';

const { fetchDirectConversationMock } = vi.hoisted(() => ({
  fetchDirectConversationMock: vi.fn(),
}));

vi.mock('./messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./messages')>()),
  fetchDirectConversation: fetchDirectConversationMock,
}));

const CONVERSATION: DirectConversation = {
  id: 'dm-1',
  workspaceId: 'ws-1',
  type: 'DIRECT',
  createdAt: new Date('2026-09-08T00:00:00.000Z'),
  updatedAt: new Date('2026-09-08T00:00:00.000Z'),
  participants: [
    { id: 'u-1', name: 'User One', email: 'user1@example.com', image: null },
    { id: 'u-2', name: 'User Two', email: 'user2@example.com', image: null },
  ],
  peer: { id: 'u-2', name: 'User Two', email: 'user2@example.com', image: null },
};

beforeEach(() => {
  fetchDirectConversationMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('useDirectConversation', () => {
  it('stays idle without conversationId', () => {
    const { result } = renderHook(() => useDirectConversation(null));
    expect(result.current.state).toEqual({ status: 'idle' });
    expect(fetchDirectConversationMock).not.toHaveBeenCalled();
  });

  it('loads conversation and handles notFound', async () => {
    fetchDirectConversationMock.mockResolvedValue({
      ok: true,
      data: CONVERSATION,
    });

    const { result, rerender } = renderHook(({ id }: { id: string }) => useDirectConversation(id), {
      initialProps: { id: 'dm-1' },
    });

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        conversation: CONVERSATION,
      });
    });

    fetchDirectConversationMock.mockResolvedValue({
      ok: false,
      kind: 'notFound',
      message: 'Not found',
    });

    rerender({ id: 'dm-missing' });

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'notFound' });
    });
  });

  it('handles error and retry', async () => {
    fetchDirectConversationMock.mockResolvedValue({
      ok: false,
      kind: 'error',
      message: 'Server error',
    });

    const { result } = renderHook(() => useDirectConversation('dm-1'));

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    fetchDirectConversationMock.mockResolvedValue({
      ok: true,
      data: CONVERSATION,
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.state).toEqual({
        status: 'ready',
        conversation: CONVERSATION,
      });
    });
  });
});

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionUser } from './use-session-user';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:4000');
});

describe('useSessionUser', () => {
  it('loads the authenticated session user from GET /api/me', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        user: {
          id: 'u1',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          image: 'data:image/jpeg;base64,AAAA',
          emailVerified: true,
        },
      }),
    });

    const { result } = renderHook(() => useSessionUser());

    await waitFor(() => {
      expect(result.current.status).toBe('authenticated');
    });

    if (result.current.status !== 'authenticated') {
      throw new Error('expected authenticated');
    }
    expect(result.current.user).toEqual({
      id: 'u1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      image: 'data:image/jpeg;base64,AAAA',
      emailVerified: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/me',
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }),
    );
  });

  it('marks the session unauthenticated on 401 without faking a user', async () => {
    fetchMock.mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({ error: { code: 'UNAUTHENTICATED' } }),
    });

    const { result } = renderHook(() => useSessionUser());

    await waitFor(() => {
      expect(result.current.status).toBe('unauthenticated');
    });
  });

  it('surfaces a safe error state on network failure', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    const { result } = renderHook(() => useSessionUser());

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    if (result.current.status !== 'error') {
      throw new Error('expected error');
    }
    expect(result.current.message).not.toContain('ECONNREFUSED');
  });
});

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionUser } from './use-session-user';

const { fetchMock, clerkAuthState } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  clerkAuthState: { value: { isLoaded: true, isSignedIn: true } },
}));

vi.stubGlobal('fetch', fetchMock);

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => clerkAuthState.value,
}));

beforeEach(() => {
  fetchMock.mockReset();
  clerkAuthState.value = { isLoaded: true, isSignedIn: true };
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

  it('stays loading while Clerk resolves, without calling the API', () => {
    clerkAuthState.value = { isLoaded: false, isSignedIn: false };
    const { result } = renderHook(() => useSessionUser());

    expect(result.current.status).toBe('loading');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports unauthenticated without fetching when Clerk has no session', () => {
    clerkAuthState.value = { isLoaded: true, isSignedIn: false };
    const { result } = renderHook(() => useSessionUser());

    expect(result.current.status).toBe('unauthenticated');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

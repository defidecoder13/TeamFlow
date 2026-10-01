'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { getApiBaseUrl } from './config';
import { authedFetch } from './session-token';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: SessionUser }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE = 'Could not load your session. Check your connection and try again.';

export function useSessionUser(): SessionState & {
  refresh: () => void;
  setUser: (user: SessionUser) => void;
} {
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const refresh = () => setAttempt((c) => c + 1);
  const setUser = (user: SessionUser) => setState({ status: 'authenticated', user });

  useEffect(() => {
    let cancelled = false;

    if (!isLoaded) {
      setState({ status: 'loading' });
      return;
    }
    if (!isSignedIn) {
      // No Clerk session: never hit the API with an anonymous request.
      setState({ status: 'unauthenticated' });
      return;
    }

    async function load() {
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        if (!cancelled) {
          setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
        }
        return;
      }

      try {
        // Bearer token attached by authedFetch; the API provisions the local
        // user record on first sight (Clerk user id → local membership id).
        const response = await authedFetch(`${apiBase}/api/me`, {
          cache: 'no-store',
        });

        if (cancelled) return;

        if (response.status === 401) {
          setState({ status: 'unauthenticated' });
          return;
        }

        if (!response.ok) {
          setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
          return;
        }

        const body: unknown = await response.json();
        if (!isSessionUserBody(body)) {
          setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
          return;
        }
        const session = body as {
          user: {
            id: string;
            name: string;
            email: string;
            image?: string | null;
            emailVerified?: boolean;
          };
        };
        const u = session.user;
        setState({
          status: 'authenticated',
          user: {
            id: u.id,
            name: u.name,
            email: u.email,
            image: u.image ?? null,
            emailVerified: u.emailVerified ?? false,
          },
        });
      } catch {
        if (!cancelled) {
          setState({ status: 'error', message: LOAD_FAILURE_MESSAGE });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt, isLoaded, isSignedIn]);

  return { ...state, refresh, setUser } as SessionState & {
    refresh: () => void;
    setUser: (user: SessionUser) => void;
  };
}

function isSessionUserBody(value: unknown): value is {
  user: { id: string; name: string; email: string; image?: string | null; emailVerified?: boolean };
} {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const user = (value as { user?: unknown }).user;
  if (typeof user !== 'object' || user === null) {
    return false;
  }
  const candidate = user as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.email === 'string'
  );
}

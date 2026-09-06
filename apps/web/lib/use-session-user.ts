/**
 * Client-side session state for the authenticated app (Phase 1D).
 *
 * The Express `GET /api/me` endpoint is the single source of truth; this
 * hook only reflects it (loading → authenticated | unauthenticated | error).
 * Route protection itself happens server-side in `middleware.ts` — this hook
 * additionally covers loading skeletons, API failures, and sessions that
 * expire while the app is open.
 */

'use client';

import { useEffect, useState } from 'react';
import type { SessionUser } from './auth-guard';
import { getApiBaseUrl } from './config';

export type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: SessionUser }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

const LOAD_FAILURE_MESSAGE = 'Could not load your session. Check your connection and try again.';

export function useSessionUser(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

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
        const response = await fetch(`${apiBase}/api/me`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (cancelled) {
          return;
        }
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
        setState({
          status: 'authenticated',
          user: {
            id: body.user.id,
            name: body.user.name,
            email: body.user.email,
            image: body.user.image ?? null,
            emailVerified: body.user.emailVerified ?? false,
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
  }, []);

  return state;
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

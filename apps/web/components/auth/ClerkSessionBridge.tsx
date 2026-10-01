/**
 * Registers Clerk's session-token getter for the plain-function API clients
 * (`lib/session-token.ts`). Mounted once in the root layout so every route —
 * including `/invite/accept`, which lives outside the `/app` shell — can
 * reach the Express API with `Authorization: Bearer`.
 */

'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import { registerSessionTokenGetter } from '../../lib/session-token';

export function ClerkSessionBridge() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    registerSessionTokenGetter(() => getToken());
    return () => {
      registerSessionTokenGetter(null);
    };
  }, [getToken, isSignedIn]);

  return null;
}

/**
 * Better Auth client for TeamFlow web.
 *
 * The browser NEVER talks to the database and never sees secrets: every call
 * goes to the Express API (`<API>/api/auth/*`), which owns Better Auth,
 * sessions, and cookies. `credentials: 'include'` ensures session cookies
 * travel on cross-origin development requests (web :3000 → api :4000).
 */

import { createAuthClient } from 'better-auth/react';
import { getApiBaseUrl } from './config';

function createClient() {
  return createAuthClient({
    baseURL: `${getApiBaseUrl()}/api/auth`,
    fetchOptions: {
      credentials: 'include',
    },
  });
}

export type AuthClient = ReturnType<typeof createClient>;

let client: AuthClient | undefined;

/** Lazy singleton so importing this module never requires env configuration. */
export function getAuthClient(): AuthClient {
  client ??= createClient();
  return client;
}

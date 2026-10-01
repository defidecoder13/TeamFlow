/**
 * Clerk session token bridge for the Express API.
 *
 * lib/* API clients are plain functions (not hooks), so they cannot call
 * Clerk's `useAuth()` directly. A mounted client component
 * (`ClerkSessionBridge`) registers the token getter once the Clerk session
 * is ready; every API call attaches it as `Authorization: Bearer`.
 *
 * Raw signed-storage URLs (R2 PUT/GET) must NEVER go through `authedFetch`:
 * extra headers break signatures and leak the token to object storage.
 * Those call sites keep using bare `fetch` deliberately.
 */

let getToken: (() => Promise<string | null>) | null = null;

/** Registered by `ClerkSessionBridge`; cleared on unmount. Test seam. */
export function registerSessionTokenGetter(
  getter: (() => Promise<string | null>) | null,
): void {
  getToken = getter;
}

export async function getSessionToken(): Promise<string | null> {
  if (!getToken) {
    return null;
  }
  try {
    return await getToken();
  } catch {
    return null;
  }
}

/** API fetch with the Clerk session token attached (when available). */
export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = await getSessionToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers, credentials: 'include' });
}

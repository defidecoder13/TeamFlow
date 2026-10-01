/**
 * Shared CORS origin configuration.
 *
 * Browser origins allowed to make credentialed requests to the API.
 * Single source of truth shared by Express CORS middleware, the Socket.IO
 * gateway, and Clerk's trusted origins. Empty (default) = same-origin
 * only; never a wildcard when credentials are involved.
 */
export function getTrustedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN;
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

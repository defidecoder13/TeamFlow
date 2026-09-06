/**
 * Centralized web environment configuration.
 *
 * All browser code must read public environment through these accessors —
 * never `process.env` inline in components. Values are read lazily so tests
 * can set `process.env` before calling.
 */

/** Base URL of the Express API, e.g. `http://localhost:4000` (no trailing path). */
export function getApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_URL;
  if (!value || value.trim().length === 0) {
    throw new Error(
      'NEXT_PUBLIC_API_URL is not set. Copy .env.example to .env.local and configure it.',
    );
  }
  return value.trim().replace(/\/+$/, '');
}

/**
 * Server-side API base URL (middleware, server components).
 * `API_BASE_URL` allows a deployment-specific internal address; otherwise the
 * public URL is used. No secrets are involved — this is only a base URL.
 */
export function getServerApiBaseUrl(): string {
  const override = process.env.API_BASE_URL;
  if (override && override.trim().length > 0) {
    return override.trim().replace(/\/+$/, '');
  }
  return getApiBaseUrl();
}

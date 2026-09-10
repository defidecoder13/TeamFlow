/**
 * Profile API client (Phase 4K.5).
 *
 * Thin fetch wrapper over PATCH /api/me. Session cookies travel via
 * credentials: include. Payloads runtime-validated before use; failures are
 * values with safe messages.
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSessionUser(value: unknown): value is SessionUser {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.email === 'string' &&
    value.email.length > 0 &&
    (value.image === null || typeof value.image === 'string') &&
    typeof value.emailVerified === 'boolean'
  );
}

function serverMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string') {
    const msg = body.error.message.trim();
    if (msg.length > 0) return msg;
  }
  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export const MAX_PROFILE_NAME_LENGTH = 100;
export const MAX_PROFILE_IMAGE_URL_LENGTH = 2048;

export function validateProfileName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Display name is required.';
  if (trimmed.length > MAX_PROFILE_NAME_LENGTH)
    return `Use ${MAX_PROFILE_NAME_LENGTH} characters or fewer.`;
  return null;
}

export function validateProfileImage(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_PROFILE_IMAGE_URL_LENGTH)
    return `Image URL must be ${MAX_PROFILE_IMAGE_URL_LENGTH} characters or fewer.`;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Enter a valid image URL.';
  } catch {
    return 'Enter a valid image URL.';
  }
  return null;
}

export type UpdateProfileInput = {
  name?: string;
  image?: string | null;
};

export type UpdateProfileResult =
  | { ok: true; user: SessionUser }
  | { ok: false; kind: 'unauthenticated' }
  | { ok: false; kind: 'validation'; message: string }
  | { ok: false; kind: 'notFound' }
  | { ok: false; kind: 'failed'; message?: string };

const UPDATE_FALLBACK = "We couldn't update your profile. Please try again.";

export async function updateProfile(
  apiBaseUrl: string,
  input: UpdateProfileInput,
): Promise<UpdateProfileResult> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.image !== undefined) body.image = input.image;
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/me`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) return { ok: false, kind: 'unauthenticated' };
  const responseBody = await readJson(response);
  if (response.status === 200) {
    const user =
      isRecord(responseBody) && isSessionUser(responseBody.user) ? responseBody.user : null;
    if (!user) return { ok: false, kind: 'failed' };
    return { ok: true, user };
  }
  if (response.status === 400) {
    return { ok: false, kind: 'validation', message: serverMessage(responseBody, UPDATE_FALLBACK) };
  }
  if (response.status === 404) return { ok: false, kind: 'notFound' };
  return { ok: false, kind: 'failed', message: serverMessage(responseBody, UPDATE_FALLBACK) };
}

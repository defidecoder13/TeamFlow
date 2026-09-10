/**
 * Channel API client (Phase 3B).
 *
 * Thin fetch wrappers over the approved channel contract. Session cookies
 * travel via `credentials: 'include'`, matching the other clients. Payloads
 * are runtime-validated before use; failures are values with safe messages.
 * No DELETE exists on the backend, so none is implemented here.
 */

export const CHANNEL_TYPES = ['PUBLIC', 'PRIVATE'] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];

/**
 * Client-side length limits mirroring the API contract (the server remains
 * authoritative — these only drive inline validation).
 */
export const MAX_CHANNEL_NAME_LENGTH = 80;
export const MAX_CHANNEL_DESCRIPTION_LENGTH = 250;

/** Channel summary as returned by the API. No membership data is exposed. */
export interface Channel {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: ChannelType;
  createdAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isChannel(value: unknown): value is Channel {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    typeof value.slug === 'string' &&
    value.slug.length > 0 &&
    (value.description === null || typeof value.description === 'string') &&
    typeof value.type === 'string' &&
    (CHANNEL_TYPES as readonly string[]).includes(value.type) &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

/** Safe server-provided message ({ error: { message } }), else the fallback. */
function serverMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string') {
    const message = body.error.message.trim();
    if (message.length > 0) {
      return message;
    }
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

function channelsUrl(apiBaseUrl: string, workspaceId: string, slug?: string): string {
  const base = `${apiBaseUrl}/api/workspaces/${encodeURIComponent(workspaceId)}/channels`;
  return slug === undefined ? base : `${base}/${encodeURIComponent(slug)}`;
}

export type FetchChannelsResult =
  { ok: true; channels: Channel[] } | { ok: false; unauthenticated: boolean };

/** List channels visible to the caller (backend enforces private access). */
export async function fetchChannels(
  apiBaseUrl: string,
  workspaceId: string,
): Promise<FetchChannelsResult> {
  let response: Response;
  try {
    response = await fetch(channelsUrl(apiBaseUrl, workspaceId), {
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, unauthenticated: false };
  }
  if (response.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (!response.ok) {
    return { ok: false, unauthenticated: false };
  }
  const body = await readJson(response);
  if (!isRecord(body) || !Array.isArray(body.channels) || !body.channels.every(isChannel)) {
    return { ok: false, unauthenticated: false };
  }
  return { ok: true, channels: body.channels };
}

export type FetchChannelResult =
  { ok: true; channel: Channel } | { ok: false; kind: 'unauthenticated' | 'notFound' | 'failed' };

/** Fetch one channel by slug. Inaccessible channels report as not found. */
export async function fetchChannel(
  apiBaseUrl: string,
  workspaceId: string,
  slug: string,
): Promise<FetchChannelResult> {
  let response: Response;
  try {
    response = await fetch(channelsUrl(apiBaseUrl, workspaceId, slug), {
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) {
    return { ok: false, kind: 'unauthenticated' };
  }
  if (response.status === 404) {
    return { ok: false, kind: 'notFound' };
  }
  if (!response.ok) {
    return { ok: false, kind: 'failed' };
  }
  const body = await readJson(response);
  if (!isRecord(body) || !isChannel(body.channel)) {
    return { ok: false, kind: 'failed' };
  }
  return { ok: true, channel: body.channel };
}

export interface CreateChannelInput {
  name: string;
  description?: string;
  type: ChannelType;
}

export type CreateChannelResult =
  | { ok: true; channel: Channel }
  | { ok: false; kind: 'unauthenticated' }
  | { ok: false; kind: 'validation'; message: string }
  | { ok: false; kind: 'conflict'; message: string }
  | { ok: false; kind: 'failed' };

const CREATE_FALLBACK_MESSAGE = "We couldn't create the channel. Please try again.";

/**
 * Create a channel. Sends ONLY name/description/type — slug, workspace, and
 * creator stay server-side.
 */
export async function createChannel(
  apiBaseUrl: string,
  workspaceId: string,
  input: CreateChannelInput,
): Promise<CreateChannelResult> {
  let response: Response;
  try {
    response = await fetch(channelsUrl(apiBaseUrl, workspaceId), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name, description: input.description, type: input.type }),
    });
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) {
    return { ok: false, kind: 'unauthenticated' };
  }
  const body = await readJson(response);
  if (response.status === 201) {
    const channel = isRecord(body) && isChannel(body.channel) ? body.channel : null;
    if (!channel) {
      return { ok: false, kind: 'failed' };
    }
    return { ok: true, channel };
  }
  if (response.status === 400) {
    return { ok: false, kind: 'validation', message: serverMessage(body, CREATE_FALLBACK_MESSAGE) };
  }
  if (response.status === 409) {
    return { ok: false, kind: 'conflict', message: serverMessage(body, CREATE_FALLBACK_MESSAGE) };
  }
  return { ok: false, kind: 'failed' };
}

export interface ChannelMember {
  id: string;
  channelId: string;
  userId: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
}

function isChannelMember(value: unknown): value is ChannelMember {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    typeof value.channelId !== 'string' ||
    typeof value.userId !== 'string' ||
    typeof value.createdAt !== 'string'
  ) {
    return false;
  }
  if (!isRecord(value.user)) return false;
  const u = value.user;
  return (
    typeof u.id === 'string' &&
    u.id.length > 0 &&
    typeof u.name === 'string' &&
    u.name.length > 0 &&
    typeof u.email === 'string' &&
    u.email.length > 0 &&
    (u.image === null || typeof u.image === 'string')
  );
}

export type FetchChannelMembersResult =
  | { ok: true; members: ChannelMember[] }
  | { ok: false; kind: 'unauthenticated' | 'notFound' | 'failed' };

export async function fetchChannelMembers(
  apiBaseUrl: string,
  workspaceId: string,
  channelSlug: string,
): Promise<FetchChannelMembersResult> {
  let response: Response;
  try {
    response = await fetch(`${channelsUrl(apiBaseUrl, workspaceId, channelSlug)}/members`, {
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) return { ok: false, kind: 'unauthenticated' };
  if (response.status === 404) return { ok: false, kind: 'notFound' };
  if (!response.ok) return { ok: false, kind: 'failed' };
  const body = await readJson(response);
  if (!isRecord(body) || !Array.isArray(body.members) || !body.members.every(isChannelMember)) {
    return { ok: false, kind: 'failed' };
  }
  return { ok: true, members: body.members };
}

export type AddChannelMemberResult =
  | { ok: true; member: ChannelMember }
  | {
      ok: false;
      kind: 'unauthenticated' | 'notFound' | 'conflict' | 'validation' | 'forbidden' | 'failed';
      message?: string;
    };

export async function addChannelMember(
  apiBaseUrl: string,
  workspaceId: string,
  channelSlug: string,
  userId: string,
): Promise<AddChannelMemberResult> {
  let response: Response;
  try {
    response = await fetch(`${channelsUrl(apiBaseUrl, workspaceId, channelSlug)}/members`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) return { ok: false, kind: 'unauthenticated' };
  const body = await readJson(response);
  if (response.status === 201) {
    const member = isRecord(body) && isChannelMember(body.member) ? body.member : null;
    if (!member) return { ok: false, kind: 'failed' };
    return { ok: true, member };
  }
  if (response.status === 400)
    return { ok: false, kind: 'validation', message: serverMessage(body, 'Invalid request.') };
  if (response.status === 403) return { ok: false, kind: 'forbidden' };
  if (response.status === 404) return { ok: false, kind: 'notFound' };
  if (response.status === 409)
    return { ok: false, kind: 'conflict', message: serverMessage(body, 'Already a member.') };
  return { ok: false, kind: 'failed' };
}

export type RemoveChannelMemberResult =
  | { ok: true }
  | {
      ok: false;
      kind: 'unauthenticated' | 'notFound' | 'forbidden' | 'validation' | 'failed';
      message?: string;
    };

export async function removeChannelMember(
  apiBaseUrl: string,
  workspaceId: string,
  channelSlug: string,
  userId: string,
): Promise<RemoveChannelMemberResult> {
  let response: Response;
  try {
    response = await fetch(
      `${channelsUrl(apiBaseUrl, workspaceId, channelSlug)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE', credentials: 'include' },
    );
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) return { ok: false, kind: 'unauthenticated' };
  if (response.status === 204) return { ok: true };
  const body = await readJson(response);
  if (response.status === 403) return { ok: false, kind: 'forbidden' };
  if (response.status === 404) return { ok: false, kind: 'notFound' };
  if (response.status === 400)
    return { ok: false, kind: 'validation', message: serverMessage(body, 'Invalid request.') };
  return { ok: false, kind: 'failed' };
}

export interface UpdateChannelInput {
  name?: string;
  description?: string | null;
}

export type UpdateChannelResult =
  | { ok: true; channel: Channel }
  | { ok: false; kind: 'unauthenticated' }
  | { ok: false; kind: 'validation'; message: string }
  | { ok: false; kind: 'forbidden' }
  | { ok: false; kind: 'conflict'; message: string }
  | { ok: false; kind: 'notFound' }
  | { ok: false; kind: 'failed' };

const UPDATE_FALLBACK_MESSAGE = "We couldn't update the channel. Please try again.";

/**
 * Update channel metadata. Only defined fields are sent — never slug,
 * workspace, creator, or type.
 */
export async function updateChannel(
  apiBaseUrl: string,
  workspaceId: string,
  slug: string,
  input: UpdateChannelInput,
): Promise<UpdateChannelResult> {
  const body: { name?: string; description?: string | null } = {};
  if (input.name !== undefined) {
    body.name = input.name;
  }
  if (input.description !== undefined) {
    body.description = input.description;
  }
  let response: Response;
  try {
    response = await fetch(channelsUrl(apiBaseUrl, workspaceId, slug), {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, kind: 'failed' };
  }
  if (response.status === 401) {
    return { ok: false, kind: 'unauthenticated' };
  }
  const responseBody = await readJson(response);
  if (response.status === 200) {
    const channel =
      isRecord(responseBody) && isChannel(responseBody.channel) ? responseBody.channel : null;
    if (!channel) {
      return { ok: false, kind: 'failed' };
    }
    return { ok: true, channel };
  }
  if (response.status === 400) {
    return {
      ok: false,
      kind: 'validation',
      message: serverMessage(responseBody, UPDATE_FALLBACK_MESSAGE),
    };
  }
  if (response.status === 403) {
    return { ok: false, kind: 'forbidden' };
  }
  if (response.status === 404) {
    return { ok: false, kind: 'notFound' };
  }
  if (response.status === 409) {
    return {
      ok: false,
      kind: 'conflict',
      message: serverMessage(responseBody, UPDATE_FALLBACK_MESSAGE),
    };
  }
  return { ok: false, kind: 'failed' };
}

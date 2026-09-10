/**
 * Message API client (Phase 4B).
 *
 * Thin layer over the existing REST message endpoints. Every request
 * resolves the current authenticated user from session cookies through
 * Better Auth — no client-supplied audience or workspace identifiers
 * are sent.
 */

export interface MessageAttachment {
  id: string;
  messageId: string;
  uploaderId?: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

/**
 * A single message as returned by the backend, normalized for the UI layer.
 * The `author` shape is the safe, public-facing subset of the author record.
 */
export interface Message {
  id: string;
  channelId?: string | null;
  directMessageConversationId?: string | null;
  authorId: string;
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  parentMessageId?: string | null;
  replyCount?: number;
  latestReplyAt?: Date | null;
  /** Author information included when the backend returns it. May be absent on older payloads. */
  author?: {
    id: string;
    name: string;
    image: string | null;
  };
  attachments?: MessageAttachment[];
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean;
  userIds?: string[];
}

export function isMessageReactionSummary(value: unknown): value is MessageReactionSummary {
  if (!isRecord(value)) return false;
  if (typeof value.emoji !== 'string' || value.emoji.length === 0) return false;
  if (typeof value.count !== 'number' || value.count < 0) return false;
  if (typeof value.reacted !== 'boolean') return false;
  if (value.userIds !== undefined && !Array.isArray(value.userIds)) return false;
  return true;
}

export interface ParticipantProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role?: 'ADMIN' | 'MEMBER';
  joinedAt?: Date;
}

export interface DirectConversation {
  id: string;
  workspaceId: string;
  type: 'DIRECT' | 'GROUP';
  name?: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: ParticipantProfile[];
  participant?: ParticipantProfile | null;
  peer?: ParticipantProfile | null;
  participantCount?: number;
  currentUserRole?: 'ADMIN' | 'MEMBER';
  unreadCount?: number;
  hasUnread?: boolean;
  lastReadMessageId?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * Runtime guard for a single message payload. The backend always returns the
 * author object; authorship is derived from `author.id` with a fallback to a
 * top-level `authorId` for forward compatibility.
 */
export function isMessagePayload(value: unknown): value is {
  id: string;
  channelId?: string | null;
  directMessageConversationId?: string | null;
  authorId?: string;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  parentMessageId?: string | null;
  replyCount?: number;
  latestReplyAt?: string | null;
  author?: { id: string; name: string; image?: string | null };
  attachments?: Array<{
    id: string;
    messageId: string;
    uploaderId?: string;
    originalName: string;
    mimeType: string;
    size: number;
    createdAt: string;
  }>;
} {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.channelId) && !isNonEmptyString(value.directMessageConversationId)) {
    return false;
  }
  if (typeof value.body !== 'string' && value.body !== null) return false;
  if (!isDateString(value.createdAt) || !isDateString(value.updatedAt)) return false;
  if (value.editedAt !== null && value.editedAt !== undefined && !isDateString(value.editedAt)) {
    return false;
  }
  if (value.deletedAt !== null && value.deletedAt !== undefined && !isDateString(value.deletedAt)) {
    return false;
  }
  if (
    value.parentMessageId !== undefined &&
    value.parentMessageId !== null &&
    typeof value.parentMessageId !== 'string'
  ) {
    return false;
  }
  if (value.replyCount !== undefined && typeof value.replyCount !== 'number') {
    return false;
  }
  if (
    value.latestReplyAt !== null &&
    value.latestReplyAt !== undefined &&
    !isDateString(value.latestReplyAt)
  ) {
    return false;
  }
  if (value.author !== undefined) {
    if (!isRecord(value.author)) return false;
    if (!isNonEmptyString(value.author.id) || typeof value.author.name !== 'string') return false;
    if (
      value.author.image !== undefined &&
      value.author.image !== null &&
      typeof value.author.image !== 'string'
    ) {
      return false;
    }
  }
  if (value.attachments !== undefined) {
    if (!Array.isArray(value.attachments)) return false;
    for (const att of value.attachments) {
      if (!isRecord(att)) return false;
      if (!isNonEmptyString(att.id) || !isNonEmptyString(att.messageId)) return false;
      if (typeof att.originalName !== 'string' || typeof att.mimeType !== 'string') return false;
      if (typeof att.size !== 'number') return false;
      if (!isDateString(att.createdAt)) return false;
    }
  }
  return true;
}

export interface MessagePage {
  messages: Message[];
  pageInfo: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface SendMessageBody {
  body: string;
}

export interface EditMessageBody {
  body: string;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; unauthenticated: boolean; kind?: string; message?: string }
  | { ok: false; kind: string; message: string };

export async function fetchMessages(
  apiBase: string,
  channelId: string,
  options?: { limit?: number; cursor?: string },
): Promise<ApiResult<MessagePage>> {
  const params = new URLSearchParams();
  if (options?.limit && options.limit > 0) {
    params.set('limit', String(options.limit));
  }
  if (options?.cursor) {
    params.set('cursor', options.cursor);
  }
  const query = params.toString();
  const url = `/api/channels/${encodeURIComponent(channelId)}/messages${query ? `?${query}` : ''}`;
  let res: Response;
  try {
    res = await fetch(`${apiBase}${url}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to fetch messages' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Channel not found' };
  }
  if (res.status === 403) {
    return {
      ok: false,
      kind: 'forbidden',
      message: 'You do not have permission to view messages in this channel',
    };
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    return { ok: false, kind: 'error', message: body || 'Failed to fetch messages' };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to fetch messages' };
  }
  if (
    !isRecord(json) ||
    !Array.isArray(json.messages) ||
    !isRecord(json.pageInfo) ||
    typeof json.pageInfo.hasMore !== 'boolean' ||
    (json.pageInfo.nextCursor !== null && typeof json.pageInfo.nextCursor !== 'string')
  ) {
    return { ok: false, kind: 'error', message: 'Failed to fetch messages' };
  }
  const messages: Message[] = [];
  for (const m of json.messages) {
    const parsed = messageFromJson(m);
    if (!parsed) {
      return { ok: false, kind: 'error', message: 'Failed to fetch messages' };
    }
    messages.push(parsed);
  }
  return {
    ok: true,
    data: {
      messages,
      pageInfo: { hasMore: json.pageInfo.hasMore, nextCursor: json.pageInfo.nextCursor },
    },
  };
}

export async function fetchThreadReplies(
  apiBase: string,
  messageId: string,
  options?: { limit?: number; cursor?: string },
): Promise<ApiResult<MessagePage>> {
  const params = new URLSearchParams();
  if (options?.limit && options.limit > 0) {
    params.set('limit', String(options.limit));
  }
  if (options?.cursor) {
    params.set('cursor', options.cursor);
  }
  const query = params.toString();
  const url = `/api/messages/${encodeURIComponent(messageId)}/replies${query ? `?${query}` : ''}`;
  let res: Response;
  try {
    res = await fetch(`${apiBase}${url}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to fetch thread replies' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Message not found' };
  }
  if (res.status === 403) {
    return {
      ok: false,
      kind: 'forbidden',
      message: 'You do not have permission to view this thread',
    };
  }
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    return { ok: false, kind: 'error', message: body || 'Failed to fetch thread replies' };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to fetch thread replies' };
  }
  if (
    !isRecord(json) ||
    !Array.isArray(json.messages) ||
    !isRecord(json.pageInfo) ||
    typeof json.pageInfo.hasMore !== 'boolean' ||
    (json.pageInfo.nextCursor !== null && typeof json.pageInfo.nextCursor !== 'string')
  ) {
    return { ok: false, kind: 'error', message: 'Failed to fetch thread replies' };
  }
  const messages: Message[] = [];
  for (const m of json.messages) {
    const parsed = messageFromJson(m);
    if (!parsed) {
      return { ok: false, kind: 'error', message: 'Failed to fetch thread replies' };
    }
    messages.push(parsed);
  }
  return {
    ok: true,
    data: {
      messages,
      pageInfo: { hasMore: json.pageInfo.hasMore, nextCursor: json.pageInfo.nextCursor },
    },
  };
}

export async function sendThreadReply(
  apiBase: string,
  messageId: string,
  body: string,
): Promise<ApiResult<Message>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/messages/${encodeURIComponent(messageId)}/replies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ body }),
    });
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to send reply' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Message not found' };
  }
  if (res.status === 403) {
    return { ok: false, kind: 'forbidden', message: 'Permission denied' };
  }
  if (res.status === 400) {
    let msg = 'Invalid message';
    try {
      const json = await res.json();
      msg = typeof json.message === 'string' ? json.message : JSON.stringify(json);
    } catch {
      // ignore
    }
    return { ok: false, kind: 'validation', message: msg };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to send reply' };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to send reply' };
  }
  const message = messageFromJson(json);
  if (!message) {
    return { ok: false, kind: 'error', message: 'Failed to send reply' };
  }
  return { ok: true, data: message };
}

export async function sendMessage(
  apiBase: string,
  channelId: string,
  body: string,
): Promise<ApiResult<Message>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/channels/${encodeURIComponent(channelId)}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ body }),
    });
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to send message' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Channel not found' };
  }
  if (res.status === 403) {
    return { ok: false, kind: 'forbidden', message: 'Permission denied' };
  }
  if (res.status === 400) {
    let msg = 'Invalid message';
    try {
      const json = await res.json();
      msg = typeof json.message === 'string' ? json.message : JSON.stringify(json);
    } catch {
      // ignore
    }
    return { ok: false, kind: 'validation', message: msg };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to send message' };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to send message' };
  }
  const message = messageFromJson(json);
  if (!message) {
    return { ok: false, kind: 'error', message: 'Failed to send message' };
  }
  return { ok: true, data: message };
}

export async function editMessage(
  apiBase: string,
  messageId: string,
  body: string,
): Promise<ApiResult<Message>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/messages/${encodeURIComponent(messageId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ body }),
    });
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to edit message' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Message not found' };
  }
  if (res.status === 403) {
    return { ok: false, kind: 'forbidden', message: 'You can only edit your own messages' };
  }
  if (res.status === 409) {
    return { ok: false, kind: 'conflict', message: 'Message was modified' };
  }
  if (res.status === 400) {
    let msg = 'Invalid message';
    try {
      const json = await res.json();
      msg = typeof json.message === 'string' ? json.message : JSON.stringify(json);
    } catch {
      // ignore
    }
    return { ok: false, kind: 'validation', message: msg };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to edit message' };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to edit message' };
  }
  const message = messageFromJson(json);
  if (!message) {
    return { ok: false, kind: 'error', message: 'Failed to edit message' };
  }
  return { ok: true, data: message };
}

export async function deleteMessage(
  apiBase: string,
  messageId: string,
): Promise<ApiResult<Message>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to delete message' };
  }
  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Message not found' };
  }
  if (res.status === 403) {
    return { ok: false, kind: 'forbidden', message: 'You can only delete your own messages' };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to delete message' };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to delete message' };
  }
  const message = messageFromJson(json);
  if (!message) {
    return { ok: false, kind: 'error', message: 'Failed to delete message' };
  }
  return { ok: true, data: message };
}

export function messageFromJson(json: unknown): Message | null {
  const candidate =
    isRecord(json) && 'message' in json && isRecord(json.message) ? json.message : json;
  if (!isMessagePayload(candidate)) return null;
  const author =
    candidate.author === undefined
      ? undefined
      : {
          id: candidate.author.id,
          name: candidate.author.name,
          image: candidate.author.image ?? null,
        };
  const rawAuthorId = (candidate as { authorId?: unknown }).authorId;
  const rawCandidate = candidate as {
    directMessageConversationId?: string | null;
    attachments?: Array<{
      id: string;
      messageId: string;
      uploaderId?: string;
      originalName: string;
      mimeType: string;
      size: number;
      createdAt: string;
    }>;
  };
  const attachments: MessageAttachment[] | undefined = Array.isArray(rawCandidate.attachments)
    ? rawCandidate.attachments.map((att) => ({
        id: att.id,
        messageId: att.messageId,
        uploaderId: att.uploaderId,
        originalName: att.originalName,
        mimeType: att.mimeType,
        size: att.size,
        createdAt: new Date(att.createdAt),
      }))
    : undefined;
  return {
    id: candidate.id,
    channelId: candidate.channelId,
    // The backend derives authorship server-side and returns it on the
    // author object; fall back to a top-level authorId if a future API
    // version includes one.
    authorId:
      typeof rawAuthorId === 'string' && rawAuthorId.length > 0 ? rawAuthorId : (author?.id ?? ''),
    body: candidate.body,
    createdAt: new Date(candidate.createdAt),
    updatedAt: new Date(candidate.updatedAt),
    editedAt: candidate.editedAt == null ? null : new Date(candidate.editedAt),
    deletedAt: candidate.deletedAt == null ? null : new Date(candidate.deletedAt),
    ...(rawCandidate.directMessageConversationId !== undefined
      ? { directMessageConversationId: rawCandidate.directMessageConversationId ?? null }
      : {}),
    ...(candidate.parentMessageId !== undefined
      ? { parentMessageId: candidate.parentMessageId ?? null }
      : {}),
    ...(candidate.replyCount !== undefined
      ? { replyCount: typeof candidate.replyCount === 'number' ? candidate.replyCount : 0 }
      : {}),
    ...(candidate.latestReplyAt !== undefined
      ? { latestReplyAt: candidate.latestReplyAt ? new Date(candidate.latestReplyAt) : null }
      : {}),
    author,
    attachments,
  };
}

export function isMessageFromCurrentUser(message: Message, userId: string | null): boolean {
  return message.authorId === userId && userId !== null;
}

/**
 * A soft-deleted message. The backend nulls the body and stamps `deletedAt`;
 * deletions are permanent (there is no undelete path), so a tombstone always
 * wins reconciliation against a live representation of the same message.
 */
export function isMessageTombstone(message: Message): boolean {
  return message.deletedAt !== null || message.body === null;
}

/**
 * Deterministic same-ID reconciliation between a locally held message and an
 * incoming authoritative server representation (REST page, reconnect recovery,
 * or a Socket.IO event that raced a fetch).
 *
 * Rules (server `updatedAt` strictly increases on every edit/delete, and
 * deletions are permanent):
 * - incoming tombstone + local live → incoming (missed delete repaired)
 * - local tombstone → local (deletes never revert)
 * - otherwise the newer `updatedAt` wins; ties keep the local instance
 *   (same server version implies equivalent content, and keeping the local
 *   reference avoids needless re-renders).
 */
export function pickAuthoritativeMessage(local: Message, incoming: Message): Message {
  const incomingDeleted = isMessageTombstone(incoming);
  const localDeleted = isMessageTombstone(local);
  if (incomingDeleted && !localDeleted) return incoming;
  if (localDeleted) return local;
  if (incoming.updatedAt.getTime() > local.updatedAt.getTime()) return incoming;
  return local;
}

/**
 * Merge an incoming authoritative message list into the existing list.
 *
 * Same-ID entries are reconciled via {@link pickAuthoritativeMessage} so REST
 * recovery can repair edits/deletes missed while offline; genuinely new IDs
 * are appended (or prepended for older pages) without disturbing order.
 * Result contains exactly one entry per message ID.
 */
export function mergeMessages(
  existing: Message[],
  incoming: Message[],
  prepend: boolean,
): Message[] {
  const incomingById = new Map<string, Message>();
  for (const message of incoming) {
    incomingById.set(message.id, message);
  }
  const existingIds = new Set<string>();
  const merged = existing.map((message) => {
    existingIds.add(message.id);
    const candidate = incomingById.get(message.id);
    return candidate ? pickAuthoritativeMessage(message, candidate) : message;
  });
  const fresh = incoming.filter((message) => !existingIds.has(message.id));
  return prepend ? [...fresh, ...merged] : [...merged, ...fresh];
}

export async function fetchMessageReactions(
  apiBase: string,
  messageId: string,
): Promise<ApiResult<MessageReactionSummary[]>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/messages/${encodeURIComponent(messageId)}/reactions`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to fetch reactions' };
  }
  if (res.status === 401) {
    return {
      ok: false,
      unauthenticated: true,
      kind: 'unauthenticated',
      message: 'Unauthenticated',
    };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Message not found' };
  }
  if (res.status === 403) {
    return { ok: false, kind: 'unauthorized', message: 'Permission denied' };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to fetch reactions' };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to fetch reactions' };
  }
  let rawList: unknown = json;
  if (isRecord(json) && Array.isArray(json.reactions)) {
    rawList = json.reactions;
  }
  if (!Array.isArray(rawList)) {
    return { ok: false, kind: 'error', message: 'Invalid reactions format' };
  }
  const summaries: MessageReactionSummary[] = [];
  for (const item of rawList) {
    if (isMessageReactionSummary(item)) {
      summaries.push({
        emoji: item.emoji,
        count: item.count,
        reacted: item.reacted,
        userIds: item.userIds ?? [],
      });
    }
  }
  return { ok: true, data: summaries };
}

export async function addMessageReaction(
  apiBase: string,
  messageId: string,
  emoji: string,
): Promise<ApiResult<{ id: string; messageId: string; userId: string; emoji: string }>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/messages/${encodeURIComponent(messageId)}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ emoji }),
    });
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to add reaction' };
  }
  if (res.status === 401) {
    return {
      ok: false,
      unauthenticated: true,
      kind: 'unauthenticated',
      message: 'Unauthenticated',
    };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Message not found' };
  }
  if (res.status === 403) {
    return { ok: false, kind: 'unauthorized', message: 'Permission denied' };
  }
  if (res.status === 409) {
    return { ok: false, kind: 'conflict', message: 'Reaction already exists' };
  }
  if (res.status === 400) {
    let msg = 'Invalid reaction';
    try {
      const json = await res.json();
      if (isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string') {
        msg = json.error.message;
      }
    } catch {
      // ignore
    }
    return { ok: false, kind: 'validation', message: msg };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to add reaction' };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to add reaction' };
  }
  if (isRecord(json) && isRecord(json.reaction)) {
    return {
      ok: true,
      data: json.reaction as { id: string; messageId: string; userId: string; emoji: string },
    };
  }
  return { ok: true, data: { id: '', messageId, userId: '', emoji } };
}

export async function removeMessageReaction(
  apiBase: string,
  messageId: string,
  emoji: string,
): Promise<ApiResult<{ success: boolean }>> {
  let res: Response;
  try {
    res = await fetch(
      `${apiBase}/api/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
      {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      },
    );
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to remove reaction' };
  }
  if (res.status === 401) {
    return {
      ok: false,
      unauthenticated: true,
      kind: 'unauthenticated',
      message: 'Unauthenticated',
    };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Reaction not found' };
  }
  if (res.status === 403) {
    return { ok: false, kind: 'unauthorized', message: 'Permission denied' };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to remove reaction' };
  }
  return { ok: true, data: { success: true } };
}

export function isParticipantProfile(value: unknown): value is ParticipantProfile {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (typeof value.name !== 'string') return false;
  if (typeof value.email !== 'string') return false;
  if (value.image !== null && value.image !== undefined && typeof value.image !== 'string') {
    return false;
  }
  if (value.role !== undefined && value.role !== 'ADMIN' && value.role !== 'MEMBER') {
    return false;
  }
  return true;
}

export function isDirectConversationPayload(value: unknown): value is {
  id: string;
  workspaceId: string;
  type: 'DIRECT' | 'GROUP';
  name?: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ParticipantProfile[];
  participant?: ParticipantProfile | null;
  peer?: ParticipantProfile | null;
  participantCount?: number;
  currentUserRole?: 'ADMIN' | 'MEMBER';
} {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.workspaceId)) return false;
  if (value.type !== 'DIRECT' && value.type !== 'GROUP') return false;
  if (value.name !== undefined && value.name !== null && typeof value.name !== 'string')
    return false;
  if (!isDateString(value.createdAt) || !isDateString(value.updatedAt)) return false;
  if (!Array.isArray(value.participants) || !value.participants.every(isParticipantProfile)) {
    return false;
  }
  if (
    value.participant !== undefined &&
    value.participant !== null &&
    !isParticipantProfile(value.participant)
  ) {
    return false;
  }
  if (value.peer !== undefined && value.peer !== null && !isParticipantProfile(value.peer)) {
    return false;
  }
  if (value.participantCount !== undefined && typeof value.participantCount !== 'number') {
    return false;
  }
  if (
    value.currentUserRole !== undefined &&
    value.currentUserRole !== 'ADMIN' &&
    value.currentUserRole !== 'MEMBER'
  ) {
    return false;
  }
  return true;
}

export function directConversationFromJson(value: unknown): DirectConversation | null {
  if (!isDirectConversationPayload(value)) return null;
  const raw = value as {
    unreadCount?: unknown;
    hasUnread?: unknown;
    lastReadMessageId?: unknown;
  };
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    type: value.type,
    name: value.name ?? null,
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
    participants: value.participants.map((p) => ({
      ...p,
      joinedAt: (p as { joinedAt?: string | Date }).joinedAt
        ? new Date((p as { joinedAt?: string | Date }).joinedAt!)
        : undefined,
    })),
    participant: value.participant ?? null,
    peer: value.peer ?? value.participant ?? null,
    participantCount: value.participantCount ?? value.participants.length,
    currentUserRole: value.currentUserRole,
    ...(typeof raw.unreadCount === 'number' ? { unreadCount: raw.unreadCount } : {}),
    ...(typeof raw.hasUnread === 'boolean' ? { hasUnread: raw.hasUnread } : {}),
    ...(raw.lastReadMessageId !== undefined
      ? {
          lastReadMessageId:
            typeof raw.lastReadMessageId === 'string' ? raw.lastReadMessageId : null,
        }
      : {}),
  };
}

export async function createOrGetDirectConversation(
  apiBase: string,
  workspaceId: string,
  recipientId: string,
): Promise<ApiResult<DirectConversation>> {
  let res: Response;
  try {
    res = await fetch(
      `${apiBase}/api/workspaces/${encodeURIComponent(workspaceId)}/direct-messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ recipientId }),
      },
    );
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to create conversation' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Workspace not found' };
  }
  if (res.status === 400) {
    let msg = 'Failed to create conversation';
    try {
      const json = await res.json();
      if (isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string') {
        msg = json.error.message;
      }
    } catch {
      // ignore
    }
    return { ok: false, kind: 'validation', message: msg };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to create conversation' };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to parse response' };
  }

  if (!isRecord(json) || !json.conversation) {
    return { ok: false, kind: 'error', message: 'Malformed conversation response' };
  }

  const parsed = directConversationFromJson(json.conversation);
  if (!parsed) {
    return { ok: false, kind: 'error', message: 'Malformed conversation payload' };
  }

  return { ok: true, data: parsed };
}

export async function createGroupConversation(
  apiBase: string,
  workspaceId: string,
  input: { participantIds: string[]; name?: string },
): Promise<ApiResult<DirectConversation>> {
  let res: Response;
  try {
    res = await fetch(
      `${apiBase}/api/workspaces/${encodeURIComponent(workspaceId)}/direct-messages/group`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(input),
      },
    );
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to create group conversation' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Workspace not found' };
  }
  if (res.status === 400 || res.status === 409) {
    let msg = 'Failed to create group conversation';
    try {
      const json = await res.json();
      if (isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string') {
        msg = json.error.message;
      }
    } catch {
      // ignore
    }
    return { ok: false, kind: res.status === 409 ? 'conflict' : 'validation', message: msg };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to create group conversation' };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to parse response' };
  }

  if (!isRecord(json) || !json.conversation) {
    return { ok: false, kind: 'error', message: 'Malformed conversation response' };
  }

  const parsed = directConversationFromJson(json.conversation);
  if (!parsed) {
    return { ok: false, kind: 'error', message: 'Malformed conversation payload' };
  }

  return { ok: true, data: parsed };
}

export async function renameGroupConversation(
  apiBase: string,
  conversationId: string,
  name: string,
): Promise<ApiResult<DirectConversation>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/direct-messages/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ name }),
    });
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to rename group conversation' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Conversation not found' };
  }
  if (res.status === 403) {
    return {
      ok: false,
      kind: 'forbidden',
      message: 'Only group admins can rename the conversation',
    };
  }
  if (res.status === 400 || res.status === 409) {
    let msg = 'Failed to rename conversation';
    try {
      const json = await res.json();
      if (isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string') {
        msg = json.error.message;
      }
    } catch {
      // ignore
    }
    return { ok: false, kind: res.status === 409 ? 'conflict' : 'validation', message: msg };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to rename conversation' };
  }

  try {
    const json = await res.json();
    if (isRecord(json) && json.conversation) {
      const parsed = directConversationFromJson(json.conversation);
      if (parsed) return { ok: true, data: parsed };
    }
  } catch {
    // ignore
  }
  return { ok: false, kind: 'error', message: 'Malformed conversation payload' };
}

export async function addConversationParticipant(
  apiBase: string,
  conversationId: string,
  userId: string,
): Promise<ApiResult<DirectConversation>> {
  let res: Response;
  try {
    res = await fetch(
      `${apiBase}/api/direct-messages/${encodeURIComponent(conversationId)}/participants`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ userId }),
      },
    );
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to add participant' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Conversation not found' };
  }
  if (res.status === 403) {
    return { ok: false, kind: 'forbidden', message: 'Only group admins can add participants' };
  }
  if (res.status === 400 || res.status === 409) {
    let msg = 'Failed to add participant';
    try {
      const json = await res.json();
      if (isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string') {
        msg = json.error.message;
      }
    } catch {
      // ignore
    }
    return { ok: false, kind: res.status === 409 ? 'conflict' : 'validation', message: msg };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to add participant' };
  }

  try {
    const json = await res.json();
    if (isRecord(json) && json.conversation) {
      const parsed = directConversationFromJson(json.conversation);
      if (parsed) return { ok: true, data: parsed };
    }
  } catch {
    // ignore
  }
  return { ok: false, kind: 'error', message: 'Malformed conversation payload' };
}

export async function removeConversationParticipant(
  apiBase: string,
  conversationId: string,
  userId: string,
): Promise<ApiResult<{ success: boolean }>> {
  let res: Response;
  try {
    res = await fetch(
      `${apiBase}/api/direct-messages/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      },
    );
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to remove participant' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Participant or conversation not found' };
  }
  if (res.status === 403) {
    return { ok: false, kind: 'forbidden', message: 'Only group admins can remove participants' };
  }
  if (res.status === 400 || res.status === 409) {
    let msg = 'Failed to remove participant';
    try {
      const json = await res.json();
      if (isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string') {
        msg = json.error.message;
      }
    } catch {
      // ignore
    }
    return { ok: false, kind: res.status === 409 ? 'conflict' : 'validation', message: msg };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to remove participant' };
  }

  return { ok: true, data: { success: true } };
}

export async function leaveGroupConversation(
  apiBase: string,
  conversationId: string,
): Promise<ApiResult<{ success: boolean }>> {
  let res: Response;
  try {
    res = await fetch(
      `${apiBase}/api/direct-messages/${encodeURIComponent(conversationId)}/leave`,
      {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      },
    );
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to leave conversation' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Conversation not found' };
  }
  if (res.status === 400 || res.status === 409) {
    let msg = 'Failed to leave conversation';
    try {
      const json = await res.json();
      if (isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string') {
        msg = json.error.message;
      }
    } catch {
      // ignore
    }
    return { ok: false, kind: res.status === 409 ? 'conflict' : 'validation', message: msg };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to leave conversation' };
  }

  return { ok: true, data: { success: true } };
}

export async function fetchConversationParticipants(
  apiBase: string,
  conversationId: string,
): Promise<ApiResult<ParticipantProfile[]>> {
  let res: Response;
  try {
    res = await fetch(
      `${apiBase}/api/direct-messages/${encodeURIComponent(conversationId)}/participants`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      },
    );
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to fetch participants' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Conversation not found' };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to fetch participants' };
  }

  try {
    const json = await res.json();
    if (isRecord(json) && Array.isArray(json.participants)) {
      const participants: ParticipantProfile[] = [];
      for (const p of json.participants) {
        if (isParticipantProfile(p)) {
          participants.push({
            ...p,
            joinedAt: (p as { joinedAt?: string | Date }).joinedAt
              ? new Date((p as { joinedAt?: string | Date }).joinedAt!)
              : undefined,
          });
        }
      }
      return { ok: true, data: participants };
    }
  } catch {
    // ignore
  }
  return { ok: false, kind: 'error', message: 'Malformed participants response' };
}

export async function fetchDirectConversations(
  apiBase: string,
  workspaceId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<
  ApiResult<{
    conversations: DirectConversation[];
    pageInfo: { nextCursor: string | null; hasMore: boolean };
  }>
> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options.cursor !== undefined) {
    params.set('cursor', options.cursor);
  }
  const query = params.toString();
  const url = `${apiBase}/api/workspaces/${encodeURIComponent(workspaceId)}/direct-messages${query ? `?${query}` : ''}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to fetch conversations' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Workspace not found' };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to fetch conversations' };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to parse response' };
  }

  if (
    !isRecord(json) ||
    !Array.isArray(json.conversations) ||
    !isRecord(json.pageInfo) ||
    typeof json.pageInfo.hasMore !== 'boolean' ||
    (json.pageInfo.nextCursor !== null && typeof json.pageInfo.nextCursor !== 'string')
  ) {
    return { ok: false, kind: 'error', message: 'Malformed conversation page response' };
  }

  const conversations: DirectConversation[] = [];
  for (const item of json.conversations) {
    const conv = directConversationFromJson(item);
    if (!conv) {
      return { ok: false, kind: 'error', message: 'Malformed conversation item' };
    }
    conversations.push(conv);
  }

  return {
    ok: true,
    data: {
      conversations,
      pageInfo: {
        hasMore: json.pageInfo.hasMore,
        nextCursor: json.pageInfo.nextCursor,
      },
    },
  };
}

export async function fetchDirectConversation(
  apiBase: string,
  conversationId: string,
): Promise<ApiResult<DirectConversation>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/direct-messages/${encodeURIComponent(conversationId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to fetch conversation' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Conversation not found' };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to fetch conversation' };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to parse response' };
  }

  if (!isRecord(json) || !json.conversation) {
    return { ok: false, kind: 'error', message: 'Malformed conversation response' };
  }

  const parsed = directConversationFromJson(json.conversation);
  if (!parsed) {
    return { ok: false, kind: 'error', message: 'Malformed conversation payload' };
  }

  return { ok: true, data: parsed };
}

export async function fetchDirectMessages(
  apiBase: string,
  conversationId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<
  ApiResult<{ messages: Message[]; pageInfo: { nextCursor: string | null; hasMore: boolean } }>
> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options.cursor !== undefined) {
    params.set('cursor', options.cursor);
  }
  const query = params.toString();
  const url = `${apiBase}/api/direct-messages/${encodeURIComponent(conversationId)}/messages${query ? `?${query}` : ''}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to fetch messages' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Conversation not found' };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to fetch messages' };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to parse response' };
  }

  if (
    !isRecord(json) ||
    !Array.isArray(json.messages) ||
    !isRecord(json.pageInfo) ||
    typeof json.pageInfo.hasMore !== 'boolean' ||
    (json.pageInfo.nextCursor !== null && typeof json.pageInfo.nextCursor !== 'string')
  ) {
    return { ok: false, kind: 'error', message: 'Malformed direct messages page response' };
  }

  const messages: Message[] = [];
  for (const m of json.messages) {
    const parsed = messageFromJson(m);
    if (!parsed) {
      return { ok: false, kind: 'error', message: 'Failed to parse direct message' };
    }
    messages.push(parsed);
  }

  return {
    ok: true,
    data: {
      messages,
      pageInfo: {
        hasMore: json.pageInfo.hasMore,
        nextCursor: json.pageInfo.nextCursor,
      },
    },
  };
}

export async function sendDirectMessage(
  apiBase: string,
  conversationId: string,
  body: string,
): Promise<ApiResult<Message>> {
  let res: Response;
  try {
    res = await fetch(
      `${apiBase}/api/direct-messages/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ body }),
      },
    );
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to send direct message' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Conversation not found' };
  }
  if (res.status === 400) {
    let msg = 'Invalid message';
    try {
      const json = await res.json();
      if (isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string') {
        msg = json.error.message;
      }
    } catch {
      // ignore
    }
    return { ok: false, kind: 'validation', message: msg };
  }
  if (!res.ok) {
    return { ok: false, kind: 'error', message: 'Failed to send direct message' };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, kind: 'error', message: 'Failed to parse response' };
  }

  if (!isRecord(json) || !json.message) {
    return { ok: false, kind: 'error', message: 'Malformed message response' };
  }

  const parsed = messageFromJson(json.message);
  if (!parsed) {
    return { ok: false, kind: 'error', message: 'Malformed direct message payload' };
  }

  return { ok: true, data: parsed };
}

export interface DirectMessageReadState {
  conversationId: string;
  userId: string;
  lastReadMessageId: string | null;
  lastReadAt: Date;
}

export async function markDirectConversationRead(
  apiBase: string,
  conversationId: string,
  body?: { messageId?: string },
): Promise<ApiResult<DirectMessageReadState>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/direct-messages/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: body ? JSON.stringify(body) : JSON.stringify({}),
    });
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to mark conversation as read' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Conversation not found' };
  }
  if (res.status === 400) {
    let msg = 'Failed to mark conversation as read';
    try {
      const json = await res.json();
      if (isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string') {
        msg = json.error.message;
      }
    } catch {
      // ignore
    }
    return { ok: false, kind: 'validation', message: msg };
  }
  if (!res.ok) {
    return { ok: false, kind: 'server', message: 'Server error marking conversation as read' };
  }

  try {
    const json = await res.json();
    if (
      isRecord(json) &&
      isRecord(json.readState) &&
      typeof json.readState.conversationId === 'string' &&
      typeof json.readState.userId === 'string'
    ) {
      return {
        ok: true,
        data: {
          conversationId: json.readState.conversationId,
          userId: json.readState.userId,
          lastReadMessageId:
            typeof json.readState.lastReadMessageId === 'string'
              ? json.readState.lastReadMessageId
              : null,
          lastReadAt: new Date(String(json.readState.lastReadAt)),
        },
      };
    }
  } catch {
    // ignore
  }
  return { ok: false, kind: 'server', message: 'Invalid response from server' };
}

export interface DirectUnreadState {
  conversations: Array<{
    conversationId: string;
    unreadCount: number;
    hasUnread: boolean;
    lastReadMessageId: string | null;
  }>;
  totalUnreadCount: number;
}

export async function fetchDirectUnreadState(
  apiBase: string,
  workspaceId: string,
): Promise<ApiResult<DirectUnreadState>> {
  let res: Response;
  try {
    res = await fetch(
      `${apiBase}/api/workspaces/${encodeURIComponent(workspaceId)}/direct-messages/unread`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      },
    );
  } catch {
    return { ok: false, kind: 'network', message: 'Failed to fetch unread state' };
  }

  if (res.status === 401) {
    return { ok: false, unauthenticated: true };
  }
  if (res.status === 404) {
    return { ok: false, kind: 'notFound', message: 'Workspace not found' };
  }
  if (!res.ok) {
    return { ok: false, kind: 'server', message: 'Server error loading unread state' };
  }

  try {
    const json = await res.json();
    if (
      isRecord(json) &&
      Array.isArray(json.conversations) &&
      typeof json.totalUnreadCount === 'number'
    ) {
      const conversations = json.conversations.filter(isRecord).map((c) => ({
        conversationId: String(c.conversationId),
        unreadCount: typeof c.unreadCount === 'number' ? c.unreadCount : 0,
        hasUnread: typeof c.hasUnread === 'boolean' ? c.hasUnread : false,
        lastReadMessageId: typeof c.lastReadMessageId === 'string' ? c.lastReadMessageId : null,
      }));
      return {
        ok: true,
        data: {
          conversations,
          totalUnreadCount: json.totalUnreadCount,
        },
      };
    }
  } catch {
    // ignore
  }
  return { ok: false, kind: 'server', message: 'Invalid response from server' };
}

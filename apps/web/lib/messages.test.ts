import { describe, expect, it, vi } from 'vitest';
import {
  deleteMessage,
  editMessage,
  fetchMessages,
  fetchThreadReplies,
  isMessageFromCurrentUser,
  messageFromJson,
  sendMessage,
  sendThreadReply,
  fetchMessageReactions,
  addMessageReaction,
  removeMessageReaction,
  isMessageReactionSummary,
  isMessageTombstone,
  mergeMessages,
  pickAuthoritativeMessage,
  createOrGetDirectConversation,
  fetchDirectConversations,
  fetchDirectConversation,
  fetchDirectMessages,
  sendDirectMessage,
  directConversationFromJson,
  isDirectConversationPayload,
  isParticipantProfile,
  type Message,
  type MessageReactionSummary,
  type ParticipantProfile,
} from './messages';

const apiBase = 'http://localhost:4000';

const MESSAGE_JSON = {
  id: 'm-1',
  channelId: 'ch-1',
  authorId: 'u-1',
  body: 'Hello team',
  createdAt: '2026-09-06T12:00:00.000Z',
  updatedAt: '2026-09-06T12:00:00.000Z',
  editedAt: null,
  deletedAt: null,
  author: { id: 'u-1', name: 'Ada Lovelace', email: 'ada@example.com', image: null },
};

const MESSAGE: Message = {
  id: 'm-1',
  channelId: 'ch-1',
  authorId: 'u-1',
  body: 'Hello team',
  createdAt: new Date('2026-09-06T12:00:00.000Z'),
  updatedAt: new Date('2026-09-06T12:00:00.000Z'),
  editedAt: null,
  deletedAt: null,
  author: { id: 'u-1', name: 'Ada Lovelace', image: null },
};

describe('messageFromJson', () => {
  it('parses a valid payload', () => {
    expect(messageFromJson(MESSAGE_JSON)).toEqual(MESSAGE);
  });

  it('unwraps a message envelope ({ message: ... }) returned by the API', () => {
    expect(messageFromJson({ message: MESSAGE_JSON })).toEqual(MESSAGE);
  });

  it('derives authorship from the author object when top-level authorId is absent', () => {
    expect(messageFromJson({ ...MESSAGE_JSON, authorId: undefined })?.authorId).toBe('u-1');
  });

  it('rejects malformed payloads', () => {
    expect(messageFromJson(null)).toBeNull();
    expect(messageFromJson({})).toBeNull();
    expect(messageFromJson({ ...MESSAGE_JSON, id: 42 })).toBeNull();
    expect(messageFromJson({ ...MESSAGE_JSON, body: 42 })).toBeNull();
    expect(messageFromJson({ ...MESSAGE_JSON, createdAt: 'not-a-date' })).toBeNull();
    expect(messageFromJson({ ...MESSAGE_JSON, author: { id: 'u-1' } })).toBeNull();
    expect(messageFromJson({ ...MESSAGE_JSON, author: null })).toBeNull();
  });
});

describe('mergeMessages (reconnect reconciliation)', () => {
  const base: Message = {
    id: 'm-1',
    channelId: 'ch-1',
    authorId: 'u-1',
    body: 'old',
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
    updatedAt: new Date('2026-09-06T12:00:00.000Z'),
    editedAt: null,
    deletedAt: null,
  };

  it('CASE 1: replaces a stale message with a newer incoming revision', () => {
    const incoming: Message = {
      ...base,
      body: 'new',
      updatedAt: new Date('2026-09-06T12:05:00.000Z'),
      editedAt: new Date('2026-09-06T12:05:00.000Z'),
    };
    const merged = mergeMessages([base], [incoming], false);
    expect(merged).toHaveLength(1);
    expect(merged[0].body).toBe('new');
  });

  it('CASE 2: preserves deletion when recovery returns a tombstone', () => {
    const tombstone: Message = {
      ...base,
      body: null,
      updatedAt: new Date('2026-09-06T12:07:00.000Z'),
      deletedAt: new Date('2026-09-06T12:07:00.000Z'),
    };
    expect(isMessageTombstone(tombstone)).toBe(true);
    expect(isMessageTombstone(base)).toBe(false);
    const merged = mergeMessages([base], [tombstone], false);
    expect(merged).toHaveLength(1);
    expect(merged[0].body).toBeNull();
    expect(merged[0].deletedAt).toEqual(new Date('2026-09-06T12:07:00.000Z'));
  });

  it('CASE 3: identical incoming messages produce exactly one entry', () => {
    const merged = mergeMessages([base], [{ ...base }], false);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(base);
  });

  it('CASE 4/5: newest authoritative state wins regardless of arrival order', () => {
    const edited: Message = {
      ...base,
      body: 'new',
      updatedAt: new Date('2026-09-06T12:05:00.000Z'),
      editedAt: new Date('2026-09-06T12:05:00.000Z'),
    };
    // Socket update first, then REST recovery with the same revision.
    expect(mergeMessages(mergeMessages([base], [edited], false), [edited], false)[0].body).toBe(
      'new',
    );
    // REST recovery first, then the socket update.
    expect(mergeMessages(mergeMessages([base], [edited], false), [edited], false)[0].body).toBe(
      'new',
    );
    // A stale duplicate arriving late must not clobber the newer state.
    expect(mergeMessages([edited], [base], false)[0].body).toBe('new');
  });

  it('CASE 6: rapid reconnect recovery introduces no duplicates', () => {
    const other: Message = { ...base, id: 'm-2', body: 'other' };
    const once = mergeMessages([base], [base, other], false);
    const twice = mergeMessages(once, [base, other], false);
    expect(twice.map((m) => m.id)).toEqual(['m-1', 'm-2']);
  });

  it('never resurrects a locally deleted message from a stale live copy', () => {
    const tombstone: Message = {
      ...base,
      body: null,
      deletedAt: new Date('2026-09-06T12:07:00.000Z'),
    };
    expect(pickAuthoritativeMessage(tombstone, base)).toBe(tombstone);
  });

  it('prepends genuinely new older messages while repairing overlapping ones', () => {
    const edited: Message = {
      ...base,
      body: 'new',
      updatedAt: new Date('2026-09-06T12:05:00.000Z'),
      editedAt: new Date('2026-09-06T12:05:00.000Z'),
    };
    const older: Message = {
      ...base,
      id: 'm-0',
      body: 'older',
      createdAt: new Date('2026-09-06T11:00:00.000Z'),
      updatedAt: new Date('2026-09-06T11:00:00.000Z'),
    };
    const merged = mergeMessages([base], [older, edited], true);
    expect(merged.map((m) => m.id)).toEqual(['m-0', 'm-1']);
    expect(merged[1].body).toBe('new');
  });
});

describe('fetchMessages', () => {
  it('returns the page on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          messages: [MESSAGE_JSON],
          pageInfo: { hasMore: false, nextCursor: null },
        }),
      }),
    );

    await expect(fetchMessages(apiBase, 'ch-1')).resolves.toEqual({
      ok: true,
      data: { messages: [MESSAGE], pageInfo: { hasMore: false, nextCursor: null } },
    });
    vi.unstubAllGlobals();
  });

  it('maps 401 and 404 distinctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );
    await expect(fetchMessages(apiBase, 'ch-1')).resolves.toEqual({
      ok: false,
      unauthenticated: true,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }),
    );
    const notFound = await fetchMessages(apiBase, 'ch-1');
    expect(notFound.ok).toBe(false);
    if (!notFound.ok && !('unauthenticated' in notFound && notFound.unauthenticated)) {
      expect(notFound.kind).toBe('notFound');
    }
    vi.unstubAllGlobals();
  });

  it('rejects corrupt envelopes and rows safely', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ nope: 1 }),
      }),
    );
    await expect(fetchMessages(apiBase, 'ch-1')).resolves.toEqual({
      ok: false,
      kind: 'error',
      message: 'Failed to fetch messages',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          messages: [MESSAGE_JSON, { id: 'broken' }],
          pageInfo: { hasMore: false, nextCursor: null },
        }),
      }),
    );
    await expect(fetchMessages(apiBase, 'ch-1')).resolves.toEqual({
      ok: false,
      kind: 'error',
      message: 'Failed to fetch messages',
    });
    vi.unstubAllGlobals();
  });

  it('handles network failure safely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    await expect(fetchMessages(apiBase, 'ch-1')).resolves.toEqual({
      ok: false,
      kind: 'error',
      message: 'Failed to fetch messages',
    });
    vi.unstubAllGlobals();
  });
});

describe('sendMessage', () => {
  it('posts only the body and returns the created message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => MESSAGE_JSON,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendMessage(apiBase, 'ch-1', 'Hello team')).resolves.toEqual({
      ok: true,
      data: MESSAGE,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/channels/ch-1/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ body: 'Hello team' }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('maps validation errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({ message: 'Enter a message.' }),
      }),
    );
    await expect(sendMessage(apiBase, 'ch-1', '')).resolves.toEqual({
      ok: false,
      kind: 'validation',
      message: 'Enter a message.',
    });
    vi.unstubAllGlobals();
  });
});

describe('editMessage', () => {
  it('patches only the body and returns the updated message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ ...MESSAGE_JSON, body: 'Edited', editedAt: '2026-09-06T13:00:00.000Z' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await editMessage(apiBase, 'm-1', 'Edited');
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/messages/m-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ body: 'Edited' }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('maps forbidden and conflict outcomes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 403, ok: false, json: async () => ({}) }),
    );
    await expect(editMessage(apiBase, 'm-1', 'x')).resolves.toEqual({
      ok: false,
      kind: 'forbidden',
      message: 'You can only edit your own messages',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 409, ok: false, json: async () => ({}) }),
    );
    const conflicted = await editMessage(apiBase, 'm-1', 'x');
    expect(conflicted.ok).toBe(false);
    if (!conflicted.ok) {
      expect('kind' in conflicted && conflicted.kind).toBe('conflict');
    }
    vi.unstubAllGlobals();
  });
});

describe('deleteMessage', () => {
  it('returns the tombstone on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ ...MESSAGE_JSON, body: null, deletedAt: '2026-09-06T14:00:00.000Z' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deleteMessage(apiBase, 'm-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.body).toBeNull();
      expect(result.data.deletedAt).toEqual(new Date('2026-09-06T14:00:00.000Z'));
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/messages/m-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    vi.unstubAllGlobals();
  });
});

describe('isMessageFromCurrentUser', () => {
  it('matches only the author id against a non-null user', () => {
    expect(isMessageFromCurrentUser(MESSAGE, 'u-1')).toBe(true);
    expect(isMessageFromCurrentUser(MESSAGE, 'u-2')).toBe(false);
    expect(isMessageFromCurrentUser(MESSAGE, null)).toBe(false);
  });
});

describe('thread fields in messageFromJson', () => {
  it('parses message with thread replies metadata', () => {
    const threadJson = {
      ...MESSAGE_JSON,
      parentMessageId: 'root-123',
      replyCount: 5,
      latestReplyAt: '2026-09-08T15:00:00.000Z',
    };
    const parsed = messageFromJson(threadJson);
    expect(parsed?.parentMessageId).toBe('root-123');
    expect(parsed?.replyCount).toBe(5);
    expect(parsed?.latestReplyAt).toEqual(new Date('2026-09-08T15:00:00.000Z'));
  });
});

describe('fetchThreadReplies', () => {
  it('fetches thread replies with limit and cursor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        messages: [
          {
            ...MESSAGE_JSON,
            id: 'reply-1',
            parentMessageId: 'root-1',
          },
        ],
        pageInfo: { hasMore: false, nextCursor: null },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchThreadReplies(apiBase, 'root-1', {
      limit: 20,
      cursor: 'cur-123',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.messages).toHaveLength(1);
      expect(result.data.messages[0].id).toBe('reply-1');
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/messages/root-1/replies?limit=20&cursor=cur-123',
      expect.objectContaining({ method: 'GET' }),
    );
    vi.unstubAllGlobals();
  });

  it('handles 404 not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }),
    );

    const result = await fetchThreadReplies(apiBase, 'root-missing');
    expect(result.ok).toBe(false);
    if (!result.ok && !('unauthenticated' in result && result.unauthenticated)) {
      expect(result.kind).toBe('notFound');
    }
    vi.unstubAllGlobals();
  });
});

describe('sendThreadReply', () => {
  it('posts reply payload to replies endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({
        ...MESSAGE_JSON,
        id: 'reply-new',
        body: 'Here is my reply',
        parentMessageId: 'root-1',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendThreadReply(apiBase, 'root-1', 'Here is my reply');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('reply-new');
      expect(result.data.body).toBe('Here is my reply');
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/messages/root-1/replies',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ body: 'Here is my reply' }),
      }),
    );
    vi.unstubAllGlobals();
  });
});

describe('isMessageReactionSummary', () => {
  it('validates proper reaction summary objects', () => {
    expect(isMessageReactionSummary({ emoji: '👍', count: 3, reacted: true })).toBe(true);
    expect(isMessageReactionSummary({ emoji: '🚀', count: 0, reacted: false })).toBe(true);
  });

  it('rejects invalid reaction objects', () => {
    expect(isMessageReactionSummary(null)).toBe(false);
    expect(isMessageReactionSummary({})).toBe(false);
    expect(isMessageReactionSummary({ emoji: '👍', count: '1', reacted: false })).toBe(false);
    expect(isMessageReactionSummary({ emoji: 123, count: 1, reacted: false })).toBe(false);
    expect(isMessageReactionSummary({ emoji: '👍', count: 1, reacted: 'yes' })).toBe(false);
  });
});

describe('fetchMessageReactions', () => {
  it('fetches and returns reactions array on success', async () => {
    const mockReactions: MessageReactionSummary[] = [
      { emoji: '👍', count: 2, reacted: true, userIds: ['u-1', 'u-2'] },
      { emoji: '🎉', count: 1, reacted: false, userIds: ['u-3'] },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ reactions: mockReactions }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMessageReactions(apiBase, 'm-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(mockReactions);
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/messages/m-1/reactions',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }),
    );
    vi.unstubAllGlobals();
  });

  it('handles 401 unauthenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }),
    );
    const result = await fetchMessageReactions(apiBase, 'm-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unauthenticated');
    }
    vi.unstubAllGlobals();
  });

  it('handles 403 unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 403, ok: false, json: async () => ({}) }),
    );
    const result = await fetchMessageReactions(apiBase, 'm-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('unauthorized');
    }
    vi.unstubAllGlobals();
  });

  it('handles 404 notFound', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 404, ok: false, json: async () => ({}) }),
    );
    const result = await fetchMessageReactions(apiBase, 'm-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('notFound');
    }
    vi.unstubAllGlobals();
  });
});

describe('addMessageReaction', () => {
  it('posts emoji and returns created reaction record', async () => {
    const createdReaction = {
      id: 'rxn-1',
      messageId: 'm-1',
      userId: 'u-1',
      emoji: '❤️',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ reaction: createdReaction }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await addMessageReaction(apiBase, 'm-1', '❤️');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(createdReaction);
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/messages/m-1/reactions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ emoji: '❤️' }),
        credentials: 'include',
      }),
    );
    vi.unstubAllGlobals();
  });

  it('handles 409 duplicate reaction conflict gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        json: async () => ({ error: 'Reaction already exists' }),
      }),
    );

    const result = await addMessageReaction(apiBase, 'm-1', '❤️');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('conflict');
    }
    vi.unstubAllGlobals();
  });
});

describe('removeMessageReaction', () => {
  it('deletes reaction with encoded emoji and returns success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await removeMessageReaction(apiBase, 'm-1', '❤️');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ success: true });
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/messages/m-1/reactions/%E2%9D%A4%EF%B8%8F',
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'include',
      }),
    );
    vi.unstubAllGlobals();
  });

  it('handles 404 when reaction does not exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
        json: async () => ({ error: 'Reaction not found' }),
      }),
    );

    const result = await removeMessageReaction(apiBase, 'm-1', '❤️');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('notFound');
    }
    vi.unstubAllGlobals();
  });
});

describe('Direct Messages client & payload validation', () => {
  const profileA: ParticipantProfile = {
    id: 'u-1',
    name: 'Alice',
    email: 'alice@example.com',
    image: null,
  };
  const profileB: ParticipantProfile = {
    id: 'u-2',
    name: 'Bob',
    email: 'bob@example.com',
    image: 'https://example.com/bob.png',
  };

  const CONVERSATION_JSON = {
    id: 'dm-1',
    workspaceId: 'ws-1',
    type: 'DIRECT',
    createdAt: '2026-09-09T01:00:00.000Z',
    updatedAt: '2026-09-09T01:00:00.000Z',
    participants: [profileA, profileB],
    participant: profileB,
    peer: profileB,
  };

  it('validates participant profiles with isParticipantProfile', () => {
    expect(isParticipantProfile(profileA)).toBe(true);
    expect(isParticipantProfile(profileB)).toBe(true);
    expect(isParticipantProfile(null)).toBe(false);
    expect(isParticipantProfile({ id: 'u-1' })).toBe(false);
    expect(isParticipantProfile({ ...profileA, email: 123 })).toBe(false);
  });

  it('validates conversation payloads with isDirectConversationPayload', () => {
    expect(isDirectConversationPayload(CONVERSATION_JSON)).toBe(true);
    expect(isDirectConversationPayload(null)).toBe(false);
    expect(isDirectConversationPayload({})).toBe(false);
    expect(isDirectConversationPayload({ ...CONVERSATION_JSON, type: 'UNKNOWN' })).toBe(false);
    expect(
      isDirectConversationPayload({ ...CONVERSATION_JSON, participants: 'not-an-array' }),
    ).toBe(false);
  });

  it('transforms valid conversation JSON into DirectConversation', () => {
    const parsed = directConversationFromJson(CONVERSATION_JSON);
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('dm-1');
    expect(parsed?.type).toBe('DIRECT');
    expect(parsed?.createdAt).toEqual(new Date('2026-09-09T01:00:00.000Z'));
    expect(parsed?.participant).toEqual(profileB);
  });

  it('createOrGetDirectConversation posts recipientId and returns conversation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ conversation: CONVERSATION_JSON }),
      }),
    );

    const result = await createOrGetDirectConversation(apiBase, 'ws-1', 'u-2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('dm-1');
      expect(result.data.participant?.id).toBe('u-2');
    }
    vi.unstubAllGlobals();
  });

  it('createOrGetDirectConversation handles 400 validation error (e.g. self-DM)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Cannot start a direct message with yourself.',
          },
        }),
      }),
    );

    const result = await createOrGetDirectConversation(apiBase, 'ws-1', 'u-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('validation');
      expect(result.message).toBe('Cannot start a direct message with yourself.');
    }
    vi.unstubAllGlobals();
  });

  it('fetchDirectConversations fetches paginated conversations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          conversations: [CONVERSATION_JSON],
          pageInfo: { hasMore: false, nextCursor: null },
        }),
      }),
    );

    const result = await fetchDirectConversations(apiBase, 'ws-1', { limit: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.conversations).toHaveLength(1);
      expect(result.data.pageInfo.hasMore).toBe(false);
    }
    vi.unstubAllGlobals();
  });

  it('fetchDirectConversation retrieves a single conversation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ conversation: CONVERSATION_JSON }),
      }),
    );

    const result = await fetchDirectConversation(apiBase, 'dm-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('dm-1');
    }
    vi.unstubAllGlobals();
  });

  it('fetchDirectMessages returns paginated DM messages', async () => {
    const dmMessageJson = {
      id: 'msg-dm-1',
      directMessageConversationId: 'dm-1',
      authorId: 'u-1',
      body: 'Hello direct message',
      createdAt: '2026-09-09T01:00:00.000Z',
      updatedAt: '2026-09-09T01:00:00.000Z',
      editedAt: null,
      deletedAt: null,
      author: profileA,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          messages: [dmMessageJson],
          pageInfo: { hasMore: false, nextCursor: null },
        }),
      }),
    );

    const result = await fetchDirectMessages(apiBase, 'dm-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.messages).toHaveLength(1);
      expect(result.data.messages[0].directMessageConversationId).toBe('dm-1');
    }
    vi.unstubAllGlobals();
  });

  it('sendDirectMessage sends message and returns created record', async () => {
    const dmMessageJson = {
      id: 'msg-dm-2',
      directMessageConversationId: 'dm-1',
      authorId: 'u-1',
      body: 'Hey Bob',
      createdAt: '2026-09-09T01:00:00.000Z',
      updatedAt: '2026-09-09T01:00:00.000Z',
      editedAt: null,
      deletedAt: null,
      author: profileA,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 201,
        ok: true,
        json: async () => ({ message: dmMessageJson }),
      }),
    );

    const result = await sendDirectMessage(apiBase, 'dm-1', 'Hey Bob');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('msg-dm-2');
      expect(result.data.body).toBe('Hey Bob');
    }
    vi.unstubAllGlobals();
  });
});

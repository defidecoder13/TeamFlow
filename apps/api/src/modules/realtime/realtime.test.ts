import http from 'node:http';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import {
  closeRealtime,
  emitChannelMembershipRemoved,
  emitDirectConversationRead,
  emitDirectMessageCreated,
  emitDirectMessageDeleted,
  emitDirectMessageUpdated,
  emitMessageCreated,
  emitMessageDeleted,
  emitMessageUpdated,
  emitNotificationNew,
  emitNotificationRead,
  emitNotificationReadAll,
  emitWorkspaceMembershipRemoved,
  initRealtime,
} from './index';

const { authorizeChannelAccessMock, authorizeDirectConversationAccessMock } = vi.hoisted(() => ({
  authorizeChannelAccessMock: vi.fn(),
  authorizeDirectConversationAccessMock: vi.fn(),
}));

vi.mock('../messages/authorization', () => ({
  authorizeChannelAccess: authorizeChannelAccessMock,
}));

vi.mock('../direct-messages/authorization', () => ({
  authorizeDirectConversationAccess: authorizeDirectConversationAccessMock,
}));

vi.mock('../auth/prisma', () => ({
  getPrisma: () => ({}),
}));

const TEST_AUTH_URL = 'http://localhost:4000';
const TEST_USER = {
  name: 'Realtime User',
  email: 'realtime@test.teamflow.local',
  password: 'realtime-test-password-12345',
};

function createTestAuth() {
  return betterAuth({
    secret: 'realtime-test-secret-0123456789abcdef-0123456789abcdef',
    baseURL: TEST_AUTH_URL,
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
  });
}

describe('Realtime Gateway (Socket.IO)', () => {
  let server: http.Server;
  let serverPort: number;
  let authCookie: string;
  let auth: ReturnType<typeof createTestAuth>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    auth = createTestAuth();
    app = createApp({ auth });
    server = http.createServer(app);
    initRealtime(server, () => auth);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });

    const agent = request.agent(app);
    const signUpRes = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', TEST_AUTH_URL)
      .send(TEST_USER);

    expect(signUpRes.status).toBeLessThan(300);
    const cookies = signUpRes.headers['set-cookie'];
    authCookie = Array.isArray(cookies) ? cookies[0]! : (cookies as unknown as string);
  });

  afterAll(async () => {
    await closeRealtime();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    authorizeChannelAccessMock.mockReset();
    authorizeDirectConversationAccessMock.mockReset();
  });

  function createClient(cookie?: string): ClientSocket {
    return ioc(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      autoConnect: false,
      extraHeaders: cookie ? { Cookie: cookie } : undefined,
    });
  }

  it('rejects unauthenticated socket connections with UNAUTHENTICATED error', async () => {
    const client = createClient(); // No cookie

    const error = await new Promise<Error>((resolve) => {
      client.on('connect_error', (err) => {
        resolve(err);
      });
      client.connect();
    });

    expect(error.message).toBe('UNAUTHENTICATED');
    client.disconnect();
  });

  it('authenticates socket connection with valid session cookie', async () => {
    const client = createClient(authCookie);

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (err) => reject(err));
      client.connect();
    });

    expect(client.connected).toBe(true);
    client.disconnect();
  });

  it('allows joining authorized channel and rejects unauthorized channel', async () => {
    const client = createClient(authCookie);
    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
      client.connect();
    });

    // 1. Authorized channel join succeeds
    authorizeChannelAccessMock.mockResolvedValueOnce({
      id: 'ch-public',
      workspaceId: 'ws-1',
      name: 'general',
      type: 'PUBLIC',
    });

    const joinResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      client.emit('channel:join', { channelId: 'ch-public' }, resolve);
    });
    expect(joinResult.ok).toBe(true);

    // 2. Unauthorized channel join fails with FORBIDDEN
    authorizeChannelAccessMock.mockResolvedValueOnce(null);

    const unauthorizedResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      client.emit('channel:join', { channelId: 'ch-private-denied' }, resolve);
    });
    expect(unauthorizedResult.ok).toBe(false);
    expect(unauthorizedResult.error).toBe('FORBIDDEN');

    client.disconnect();
  });

  it('isolates events between different channel rooms', async () => {
    const clientA = createClient(authCookie);
    const clientB = createClient(authCookie);

    await Promise.all([
      new Promise<void>((resolve) => {
        clientA.on('connect', () => resolve());
        clientA.connect();
      }),
      new Promise<void>((resolve) => {
        clientB.on('connect', () => resolve());
        clientB.connect();
      }),
    ]);

    authorizeChannelAccessMock.mockResolvedValue({ id: 'ch-1', workspaceId: 'ws-1' });

    await new Promise<void>((resolve) => {
      clientA.emit('channel:join', { channelId: 'ch-1' }, () => resolve());
    });
    await new Promise<void>((resolve) => {
      clientB.emit('channel:join', { channelId: 'ch-2' }, () => resolve());
    });

    const clientAMessages: unknown[] = [];
    const clientBMessages: unknown[] = [];

    clientA.on('message:new', (msg) => clientAMessages.push(msg));
    clientB.on('message:new', (msg) => clientBMessages.push(msg));

    const testMessage = {
      id: 'm-test-1',
      channelId: 'ch-1',
      authorId: 'u-1',
      body: 'Hello room 1',
      createdAt: new Date(),
      updatedAt: new Date(),
      editedAt: null,
      deletedAt: null,
      author: { id: 'u-1', name: 'User 1', email: 'u1@example.com', image: null },
    };

    emitMessageCreated('ch-1', testMessage);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(clientAMessages).toHaveLength(1);
    expect(clientBMessages).toHaveLength(0);

    clientA.disconnect();
    clientB.disconnect();
  });

  it('emits message:updated and message:deleted to channel room', async () => {
    const client = createClient(authCookie);
    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
      client.connect();
    });

    authorizeChannelAccessMock.mockResolvedValue({ id: 'ch-1', workspaceId: 'ws-1' });
    await new Promise<void>((resolve) => {
      client.emit('channel:join', { channelId: 'ch-1' }, () => resolve());
    });

    const updatedEvents: unknown[] = [];
    const deletedEvents: unknown[] = [];

    client.on('message:updated', (ev) => updatedEvents.push(ev));
    client.on('message:deleted', (ev) => deletedEvents.push(ev));

    const message = {
      id: 'm-1',
      channelId: 'ch-1',
      authorId: 'u-1',
      body: 'Updated body',
      createdAt: new Date(),
      updatedAt: new Date(),
      editedAt: new Date(),
      deletedAt: null,
      author: { id: 'u-1', name: 'User 1', email: 'u1@example.com', image: null },
    };

    emitMessageUpdated('ch-1', message);
    emitMessageDeleted('ch-1', 'm-1', new Date('2026-09-08T10:00:00.000Z'));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(updatedEvents).toHaveLength(1);
    expect(updatedEvents[0]).toEqual({
      type: 'message:updated',
      channelId: 'ch-1',
      conversationId: null,
      message: expect.objectContaining({ id: 'm-1', body: 'Updated body' }),
    });

    expect(deletedEvents).toHaveLength(1);
    expect(deletedEvents[0]).toEqual({
      type: 'message:deleted',
      channelId: 'ch-1',
      conversationId: null,
      messageId: 'm-1',
      deletedAt: '2026-09-08T10:00:00.000Z',
    });

    client.disconnect();
  });

  it('allows joining authorized direct conversation and rejects unauthorized access', async () => {
    const client = createClient(authCookie);
    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
      client.connect();
    });

    // 1. Authorized direct conversation join succeeds
    authorizeDirectConversationAccessMock.mockResolvedValueOnce({
      id: 'dm-authorized',
      workspaceId: 'ws-1',
      type: 'DIRECT',
    });

    const joinResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      client.emit('join_direct_conversation', { conversationId: 'dm-authorized' }, resolve);
    });
    expect(joinResult.ok).toBe(true);

    // 2. Unauthorized direct conversation join fails with FORBIDDEN
    authorizeDirectConversationAccessMock.mockResolvedValueOnce(null);

    const unauthorizedResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      client.emit('join_direct_conversation', { conversationId: 'dm-forbidden' }, resolve);
    });
    expect(unauthorizedResult.ok).toBe(false);
    expect(unauthorizedResult.error).toBe('FORBIDDEN');

    client.disconnect();
  });

  it('isolates events between different direct conversation rooms', async () => {
    const clientA = createClient(authCookie);
    const clientB = createClient(authCookie);

    await Promise.all([
      new Promise<void>((resolve) => {
        clientA.on('connect', () => resolve());
        clientA.connect();
      }),
      new Promise<void>((resolve) => {
        clientB.on('connect', () => resolve());
        clientB.connect();
      }),
    ]);

    authorizeDirectConversationAccessMock.mockResolvedValue({
      id: 'dm-1',
      workspaceId: 'ws-1',
      type: 'DIRECT',
    });

    await new Promise<void>((resolve) => {
      clientA.emit('join_direct_conversation', { conversationId: 'dm-1' }, () => resolve());
    });
    await new Promise<void>((resolve) => {
      clientB.emit('join_direct_conversation', { conversationId: 'dm-2' }, () => resolve());
    });

    const clientAMessages: unknown[] = [];
    const clientBMessages: unknown[] = [];

    clientA.on('message:new', (msg) => clientAMessages.push(msg));
    clientB.on('message:new', (msg) => clientBMessages.push(msg));

    const directMessage = {
      id: 'dm-msg-1',
      channelId: null,
      directMessageConversationId: 'dm-1',
      parentMessageId: null,
      authorId: 'u-1',
      body: 'Hello direct conversation 1',
      createdAt: new Date(),
      updatedAt: new Date(),
      editedAt: null,
      deletedAt: null,
      author: { id: 'u-1', name: 'User 1', email: 'u1@example.com', image: null },
    };

    emitDirectMessageCreated('dm-1', directMessage);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(clientAMessages).toHaveLength(1);
    expect(clientBMessages).toHaveLength(0);

    clientA.disconnect();
    clientB.disconnect();
  });

  it('isolates events between channel rooms and direct conversation rooms', async () => {
    const channelClient = createClient(authCookie);
    const dmClient = createClient(authCookie);

    await Promise.all([
      new Promise<void>((resolve) => {
        channelClient.on('connect', () => resolve());
        channelClient.connect();
      }),
      new Promise<void>((resolve) => {
        dmClient.on('connect', () => resolve());
        dmClient.connect();
      }),
    ]);

    authorizeChannelAccessMock.mockResolvedValue({ id: 'ch-1', workspaceId: 'ws-1' });
    authorizeDirectConversationAccessMock.mockResolvedValue({
      id: 'dm-1',
      workspaceId: 'ws-1',
      type: 'DIRECT',
    });

    await new Promise<void>((resolve) => {
      channelClient.emit('channel:join', { channelId: 'ch-1' }, () => resolve());
    });
    await new Promise<void>((resolve) => {
      dmClient.emit('join_direct_conversation', { conversationId: 'dm-1' }, () => resolve());
    });

    const channelReceived: unknown[] = [];
    const dmReceived: unknown[] = [];

    channelClient.on('message:new', (msg) => channelReceived.push(msg));
    dmClient.on('message:new', (msg) => dmReceived.push(msg));

    // Emit channel message -> only channelClient should receive
    emitMessageCreated('ch-1', {
      id: 'ch-msg-1',
      channelId: 'ch-1',
      body: 'Channel message',
      createdAt: new Date(),
      updatedAt: new Date(),
      editedAt: null,
      deletedAt: null,
      author: { id: 'u-1', name: 'User 1', email: 'u1@example.com', image: null },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(channelReceived).toHaveLength(1);
    expect(dmReceived).toHaveLength(0);

    // Emit direct message -> only dmClient should receive
    emitDirectMessageCreated('dm-1', {
      id: 'dm-msg-2',
      channelId: null,
      directMessageConversationId: 'dm-1',
      parentMessageId: null,
      body: 'DM message',
      createdAt: new Date(),
      updatedAt: new Date(),
      editedAt: null,
      deletedAt: null,
      author: { id: 'u-2', name: 'User 2', email: 'u2@example.com', image: null },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(channelReceived).toHaveLength(1);
    expect(dmReceived).toHaveLength(1);

    channelClient.disconnect();
    dmClient.disconnect();
  });

  it('emits message:updated and message:deleted to direct conversation room', async () => {
    const client = createClient(authCookie);
    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
      client.connect();
    });

    authorizeDirectConversationAccessMock.mockResolvedValue({
      id: 'dm-1',
      workspaceId: 'ws-1',
      type: 'DIRECT',
    });
    await new Promise<void>((resolve) => {
      client.emit('join_direct_conversation', { conversationId: 'dm-1' }, () => resolve());
    });

    const updatedEvents: unknown[] = [];
    const deletedEvents: unknown[] = [];

    client.on('message:updated', (ev) => updatedEvents.push(ev));
    client.on('message:deleted', (ev) => deletedEvents.push(ev));

    const message = {
      id: 'dm-msg-1',
      channelId: null,
      directMessageConversationId: 'dm-1',
      parentMessageId: null,
      authorId: 'u-1',
      body: 'Updated direct message body',
      createdAt: new Date(),
      updatedAt: new Date(),
      editedAt: new Date(),
      deletedAt: null,
      author: { id: 'u-1', name: 'User 1', email: 'u1@example.com', image: null },
    };

    emitDirectMessageUpdated('dm-1', message);
    emitDirectMessageDeleted('dm-1', 'dm-msg-1', new Date('2026-09-08T11:00:00.000Z'));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(updatedEvents).toHaveLength(1);
    expect(updatedEvents[0]).toEqual({
      type: 'message:updated',
      channelId: null,
      conversationId: 'dm-1',
      message: expect.objectContaining({ id: 'dm-msg-1', body: 'Updated direct message body' }),
    });

    expect(deletedEvents).toHaveLength(1);
    expect(deletedEvents[0]).toEqual({
      type: 'message:deleted',
      channelId: null,
      conversationId: 'dm-1',
      messageId: 'dm-msg-1',
      deletedAt: '2026-09-08T11:00:00.000Z',
    });

    client.disconnect();
  });

  it('emits conversation:read event to direct conversation room', async () => {
    const client = createClient(authCookie);
    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
      client.connect();
    });

    authorizeDirectConversationAccessMock.mockResolvedValue({
      id: 'dm-read-room',
      workspaceId: 'ws-1',
      type: 'DIRECT',
    });
    await new Promise<void>((resolve) => {
      client.emit('join_direct_conversation', { conversationId: 'dm-read-room' }, () => resolve());
    });

    const readEvents: unknown[] = [];
    client.on('conversation:read', (ev) => readEvents.push(ev));

    emitDirectConversationRead('dm-read-room', {
      conversationId: 'dm-read-room',
      userId: 'u-peer',
      lastReadMessageId: 'msg-latest',
      lastReadAt: new Date('2026-09-09T01:30:00.000Z'),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(readEvents).toHaveLength(1);
    expect(readEvents[0]).toEqual({
      type: 'conversation:read',
      conversationId: 'dm-read-room',
      userId: 'u-peer',
      lastReadMessageId: 'msg-latest',
      lastReadAt: '2026-09-09T01:30:00.000Z',
    });

    client.disconnect();
  });

  let secondUserCounter = 0;
  async function signUpSecondUser(
    app: ReturnType<typeof createApp>,
  ): Promise<{ cookie: string; userId: string }> {
    secondUserCounter += 1;
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', TEST_AUTH_URL)
      .send({
        name: 'Realtime User Two',
        email: `realtime-two-${secondUserCounter}@test.teamflow.local`,
        password: 'realtime-test-password-12345',
      });
    expect(res.status).toBeLessThan(300);
    const cookies = res.headers['set-cookie'];
    const cookie = Array.isArray(cookies) ? cookies[0]! : (cookies as unknown as string);
    const userId = (res.body as { user: { id: string } }).user.id;
    return { cookie, userId };
  }

  function notificationPayload(recipientUserId: string) {
    return {
      id: 'n-1',
      type: 'MENTION',
      workspaceId: 'ws-1',
      recipientUserId,
      actorUserId: 'u-actor',
      actorName: 'Actor',
      actorImage: null,
      messageId: 'm-1',
      conversationId: null,
      channelId: 'ch-1',
      threadRootMessageId: null,
      channelName: 'general',
      conversationName: null,
      createdAt: '2026-09-09T02:00:00.000Z',
      readAt: null,
    };
  }

  it('auto-joins the authenticated user room and isolates notification delivery', async () => {
    const second = await signUpSecondUser(app);
    const firstUserId = (
      await request(app).post('/api/auth/sign-in/email').set('Origin', TEST_AUTH_URL).send({
        email: TEST_USER.email,
        password: TEST_USER.password,
      })
    ).body.user.id as string;

    const clientA = createClient(authCookie);
    const clientB = createClient(second.cookie);

    await Promise.all([
      new Promise<void>((resolve) => {
        clientA.on('connect', () => resolve());
        clientA.connect();
      }),
      new Promise<void>((resolve) => {
        clientB.on('connect', () => resolve());
        clientB.connect();
      }),
    ]);

    const eventsA: unknown[] = [];
    const eventsB: unknown[] = [];
    clientA.on('notification:new', (ev) => eventsA.push(ev));
    clientB.on('notification:new', (ev) => eventsB.push(ev));

    // No client-driven room join exists; delivery to B must not reach A.
    emitNotificationNew(second.userId, notificationPayload(second.userId));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(eventsB).toHaveLength(1);
    expect(eventsB[0]).toEqual({
      type: 'notification:new',
      notification: notificationPayload(second.userId),
    });
    expect(eventsA).toHaveLength(0);
    expect(firstUserId).not.toBe(second.userId);

    clientA.disconnect();
    clientB.disconnect();
  });

  it('ignores unknown client events without breaking the connection', async () => {
    const client = createClient(authCookie);
    await new Promise<void>((resolve) => {
      client.on('connect', () => resolve());
      client.connect();
    });

    // There is no handler for joining other users' rooms; garbage is a no-op.
    client.emit('user:join' as never, { userId: 'u-evil' } as never);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(client.connected).toBe(true);

    client.disconnect();
  });

  it('delivers notification:read and notification:read-all to the recipient room only', async () => {
    const second = await signUpSecondUser(app);
    const clientA = createClient(authCookie);
    const clientB = createClient(second.cookie);

    await Promise.all([
      new Promise<void>((resolve) => {
        clientA.on('connect', () => resolve());
        clientA.connect();
      }),
      new Promise<void>((resolve) => {
        clientB.on('connect', () => resolve());
        clientB.connect();
      }),
    ]);

    const readA: unknown[] = [];
    const readB: unknown[] = [];
    const readAllA: unknown[] = [];
    const readAllB: unknown[] = [];
    clientA.on('notification:read', (ev) => readA.push(ev));
    clientB.on('notification:read', (ev) => readB.push(ev));
    clientA.on('notification:read-all', (ev) => readAllA.push(ev));
    clientB.on('notification:read-all', (ev) => readAllB.push(ev));

    emitNotificationRead(second.userId, {
      id: 'n-9',
      workspaceId: 'ws-1',
      readAt: new Date('2026-09-09T03:00:00.000Z'),
    });
    emitNotificationReadAll(second.userId, {
      workspaceId: 'ws-1',
      readAt: new Date('2026-09-09T03:01:00.000Z'),
      updatedCount: 4,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(readB).toEqual([
      {
        type: 'notification:read',
        id: 'n-9',
        workspaceId: 'ws-1',
        readAt: '2026-09-09T03:00:00.000Z',
      },
    ]);
    expect(readAllB).toEqual([
      {
        type: 'notification:read-all',
        workspaceId: 'ws-1',
        readAt: '2026-09-09T03:01:00.000Z',
        updatedCount: 4,
      },
    ]);
    expect(readA).toHaveLength(0);
    expect(readAllA).toHaveLength(0);

    clientA.disconnect();
    clientB.disconnect();
  });

  it('delivers membership-removal events only to the removed user room', async () => {
    const second = await signUpSecondUser(app);
    const clientA = createClient(authCookie);
    const clientB = createClient(second.cookie);

    await Promise.all([
      new Promise<void>((resolve) => {
        clientA.on('connect', () => resolve());
        clientA.connect();
      }),
      new Promise<void>((resolve) => {
        clientB.on('connect', () => resolve());
        clientB.connect();
      }),
    ]);

    const channelA: unknown[] = [];
    const channelB: unknown[] = [];
    const workspaceA: unknown[] = [];
    const workspaceB: unknown[] = [];
    clientA.on('channel:membership-removed', (ev) => channelA.push(ev));
    clientB.on('channel:membership-removed', (ev) => channelB.push(ev));
    clientA.on('workspace:membership-removed', (ev) => workspaceA.push(ev));
    clientB.on('workspace:membership-removed', (ev) => workspaceB.push(ev));

    emitChannelMembershipRemoved('ws-1', 'ch-private', second.userId);
    emitWorkspaceMembershipRemoved('ws-1', second.userId);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Victim receives both, with ids only and no content.
    expect(channelB).toEqual([
      {
        type: 'channel:membership-removed',
        workspaceId: 'ws-1',
        channelId: 'ch-private',
        userId: second.userId,
      },
    ]);
    expect(workspaceB).toEqual([
      {
        type: 'workspace:membership-removed',
        workspaceId: 'ws-1',
        userId: second.userId,
      },
    ]);
    // Unrelated connected user receives nothing.
    expect(channelA).toHaveLength(0);
    expect(workspaceA).toHaveLength(0);

    clientA.disconnect();
    clientB.disconnect();
  });
});

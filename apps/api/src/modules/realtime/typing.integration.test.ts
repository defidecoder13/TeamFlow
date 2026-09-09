/**
 * Typing indicator backend integration tests (Phase 4I.4).
 *
 * Covers:
 * - Authenticated socket starts typing in channel -> peers in room receive typing:started, sender excluded
 * - Authenticated socket stops typing in channel -> peers in room receive typing:stopped, sender excluded
 * - Authenticated socket starts/stops typing in DM conversation -> peers in room receive events, sender excluded
 * - Disconnecting socket clears typing state and broadcasts typing:stopped
 * - Multi-tab / multi-socket: user stays typing while at least one tab is active
 * - Authorization: unauthenticated socket rejected, unauthorized private channel rejected, unauthorized DM rejected
 * - Invalid payloads rejection
 */

import http from 'node:http';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { closeRealtime, initRealtime, typingRegistry } from './index';

const { mockGetPrisma } = vi.hoisted(() => ({
  mockGetPrisma: vi.fn(),
}));

vi.mock('../auth/prisma', () => ({
  getPrisma: (...args: unknown[]) => mockGetPrisma(...args),
}));

const TEST_AUTH_URL = 'http://localhost:4000';

function createTestAuth() {
  return betterAuth({
    secret: 'typing-test-secret-0123456789abcdef-0123456789abcdef',
    baseURL: TEST_AUTH_URL,
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
  });
}

describe('Typing Indicator Backend Integration (Phase 4I.4)', () => {
  let server: http.Server;
  let serverPort: number;
  let auth: ReturnType<typeof createTestAuth>;
  let app: ReturnType<typeof createApp>;
  let prismaMock: {
    workspaceMembership: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    channel: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    channelMembership: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    directMessageConversation: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    directMessageParticipant: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  let user1Cookie: string;
  let user1Id: string;
  let user2Cookie: string;
  let user2Id: string;
  let user3Cookie: string;

  const workspaceId = 'ws-test-typing-123';
  const channelId = 'ch-test-typing-123';
  const conversationId = 'conv-test-typing-123';

  function createClient(cookie?: string): ClientSocket {
    return ioc(`http://localhost:${serverPort}`, {
      autoConnect: false,
      extraHeaders: cookie ? { cookie } : {},
      transports: ['websocket'],
      reconnection: false,
    });
  }

  async function connectClient(client: ClientSocket): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connection timeout')), 5000);
      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      client.connect();
    });
  }

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

    // Sign up User 1
    const res1 = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', TEST_AUTH_URL)
      .send({ name: 'User One', email: 'user1@example.com', password: 'password12345' });
    user1Cookie = Array.isArray(res1.headers['set-cookie'])
      ? res1.headers['set-cookie'][0]!
      : (res1.headers['set-cookie'] as unknown as string);
    user1Id = res1.body.user.id;

    // Sign up User 2
    const res2 = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', TEST_AUTH_URL)
      .send({ name: 'User Two', email: 'user2@example.com', password: 'password12345' });
    user2Cookie = Array.isArray(res2.headers['set-cookie'])
      ? res2.headers['set-cookie'][0]!
      : (res2.headers['set-cookie'] as unknown as string);
    user2Id = res2.body.user.id;

    // Sign up User 3 (outsider)
    const res3 = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', TEST_AUTH_URL)
      .send({ name: 'Outsider', email: 'outsider@example.com', password: 'password12345' });
    user3Cookie = Array.isArray(res3.headers['set-cookie'])
      ? res3.headers['set-cookie'][0]!
      : (res3.headers['set-cookie'] as unknown as string);
  });

  afterAll(async () => {
    await closeRealtime();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    typingRegistry.clear();

    prismaMock = {
      workspaceMembership: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: { workspaceId_userId: { workspaceId: string; userId: string } };
          }) => {
            if (where.workspaceId_userId.workspaceId === workspaceId) {
              if (
                where.workspaceId_userId.userId === user1Id ||
                where.workspaceId_userId.userId === user2Id
              ) {
                return {
                  id: 'mem-1',
                  workspaceId,
                  userId: where.workspaceId_userId.userId,
                  role: 'MEMBER',
                };
              }
            }
            return null;
          },
        ),
        findMany: vi.fn(async () => []),
      },
      channel: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id === channelId) {
            return { id: channelId, workspaceId, isPrivate: false, type: 'PUBLIC' };
          }
          if (where.id === 'ch-private-123') {
            return { id: 'ch-private-123', workspaceId, isPrivate: true, type: 'PRIVATE' };
          }
          return null;
        }),
      },
      channelMembership: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: { channelId_userId: { channelId: string; userId: string } };
          }) => {
            if (
              where.channelId_userId.channelId === 'ch-private-123' &&
              where.channelId_userId.userId === user1Id
            ) {
              return { id: 'cm-1', channelId: 'ch-private-123', userId: user1Id };
            }
            return null;
          },
        ),
      },
      directMessageConversation: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id === conversationId) {
            return {
              id: conversationId,
              workspaceId,
              type: 'DIRECT',
            };
          }
          return null;
        }),
      },
      directMessageParticipant: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: { conversationId_userId: { conversationId: string; userId: string } };
          }) => {
            if (where.conversationId_userId.conversationId === conversationId) {
              if (
                where.conversationId_userId.userId === user1Id ||
                where.conversationId_userId.userId === user2Id
              ) {
                return {
                  id: 'dp-x',
                  conversationId,
                  userId: where.conversationId_userId.userId,
                  role: 'MEMBER',
                };
              }
            }
            return null;
          },
        ),
      },
    };

    mockGetPrisma.mockReturnValue(prismaMock);
  });

  async function createConnectedClient(cookie?: string): Promise<ClientSocket> {
    const client = createClient(cookie);
    await connectClient(client);
    return client;
  }

  it('delivers typing:started and typing:stopped to channel peers while excluding sender', async () => {
    const client1 = await createConnectedClient(user1Cookie);
    const client2 = await createConnectedClient(user2Cookie);

    // Both join channel room
    await new Promise((res) => client1.emit('channel:join', { channelId }, res));
    await new Promise((res) => client2.emit('channel:join', { channelId }, res));

    const client1Events: unknown[] = [];
    const client2Events: unknown[] = [];

    client1.on('typing:started', (data) => client1Events.push(data));
    client1.on('typing:stopped', (data) => client1Events.push(data));
    client2.on('typing:started', (data) => client2Events.push(data));
    client2.on('typing:stopped', (data) => client2Events.push(data));

    // User 1 starts typing
    const startRes = await new Promise<{ ok: boolean }>((res) => {
      client1.emit('typing:start', { channelId }, res);
    });
    expect(startRes.ok).toBe(true);

    // Wait short time for socket event propagation
    await new Promise((r) => setTimeout(r, 50));

    // Client 2 (peer) receives typing:started, Client 1 (sender) does not
    expect(client1Events).toHaveLength(0);
    expect(client2Events).toHaveLength(1);
    expect(client2Events[0]).toEqual({
      type: 'typing:started',
      userId: user1Id,
      channelId,
    });

    // User 1 stops typing
    const stopRes = await new Promise<{ ok: boolean }>((res) => {
      client1.emit('typing:stop', { channelId }, res);
    });
    expect(stopRes.ok).toBe(true);

    await new Promise((r) => setTimeout(r, 50));

    expect(client1Events).toHaveLength(0);
    expect(client2Events).toHaveLength(2);
    expect(client2Events[1]).toEqual({
      type: 'typing:stopped',
      userId: user1Id,
      channelId,
    });

    client1.disconnect();
    client2.disconnect();
  });

  it('delivers typing:started and typing:stopped to direct conversation peers while excluding sender', async () => {
    const client1 = await createConnectedClient(user1Cookie);
    const client2 = await createConnectedClient(user2Cookie);

    await new Promise((res) => client1.emit('direct:join', { conversationId }, res));
    await new Promise((res) => client2.emit('direct:join', { conversationId }, res));

    const client2Events: unknown[] = [];
    client2.on('typing:started', (data) => client2Events.push(data));
    client2.on('typing:stopped', (data) => client2Events.push(data));

    // User 1 starts typing in DM
    await new Promise<{ ok: boolean }>((res) =>
      client1.emit('typing:start', { conversationId }, res),
    );
    await new Promise((r) => setTimeout(r, 50));

    expect(client2Events).toHaveLength(1);
    expect(client2Events[0]).toEqual({
      type: 'typing:started',
      userId: user1Id,
      conversationId,
    });

    // User 1 stops typing in DM
    await new Promise<{ ok: boolean }>((res) =>
      client1.emit('typing:stop', { conversationId }, res),
    );
    await new Promise((r) => setTimeout(r, 50));

    expect(client2Events).toHaveLength(2);
    expect(client2Events[1]).toEqual({
      type: 'typing:stopped',
      userId: user1Id,
      conversationId,
    });

    client1.disconnect();
    client2.disconnect();
  });

  it('enforces authorization for private channels and unauthorized users', async () => {
    const client1 = await createConnectedClient(user1Cookie); // Member of private channel
    const client3 = await createConnectedClient(user3Cookie); // Outsider

    // Outsider trying to start typing in public channel where not member of workspace
    const resOutsider = await new Promise<{ ok: boolean; error?: string }>((res) => {
      client3.emit('typing:start', { channelId }, res);
    });
    expect(resOutsider.ok).toBe(false);
    expect(resOutsider.error).toBe('FORBIDDEN');

    // Outsider trying to start typing in private channel
    const resPrivateOutsider = await new Promise<{ ok: boolean; error?: string }>((res) => {
      client3.emit('typing:start', { channelId: 'ch-private-123' }, res);
    });
    expect(resPrivateOutsider.ok).toBe(false);
    expect(resPrivateOutsider.error).toBe('FORBIDDEN');

    // User 1 is member of private channel
    const resPrivateMember = await new Promise<{ ok: boolean; error?: string }>((res) => {
      client1.emit('typing:start', { channelId: 'ch-private-123' }, res);
    });
    expect(resPrivateMember.ok).toBe(true);

    client1.disconnect();
    client3.disconnect();
  });

  it('enforces authorization for direct conversations', async () => {
    const client3 = await createConnectedClient(user3Cookie); // Non-participant

    const res = await new Promise<{ ok: boolean; error?: string }>((res) => {
      client3.emit('typing:start', { conversationId }, res);
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('FORBIDDEN');

    client3.disconnect();
  });

  it('rejects invalid payloads and unauthenticated sockets', async () => {
    const client1 = await createConnectedClient(user1Cookie);

    // Both channelId and conversationId provided
    const resBoth = await new Promise<{ ok: boolean; error?: string }>((res) => {
      client1.emit('typing:start', { channelId, conversationId }, res);
    });
    expect(resBoth.ok).toBe(false);
    expect(resBoth.error).toBe('INVALID_CONTAINER');

    // Neither provided
    const resNone = await new Promise<{ ok: boolean; error?: string }>((res) => {
      client1.emit('typing:start', {}, res);
    });
    expect(resNone.ok).toBe(false);
    expect(resNone.error).toBe('INVALID_CONTAINER');

    client1.disconnect();

    // Unauthenticated connection
    const unauthClient = createClient();
    await expect(connectClient(unauthClient)).rejects.toThrow('UNAUTHENTICATED');
  });

  it('cleans up typing state and emits typing:stopped upon socket disconnect', async () => {
    const client1 = await createConnectedClient(user1Cookie);
    const client2 = await createConnectedClient(user2Cookie);

    await new Promise((res) => client1.emit('channel:join', { channelId }, res));
    await new Promise((res) => client2.emit('channel:join', { channelId }, res));

    const client2Events: unknown[] = [];
    client2.on('typing:started', (data) => client2Events.push(data));
    client2.on('typing:stopped', (data) => client2Events.push(data));

    // User 1 starts typing
    await new Promise<{ ok: boolean }>((res) => client1.emit('typing:start', { channelId }, res));
    await new Promise((r) => setTimeout(r, 50));
    expect(client2Events).toHaveLength(1);

    // User 1 disconnects unexpectedly
    client1.disconnect();

    // Wait for disconnect handling
    await new Promise((r) => setTimeout(r, 80));

    expect(client2Events).toHaveLength(2);
    expect(client2Events[1]).toEqual({
      type: 'typing:stopped',
      userId: user1Id,
      channelId,
    });

    client2.disconnect();
  });

  it('keeps typing active across multiple sockets/tabs until all stop or disconnect', async () => {
    const client1Tab1 = await createConnectedClient(user1Cookie);
    const client1Tab2 = await createConnectedClient(user1Cookie);
    const client2 = await createConnectedClient(user2Cookie);

    await new Promise((res) => client2.emit('channel:join', { channelId }, res));

    const client2Events: unknown[] = [];
    client2.on('typing:started', (data) => client2Events.push(data));
    client2.on('typing:stopped', (data) => client2Events.push(data));

    // Tab 1 starts typing -> peer receives typing:started
    await new Promise<{ ok: boolean }>((res) =>
      client1Tab1.emit('typing:start', { channelId }, res),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(client2Events).toHaveLength(1);

    // Tab 2 starts typing in same container -> no duplicate typing:started
    await new Promise<{ ok: boolean }>((res) =>
      client1Tab2.emit('typing:start', { channelId }, res),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(client2Events).toHaveLength(1);

    // Tab 1 stops typing -> user is still typing in Tab 2 -> no typing:stopped emitted yet
    await new Promise<{ ok: boolean }>((res) =>
      client1Tab1.emit('typing:stop', { channelId }, res),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(client2Events).toHaveLength(1);

    // Tab 2 stops typing -> user is now completely stopped -> typing:stopped emitted
    await new Promise<{ ok: boolean }>((res) =>
      client1Tab2.emit('typing:stop', { channelId }, res),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(client2Events).toHaveLength(2);
    expect(client2Events[1]).toEqual({
      type: 'typing:stopped',
      userId: user1Id,
      channelId,
    });

    client1Tab1.disconnect();
    client1Tab2.disconnect();
    client2.disconnect();
  });
});

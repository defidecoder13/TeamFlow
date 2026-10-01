/**
 * Presence backend integration tests (Phase 4I.1).
 *
 * Covers:
 * - Authenticated socket connection triggers ONLINE presence
 * - Multiple sockets/tabs keep presence ONLINE until last disconnects
 * - Disconnect transitions to OFFLINE and records lastSeenAt
 * - Scoped workspace broadcast of presence:changed events
 * - REST GET /api/workspaces/:workspaceId/presence authentication & workspace membership checks
 * - Cross-workspace presence isolation
 * - Unauthenticated sockets/REST requests rejection
 */

import http from 'node:http';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClerkFakes } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { closeRealtime, initRealtime, presenceRegistry } from './index';

const { mockGetPrisma } = vi.hoisted(() => ({
  mockGetPrisma: vi.fn(),
}));

vi.mock('../auth/prisma', () => ({
  getPrisma: (...args: unknown[]) => mockGetPrisma(...args),
}));

const fakes = createClerkFakes('presence');

const PRESENCE_USERS: Record<string, { id: string; name: string; email: string; image: null; emailVerified: boolean }> = {
  [fakes.clerkIdFor('user1')]: { id: 'u-pres-1', name: 'User One', email: fakes.emailFor('user1'), image: null, emailVerified: false },
  [fakes.clerkIdFor('user2')]: { id: 'u-pres-2', name: 'User Two', email: fakes.emailFor('user2'), image: null, emailVerified: false },
  [fakes.clerkIdFor('outsider')]: { id: 'u-pres-out', name: 'Outsider', email: fakes.emailFor('outsider'), image: null, emailVerified: false },
};

describe('Presence Backend Integration (Phase 4I.1)', () => {
  let server: http.Server;
  let serverPort: number;
  let app: ReturnType<typeof createApp>;
  let prismaMock: {
    user: { findUnique: ReturnType<typeof vi.fn> };
    workspaceMembership: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  };

  let user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let user2Id: string;
  let outsiderToken: string;

  function createClient(token?: string): ClientSocket {
    return ioc(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      autoConnect: false,
      auth: token ? { token } : undefined,
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
    app = createApp(fakes.appDeps());
    server = http.createServer(app);
    initRealtime(server, fakes.appDeps());

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });

    // Provisioned identities resolve through the mocked user model below.
    user1Token = fakes.tokenFor('user1');
    user1Id = 'u-pres-1';
    user2Token = fakes.tokenFor('user2');
    user2Id = 'u-pres-2';
    outsiderToken = fakes.tokenFor('outsider');
  });

  afterAll(async () => {
    await closeRealtime();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    presenceRegistry.clear();
    prismaMock = {
      user: {
        findUnique: vi.fn(async ({ where }: { where: { clerkId: string } }) =>
          PRESENCE_USERS[where.clerkId] ? { ...PRESENCE_USERS[where.clerkId] } : null,
        ),
      },
      workspaceMembership: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
    };
    mockGetPrisma.mockReturnValue(prismaMock);
  });

  it('rejects unauthenticated socket connections', async () => {
    const unauthClient = createClient();
    await expect(connectClient(unauthClient)).rejects.toThrow('UNAUTHENTICATED');
  });

  it('manages multi-socket presence lifecycle and broadcasts scoped workspace presence changes', async () => {
    // Setup workspace memberships:
    // User1 and User2 share ws-1
    // Outsider is in ws-2 only
    prismaMock.workspaceMembership.findMany.mockImplementation(
      (args: { where: { userId?: string; workspaceId?: unknown } }) => {
        if (args.where.userId === user1Id) {
          return Promise.resolve([{ workspaceId: 'ws-1' }]);
        }
        if (
          args.where.workspaceId &&
          typeof args.where.workspaceId === 'object' &&
          'in' in args.where.workspaceId
        ) {
          // Peer lookup for ws-1
          return Promise.resolve([{ userId: user1Id }, { userId: user2Id }]);
        }
        return Promise.resolve([]);
      },
    );

    // User2 is listening for presence events
    const clientUser2 = createClient(user2Token);
    await connectClient(clientUser2);

    const clientOutsider = createClient(outsiderToken);
    await connectClient(clientOutsider);

    const user2Events: unknown[] = [];
    const outsiderEvents: unknown[] = [];

    clientUser2.on('presence:changed', (ev) => user2Events.push(ev));
    clientOutsider.on('presence:changed', (ev) => outsiderEvents.push(ev));

    // 1. User 1 connects tab 1 -> ONLINE
    const clientUser1Tab1 = createClient(user1Token);
    await connectClient(clientUser1Tab1);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(presenceRegistry.isUserOnline(user1Id)).toBe(true);
    expect(presenceRegistry.getSocketCount(user1Id)).toBe(1);

    // User 2 received ONLINE presence event; Outsider received nothing (scoped to workspace peers)
    expect(user2Events).toHaveLength(1);
    expect(user2Events[0]).toMatchObject({
      type: 'presence:changed',
      userId: user1Id,
      status: 'ONLINE',
      lastSeenAt: null,
    });
    expect(outsiderEvents).toHaveLength(0);

    // 2. User 1 connects tab 2 -> remains ONLINE (no new transition event)
    const clientUser1Tab2 = createClient(user1Token);
    await connectClient(clientUser1Tab2);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(presenceRegistry.isUserOnline(user1Id)).toBe(true);
    expect(presenceRegistry.getSocketCount(user1Id)).toBe(2);
    expect(user2Events).toHaveLength(1); // Still 1

    // 3. User 1 disconnects tab 1 -> remains ONLINE (no offline transition event)
    clientUser1Tab1.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(presenceRegistry.isUserOnline(user1Id)).toBe(true);
    expect(presenceRegistry.getSocketCount(user1Id)).toBe(1);
    expect(user2Events).toHaveLength(1);

    // 4. User 1 disconnects tab 2 (last tab) -> OFFLINE
    clientUser1Tab2.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(presenceRegistry.isUserOnline(user1Id)).toBe(false);
    expect(presenceRegistry.getSocketCount(user1Id)).toBe(0);

    expect(user2Events).toHaveLength(2);
    expect(user2Events[1]).toMatchObject({
      type: 'presence:changed',
      userId: user1Id,
      status: 'OFFLINE',
    });
    expect((user2Events[1] as { lastSeenAt: string }).lastSeenAt).toBeDefined();

    clientUser2.disconnect();
    clientOutsider.disconnect();
  });

  it('deduplicates presence:changed emission when peer shares multiple workspaces with connecting user', async () => {
    // Setup workspace memberships:
    // User1 and User2 share BOTH ws-1 AND ws-2
    prismaMock.workspaceMembership.findMany.mockImplementation(
      (args: { where: { userId?: string; workspaceId?: unknown } }) => {
        if (args.where.userId === user1Id) {
          return Promise.resolve([{ workspaceId: 'ws-1' }, { workspaceId: 'ws-2' }]);
        }
        if (
          args.where.workspaceId &&
          typeof args.where.workspaceId === 'object' &&
          'in' in args.where.workspaceId
        ) {
          // Peer lookup for ws-1 & ws-2 returns user1 and user2 for both
          return Promise.resolve([
            { userId: user1Id },
            { userId: user2Id },
            { userId: user1Id },
            { userId: user2Id },
          ]);
        }
        return Promise.resolve([]);
      },
    );

    const clientUser2 = createClient(user2Token);
    await connectClient(clientUser2);

    const user2Events: unknown[] = [];
    clientUser2.on('presence:changed', (ev) => user2Events.push(ev));

    const clientUser1 = createClient(user1Token);
    await connectClient(clientUser1);

    await new Promise((resolve) => setTimeout(resolve, 50));

    // User2 should receive exactly 1 presence:changed event despite sharing 2 workspaces
    expect(user2Events).toHaveLength(1);
    expect(user2Events[0]).toMatchObject({
      type: 'presence:changed',
      userId: user1Id,
      status: 'ONLINE',
    });

    clientUser1.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // User2 should receive exactly 1 offline presence:changed event
    expect(user2Events).toHaveLength(2);
    expect(user2Events[1]).toMatchObject({
      type: 'presence:changed',
      userId: user1Id,
      status: 'OFFLINE',
    });

    clientUser2.disconnect();
  });

  describe('REST GET /api/workspaces/:workspaceId/presence', () => {
    it('requires authentication (401 when unauthenticated)', async () => {
      const res = await request(app).get('/api/workspaces/ws-1/presence');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('requires workspace membership (404 when not a member)', async () => {
      prismaMock.workspaceMembership.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/workspaces/ws-1/presence')
        .set(fakes.headersFor('user1'));

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns presence for all members of the requested workspace only', async () => {
      prismaMock.workspaceMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      prismaMock.workspaceMembership.findMany.mockResolvedValue([
        { userId: user1Id },
        { userId: user2Id },
      ]);

      // Make user 1 online
      presenceRegistry.addSocket(user1Id, 'sock-u1');

      const res = await request(app)
        .get('/api/workspaces/ws-1/presence')
        .set(fakes.headersFor('user1'));

      expect(res.status).toBe(200);
      expect(res.body.presence).toEqual([
        {
          userId: user1Id,
          status: 'ONLINE',
          lastSeenAt: null,
        },
        {
          userId: user2Id,
          status: 'OFFLINE',
          lastSeenAt: null,
        },
      ]);
    });
  });
});

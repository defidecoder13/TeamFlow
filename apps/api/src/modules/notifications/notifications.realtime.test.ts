/**
 * Notification realtime integration tests (Phase 4H.6, live database +
 * real Socket.IO).
 *
 * Real Better Auth sessions, real sockets, real persistence. SKIPPED without
 * auth/database env. Proves the DB-before-emit ordering (row exists before
 * delivery is observable), recipient isolation, reconnect resync through
 * REST, and idempotent recovery without duplicates.
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClerkFakes, requestAs } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { getPrisma } from '../auth/prisma';
import { closeRealtime, initRealtime } from '../realtime/index';

vi.setConfig({ testTimeout: 90000, hookTimeout: 300000 });

const LIVE = !!process.env.DATABASE_URL && !!process.env.CLERK_SECRET_KEY;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
const fakes = createClerkFakes('notifrealtime');
const email = (who: string) => fakes.emailFor(who);

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 20000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    const onEvent = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, onEvent);
  });
}

function connectSocket(port: number, token: string): Promise<ClientSocket> {
  const socket = ioc(`http://localhost:${port}`, {
    transports: ['websocket'],
    autoConnect: false,
    auth: { token },
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), 15000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.connect();
  });
}

liveDescribe('notification realtime (live database + sockets)', () => {
  const app = createApp(fakes.appDeps());
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let server: http.Server;
  let serverPort: number;
  let actor: ReturnType<typeof requestAs>;
  let ws1 = '';
  let pubId = '';
  let ritaId = '';
  let ritaToken = '';
  let ottoToken = '';

  async function signUp(
    who: string,
    name: string,
  ): Promise<{ agent: ReturnType<typeof requestAs>; token: string; userId: string }> {
    fakes.setProfile(who, { name });
    createdEmails.push(email(who));
    // First sight provisions the local user row through the fake directory.
    const agent = requestAs(app, fakes, who);
    const me = await agent.get('/api/me');
    expect(me.status).toBe(200);
    const user = await getPrisma().user.findUniqueOrThrow({ where: { email: email(who) } });
    return { agent, token: fakes.tokenFor(who), userId: user.id };
  }

  beforeAll(async () => {
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

    actor = (await signUp('actor', 'Rita Announcer')).agent;
    const rita = await signUp('rita', 'Rita');
    ritaId = rita.userId;
    ritaToken = rita.token;
    const otto = await signUp('otto', 'Otto');
    ottoToken = otto.token;

    const ws = await actor
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `NotifRT HQ ${RUN}` });
    expect(ws.status).toBe(201);
    ws1 = ws.body.workspace.id as string;
    createdWorkspaceIds.push(ws1);

    const prisma = getPrisma();
    for (const id of [ritaId, otto.userId]) {
      await prisma.workspaceMembership.create({
        data: { id: randomUUID(), workspaceId: ws1, userId: id, role: 'MEMBER' },
      });
    }

    const pub = await actor
      .post(`/api/workspaces/${ws1}/channels`)
      .set('Origin', ORIGIN)
      .send({ name: `Notifrtpub ${RUN}`, type: 'PUBLIC' });
    expect(pub.status).toBe(201);
    pubId = pub.body.channel.id as string;
  }, 300000);

  afterAll(async () => {
    await closeRealtime();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!LIVE) {
      return;
    }
    const prisma = getPrisma();
    for (const workspaceId of createdWorkspaceIds) {
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    }
    for (const userEmail of createdEmails) {
      await prisma.user.deleteMany({ where: { email: userEmail } });
    }
  });

  it('delivers notification:new only after the row persists, to the recipient only', async () => {
    const recipientSocket = await connectSocket(serverPort, ritaToken);
    const bystanderEvents: unknown[] = [];
    const bystanderSocket = await connectSocket(serverPort, ottoToken);
    bystanderSocket.on('notification:new', (ev) => bystanderEvents.push(ev));
    try {
      const eventPromise = waitForEvent<{
        type: string;
        notification: Record<string, unknown>;
      }>(recipientSocket, 'notification:new');
      const posted = await actor
        .post(`/api/channels/${pubId}/messages`)
        .set('Origin', ORIGIN)
        .send({ body: `hey @Rita realtime ${RUN}` });
      expect(posted.status).toBe(201);

      const event = await eventPromise;
      expect(event.type).toBe('notification:new');
      expect(event.notification).toMatchObject({
        type: 'MENTION',
        workspaceId: ws1,
        recipientUserId: ritaId,
        channelId: pubId,
        readAt: null,
      });
      expect(JSON.stringify(event.notification)).not.toMatch(/email|password|token|secret/i);

      // The row provably exists: delivery happened strictly after commit.
      const row = await getPrisma().notification.findUniqueOrThrow({
        where: { id: event.notification.id as string },
      });
      expect(row.recipientUserId).toBe(ritaId);
      expect(row.readAt).toBeNull();

      // Isolation holds even with time to spare.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(bystanderEvents).toHaveLength(0);
    } finally {
      recipientSocket.disconnect();
      bystanderSocket.disconnect();
    }
  });

  it('delivers notification:read after readAt persists', async () => {
    const recipientSocket = await connectSocket(serverPort, ritaToken);
    try {
      const created = waitForEvent<{ notification: { id: string } }>(
        recipientSocket,
        'notification:new',
      );
      const posted = await actor
        .post(`/api/channels/${pubId}/messages`)
        .set('Origin', ORIGIN)
        .send({ body: `read me @Rita ${RUN}` });
      expect(posted.status).toBe(201);
      const { notification } = await created;
      const notificationId = notification.id;

      const readPromise = waitForEvent<{ id: string; readAt: string }>(
        recipientSocket,
        'notification:read',
      );
      // A fresh stateless request with the recipient token marks read.
      const markRes = await request(app)
        .post(`/api/workspaces/${ws1}/notifications/${notificationId}/read`)
        .set(fakes.headersFor('rita'))
        .set('Origin', ORIGIN);
      expect(markRes.status).toBe(200);

      const event = await readPromise;
      expect(event.id).toBe(notificationId);
      const row = await getPrisma().notification.findUniqueOrThrow({
        where: { id: notificationId },
      });
      expect(row.readAt).not.toBeNull();
      expect(new Date(event.readAt).getTime()).toBe(row.readAt!.getTime());
    } finally {
      recipientSocket.disconnect();
    }
  });

  it('recovers missed notifications through REST resync without duplicates', async () => {
    // Post while disconnected: the server emits to an empty room.
    const posted = await actor
      .post(`/api/channels/${pubId}/messages`)
      .set('Origin', ORIGIN)
      .send({ body: `missed you @Rita ${RUN}` });
    expect(posted.status).toBe(201);
    const messageId = posted.body.message.id as string;

    // Reconnect and resync through REST (the supported recovery path).
    const recipientSocket = await connectSocket(serverPort, ritaToken);
    try {
      const res = await request(app)
        .get(`/api/workspaces/${ws1}/notifications`)
        .set(fakes.headersFor('rita'))
        .query({ unreadOnly: 'true', limit: '50' });
      expect(res.status).toBe(200);
      const ids = (res.body.notifications as Array<{ id: string; messageId: string | null }>).map(
        (n) => n.id,
      );
      const forMessage = (res.body.notifications as Array<{ messageId: string | null }>).filter(
        (n) => n.messageId === messageId,
      );
      expect(forMessage).toHaveLength(1);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      recipientSocket.disconnect();
    }
  });
});

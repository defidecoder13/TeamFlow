import http from 'node:http';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createClerkFakes } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { getPrisma } from '../auth/prisma';
import { closeRealtime, initRealtime } from '../realtime/index';

// Live lifecycle sync tests: channel/DM creation must propagate to
// authorized sessions via channel:created / conversation:created, and
// private data must never reach unauthorized sockets.
// SKIPPED without auth/database env so `pnpm test` stays green everywhere.
vi.setConfig({ testTimeout: 60000, hookTimeout: 180000 });

const LIVE = !!process.env.DATABASE_URL && !!process.env.CLERK_SECRET_KEY;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
const fakes = createClerkFakes('channel-created');
const email = (who: string) => fakes.emailFor(who);

interface ReceivedEvent {
  type: string;
  payload: unknown;
}

liveDescribe('creation lifecycle realtime sync (live database + sockets)', () => {
  const app = createApp(fakes.appDeps());
  let server: http.Server;
  let baseUrl = '';
  const sockets: ClientSocket[] = [];
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  async function signUp(who: string, name: string): Promise<string> {
    fakes.setProfile(who, { name });
    createdEmails.push(email(who));
    // First sight provisions the local user row through the fake directory.
    const me = await request(app).get('/api/me').set(fakes.headersFor(who));
    expect(me.status).toBe(200);
    return fakes.tokenFor(who);
  }

  async function connectSocket(token: string): Promise<{
    socket: ClientSocket;
    received: ReceivedEvent[];
  }> {
    const received: ReceivedEvent[] = [];
    const socket = ioc(baseUrl, {
      auth: { token },
      transports: ['websocket'],
    });
    sockets.push(socket);
    for (const type of [
      'channel:created',
      'channel:updated',
      'channel:deleted',
      'conversation:created',
      'workspace:deleted',
    ] as const) {
      socket.on(type, (payload: unknown) => {
        received.push({ type, payload });
      });
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connect timeout')), 20000);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('connect_error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    return { socket, received };
  }

  async function waitFor<T>(check: () => T | null, message: string, timeoutMs = 15000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const value = check();
      if (value !== null) return value;
      if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  let ws1 = '';
  let ownerToken = '';
  let mateToken = '';
  let thirdToken = '';
  let outsiderToken = '';

  beforeAll(async () => {
    server = http.createServer(app);
    initRealtime(server, fakes.appDeps());
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });

    ownerToken = await signUp('owner', 'CC Owner');
    mateToken = await signUp('mate', 'CC Mate');
    thirdToken = await signUp('third', 'CC Third');
    outsiderToken = await signUp('outsider', 'CC Outsider');

    const res = await request(app)
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .set(fakes.headersFor('owner'))
      .send({ name: `Lifecycle HQ ${RUN}` });
    expect(res.status).toBe(201);
    ws1 = res.body.workspace.id as string;
    createdWorkspaceIds.push(ws1);

    const prisma = getPrisma();
    const targetEmails = [email('mate'), email('third')];
    for (const target of targetEmails) {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: target } });
      await prisma.workspaceMembership.create({
        data: { id: randomUUID(), workspaceId: ws1, userId: user.id, role: 'MEMBER' },
      });
    }
  }, 180000);

  afterAll(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    await closeRealtime().catch(() => undefined);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    if (!LIVE) return;
    const prisma = getPrisma();
    for (const workspaceId of createdWorkspaceIds) {
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    }
    for (const userEmail of createdEmails) {
      await prisma.user.deleteMany({ where: { email: userEmail } });
    }
  });

  function postAs(token: string, url: string, body: Record<string, unknown>) {
    return request(app)
      .post(url)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function patchAs(token: string, url: string, body: Record<string, unknown>) {
    return request(app)
      .patch(url)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function deleteAs(token: string, url: string) {
    return request(app)
      .delete(url)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`)
      .send({});
  }

  it('fans public channel creation out to workspace members only', async () => {
    const ownerEvents: ReceivedEvent[] = [];
    const mateEvents: ReceivedEvent[] = [];
    const outsiderEvents: ReceivedEvent[] = [];
    const ownerSocket = ioc(baseUrl, {
      auth: { token: ownerToken },
      transports: ['websocket'],
    });
    const mateSocket = ioc(baseUrl, {
      auth: { token: mateToken },
      transports: ['websocket'],
    });
    const outsiderSocket = ioc(baseUrl, {
      auth: { token: outsiderToken },
      transports: ['websocket'],
    });
    sockets.push(ownerSocket, mateSocket, outsiderSocket);
    for (const [socket, bucket] of [
      [ownerSocket, ownerEvents],
      [mateSocket, mateEvents],
      [outsiderSocket, outsiderEvents],
    ] as const) {
      socket.on('channel:created', (payload: unknown) => {
        bucket.push({ type: 'channel:created', payload });
      });
    }
    await Promise.all(
      [ownerSocket, mateSocket, outsiderSocket].map(
        (socket) =>
          new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('connect timeout')), 20000);
            socket.once('connect', () => {
              clearTimeout(timer);
              resolve();
            });
            socket.once('connect_error', reject);
          }),
      ),
    );

    const res = await postAs(ownerToken, `/api/workspaces/${ws1}/channels`, {
      name: `Announce ${RUN}`,
      type: 'PUBLIC',
    });
    expect(res.status).toBe(201);

    const ownerGot = await waitFor(
      () =>
        ownerEvents.find(
          (e) =>
            (e.payload as { channel: { slug: string } }).channel.slug ===
            `announce-${RUN.toLowerCase()}`,
        ) ?? null,
      'owner receives channel:created',
    );
    const mateGot = await waitFor(
      () =>
        mateEvents.find(
          (e) =>
            (e.payload as { channel: { slug: string } }).channel.slug ===
            `announce-${RUN.toLowerCase()}`,
        ) ?? null,
      'member receives channel:created',
    );
    expect((ownerGot.payload as { workspaceId: string }).workspaceId).toBe(ws1);
    expect((mateGot.payload as { workspaceId: string }).workspaceId).toBe(ws1);
    // List-contract shape: no creator identity leaks.
    expect(mateGot.payload as object).not.toHaveProperty('createdById');
    expect(
      (mateGot.payload as { channel: Record<string, unknown> }).channel ?? {},
    ).not.toHaveProperty('createdById');

    // Outsider (non-member) receives nothing.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(outsiderEvents).toHaveLength(0);
  });

  it('restricts private channel creation to channel members', async () => {
    const { socket: ownerSocket, received: ownerEvents } = await connectSocket(ownerToken);
    const { received: mateEvents } = await connectSocket(mateToken);
    void ownerSocket;

    const res = await postAs(ownerToken, `/api/workspaces/${ws1}/channels`, {
      name: `Vault ${RUN}`,
      type: 'PRIVATE',
    });
    expect(res.status).toBe(201);

    await waitFor(
      () =>
        ownerEvents.find(
          (e) =>
            (e.payload as { channel: { slug: string } }).channel.slug ===
            `vault-${RUN.toLowerCase()}`,
        ) ?? null,
      'creator receives private channel:created',
    );
    // Workspace member without channel membership receives nothing.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(mateEvents).toHaveLength(0);
  });

  it('notifies both participants on 1:1 creation with mirrored peers, and stays silent on re-open', async () => {
    const { received: ownerEvents } = await connectSocket(ownerToken);
    const { received: mateEvents } = await connectSocket(mateToken);

    const mate = await getPrisma().user.findUniqueOrThrow({ where: { email: email('mate') } });
    const created = await postAs(ownerToken, `/api/workspaces/${ws1}/direct-messages`, {
      recipientId: mate.id,
    });
    expect(created.status).toBe(200);

    const ownerGot = await waitFor(
      () =>
        ownerEvents.find(
          (e) =>
            (e.payload as { conversation: { id: string } }).conversation.id ===
            (created.body.conversation.id as string),
        ) ?? null,
      'creator receives conversation:created',
    );
    const mateGot = await waitFor(
      () =>
        mateEvents.find(
          (e) =>
            (e.payload as { conversation: { id: string } }).conversation.id ===
            (created.body.conversation.id as string),
        ) ?? null,
      'recipient receives conversation:created',
    );
    const ownerConv = (ownerGot.payload as { conversation: { peer: { id: string } } }).conversation;
    const mateConv = (mateGot.payload as { conversation: { peer: { id: string } } }).conversation;
    const owner = await getPrisma().user.findUniqueOrThrow({ where: { email: email('owner') } });
    expect(ownerConv.peer.id).toBe(mate.id);
    expect(mateConv.peer.id).toBe(owner.id);

    const ownerCount = ownerEvents.length;
    const mateCount = mateEvents.length;
    const reopened = await postAs(ownerToken, `/api/workspaces/${ws1}/direct-messages`, {
      recipientId: mate.id,
    });
    expect(reopened.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(ownerEvents).toHaveLength(ownerCount);
    expect(mateEvents).toHaveLength(mateCount);
  });

  it('notifies every group participant with role-correct payloads', async () => {
    const { received: ownerEvents } = await connectSocket(ownerToken);
    const { received: mateEvents } = await connectSocket(mateToken);
    const { received: thirdEvents } = await connectSocket(thirdToken);

    const prisma = getPrisma();
    const mate = await prisma.user.findUniqueOrThrow({ where: { email: email('mate') } });
    const third = await prisma.user.findUniqueOrThrow({ where: { email: email('third') } });
    const created = await postAs(ownerToken, `/api/workspaces/${ws1}/direct-messages/group`, {
      participantIds: [mate.id, third.id],
      name: `Crew ${RUN}`,
    });
    expect(created.status).toBe(201);
    const conversationId = created.body.conversation.id as string;

    for (const [bucket, who] of [
      [ownerEvents, 'owner'],
      [mateEvents, 'mate'],
      [thirdEvents, 'third'],
    ] as const) {
      const got = await waitFor(
        () =>
          bucket.find(
            (e) =>
              (e.payload as { conversation: { id: string } }).conversation.id === conversationId,
          ) ?? null,
        `${who} receives group conversation:created`,
      );
      const conversation = (got.payload as { conversation: { peer: unknown; type: string } })
        .conversation;
      expect(conversation.type).toBe('GROUP');
      expect(conversation.peer).toBeNull();
    }
    const thirdConv = (
      thirdEvents.find(
        (e) => (e.payload as { conversation: { id: string } }).conversation.id === conversationId,
      )?.payload as { conversation: { currentUserRole: string } }
    ).conversation;
    expect(thirdConv.currentUserRole).toBe('MEMBER');
  });

  describe('workspace deletion realtime push', () => {
    async function makeWorkspaceWithMate(name: string): Promise<string> {
      const res = await postAs(ownerToken, '/api/workspaces', { name });
      expect(res.status).toBe(201);
      const workspaceId = res.body.workspace.id as string;
      createdWorkspaceIds.push(workspaceId);
      const mate = await getPrisma().user.findUniqueOrThrow({ where: { email: email('mate') } });
      await getPrisma().workspaceMembership.create({
        data: { id: randomUUID(), workspaceId, userId: mate.id, role: 'MEMBER' },
      });
      return workspaceId;
    }

    it('notifies pre-deletion members with a minimal payload, and nobody else', async () => {
      const doomedId = await makeWorkspaceWithMate(`Doomed ${RUN}`);
      const { received: ownerEvents } = await connectSocket(ownerToken);
      const { received: mateEvents } = await connectSocket(mateToken);
      const { received: outsiderEvents } = await connectSocket(outsiderToken);

      const res = await deleteAs(ownerToken, `/api/workspaces/${doomedId}`);
      expect(res.status).toBe(204);

      for (const [bucket, who] of [
        [ownerEvents, 'owner'],
        [mateEvents, 'mate'],
      ] as const) {
        const got = await waitFor(
          () =>
            bucket.find((e) => (e.payload as { workspaceId: string }).workspaceId === doomedId) ??
            null,
          `${who} receives workspace:deleted`,
        );
        expect(Object.keys(got.payload as object).sort()).toEqual(['type', 'workspaceId']);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(outsiderEvents).toHaveLength(0);
    });

    it('emits nothing when deletion is rejected', async () => {
      const doomedId = await makeWorkspaceWithMate(`Doomed Again ${RUN}`);
      const { received: ownerEvents } = await connectSocket(ownerToken);
      const { received: mateEvents } = await connectSocket(mateToken);

      // Non-owner member cannot delete.
      const forbidden = await deleteAs(mateToken, `/api/workspaces/${doomedId}`);
      expect(forbidden.status).toBe(403);

      // Deleting twice: second attempt 404s on the missing workspace.
      const first = await deleteAs(ownerToken, `/api/workspaces/${doomedId}`);
      expect(first.status).toBe(204);
      const second = await deleteAs(ownerToken, `/api/workspaces/${doomedId}`);
      expect(second.status).toBe(404);

      // Exactly one push per member (from the single successful deletion).
      await waitFor(
        () =>
          ownerEvents.filter((e) => (e.payload as { workspaceId: string }).workspaceId === doomedId)
            .length === 1
            ? true
            : null,
        'single push for the successful deletion',
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const countFor = (bucket: typeof ownerEvents) =>
        bucket.filter((e) => (e.payload as { workspaceId: string }).workspaceId === doomedId)
          .length;
      expect(countFor(ownerEvents)).toBe(1);
      expect(countFor(mateEvents)).toBe(1);
    });

    describe('channel update/delete realtime push', () => {
      async function makePublicChannel(name: string): Promise<{ id: string; slug: string }> {
        const res = await postAs(ownerToken, `/api/workspaces/${ws1}/channels`, {
          name,
          type: 'PUBLIC',
        });
        expect(res.status).toBe(201);
        return res.body.channel as { id: string; slug: string };
      }

      it('fans renames out to members and stays silent on rejection', async () => {
        const channel = await makePublicChannel(`Rename ${RUN}`);
        const { received: ownerEvents } = await connectSocket(ownerToken);
        const { received: mateEvents } = await connectSocket(mateToken);

        const renamed = await patchAs(
          ownerToken,
          `/api/workspaces/${ws1}/channels/${channel.slug}`,
          {
            name: `Renamed ${RUN}`,
          },
        );
        expect(renamed.status).toBe(200);

        for (const [bucket, who] of [
          [ownerEvents, 'owner'],
          [mateEvents, 'mate'],
        ] as const) {
          const got = await waitFor(
            () =>
              bucket.find(
                (e) =>
                  e.type === 'channel:updated' &&
                  (e.payload as { channel: { id: string } }).channel.id === channel.id,
              ) ?? null,
            `${who} receives channel:updated`,
          );
          const payload = got.payload as {
            workspaceId: string;
            channel: Record<string, unknown>;
          };
          expect(payload.workspaceId).toBe(ws1);
          expect(payload.channel).not.toHaveProperty('createdById');
        }

        // Rejected rename emits nothing (attempted on the current slug).
        const updatedBefore = mateEvents.filter((e) => e.type === 'channel:updated').length;
        const currentSlug = (renamed.body.channel as { slug: string }).slug;
        const rejected = await patchAs(
          mateToken,
          `/api/workspaces/${ws1}/channels/${currentSlug}`,
          {
            name: `Hijack ${RUN}`,
          },
        );
        expect(rejected.status).toBe(403);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        expect(mateEvents.filter((e) => e.type === 'channel:updated')).toHaveLength(updatedBefore);
      });

      it('drops deleted channels everywhere and hides private deletes from non-members', async () => {
        const priv = await postAs(ownerToken, `/api/workspaces/${ws1}/channels`, {
          name: `Gone ${RUN}`,
          type: 'PRIVATE',
        });
        expect(priv.status).toBe(201);
        const channelId = (priv.body.channel as { id: string }).id;
        const slug = (priv.body.channel as { slug: string }).slug;

        const { received: ownerEvents } = await connectSocket(ownerToken);
        const { received: mateEvents } = await connectSocket(mateToken);

        const deleted = await deleteAs(ownerToken, `/api/workspaces/${ws1}/channels/${slug}`);
        expect(deleted.status).toBe(204);

        const got = await waitFor(
          () =>
            ownerEvents.find(
              (e) =>
                e.type === 'channel:deleted' &&
                (e.payload as { channelId: string }).channelId === channelId,
            ) ?? null,
          'creator receives channel:deleted',
        );
        expect(Object.keys(got.payload as object).sort()).toEqual([
          'channelId',
          'type',
          'workspaceId',
        ]);
        // Workspace member without channel membership learns nothing.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        expect(mateEvents).toHaveLength(0);
      });
    });
  });
});

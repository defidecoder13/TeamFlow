import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { getPrisma } from '../auth/prisma';

// Live-database roundtrips (Neon pooler) take seconds per request — mostly
// Better Auth session validation. Unit tests stay fast; only this file is slow.
vi.setConfig({ testTimeout: 45000, hookTimeout: 180000 });

/**
 * Invitation API integration tests (Phase 2F-A, backend only).
 *
 * Real Better Auth sessions against the configured development database.
 * SKIPPED without auth/database env so `pnpm test` stays green everywhere.
 * Every fixture uses unique run-scoped emails; workspaces are deleted in
 * `afterAll` (memberships + invitations cascade) and then the users.
 */

const LIVE =
  !!process.env.DATABASE_URL && !!process.env.BETTER_AUTH_SECRET && !!process.env.BETTER_AUTH_URL;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = process.env.BETTER_AUTH_URL ?? 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const email = (who: string) => `ws2f-${RUN}-${who}@example.invalid`;
const PASSWORD = 'invitation-test-password-0123456789';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function randomUUID(): string {
  return randomBytes(16).toString('hex');
}

liveDescribe('invitation API (live database)', () => {
  const app = createApp();
  const api = () => request(app);
  const createdWorkspaceIds: string[] = [];
  const createdEmails: string[] = [];

  let ws1 = '';
  let ws2 = '';

  async function signUp(who: string, name: string): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name, email: email(who), password: PASSWORD });
    expect(res.status).toBeLessThan(300);
    createdEmails.push(email(who));
    return agent;
  }

  let owner: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;
  let member: ReturnType<typeof request.agent>;
  let outsider: ReturnType<typeof request.agent>;
  let invitee: ReturnType<typeof request.agent>;
  let wronguser: ReturnType<typeof request.agent>;
  let second: ReturnType<typeof request.agent>;

  async function userIdFor(who: string): Promise<string> {
    const user = await getPrisma().user.findUniqueOrThrow({ where: { email: email(who) } });
    return user.id;
  }

  async function inviteAs(
    agent: ReturnType<typeof request.agent>,
    workspaceId: string,
    targetEmail: string,
  ) {
    return agent
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Origin', ORIGIN)
      .send({ email: targetEmail });
  }

  beforeAll(async () => {
    owner = await signUp('owner', 'Inv Owner');
    admin = await signUp('admin', 'Inv Admin');
    member = await signUp('member', 'Inv Member');
    outsider = await signUp('outsider', 'Inv Outsider');
    invitee = await signUp('invitee', 'Inv Invitee');
    wronguser = await signUp('wronguser', 'Inv Wrong');
    second = await signUp('second', 'Inv Second');

    const res = await owner
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Invite HQ ${RUN}` });
    expect(res.status).toBe(201);
    ws1 = res.body.workspace.id as string;
    createdWorkspaceIds.push(ws1);

    const prisma = getPrisma();
    await prisma.workspaceMembership.create({
      data: { id: randomUUID(), workspaceId: ws1, userId: await userIdFor('admin'), role: 'ADMIN' },
    });
    await prisma.workspaceMembership.create({
      data: {
        id: randomUUID(),
        workspaceId: ws1,
        userId: await userIdFor('member'),
        role: 'MEMBER',
      },
    });

    const other = await second
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: `Second Place ${RUN}` });
    expect(other.status).toBe(201);
    ws2 = other.body.workspace.id as string;
    createdWorkspaceIds.push(ws2);
  }, 180000);

  afterAll(async () => {
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

  // ---------- Creation ----------

  it('lets OWNER create an invitation and returns the raw token once', async () => {
    const res = await inviteAs(owner, ws1, email('invitee'));
    expect(res.status).toBe(201);
    expect(Object.keys(res.body.invitation).sort()).toEqual([
      'createdAt',
      'email',
      'expiresAt',
      'id',
      'token',
    ]);
    expect(res.body.invitation.email).toBe(email('invitee'));
    expect(typeof res.body.invitation.token).toBe('string');
    expect((res.body.invitation.token as string).length).toBeGreaterThanOrEqual(32);
  });

  it('lets ADMIN create an invitation', async () => {
    const res = await inviteAs(admin, ws1, `admin-invite-${RUN}@example.invalid`);
    expect(res.status).toBe(201);
    expect(res.body.invitation.email).toBe(`admin-invite-${RUN}@example.invalid`);
  });

  it('forbids MEMBER creation, 404s non-members, 401s strangers', async () => {
    expect((await inviteAs(member, ws1, 'x@example.invalid')).status).toBe(403);
    expect((await inviteAs(outsider, ws1, 'x@example.invalid')).status).toBe(404);
    expect(
      (
        await api()
          .post(`/api/workspaces/${ws1}/invitations`)
          .set('Origin', ORIGIN)
          .send({ email: 'x@example.invalid' })
      ).status,
    ).toBe(401);
  });

  it('rejects invalid emails', async () => {
    for (const payload of [{}, { email: '' }, { email: '   ' }, { email: 'nope' }]) {
      const res = await owner
        .post(`/api/workspaces/${ws1}/invitations`)
        .set('Origin', ORIGIN)
        .send(payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('normalizes invitation emails', async () => {
    const res = await inviteAs(owner, ws1, `  Norm-${RUN}@Example.COM `);
    expect(res.status).toBe(201);
    expect(res.body.invitation.email).toBe(`norm-${RUN}@example.com`);

    const row = await getPrisma().invitation.findUniqueOrThrow({
      where: { id: res.body.invitation.id as string },
    });
    expect(row.email).toBe(`norm-${RUN}@example.com`);
  });

  it('rejects inviting an existing member', async () => {
    const res = await inviteAs(owner, ws1, email('member'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects duplicate pending invitations (case-insensitively)', async () => {
    const target = `dupe-${RUN}@example.invalid`;
    expect((await inviteAs(owner, ws1, target)).status).toBe(201);
    const secondAttempt = await inviteAs(owner, ws1, target.toUpperCase());
    expect(secondAttempt.status).toBe(409);
    expect(secondAttempt.body.error.code).toBe('CONFLICT');
  });

  it('generates cryptographic tokens and stores only the hash', async () => {
    const a = await inviteAs(owner, ws1, `tok-a-${RUN}@example.invalid`);
    const b = await inviteAs(owner, ws1, `tok-b-${RUN}@example.invalid`);
    const tokenA = a.body.invitation.token as string;
    const tokenB = b.body.invitation.token as string;
    expect(tokenA).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenA).not.toBe(tokenB);

    const row = await getPrisma().invitation.findUniqueOrThrow({
      where: { id: a.body.invitation.id as string },
    });
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).toBe(createHash('sha256').update(tokenA, 'utf8').digest('hex'));
    expect(row.tokenHash).not.toContain(tokenA);
    expect('token' in row).toBe(false);
  });

  it('sets expiration approximately 7 days out', async () => {
    const res = await inviteAs(owner, ws1, `exp-${RUN}@example.invalid`);
    expect(res.status).toBe(201);
    const createdAt = new Date(res.body.invitation.createdAt as string).getTime();
    const expiresAt = new Date(res.body.invitation.expiresAt as string).getTime();
    expect(Math.abs(expiresAt - createdAt - SEVEN_DAYS_MS)).toBeLessThan(5 * 60 * 1000);
  });

  // ---------- Listing ----------

  it('lets OWNER and ADMIN list pending invitations', async () => {
    const asOwner = await owner.get(`/api/workspaces/${ws1}/invitations`);
    expect(asOwner.status).toBe(200);
    expect(Array.isArray(asOwner.body.invitations)).toBe(true);
    expect((asOwner.body.invitations as { email: string }[]).map((i) => i.email)).toContain(
      email('invitee'),
    );

    const asAdmin = await admin.get(`/api/workspaces/${ws1}/invitations`);
    expect(asAdmin.status).toBe(200);
  });

  it('forbids MEMBER listing, 404s outsiders, 401s strangers', async () => {
    expect((await member.get(`/api/workspaces/${ws1}/invitations`)).status).toBe(403);
    expect((await outsider.get(`/api/workspaces/${ws1}/invitations`)).status).toBe(404);
    expect((await api().get(`/api/workspaces/${ws1}/invitations`)).status).toBe(401);
  });

  it('excludes expired, accepted, and revoked invitations', async () => {
    const prisma = getPrisma();
    const expired = await inviteAs(owner, ws1, `excl-expired-${RUN}@example.invalid`);
    const revoked = await inviteAs(owner, ws1, `excl-revoked-${RUN}@example.invalid`);
    const accepter = await signUp('accepter', 'Inv Accepter');
    const accepted = await inviteAs(owner, ws1, email('accepter'));
    expect(expired.status).toBe(201);
    expect(revoked.status).toBe(201);
    expect(accepted.status).toBe(201);

    await prisma.invitation.update({
      where: { id: expired.body.invitation.id as string },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await prisma.invitation.update({
      where: { id: revoked.body.invitation.id as string },
      data: { revokedAt: new Date() },
    });
    const acceptRes = await accepter
      .post('/api/invitations/accept')
      .set('Origin', ORIGIN)
      .send({ token: accepted.body.invitation.token as string });
    expect(acceptRes.status).toBe(200);

    const res = await owner.get(`/api/workspaces/${ws1}/invitations`);
    const emails = (res.body.invitations as { email: string }[]).map((i) => i.email);
    expect(emails).not.toContain(`excl-expired-${RUN}@example.invalid`);
    expect(emails).not.toContain(`excl-revoked-${RUN}@example.invalid`);
    expect(emails).not.toContain(email('accepter'));
  });

  it('never exposes token material in listings', async () => {
    const res = await owner.get(`/api/workspaces/${ws1}/invitations`);
    expect(res.status).toBe(200);
    for (const invitation of res.body.invitations as Record<string, unknown>[]) {
      expect(Object.keys(invitation).sort()).toEqual([
        'createdAt',
        'email',
        'expiresAt',
        'id',
        'invitedBy',
      ]);
      expect(Object.keys(invitation.invitedBy as Record<string, unknown>).sort()).toEqual([
        'email',
        'id',
        'name',
      ]);
    }
    const serialized = JSON.stringify(res.body).toLowerCase();
    for (const leaked of ['token', 'secret', 'password', 'hash']) {
      expect(serialized).not.toContain(leaked);
    }
  });

  // ---------- Acceptance ----------

  it('lets the invited user accept and become MEMBER', async () => {
    await getPrisma().invitation.deleteMany({
      where: { workspaceId: ws1, email: email('invitee') },
    });
    const created = await inviteAs(owner, ws1, email('invitee'));
    expect(created.status).toBe(201);

    const res = await invitee
      .post('/api/invitations/accept')
      .set('Origin', ORIGIN)
      .send({ token: created.body.invitation.token as string });
    expect(res.status).toBe(200);
    expect(res.body.membership.role).toBe('MEMBER');
    expect(res.body.workspace.id).toBe(ws1);
    expect(res.body.alreadyMember).toBe(false);

    const row = await getPrisma().invitation.findUniqueOrThrow({
      where: { id: created.body.invitation.id as string },
    });
    expect(row.acceptedAt).not.toBeNull();
  });

  it('rejects unknown tokens without leaking existence', async () => {
    const reused = await invitee
      .post('/api/invitations/accept')
      .set('Origin', ORIGIN)
      .send({ token: 'definitely-not-a-real-token' });
    expect(reused.status).toBe(404);
    expect(reused.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'This invitation is invalid or has expired.' },
    });
  });

  it('rejects expired invitations', async () => {
    const created = await inviteAs(owner, ws1, `stale-${RUN}@example.invalid`);
    expect(created.status).toBe(201);
    await getPrisma().invitation.update({
      where: { id: created.body.invitation.id as string },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await invitee
      .post('/api/invitations/accept')
      .set('Origin', ORIGIN)
      .send({ token: created.body.invitation.token as string });
    expect(res.status).toBe(404);
  });

  it('rejects acceptance by the wrong authenticated email', async () => {
    const created = await inviteAs(owner, ws1, `wrong-target-${RUN}@example.invalid`);
    expect(created.status).toBe(201);
    const res = await wronguser
      .post('/api/invitations/accept')
      .set('Origin', ORIGIN)
      .send({ token: created.body.invitation.token as string });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'This invitation was sent to a different email address.',
      },
    });
  });

  it('handles already-members idempotently without duplicating', async () => {
    const prisma = getPrisma();
    const rawToken = randomBytes(32).toString('base64url');
    await prisma.invitation.create({
      data: {
        id: randomUUID(),
        workspaceId: ws1,
        email: email('member'),
        tokenHash: createHash('sha256').update(rawToken, 'utf8').digest('hex'),
        invitedById: await userIdFor('owner'),
        expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
      },
    });
    const res = await member
      .post('/api/invitations/accept')
      .set('Origin', ORIGIN)
      .send({ token: rawToken });
    expect(res.status).toBe(200);
    expect(res.body.alreadyMember).toBe(true);
    expect(
      await prisma.workspaceMembership.count({
        where: { workspaceId: ws1, userId: await userIdFor('member') },
      }),
    ).toBe(1);
  });

  it('rejects unauthenticated acceptance', async () => {
    expect(
      (await api().post('/api/invitations/accept').set('Origin', ORIGIN).send({ token: 'x' }))
        .status,
    ).toBe(401);
  });

  it('serializes concurrent acceptance into exactly one membership', async () => {
    const created = await inviteAs(owner, ws1, `race-${RUN}@example.invalid`);
    expect(created.status).toBe(201);

    const racer = request.agent(app);
    const signed = await racer
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'Race Racer', email: `race-${RUN}@example.invalid`, password: PASSWORD });
    expect(signed.status).toBeLessThan(300);
    createdEmails.push(`race-${RUN}@example.invalid`);

    const token = created.body.invitation.token as string;
    const [first, second] = await Promise.all([
      racer.post('/api/invitations/accept').set('Origin', ORIGIN).send({ token }),
      racer.post('/api/invitations/accept').set('Origin', ORIGIN).send({ token }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 404]);

    const racerId = await getPrisma().user.findUniqueOrThrow({
      where: { email: `race-${RUN}@example.invalid` },
    });
    expect(
      await getPrisma().workspaceMembership.count({
        where: { workspaceId: ws1, userId: racerId.id },
      }),
    ).toBe(1);
  });

  // ---------- Security ----------

  it('ignores body attempts to override inviter, workspace, and role', async () => {
    for (const payload of [
      { email: `sec-a-${RUN}@example.invalid`, invitedById: 'someone-else' },
      { email: `sec-b-${RUN}@example.invalid`, workspaceId: ws2 },
      { email: `sec-c-${RUN}@example.invalid`, role: 'ADMIN' },
      { email: `sec-d-${RUN}@example.invalid`, token: 'chosen' },
      { email: `sec-e-${RUN}@example.invalid`, expiresAt: new Date().toISOString() },
    ]) {
      expect(
        (await owner.post(`/api/workspaces/${ws1}/invitations`).set('Origin', ORIGIN).send(payload))
          .status,
      ).toBe(400);
    }
    const legit = await inviteAs(owner, ws1, `sec-ok-${RUN}@example.invalid`);
    expect(legit.status).toBe(201);
    const row = await getPrisma().invitation.findUniqueOrThrow({
      where: { id: legit.body.invitation.id as string },
    });
    expect(row.invitedById).toBe(await userIdFor('owner'));
    expect(row.workspaceId).toBe(ws1);
  });

  it('denies cross-workspace invitation access', async () => {
    expect((await inviteAs(admin, ws2, `x-${RUN}@example.invalid`)).status).toBe(404);
    expect((await admin.get(`/api/workspaces/${ws2}/invitations`)).status).toBe(404);
    expect((await second.get(`/api/workspaces/${ws1}/invitations`)).status).toBe(404);
  });

  it('never exposes tokenHash or credential material', async () => {
    const created = await inviteAs(owner, ws1, `leak-${RUN}@example.invalid`);
    expect(created.status).toBe(201);
    const listed = await owner.get(`/api/workspaces/${ws1}/invitations`);
    const rejected = await invitee
      .post('/api/invitations/accept')
      .set('Origin', ORIGIN)
      .send({ token: 'wrong-token-for-shape-check' });

    for (const body of [created.body, listed.body, rejected.body]) {
      const serialized = JSON.stringify(body).toLowerCase();
      for (const leaked of ['tokenhash', 'password', 'session', 'secret']) {
        expect(serialized).not.toContain(leaked);
      }
    }
    expect(Object.keys(created.body.invitation).sort()).toEqual([
      'createdAt',
      'email',
      'expiresAt',
      'id',
      'token',
    ]);
  });
});

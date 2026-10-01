import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { getPrisma } from './prisma';

vi.setConfig({ testTimeout: 30000, hookTimeout: 120000 });

const LIVE =
  !!process.env.DATABASE_URL && !!process.env.BETTER_AUTH_SECRET && !!process.env.BETTER_AUTH_URL;
const liveDescribe = LIVE ? describe : describe.skip;

const ORIGIN = process.env.BETTER_AUTH_URL ?? 'http://localhost:4000';
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const email = (who: string) => `prof-${RUN}-${who}@example.invalid`;
const PASSWORD = 'profile-test-password-0123456789';

liveDescribe('profile API (live database)', () => {
  const app = createApp();
  const createdEmails: string[] = [];

  async function signUp(who: string, name: string) {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name, email: email(who), password: PASSWORD });
    expect(res.status).toBeLessThan(300);
    createdEmails.push(email(who));
    return agent;
  }

  let alice: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    alice = await signUp('alice', 'Alice Original');
  }, 60000);

  afterAll(async () => {
    if (!LIVE) return;
    const prisma = getPrisma();
    for (const e of createdEmails) await prisma.user.deleteMany({ where: { email: e } });
  });

  it('PATCH /api/me 401 when unauthenticated', async () => {
    const res = await request(app).patch('/api/me').set('Origin', ORIGIN).send({ name: 'Bob' });
    expect(res.status).toBe(401);
  });

  it('valid update returns SafeUser shape', async () => {
    const res = await alice.patch('/api/me').set('Origin', ORIGIN).send({ name: 'Alice Updated' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: expect.any(String),
      name: 'Alice Updated',
      email: email('alice'),
      image: null,
    });
    expect(Object.keys(res.body.user).sort()).toEqual([
      'email',
      'emailVerified',
      'id',
      'image',
      'name',
    ]);
    // image null allowed
    const withImage = await alice
      .patch('/api/me')
      .set('Origin', ORIGIN)
      .send({ image: 'https://example.com/avatar.jpg' });
    expect(withImage.status).toBe(200);
    expect(withImage.body.user.image).toBe('https://example.com/avatar.jpg');
    // null image to remove
    const nullImage = await alice.patch('/api/me').set('Origin', ORIGIN).send({ image: null });
    expect(nullImage.status).toBe(200);
    expect(nullImage.body.user.image).toBeNull();
  });

  it('rejects invalid name and image', async () => {
    expect((await alice.patch('/api/me').set('Origin', ORIGIN).send({ name: '' })).status).toBe(
      400,
    );
    expect((await alice.patch('/api/me').set('Origin', ORIGIN).send({ name: '   ' })).status).toBe(
      400,
    );
    expect(
      (
        await alice
          .patch('/api/me')
          .set('Origin', ORIGIN)
          .send({ name: 'a'.repeat(101) })
      ).status,
    ).toBe(400);
    expect(
      (await alice.patch('/api/me').set('Origin', ORIGIN).send({ image: 'not-a-url' })).status,
    ).toBe(400);
    expect(
      (
        await alice
          .patch('/api/me')
          .set('Origin', ORIGIN)
          .send({ image: 'ftp://example.com/a.jpg' })
      ).status,
    ).toBe(400);
    expect(
      (
        await alice
          .patch('/api/me')
          .set('Origin', ORIGIN)
          .send({ image: 'https://example.com/' + 'a'.repeat(2048) })
      ).status,
    ).toBe(400);
    expect((await alice.patch('/api/me').set('Origin', ORIGIN).send({})).status).toBe(400);
  });

  it('accepts a downscaled avatar data URL and rejects invalid ones', async () => {
    const dataUrl = `data:image/jpeg;base64,${'AAAA'.repeat(16)}`;
    const ok = await alice.patch('/api/me').set('Origin', ORIGIN).send({ image: dataUrl });
    expect(ok.status).toBe(200);
    expect(ok.body.user.image).toBe(dataUrl);

    const badType = await alice
      .patch('/api/me')
      .set('Origin', ORIGIN)
      .send({ image: 'data:image/svg+xml;base64,AAAA' });
    expect(badType.status).toBe(400);

    const badPayload = await alice
      .patch('/api/me')
      .set('Origin', ORIGIN)
      .send({ image: 'data:image/jpeg;base64,@@@' });
    expect(badPayload.status).toBe(400);

    // restore null for later tests
    const cleared = await alice.patch('/api/me').set('Origin', ORIGIN).send({ image: null });
    expect(cleared.status).toBe(200);
  });

  it('rejects extra fields and userId/email', async () => {
    expect(
      (await alice.patch('/api/me').set('Origin', ORIGIN).send({ name: 'Alice', userId: 'hax' }))
        .status,
    ).toBe(400);
    expect(
      (
        await alice
          .patch('/api/me')
          .set('Origin', ORIGIN)
          .send({ name: 'Alice', email: 'hax@example.com' })
      ).status,
    ).toBe(400);
    expect(
      (await alice.patch('/api/me').set('Origin', ORIGIN).send({ name: 'Alice', extra: 'x' }))
        .status,
    ).toBe(400);
    expect(
      (
        await alice
          .patch('/api/me')
          .set('Origin', ORIGIN)
          .send({ name: 'Alice', emailVerified: true } as unknown as object)
      ).status,
    ).toBe(400);
  });

  it('userId in body rejected and cannot update another user', async () => {
    const bob = await signUp('bob', 'Bob');
    const bobUser = await getPrisma().user.findUniqueOrThrow({ where: { email: email('bob') } });
    // Alice tries to send bob's id — should be rejected via strict
    const res = await alice
      .patch('/api/me')
      .set('Origin', ORIGIN)
      .send({ name: 'Hax', userId: bobUser.id } as unknown as object);
    expect(res.status).toBe(400);
    // Verify bob unchanged
    const me = await bob.get('/api/me');
    expect(me.body.user.name).toBe('Bob');
  });
});

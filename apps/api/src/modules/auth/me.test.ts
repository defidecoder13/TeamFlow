import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createClerkFakes } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { getPrisma } from './prisma';
import { updateMeSchema } from './me';

describe('updateMeSchema', () => {
  it('accepts http(s) image URLs and null', () => {
    expect(
      updateMeSchema.safeParse({ image: 'https://example.com/a.jpg' }).success,
    ).toBe(true);
    expect(updateMeSchema.safeParse({ image: null }).success).toBe(true);
    expect(updateMeSchema.safeParse({ name: 'Ada' }).success).toBe(true);
  });

  it('accepts a well-formed jpeg/png/webp/gif data URL under the cap', () => {
    const dataUrl = 'data:image/jpeg;base64,' + 'AAAA'.repeat(8);
    expect(updateMeSchema.safeParse({ image: dataUrl }).success).toBe(true);
  });

  it('rejects bad data URLs, non-http URLs, and oversized payloads', () => {
    expect(updateMeSchema.safeParse({ image: 'data:image/svg+xml;base64,AAAA' }).success).toBe(
      false,
    );
    expect(updateMeSchema.safeParse({ image: 'data:image/jpeg;base64,!!' }).success).toBe(false);
    expect(updateMeSchema.safeParse({ image: 'ftp://example.com/a.jpg' }).success).toBe(false);
    expect(
      updateMeSchema.safeParse({ image: 'data:image/jpeg;base64,' + 'A'.repeat(400_001) }).success,
    ).toBe(false);
    expect(updateMeSchema.safeParse({}).success).toBe(false);
    expect(updateMeSchema.safeParse({ name: 'A', extra: true }).success).toBe(false);
  });
});

/**
 * Session tests run against the real Express wiring with a fake Clerk
 * verifier/directory: Bearer token in, provisioned local user out.
 * Provisioning touches PostgreSQL, so the session block is LIVE-gated
 * (same convention as the route suites). The schema block needs no I/O.
 */
const LIVE = !!process.env.DATABASE_URL;
const liveDescribe = LIVE ? describe : describe.skip;

const fakes = createClerkFakes('me');

describe('GET /api/me', () => {
  const app = createApp(fakes.appDeps());

  it('returns 401 with the standard error shape when unauthenticated', async () => {
    const res = await request(app).get('/api/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
    });
  });

  it('returns 401 for a token the verifier does not recognize', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
    });
  });

  liveDescribe('provisioned identity (live database)', () => {
    const createdEmails: string[] = [];

    afterAll(async () => {
      if (createdEmails.length > 0) {
        await getPrisma().user.deleteMany({ where: { email: { in: createdEmails } } });
      }
    });

    it('returns the provisioned identity when authenticated', async () => {
      fakes.setProfile('ada', { name: 'Phase One B' });
      createdEmails.push(fakes.emailFor('ada'));
      const res = await request(app).get('/api/me').set(fakes.headersFor('ada'));

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        name: 'Phase One B',
        email: fakes.emailFor('ada'),
        emailVerified: false,
      });
      expect(typeof res.body.user.id).toBe('string');
    });

    it('ignores client-supplied user identity', async () => {
      const sessionRes = await request(app).get('/api/me').set(fakes.headersFor('ada'));
      const realId = sessionRes.body.user.id as string;

      const res = await request(app)
        .get('/api/me?userId=attacker-controlled-id')
        .set(fakes.headersFor('ada'))
        .set('x-user-id', 'attacker-controlled-id');

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(realId);
      expect(res.body.user.id).not.toBe('attacker-controlled-id');
    });

    it('exposes only the explicit safe fields', async () => {
      const res = await request(app).get('/api/me').set(fakes.headersFor('ada'));

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(['user']);
      expect(Object.keys(res.body.user).sort()).toEqual([
        'email',
        'emailVerified',
        'id',
        'image',
        'name',
      ]);
      const serialized = JSON.stringify(res.body).toLowerCase();
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('token');
      expect(serialized).not.toContain('hash');
    });

    it('isolates identities between different tokens', async () => {
      createdEmails.push(fakes.emailFor('second'));
      const first = await request(app).get('/api/me').set(fakes.headersFor('ada'));
      const second = await request(app).get('/api/me').set(fakes.headersFor('second'));

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.user.id).not.toBe(first.body.user.id);
      expect(second.body.user.email).toBe(fakes.emailFor('second'));
    });
  });
});

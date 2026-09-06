import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app';

const TEST_AUTH_URL = 'http://localhost:4000';
const TEST_USER = {
  name: 'Phase One B',
  email: 'phase-1b@test.teamflow.local',
  password: 'phase-1b-test-password-0123456789',
};

/**
 * Session tests run against a memory-adapter auth instance: the full Express
 * wiring (mount, cookies, /api/me, sign-out) is real Better Auth behavior.
 * PostgreSQL-backed sign-in is NOT covered here — no live database exists in
 * this environment (see Phase 1B report).
 */
function createTestAuth() {
  return betterAuth({
    secret: 'phase-1b-test-secret-0123456789abcdef-0123456789abcdef',
    baseURL: TEST_AUTH_URL,
    // In-memory store with pre-initialized auth tables (the adapter requires
    // one array per model). No live database needed for session-route tests.
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: {
      enabled: true,
    },
    rateLimit: {
      enabled: false,
    },
  });
}

describe('GET /api/me', () => {
  const auth = createTestAuth();
  const app = createApp({ auth });
  const agent = request.agent(app);

  beforeAll(async () => {
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', TEST_AUTH_URL)
      .send(TEST_USER);
    expect(res.status).toBeLessThan(300);
  });

  it('returns 401 with the standard error shape when unauthenticated', async () => {
    const res = await request(app).get('/api/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
    });
  });

  it('returns the session-derived identity when authenticated', async () => {
    const res = await agent.get('/api/me');

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: TEST_USER.name,
      email: TEST_USER.email,
      emailVerified: false,
    });
    expect(typeof res.body.user.id).toBe('string');
  });

  it('ignores client-supplied user identity', async () => {
    const sessionRes = await agent.get('/api/me');
    const realId = sessionRes.body.user.id as string;

    const res = await agent
      .get('/api/me?userId=attacker-controlled-id')
      .set('x-user-id', 'attacker-controlled-id');

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(realId);
    expect(res.body.user.id).not.toBe('attacker-controlled-id');
  });

  it('exposes only the explicit safe fields', async () => {
    const res = await agent.get('/api/me');

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

  it('returns 401 after the session is invalidated via sign-out', async () => {
    const secondAgent = request.agent(app);
    const signUpRes = await secondAgent
      .post('/api/auth/sign-up/email')
      .set('Origin', TEST_AUTH_URL)
      .send({
        name: 'Second User',
        email: 'phase-1b-second@test.teamflow.local',
        password: 'phase-1b-second-password-0123456789',
      });
    expect(signUpRes.status).toBeLessThan(300);
    expect((await secondAgent.get('/api/me')).status).toBe(200);

    const signOutRes = await secondAgent.post('/api/auth/sign-out').set('Origin', TEST_AUTH_URL);
    expect(signOutRes.status).toBeLessThan(300);

    const res = await secondAgent.get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
    });
  });
});

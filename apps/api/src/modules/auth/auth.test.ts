import type { Request } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createClerkFakes } from '../../test-utils/clerk-fakes';
import { createApp } from '../../app';
import { getClerkSession } from './clerk';

const fakes = createClerkFakes('auth');

function reqWith(authHeader: string | undefined): Request {
  return {
    headers: authHeader === undefined ? {} : { authorization: authHeader },
  } as unknown as Request;
}

describe('clerk session verification', () => {
  it('returns null without a bearer token', async () => {
    await expect(getClerkSession(reqWith(undefined), fakes.verify)).resolves.toBeNull();
    await expect(getClerkSession(reqWith('Bearer '), fakes.verify)).resolves.toBeNull();
    await expect(getClerkSession(reqWith('Basic abc123'), fakes.verify)).resolves.toBeNull();
  });

  it('returns null for unknown tokens and throwing verifiers', async () => {
    await expect(
      getClerkSession(reqWith('Bearer not-issued-here'), fakes.verify),
    ).resolves.toBeNull();
    await expect(
      getClerkSession(reqWith('Bearer anything'), async () => {
        throw new Error('jwks unreachable');
      }),
    ).resolves.toBeNull();
  });

  it('resolves the clerk id for recognized tokens', async () => {
    fakes.headersFor('ada');
    const session = await getClerkSession(
      reqWith(`Bearer ${fakes.tokenFor('ada')}`),
      fakes.verify,
    );
    expect(session).toEqual({ clerkId: fakes.clerkIdFor('ada') });
  });

  it('responds 401 with the standard envelope when unauthenticated', async () => {
    const app = createApp(fakes.appDeps());
    const res = await request(app).get('/api/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' },
    });
  });
});

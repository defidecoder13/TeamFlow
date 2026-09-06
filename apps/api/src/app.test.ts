import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app';

describe('foundation API', () => {
  it('GET /health returns { status: "ok" }', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns JSON 404 for unknown routes', async () => {
    const response = await request(createApp()).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not Found' } });
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { getDatabaseUrl } from './index';

describe('getDatabaseUrl', () => {
  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it('returns DATABASE_URL when configured', () => {
    process.env.DATABASE_URL = 'postgresql://teamflow:teamflow@localhost:5432/teamflow';
    expect(getDatabaseUrl()).toBe('postgresql://teamflow:teamflow@localhost:5432/teamflow');
  });

  it('throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => getDatabaseUrl()).toThrow('DATABASE_URL is not set');
  });

  it('throws when DATABASE_URL is blank', () => {
    process.env.DATABASE_URL = '   ';
    expect(() => getDatabaseUrl()).toThrow('DATABASE_URL is not set');
  });
});

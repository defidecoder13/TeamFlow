import { beforeEach, describe, expect, it } from 'vitest';
import { getR2Config, isR2Configured, MissingR2ConfigError, resetR2ConfigCache } from './config';

describe('R2 Config Loader', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetR2ConfigCache();
    process.env = { ...originalEnv };
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_ENDPOINT;
  });

  it('reports isR2Configured as false when env vars are missing', () => {
    expect(isR2Configured()).toBe(false);
  });

  it('throws MissingR2ConfigError listing all missing mandatory variables', () => {
    expect(() => getR2Config()).toThrow(MissingR2ConfigError);
    try {
      getR2Config();
    } catch (error) {
      expect((error as MissingR2ConfigError).message).toContain('R2_ACCOUNT_ID');
      expect((error as MissingR2ConfigError).message).toContain('R2_ACCESS_KEY_ID');
      expect((error as MissingR2ConfigError).message).toContain('R2_SECRET_ACCESS_KEY');
      expect((error as MissingR2ConfigError).message).toContain('R2_BUCKET_NAME');
    }
  });

  it('loads valid configuration when all required variables are present', () => {
    process.env.R2_ACCOUNT_ID = 'acc-123';
    process.env.R2_ACCESS_KEY_ID = 'key-123';
    process.env.R2_SECRET_ACCESS_KEY = 'secret-123';
    process.env.R2_BUCKET_NAME = 'teamflow-bucket';

    expect(isR2Configured()).toBe(true);
    const config = getR2Config();
    expect(config.accountId).toBe('acc-123');
    expect(config.accessKeyId).toBe('key-123');
    expect(config.secretAccessKey).toBe('secret-123');
    expect(config.bucketName).toBe('teamflow-bucket');
    expect(config.endpoint).toBe('https://acc-123.r2.cloudflarestorage.com');
  });

  it('respects explicit R2_ENDPOINT override if provided', () => {
    process.env.R2_ACCOUNT_ID = 'acc-123';
    process.env.R2_ACCESS_KEY_ID = 'key-123';
    process.env.R2_SECRET_ACCESS_KEY = 'secret-123';
    process.env.R2_BUCKET_NAME = 'teamflow-bucket';
    process.env.R2_ENDPOINT = 'https://custom-endpoint.local';

    const config = getR2Config();
    expect(config.endpoint).toBe('https://custom-endpoint.local');
  });
});

import { describe, expect, it } from 'vitest';
import { createHealthStatus, HEALTH_STATUS_OK, TEAMFLOW_APP_NAME } from './index';

describe('shared foundation exports', () => {
  it('exposes the application name', () => {
    expect(TEAMFLOW_APP_NAME).toBe('TeamFlow');
  });

  it('builds the canonical health payload', () => {
    expect(createHealthStatus()).toEqual({ status: HEALTH_STATUS_OK });
  });
});

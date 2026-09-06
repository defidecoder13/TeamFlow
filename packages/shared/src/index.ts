/**
 * Genuinely shared TeamFlow primitives.
 *
 * Phase 0: minimal valid exports only. Application-specific business logic
 * must NOT live here — it belongs in domain modules under `apps/api`.
 */

export const TEAMFLOW_APP_NAME = 'TeamFlow' as const;

export const HEALTH_STATUS_OK = 'ok' as const;

export interface HealthStatus {
  status: typeof HEALTH_STATUS_OK;
}

export function createHealthStatus(): HealthStatus {
  return { status: HEALTH_STATUS_OK };
}

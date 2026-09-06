# Definition of Done

A feature is complete when:

- Requirements are documented.
- UI and API behavior are implemented.
- Server-side authorization exists.
- Inputs are validated.
- Database constraints/indexes are appropriate.
- Errors have stable handling.
- Relevant unit/integration/E2E tests exist.
- Realtime behavior is tested if applicable.
- Offline behavior is tested if applicable.
- Observability is sufficient for the feature.
- No secrets are committed.
- Typecheck/lint/build pass.
- Documentation reflects the final behavior.

## Production readiness checklist

- Authentication secure
- RBAC tested
- Tenant isolation tested
- Rate limits active
- File limits active
- Database backups configured
- Redis failure behavior understood
- AI permissions tested
- Error tracking enabled
- Health checks enabled
- Deployment rollback plan documented

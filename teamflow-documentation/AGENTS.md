# TeamFlow Agent Instructions

## Mission

Implement TeamFlow according to `/docs`. Treat the documentation as the source of truth.

## Non-negotiable architecture rules

1. Keep the backend modular. Do not create microservices unless explicitly required.
2. PostgreSQL is the source of truth for durable application data.
3. Redis is for transient state, caching, Pub/Sub, queues, and distributed coordination.
4. Never broadcast a message before durable persistence succeeds.
5. Every protected backend operation must perform authorization server-side.
6. Never trust frontend role checks as security controls.
7. Large files must use direct signed uploads to object storage.
8. Offline mutations must be idempotent.
9. AI retrieval must enforce the same workspace/channel permissions as normal search.
10. Do not expose secrets to the browser.
11. Prefer cursor pagination for message history.
12. Add tests for critical business rules before considering a feature complete.

## Implementation workflow

1. Read relevant docs before coding.
2. Identify affected modules and data models.
3. Implement domain logic separately from transport/UI concerns.
4. Add validation and authorization.
5. Add tests.
6. Update docs when behavior or architecture changes.
7. Run formatting, type checks, tests, and build checks.

## Avoid

- Premature microservices
- Giant controller files
- Business logic hidden in React components
- Database access scattered throughout the application
- Unbounded queries
- Loading entire message histories
- Storing ephemeral presence heartbeats in PostgreSQL
- Sending large files through the API server
- AI retrieval without permission filtering
- Silent error swallowing

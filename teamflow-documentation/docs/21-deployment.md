# Deployment

## Suggested topology

```text
Vercel
  -> Next.js frontend

Backend host
  -> Node/Express + Socket.IO

Neon
  -> PostgreSQL

Upstash/Redis provider
  -> Redis

Cloudflare R2/S3
  -> Object storage
```

Workers can run separately from the API process.

## Environments

- local
- preview/staging
- production

## CI pipeline

```text
install
 -> lint
 -> typecheck
 -> test
 -> build
 -> deploy
```

## Docker

Provide a backend/worker Docker image with non-root runtime, deterministic dependency installation, health checks, and environment-based configuration.

## Migrations

Database migrations must run in a controlled deployment step. Never modify production schema manually without a migration.

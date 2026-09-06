# TeamFlow

TeamFlow is a production-oriented, Slack-like collaboration platform for teams. It combines real-time messaging, workspaces, channels, direct messages, file sharing, search, notifications, offline-first behavior, and an AI workspace assistant.

> Canonical product/architecture specifications live in `teamflow-documentation/docs/`.
> Agent rules live in `AGENTS.md` (mirrors `teamflow-documentation/AGENTS.md`).

## Architecture principle

Start as a **modular monolith**. Keep strong module boundaries so high-load components can later be extracted into services without rewriting the product.

## Repository layout

```text
TeamFlow/
├── apps/
│   ├── web/        # Next.js frontend (Phase 0: minimal placeholder page)
│   └── api/        # Express API (Phase 0: GET /health only)
├── packages/
│   ├── db/         # Prisma + PostgreSQL infrastructure
│   ├── shared/     # Genuinely shared types/constants/utils
│   └── config/     # Shared TypeScript base config
├── prisma/         # Pointer to the canonical Prisma schema
├── docs/           # Pointer to the canonical documentation
├── docker/         # Local PostgreSQL via Docker Compose
├── .github/        # CI workflow
├── teamflow-documentation/  # Source of truth (do not rewrite)
├── .env.example
├── AGENTS.md
└── pnpm-workspace.yaml
```

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- pnpm 11 (`corepack enable` or `npm i -g pnpm`)
- Docker (for local PostgreSQL)

## Quickstart

```bash
cp .env.example .env
# Set DATABASE_URL, e.g.:
# DATABASE_URL=postgresql://teamflow:teamflow@localhost:5432/teamflow

# Start local PostgreSQL
docker compose -f docker/docker-compose.yml up -d

pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build

# Run both apps
pnpm dev
# Web: http://localhost:3000 — API health: http://localhost:4000/health
```

## Scripts

| Script             | What it does                                   |
| ------------------ | ---------------------------------------------- |
| `pnpm dev`         | Run API + web in parallel                      |
| `pnpm build`       | Build every workspace package (`--if-present`) |
| `pnpm lint`        | ESLint every workspace package                 |
| `pnpm typecheck`   | `tsc --noEmit` in every workspace package      |
| `pnpm test`        | Vitest suites in every workspace package       |
| `pnpm format`      | Prettier write                                 |
| `pnpm db:validate` | `prisma validate` for the db package           |
| `pnpm db:generate` | `prisma generate` for the db package           |

```

## Current phase

Phase 0 (foundation) only: repository + tooling + minimal frontend + minimal API + database infrastructure. No product features yet.
```

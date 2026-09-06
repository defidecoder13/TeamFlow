# System Architecture

## Architectural style

TeamFlow uses a modular monolith initially.

```text
Browser/PWA
   |
HTTPS + WebSocket
   |
API / Realtime Gateway
   |
+--+----------+----------+----------+
| Auth | Workspace | Messaging | AI |
| Search | Files | Notifications | Jobs |
+-----------------------------------+
   |
PostgreSQL ---- Redis ---- Object Storage
   |             |
 pgvector       BullMQ
```

## Why modular monolith

It reduces operational complexity while preserving clear boundaries. A future service can be extracted when load, team ownership, or deployment isolation justifies it.

## Module boundaries

- auth
- users
- workspaces
- channels
- messaging
- realtime
- notifications
- files
- search
- ai
- jobs
- audit

## Source of truth

PostgreSQL owns durable business state. Redis owns transient/distributed state. Object storage owns binary files.

## Scaling path

1. Single backend instance
2. Add Redis
3. Add multiple API/realtime instances
4. Add worker instances
5. Optimize database indexes/queries
6. Extract only demonstrably hot or independently deployable modules

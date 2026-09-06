# API Specification

Base path: `/api/v1`

## Authentication

```text
GET  /auth/session
POST /auth/sign-out
```

## Workspaces

```text
GET    /workspaces
POST   /workspaces
GET    /workspaces/:workspaceId
PATCH  /workspaces/:workspaceId
DELETE /workspaces/:workspaceId
```

## Channels

```text
GET    /workspaces/:workspaceId/channels
POST   /workspaces/:workspaceId/channels
GET    /channels/:channelId
PATCH  /channels/:channelId
POST   /channels/:channelId/archive
```

## Messages

```text
GET  /channels/:channelId/messages?limit=50&cursor=...
POST /channels/:channelId/messages
PATCH /messages/:messageId
DELETE /messages/:messageId
```

## Search

```text
GET /workspaces/:workspaceId/search?q=...
```

## Files

```text
POST /files/presign
POST /files/complete
```

## Sync

```text
POST /sync/mutations
GET  /sync/changes?cursor=...
```

## API rules

- Validate every request.
- Return stable error codes.
- Authenticate and authorize before domain logic.
- Use cursor pagination for large collections.
- Support idempotency for mutation endpoints where retries are possible.
- Never expose internal stack traces in production.

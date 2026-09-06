# API Specification

Base path: `/api`

## Authentication

```text
GET  /api/auth/session
POST /api/auth/sign-out
```

## Workspaces

```text
GET    /api/workspaces
POST   /api/workspaces
GET    /api/workspaces/:workspaceId
PATCH  /api/workspaces/:workspaceId
DELETE /api/workspaces/:workspaceId
GET    /api/workspaces/:workspaceId/members
POST   /api/workspaces/:workspaceId/invitations
GET    /api/workspaces/:workspaceId/invitations
```

## Invitations

```text
POST   /api/invitations/accept
```

Invitation creation returns the raw token once (no email delivery yet); only the SHA-256 hash is stored. Acceptance consumes the token atomically and always creates a MEMBER membership. OWNER/ADMIN manage invitations; members read member lists; non-members receive non-enumerating responses.

Email delivery is not implemented: the creation-time token feeds the development-only `/invite/accept?token=…` flow, which authenticates via the normal session and accepts server-side.

## Channels

```text
GET    /api/workspaces/:workspaceId/channels
POST   /api/workspaces/:workspaceId/channels
GET    /api/channels/:channelId
PATCH  /api/channels/:channelId
POST   /api/channels/:channelId/archive
```

## Messages

```text
GET  /api/channels/:channelId/messages?limit=50&cursor=...
POST /api/channels/:channelId/messages
PATCH /api/messages/:messageId
DELETE /api/messages/:messageId
```

Message history uses opaque keyset cursors over (createdAt, id) descending, default limit 50, max 100. Only the original author may edit (sets editedAt) or delete; deletion is a soft tombstone (body hidden, row kept). Realtime delivery is a later layer on top of these REST operations — persist first, broadcast later.

## Search

```text
GET /api/workspaces/:workspaceId/search?q=...
```

## Files

```text
POST /api/files/presign
POST /api/files/complete
```

## Sync

```text
POST /api/sync/mutations
GET  /api/sync/changes?cursor=...
```

## API rules

- Validate every request.
- Return stable error codes.
- Authenticate and authorize before domain logic.
- Use cursor pagination for large collections.
- Support idempotency for mutation endpoints where retries are possible.
- Never expose internal stack traces in production.

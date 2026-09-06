# Sync and Conflict Strategy

## Idempotency

Every offline mutation gets a client-generated `clientMutationId`.

The server stores that identifier within the appropriate tenant/user scope and treats repeated submissions as the same mutation.

## Sync protocol

Client sends:

```json
{
  "mutations": [
    {
      "clientMutationId": "uuid",
      "type": "message.create",
      "payload": {}
    }
  ],
  "lastServerCursor": "..."
}
```

Server returns accepted mutations, failures, and a new change cursor.

## Conflict classes

### Message creation

Generally append-only; duplicate creation is prevented through idempotency.

### Message edit

Use server version/timestamp checks. If the message changed after the local edit, return a conflict rather than silently overwriting.

### Channel/workspace metadata

Prefer last-write rules only when business semantics permit them.

### Deletion

Treat deletion as a tombstone so offline clients can learn that a record was deleted.

## Principle

Never silently discard user-created data during synchronization.

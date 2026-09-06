# Background Jobs

## Queue

BullMQ backed by Redis.

## Job categories

- Email invitations
- Notification delivery
- AI embedding generation
- AI summaries
- File processing
- Cleanup
- Scheduled messages
- Reconciliation

## Job rules

Jobs must be idempotent where possible.

Include:

- job ID
- retry policy
- backoff
- timeout
- dead-letter/failure handling
- structured logging

## Example

```text
Message created
 -> enqueue embedding job
 -> worker reads message
 -> verify it is still eligible
 -> generate embedding
 -> upsert vector
```

Never make message delivery depend synchronously on embedding generation.

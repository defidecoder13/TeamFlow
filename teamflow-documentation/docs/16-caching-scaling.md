# Caching and Scaling

## Redis uses

- Presence
- Rate limiting
- Short-lived cache
- Pub/Sub
- Socket.IO adapter
- BullMQ

## What not to cache blindly

Do not cache highly permission-sensitive responses without tenant/user-aware keys and invalidation rules.

## Horizontal scaling

```text
Load Balancer
  |--- API/Realtime instance 1
  |--- API/Realtime instance 2
  |--- API/Realtime instance 3
          |
        Redis
          |
      PostgreSQL
```

## Database scaling

First optimize indexes and query patterns. Then consider connection pooling, read replicas, partitioning, or archival only when evidence justifies them.

## Backpressure

Bound payload sizes, pagination, queue concurrency, and expensive AI requests.

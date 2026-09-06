# Interview Discussion Guide

## Why PostgreSQL?

The product has strongly relational entities: users, memberships, workspaces, channels, permissions, and messages. Transactions and constraints are valuable.

## Why modular monolith?

It provides clean architecture without premature distributed-system complexity. Boundaries allow future extraction.

## Why WebSockets?

Messaging, typing, presence, and notifications require low-latency server-to-client events.

## Why Redis?

Presence and Pub/Sub are transient/distributed concerns. Redis also supports queues and caching.

## Why IndexedDB?

It enables bounded local persistence and offline mutations in the browser.

## How do you prevent duplicate offline messages?

Client-generated idempotency keys are persisted server-side and reused on retries.

## How do you scale realtime?

Multiple Socket.IO instances share events through Redis Pub/Sub/adapter.

## How does AI avoid leaking private messages?

Retrieval is filtered by the user's effective workspace/channel permissions before context reaches the model.

## Why direct-to-object-storage uploads?

It prevents large files from consuming API server bandwidth and memory.

## How would you scale PostgreSQL?

Start with indexes/query optimization, pooling, bounded queries, and profiling. Add replicas/partitioning only after measuring actual bottlenecks.

## What happens if Redis goes down?

Design critical durable operations so PostgreSQL remains authoritative. Realtime fanout/presence/queues may degrade, but the product should recover after Redis returns.

## What happens if the AI provider goes down?

Messaging and normal search remain available. AI requests fail gracefully and can be retried.

## Strong tradeoffs to discuss

- Modular monolith vs microservices
- REST vs WebSocket
- PostgreSQL vs NoSQL
- Redis ephemeral state vs durable database state
- Optimistic UI vs strict acknowledgement
- Cursor vs offset pagination
- RAG vs keyword search
- Offline availability vs conflict complexity

# Architecture Decision Records

## ADR-001: Modular monolith first

**Decision:** Start with one deployable backend organized into modules.

**Reason:** Lower operational overhead and faster iteration while preserving future extraction boundaries.

## ADR-002: PostgreSQL as source of truth

**Decision:** Durable collaboration state lives in PostgreSQL.

**Reason:** Strong consistency, transactions, relational modeling, constraints, and mature indexing.

## ADR-003: Socket.IO for realtime

**Decision:** Use Socket.IO for browser realtime events.

**Reason:** Connection lifecycle, rooms, acknowledgements, reconnection behavior, and ecosystem support.

## ADR-004: Redis for transient/distributed concerns

**Decision:** Use Redis for presence, Pub/Sub, cache, and queues.

**Reason:** These concerns are ephemeral or cross-instance and do not belong in the primary relational model.

## ADR-005: IndexedDB for offline data

**Decision:** Use IndexedDB via Dexie.

**Reason:** Browser-native durable local storage suitable for bounded application data and mutation queues.

## ADR-006: pgvector for semantic search

**Decision:** Keep vectors beside PostgreSQL.

**Reason:** Simplifies permission-aware retrieval and avoids introducing a separate vector database early.

## ADR-007: Direct object-storage uploads

**Decision:** Use signed URLs.

**Reason:** Reduces backend bandwidth/memory pressure and scales better for binary data.

# Search Architecture

## Phase 1

PostgreSQL full-text/trigram search for messages and metadata.

## Query flow

```text
User query
 -> authenticate
 -> resolve workspace
 -> apply membership/channel permissions
 -> execute indexed search
 -> rank results
 -> paginate
```

## Filters

Support concepts such as:

```text
from:user
in:channel
after:date
before:date
has:file
```

## Phase 2

Semantic search through embeddings and pgvector.

## Security

Authorization filtering is mandatory before results are returned. Search indexes must not become a side channel around private-channel permissions.

## Performance

Use indexed queries, bounded result counts, cursor pagination where appropriate, and query timeouts.

# AI and RAG Architecture

## Features

- Ask questions about accessible workspace conversations
- Summarize channels/time ranges
- Summarize threads
- Rewrite messages
- Semantic search

## RAG pipeline

```text
Message
 -> normalize
 -> chunk when needed
 -> generate embedding
 -> store embedding + metadata
 -> retrieve relevant authorized chunks
 -> construct context
 -> LLM
 -> answer with source references
```

## Permission-aware retrieval

Before vector retrieval, derive the user's accessible workspace/channel scope. Apply those constraints to retrieval metadata.

The model must never receive content the user could not normally access.

## Grounding

AI responses should identify supporting messages/conversations where practical. If evidence is insufficient, say so rather than inventing an answer.

## Cost controls

- Limit context size.
- Cache repeated summaries where safe.
- Batch embeddings.
- Use smaller models for simple transformations.
- Rate-limit expensive AI operations.

## Failure behavior

If the AI provider fails, normal collaboration features must continue working. AI is an enhancement, not a dependency for messaging.

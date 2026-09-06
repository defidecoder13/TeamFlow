# Offline-First Architecture

## Goals

Users should be able to read recently cached conversations and compose messages during connectivity loss.

## Local storage

Use IndexedDB through Dexie.

Suggested stores:

```text
conversations
messages
pending_mutations
sync_state
users
attachments
```

## Message flow offline

```text
Compose
 -> create clientMutationId
 -> write local message
 -> mark pending
 -> queue mutation
 -> when online, sync
 -> server persists
 -> server returns canonical ID
 -> replace local temporary record
 -> mark sent
```

## Optimistic UI

The message appears immediately with `pending` state.

## Retry

Use exponential backoff with a bounded retry count. Permanent validation/auth errors should stop retrying and surface an actionable state.

## Cache strategy

Cache recently visited channels and bounded message history. Do not attempt to mirror the entire workspace locally.

## Service worker

Use the service worker for app shell/offline asset availability. Application data synchronization remains an application-level concern.

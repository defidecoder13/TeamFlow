# Notification System

## Notification sources

- Direct message
- Mention
- Thread reply
- Invitation
- Reaction
- Administrative event

## Flow

```text
Domain event
 -> notification job/event
 -> durable notification record
 -> realtime user event
 -> optional browser/email delivery
```

## Unread state

Durable unread state belongs in PostgreSQL. Realtime delivery is not the source of truth.

## Preferences

Users can mute channels, configure mention behavior, and manage notification categories.

## Reliability

Notification creation should be transactionally tied to the relevant business event where correctness requires it, or processed through an outbox/job pattern.

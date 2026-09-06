# Database Design

## Core entities

```text
User
Workspace
WorkspaceMember
Channel
ChannelMember
Conversation
Message
MessageReaction
Attachment
Notification
Invitation
Bookmark
AuditLog
Embedding
```

## Important relationships

```text
User 1--N WorkspaceMember N--1 Workspace
Workspace 1--N Channel
Channel N--N User through ChannelMember
Channel 1--N Message
Message 1--N Message (replies)
Message 1--N Reaction
Message 1--N Attachment
User 1--N Notification
```

## Key fields

### users
id, email, name, avatar_url, status, last_seen_at, created_at

### workspaces
id, name, slug, owner_id, created_at

### workspace_members
workspace_id, user_id, role, joined_at

### invitations
id, workspace_id, email (normalized), token_hash (unique, raw token never stored), invited_by, expires_at (default 7 days), accepted_at, revoked_at, created_at

An invitation is pending only when accepted_at/revoked_at are NULL and expiresAt is in the future. The active-pending invariant (one pending invitation per workspace + email) is enforced transactionally; role on acceptance is always MEMBER.

### channels
id, workspace_id, name, slug (unique per workspace), description, type (PUBLIC/PRIVATE), created_by, created_at

### channel_members
channel_id, user_id, created_at

Private channels are visible only to channel members; the creator is added atomically at creation. Channel membership carries no role.

### messages
id, channel_id, author_id, body, created_at, updated_at, edited_at, deleted_at

Messages resolve their workspace through their channel (no workspace_id column). Edits set editedAt; deletes set deletedAt and null the exposed body while keeping the row. `parent_message_id` (threads) and `client_mutation_id` (offline idempotency) arrive in their respective phases.

## Indexes

- messages(channel_id, created_at, id)
- messages(author_id)
- messages(workspace_id, created_at)
- workspace_members(workspace_id, user_id) unique
- channel_members(channel_id, user_id) unique
- notifications(user_id, created_at)
- invitations(workspace_id, email)

Use composite indexes based on actual query patterns.

## Data integrity

Foreign keys, unique constraints, check constraints, transactions, and server-side validation are mandatory for critical relationships.

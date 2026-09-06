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

### channels
id, workspace_id, name, description, visibility, archived_at, created_at

### messages
id, workspace_id, channel_id, author_id, body, parent_message_id, client_mutation_id, created_at, updated_at, deleted_at

## Indexes

- messages(channel_id, created_at, id)
- messages(workspace_id, created_at)
- workspace_members(workspace_id, user_id) unique
- channel_members(channel_id, user_id) unique
- notifications(user_id, created_at)
- invitations(workspace_id, email)

Use composite indexes based on actual query patterns.

## Data integrity

Foreign keys, unique constraints, check constraints, transactions, and server-side validation are mandatory for critical relationships.

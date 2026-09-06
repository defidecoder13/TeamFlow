# Product Requirements

## Functional requirements

### Authentication
- Sign up/sign in
- Session management
- OAuth providers
- Sign out
- Profile editing

### Workspaces
- Create/update workspace
- Invite users
- Membership management
- Roles: Owner, Admin, Member
- Workspace switching

### Channels
- Public/private channels
- Create/edit/archive
- Membership management
- Pinned messages

### Messaging
- Channel messages
- DMs and group DMs
- Edit/delete
- Replies/threads
- Reactions
- Mentions
- Bookmarks
- Read state
- Attachments

### Realtime
- New messages
- Message updates/deletes
- Typing state
- Presence
- Reactions
- Notifications
- Reconnection

### Offline
- Cached conversations
- Offline composition
- Mutation queue
- Automatic retry
- Sync status

### AI
- Semantic workspace search
- Conversation summaries
- Message rewriting assistance
- Permission-aware retrieval

## Non-functional requirements

- Secure by default
- Responsive UI
- Accessible controls
- Predictable API contracts
- Observable backend
- Idempotent critical mutations
- Paginated data access
- Graceful degradation when realtime/AI services fail

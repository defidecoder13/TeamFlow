# TeamFlow — Existing Implementation Audit

## 1. Executive Summary

TeamFlow is an authenticated, multi-tenant team collaboration platform (Slack/Linear inspired) architected as a modular monolith. The codebase is organized as a pnpm workspace containing:
- `apps/web`: Next.js 15.5.0 App Router frontend using React 19.1.0, Tailwind CSS v4.1.0, `@hugeicons/react`, and Better Auth React client.
- `apps/api`: Express 4.21.2 backend service with Better Auth 1.7.2, Socket.IO 4.8.3, Zod 4.5.4 validation, and AWS S3 SDK for Cloudflare R2 object storage.
- `packages/db`: Prisma 6.x ORM package with PostgreSQL client, migrations, schema definitions, and model types.
- `packages/shared`: Shared primitives, types, and constants.
- `packages/config`: Shared configurations (ESLint, TypeScript).

The codebase exhibits exceptionally high engineering discipline:
- **Zero TODOs or FIXMEs** across all production source files.
- **Strict TypeScript type checking** passes with zero errors across all packages (`pnpm typecheck`).
- **ESLint** passes with zero errors or warnings (`pnpm lint`).
- **Production builds** succeed for all packages (`pnpm build`).
- **Extensive test coverage**: 337 tests pass in `@teamflow/api` (with live DB integration tests cleanly skipped in environments without Postgres), and 723 tests pass in `@teamflow/web`.
- **Honest data register**: Strictly adheres to the product anti-reference rules. There are no fabricated statistics, fake user bots, or placeholder mock messages in the authenticated app. Everything in the core application connects to real API endpoints, database models, and WebSocket rooms.

---

## 2. Architecture

### Monorepo & Dependencies

```
TeamFlow (Root pnpm Workspace)
├── apps/
│   ├── api/          (Express 4.21.2, Socket.IO 4.8.3, Better Auth 1.7.2, Zod 4.5.4, AWS S3 SDK)
│   └── web/          (Next.js 15.5.0, React 19.1.0, Tailwind v4.1.0, @hugeicons/react, Socket.IO Client)
└── packages/
    ├── config/       (Shared tsconfig, ESLint rules)
    ├── db/           (Prisma 6.x, PostgreSQL schema, PrismaClient factory)
    └── shared/       (Shared constants, types, utilities)
```

### Communication Flow

```
+-------------------------------------------------------------------------+
|                              Next.js Web                                |
|  - Pages (/app, /app/channels/[slug], /app/dms/[id], /app/search, etc.) |
|  - Components (AppShell, Sidebar, TopBar, Composer, ThreadPanel)       |
+------------------------------------+------------------------------------+
                                     |
                HTTP (fetch with credentials) / WebSockets (Socket.IO)
                                     |
+------------------------------------v------------------------------------+
|                             Express API                                 |
|  - Middleware: CORS, Better Auth session handler, requireAuth           |
|  - Routers: /api/me, /api/workspaces, /api/channels, /api/messages,     |
|             /api/direct-messages, /api/search, /api/notifications       |
|  - Realtime: Socket.IO Server (user, channel, DM rooms)                |
+-------------------+--------------------------------+--------------------+
                    |                                |
        SQL Queries via Prisma ORM      S3 / Presigned URLs
                    |                                |
+-------------------v----------------+   +-----------v--------------------+
|          PostgreSQL 16             |   |       Cloudflare R2            |
|  - Tenancy, Users, Workspaces,     |   |  - Message attachments         |
|    Channels, Messages, DMs,        |   |  - Signed PUT/GET URLs         |
|    Notifications, Full-Text Search |   |                                |
+------------------------------------+   +--------------------------------+
```

---

## 3. Routes

| Route | Exists? | Implementation Status | Auth Required? | Rendering Component / Page | Primary Data / API Dependency | Operational Assessment |
|---|---|---|---|---|---|---|
| `/` | Yes | Complete | No | `apps/web/app/page.tsx` | Static marketing landing page (`NewLanding*`) | Complete |
| `/sign-in` | Yes | Complete | No (Redirects if authed) | `apps/web/app/(auth)/sign-in/page.tsx` | Better Auth `authClient.signIn.email`, `GET /api/me` | Complete |
| `/sign-up` | Yes | Complete | No (Redirects if authed) | `apps/web/app/(auth)/sign-up/page.tsx` | Better Auth `authClient.signUp.email`, `GET /api/me` | Complete |
| `/invite/accept` | Yes | Complete | Yes (Prompts login if guest) | `apps/web/app/invite/accept/page.tsx` | `POST /api/invitations/accept`, token param | Complete |
| `/app` | Yes | Complete | Yes | `apps/web/app/app/page.tsx` | `GET /api/me`, `GET /api/workspaces`, `WorkspaceHome` | Complete |
| `/app/channels/[slug]` | Yes | Complete | Yes | `apps/web/app/app/channels/[slug]/page.tsx` | `GET /api/workspaces/:id/channels/:slug`, `useMessages`, Socket.IO | Complete |
| `/app/dms/[conversationId]` | Yes | Complete | Yes | `apps/web/app/app/dms/[conversationId]/page.tsx` | `GET /api/direct-messages/:id`, `useDirectMessages`, Socket.IO | Complete |
| `/app/search` | Yes | Complete | Yes | `apps/web/app/app/search/page.tsx` | `GET /api/workspaces/:id/search`, query params | Complete |
| `/app/settings` | Yes | Complete | Yes | `apps/web/app/app/settings/page.tsx` | `useWorkspaces`, `useSessionUser` | Complete |
| `/app/settings/profile` | Yes | Complete | Yes | `apps/web/app/app/settings/profile/page.tsx` | `PATCH /api/me`, `ProfileContent` | Complete |
| `/app/settings/workspace` | Yes | Complete | Yes | `apps/web/app/app/settings/workspace/page.tsx` | `PATCH/DELETE /api/workspaces/:id`, `WorkspaceSettingsContent` | Complete |
| `/app/settings/members` | Yes | Complete | Yes | `apps/web/app/app/settings/members/page.tsx` | `GET /api/workspaces/:id/members`, `InviteMemberDialog` | Complete |
| `/app/settings/notifications`| Yes | Complete | Yes | `apps/web/app/app/settings/notifications/page.tsx`| `GET/PUT /api/users/me/notification-preferences` | Complete |

---

## 4. Authentication

- **Provider**: Better Auth (`better-auth` 1.7.2) mounted on the Express server under `/api/auth/*` using `@better-auth/prisma-adapter`.
- **Session Implementation**: HTTP-only session cookies (`better-auth.session_token`).
- **Session Retrieval**: `GET /api/me` on Express extracts session identity via `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`. Safe user object returned: `{ id, name, email, image, emailVerified }`.
- **Edge Route Protection (`middleware.ts`)**: Evaluates `/app/:path*`, `/sign-in`, and `/sign-up`. Gating calls `fetchSessionUser` against `GET /api/me`. If unauthenticated on `/app/*`, redirects to `/sign-in?next=<safeReturnPath>`. If authenticated on `/sign-in` or `/sign-up`, redirects to `/app`.
- **Client Route Protection**: `useSessionUser` hook provides reactive session state (`loading`, `authenticated`, `unauthenticated`, `error`). Triggers router redirect on `unauthenticated`.
- **Sign Out**: `UserMenu.tsx` calls `getAuthClient().signOut()`, calls `disconnectRealtime()` to terminate active WebSocket connection, flushes `clearAttachmentDownloadUrlCache()`, and navigates to `/sign-in`.

---

## 5. Workspace System

- **Loading & State**: `WorkspacesProvider` mounts at `/app/layout.tsx`. Fetches `GET /api/workspaces` exactly once and shares state across rail, sidebar, and pages.
- **Current Workspace Selection**: Deterministic. Restores `teamflow:selected-workspace-id` from `localStorage` if still valid, otherwise falls back to the first available workspace in the returned array.
- **Workspace Creation**: `CreateWorkspace` component and `WorkspaceRail` dialog invoke `createWorkspace` (`POST /api/workspaces`). Name is validated (max 100 characters); slug is generated server-side. Creator is assigned the `OWNER` role.
- **Workspace Renaming**: `PATCH /api/workspaces/:workspaceId` updates workspace name. Requires `OWNER` or `ADMIN` role. Slug is immutable.
- **Workspace Deletion**: `DELETE /api/workspaces/:workspaceId` is strictly restricted to `OWNER`. Prompts typing workspace name to confirm. Pre-deletion members are queried, deletion cascades in PostgreSQL, and `workspace:deleted` event is broadcast via Socket.IO to evict remaining users to `/app`.
- **Empty Workspace State**: `WorkspaceEmptyState` renders when an authenticated user has zero workspace memberships, prompting them to create their first workspace.

---

## 6. App Shell

- **Workspace Rail**:
  - Rendered on desktop (`md:` and above). Hidden on mobile.
  - Displays brand icon (`TeamFlowLogo`).
  - Displays circular workspace icons with single-character initials and active indicator bar.
  - Shows switcher list only when 2+ workspaces exist (avoids redundant display).
  - Plus (`+`) button opens `CreateWorkspace` modal.
- **Sidebar**:
  - Displays current workspace header with avatar initial.
  - Primary navigation links: `Home` (`/app`).
  - `Channels` section: Header with `+` create button, lists public and private channels, active item indicator, chunked to 8 items with "Show all X channels" toggle.
  - `Direct Messages` section: Header with compose button, lists 1:1 and group conversations, presence dot, unread message count badges, chunked to 8 items with expand toggle.
  - Bottom navigation links: `Members` (`/app/settings/members`), `Workspace` (`/app/settings/workspace`), `Settings` (`/app/settings`).
- **Top Bar**:
  - Left: Hamburger toggle button (visible below `lg:`), Breadcrumb (`Workspace / Location`).
  - Right: Mobile search button (links to `/app/search`), desktop search input with `⌘K` / `Ctrl+K` keyboard shortcut, active notification bell with unread count badge and popover panel, and `UserMenu` profile dropdown.
- **Mobile Drawer (`MobileNavDrawer`)**:
  - Active below `lg:` breakpoint.
  - Implemented with React Portal, backdrop blur, CSS slide drawer animation, focus trap via `useModalDialog`, body scroll lock, and Escape key dismissal.
  - Contains mobile workspace switcher (when multiple workspaces exist) and reuses identical `Sidebar` navigation without markup duplication.

---

## 7. Channels

- **Channel Types**: `PUBLIC` and `PRIVATE`.
- **Creation Flow**: `CreateChannelDialog` validates name and description, radio selector for Public/Private. Posts to `POST /api/workspaces/:workspaceId/channels`. Slug generated from name. Creator automatically added to `ChannelMembership`. Broadcasts `channel:created` via Socket.IO.
- **Channel Access Control**: Backend middleware checks channel access. Private channels are only accessible to enrolled members; non-members receive 404/403.
- **Channel Lifecycle**:
  - Edit Channel: `EditChannelDialog` modifies name and description (`PATCH /api/workspaces/:id/channels/:channelId`).
  - Delete Channel: `ChannelDeleteDialog` removes channel (`DELETE /api/workspaces/:id/channels/:channelId`). Restores navigation to `/app`.
  - Leave Channel: `ChannelLeaveDialog` leaves membership (`POST /api/workspaces/:id/channels/:channelId/leave`).
  - Member Management: `ChannelMembersDialog` lists channel members, adds workspace members, removes channel members.
- **Channel Messaging**:
  - Cursor-paginated message retrieval (`GET /api/channels/:channelId/messages?cursor=...`).
  - Infinite scroll with older messages loading.
  - Realtime incoming messages via `message:new`.
  - Message editing (`PATCH /api/messages/:id`) and soft delete (`DELETE /api/messages/:id`).
  - Emoji reactions (`POST/DELETE /api/messages/:id/reactions`).
  - Mentions (`@username`, `@channel`) with autocomplete menu.
  - Attachments display and Cloudflare R2 file uploads.
  - Thread replies panel (`ThreadPanel`).

---

## 8. Direct Messages

- **DM Implementation**: Fully functional backend and frontend (NOT a UI mock).
- **Conversation Types**: 1:1 DMs (`DIRECT`) and Multi-party DMs (`GROUP`).
- **Starting a Conversation**: `StartDirectMessageDialog` allows selecting one or multiple workspace members. Calls `POST /api/workspaces/:workspaceId/direct-messages`. Returns existing 1:1 conversation if already created, or instantiates a new conversation.
- **Routing**: Accessible at `/app/dms/[conversationId]`.
- **Read Receipts & Unread Counts**: Tracked via `DirectMessageReadState`. Calling `POST /api/direct-messages/:conversationId/read` updates `lastReadMessageId` and clears unread badges in the sidebar.
- **Group Management**: `GroupMembersDialog` allows viewing group participants, adding members, or leaving the group conversation.
- **Feature Parity**: DM messaging supports threads, attachments, reactions, typing indicators, and message editing/deleting identically to channels.

---

## 9. Members & Invitations

- **Members Page**: Located at `/app/settings/members`.
- **Member Directory**: Fetches all workspace members with their assigned role (`OWNER`, `ADMIN`, `MEMBER`).
- **Role Modification**: Workspace `OWNER` can promote members to `ADMIN` or demote (`PATCH /api/workspaces/:id/members/:userId`).
- **Member Removal**: `OWNER` can remove non-owner members (`DELETE /api/workspaces/:id/members/:userId`). Kicks active Socket.IO connections from workspace rooms.
- **Invitation Flow**:
  - Admin/Owner triggers `InviteMemberDialog`.
  - Enters target email.
  - `POST /api/workspaces/:workspaceId/invitations` generates secure invitation token hash and expiration timestamp.
  - Dialog presents development acceptance link: `/invite/accept?token=<token>` (email delivery service is unconfigured in development).
  - Recipient visits link. If unauthenticated, redirected to sign-in preserving `next` parameter.
  - On acceptance, `POST /api/invitations/accept` verifies token validity, validates session email, creates `WorkspaceMembership`, marks invitation accepted, and redirects user to `/app`.
- **Pending Invitations**: Listed under Pending Invitations section on members page; allows revocation via `DELETE /api/workspaces/:id/invitations/:invitationId`.

---

## 10. Search

- **Route**: `/app/search`. Accepts query parameters: `?q=&type=&in=&from=&after=&before=&thread=`.
- **Scope & Types**:
  - `messages`: Full-text search over message contents with PostgreSQL FTS + pg_trgm similarity fallback. Respects channel and DM permissions.
  - `channels`: Searches accessible channel names and descriptions.
  - `users`: Searches workspace member names and emails.
- **Files Search**: **NOT IMPLEMENTED**. While UI placeholder copy references searching files, the search API schema only supports `messages`, `channels`, and `users`.
- **Filters**:
  - In channel / DM (`in:channel:<slug>`, `in:dm:<id>`).
  - From author (`from:<userId>`).
  - Date boundaries (`after:<iso>`, `before:<iso>`).
  - Thread mode (`include`, `only`, `exclude`).
- **Results**: Displays highlight snippet, date, author avatar, and deep link into message context in channel or DM.

---

## 11. Home Page (`WorkspaceHome`)

- **Context Row**: Displays uppercase "OVERVIEW" and current formatted date (`formatToday(now)`).
- **Greeting**: Time-based greeting ("Good morning", "Good afternoon", "Good evening") + user's first name.
- **Action Buttons**:
  - "Invite your team": Links to `/app/settings/members`.
  - "Create a channel": Opens `CreateChannelDialog`.
- **Quick-Start Cards**:
  1. *Bring your team together*: Links to `/app/settings/members`.
  2. *Keep work organized*: Opens `CreateChannelDialog`.
  3. *Find work faster*: Links to `/app/search`.
- **Recent Activity**:
  - Renders an honest empty state ("Nothing here yet. Invite your team or create a channel to get the conversation started.").
  - **No backend recent activity feed exists**. There is no API endpoint or database query fetching recent workspace activity; it defaults directly to the empty state without generating fake data.

---

## 12. Backend / API Matrix

| Feature | Frontend Component / Hook | API Route | Backend Module / Service | Database Model / Table | Operational Status |
|---|---|---|---|---|---|
| Authentication (Sign-up) | `SignUpForm.tsx` | `POST /api/auth/sign-up/email` | `better-auth` / Express | `User`, `Account` | Verified Real |
| Authentication (Sign-in) | `SignInForm.tsx` | `POST /api/auth/sign-in/email` | `better-auth` / Express | `User`, `Account`, `Session` | Verified Real |
| Session Identity | `useSessionUser.ts` | `GET /api/me` | `modules/auth/me.ts` | `Session`, `User` | Verified Real |
| User Profile | `ProfileContent.tsx` | `PATCH /api/me` | `modules/auth/me.ts` | `User` | Verified Real |
| Workspaces List | `useWorkspaces.tsx` | `GET /api/workspaces` | `modules/workspaces/routes.ts` | `WorkspaceMembership`, `Workspace` | Verified Real |
| Workspace Create | `CreateWorkspace.tsx` | `POST /api/workspaces` | `modules/workspaces/service.ts` | `Workspace`, `WorkspaceMembership` | Verified Real |
| Workspace Rename | `WorkspaceSettingsContent.tsx` | `PATCH /api/workspaces/:id` | `modules/workspaces/service.ts` | `Workspace` | Verified Real |
| Workspace Delete | `WorkspaceSettingsContent.tsx` | `DELETE /api/workspaces/:id` | `modules/workspaces/service.ts` | `Workspace` (Cascade) | Verified Real |
| Workspace Members | `MembersContent.tsx` | `GET /api/workspaces/:id/members` | `modules/workspaces/service.ts` | `WorkspaceMembership`, `User` | Verified Real |
| Channels List | `useWorkspaceChannels.ts` | `GET /api/workspaces/:id/channels` | `modules/channels/service.ts` | `Channel`, `ChannelMembership` | Verified Real |
| Channel Create | `CreateChannelDialog.tsx` | `POST /api/workspaces/:id/channels` | `modules/channels/service.ts` | `Channel`, `ChannelMembership` | Verified Real |
| Channel Update | `EditChannelDialog.tsx` | `PATCH /api/workspaces/:id/channels/:cId`| `modules/channels/service.ts` | `Channel` | Verified Real |
| Channel Delete | `ChannelDeleteDialog.tsx` | `DELETE /api/workspaces/:id/channels/:cId`| `modules/channels/service.ts` | `Channel` (Cascade) | Verified Real |
| Channel Messages | `useMessages.ts` | `GET/POST /api/channels/:cId/messages` | `modules/messages/service.ts` | `Message`, `Attachment` | Verified Real |
| Message Edit / Delete | `MessageEditor.tsx`, `DeleteMessageDialog.tsx` | `PATCH/DELETE /api/messages/:id` | `modules/messages/service.ts` | `Message` (Soft delete) | Verified Real |
| Reactions | `MessageReactions.tsx` | `POST/DELETE /api/messages/:id/reactions`| `modules/messages/service.ts` | `MessageReaction` | Verified Real |
| Mentions | `MessageComposer.tsx` | Parsed during message save | `modules/mentions/service.ts` | `MessageMention` | Verified Real |
| Direct Messages | `useDirectConversations.ts` | `GET/POST /api/workspaces/:id/direct-messages` | `modules/direct-messages/service.ts`| `DirectMessageConversation` | Verified Real |
| DM Messages | `useDirectMessages.ts` | `GET/POST /api/direct-messages/:id/messages` | `modules/direct-messages/service.ts`| `Message` | Verified Real |
| DM Read Receipts | `useDirectMessages.ts` | `POST /api/direct-messages/:id/read` | `modules/direct-messages/service.ts`| `DirectMessageReadState` | Verified Real |
| Search | `useSearch.ts` | `GET /api/workspaces/:id/search` | `modules/search/service.ts` | `Message`, `Channel`, `User` | Verified Real |
| Invitations Create | `InviteMemberDialog.tsx` | `POST /api/workspaces/:id/invitations` | `modules/invitations/service.ts` | `Invitation` | Verified Real (Dev Link) |
| Invitations Accept | `invite/accept/page.tsx` | `POST /api/invitations/accept` | `modules/invitations/service.ts` | `Invitation`, `WorkspaceMembership` | Verified Real |
| Notifications | `useNotifications.ts` | `GET /api/workspaces/:id/notifications` | `modules/notifications/service.ts` | `Notification` | Verified Real |
| Notification Preferences | `NotificationPreferencesForm.tsx` | `GET/PUT /api/users/me/notification-preferences` | `modules/notifications/preferences.service.ts` | `UserNotificationPreference` | Verified Real |
| File Attachments | `AttachmentDisplay.tsx` | `POST /api/messages/:id/attachments/presign` | `modules/storage/service.ts` | `Attachment`, Cloudflare R2 | Verified Real |
| File Search | None | None | None | None | **Missing** |
| Recent Activity Feed | `WorkspaceHome.tsx` | None | None | None | **UI Empty State Only** |

---

## 13. Database Models

The schema is defined in `packages/db/prisma/schema.prisma` targeting PostgreSQL.

### Core Models & Relationships

1. **`User`**: Core user record. Linked to Better Auth (`sessions`, `accounts`), `memberships`, `channelMemberships`, `messages`, `reactions`, `sentInvitations`, `directMessageParticipants`, and `attachments`.
2. **`Session`**: Session tokens, expiration dates, IP, and userAgent managed by Better Auth.
3. **`Account`**: OAuth credentials and passwords managed by Better Auth.
4. **`Verification`**: Email verification and reset tokens managed by Better Auth.
5. **`Workspace`**: Multi-tenant workspace record (`id`, `name`, `slug`, `createdAt`, `updatedAt`).
6. **`WorkspaceMembership`**: Many-to-many relationship joining `User` and `Workspace` with role enum: `OWNER`, `ADMIN`, `MEMBER`.
7. **`Invitation`**: Pending workspace invitations with hashed token, invited-by user, email, expiration, and accepted/revoked timestamps.
8. **`Channel`**: Channel records scoped to a workspace (`type`: `PUBLIC` | `PRIVATE`).
9. **`ChannelMembership`**: Membership mapping users to channels.
10. **`Message`**: Unified message entity supporting both channel messages (`channelId`) and DM messages (`directMessageConversationId`). Supports self-referential threading (`parentMessageId`, `replyCount`, `latestReplyAt`), soft deletes (`deletedAt`), and edits (`editedAt`).
11. **`Attachment`**: File attachments referencing `Message` and uploader `User`, tracking file size, mimeType, and unique Cloudflare R2 `storageKey`.
12. **`MessageReaction`**: Emoji reactions on messages (`unique([messageId, userId, emoji])`).
13. **`MessageMention`**: Tracks `@` mentions for messages and recipient users.
14. **`Notification`**: Realtime & persistent notifications (`MENTION`, `DM_MESSAGE`, `GROUP_MESSAGE`, `THREAD_REPLY`).
15. **`UserNotificationPreference`**: User preferences for notification delivery per type (`ALL` | `NONE`).
16. **`DirectMessageConversation`**: 1:1 and group conversations (`type`: `DIRECT` | `GROUP`).
17. **`DirectMessageParticipant`**: Participants in a conversation (`role`: `ADMIN` | `MEMBER`).
18. **`DirectMessageReadState`**: Tracks `lastReadMessageId` and `lastReadAt` per user and conversation.

**Unused / Dead Models**: None. Every model in `schema.prisma` is actively utilized by corresponding services and controllers.

---

## 14. Realtime System

- **Engine**: Socket.IO 4.8.3 on backend; `socket.io-client` 4.8.3 on frontend.
- **Handshake Authentication**: Authenticates incoming socket handshakes using session cookies validated against Better Auth.
- **Room Topology**:
  - `user:${userId}`: User-specific private room for notifications, workspace deletions, and membership revocations.
  - `channel:${channelId}`: Broadcasts channel message events, edits, deletes, reactions, and typing indicators.
  - `direct-message:${conversationId}`: Broadcasts DM messages, reactions, read receipts, and typing indicators.
- **Event Catalog**:
  - Messages: `message:new`, `message:updated`, `message:deleted`.
  - Reactions: `reaction:added`, `reaction:removed`.
  - Typing: `typing:start` -> `typing:started`, `typing:stop` -> `typing:stopped`.
  - Presence: `presence:changed` (online/offline tracking via in-memory `presenceRegistry`).
  - Channels: `channel:created`, `channel:updated`, `channel:deleted`, `channel:membership-removed`.
  - Conversations: `conversation:created`, `conversation:read`, `conversation:updated`, `conversation:participant-added`, `conversation:participant-removed`.
  - Workspaces: `workspace:deleted`, `workspace:membership-removed`.
  - Notifications: `notification:new`, `notification:read`, `notification:read-all`.
- **Status**: **Fully Implemented**.

---

## 15. State Management

- **Local React State**: Component-level state (`useState`, `useReducer`, `useRef`) for ephemeral interactions (composer text, modal toggles, dropdowns).
- **Context**: `WorkspacesProvider` provides a unified workspace store (`useWorkspaces`), ensuring rail, top bar, and main views stay synchronized without prop drilling.
- **Custom Domain Hooks**:
  - `useSessionUser`: Authoritative session identity from `/api/me`.
  - `useWorkspaceChannels`: Channel list and subscriptions.
  - `useWorkspaceChannel`: Individual channel metadata.
  - `useMessages` & `useDirectMessages`: Cursor-paginated message feeds, optimistic mutations, and Socket.IO event merges.
  - `usePresence`: Tracks member online/offline status.
  - `useTyping`: Manages typing debouncing and presence.
  - `useNotifications`: Paginated notification stream and unread counts.
  - `useSearch`: URL search query synchronization.
- **Caching**: LocalStorage for `teamflow:selected-workspace-id`; in-memory cache for presigned R2 download URLs (`attachmentDownloadUrlCache`).
- **Resync on Reconnect**: `onRealtimeReconnect` listeners silently refetch authoritative data without flickering loading skeletons.

---

## 16. Loading States

- **`AppShellSkeleton`**: Full shell skeleton with pulsating rail, sidebar, and content placeholders during initial authentication and workspace resolution.
- **`MessageListSkeleton`**: Message feed skeleton for channels and DMs.
- **Notification Skeleton**: Pulsating avatar and rows in `NotificationCenter`.
- **Sidebar Skeletons**: Pulsating bars in channels and DM sections during initial load.
- **Button Loading States**: Disabled buttons with spinners and text swaps ("Signing in…", "Creating channel…", "Saving…", "Deleting…").

---

## 17. Error States

- **`LoadErrorPanel` / `LoadError`**: Retryable error card displayed when session or workspace loading fails.
- **Form Error Panels (`AuthError`)**: Displays server-provided error messages or safe fallbacks on sign-in, sign-up, workspace creation, channel creation, etc.
- **In-line Mutation Errors**: Composer and edit dialogs display localized error banners when API calls fail, preserving user draft text.
- **Not Found States**: `ChannelNotFound` and `ConversationNotFound` handle 404 responses gracefully with return-home CTAs.

---

## 18. Empty States

- **No Workspace**: `WorkspaceEmptyState` guides the user to create their first workspace.
- **No Channels / Inaccessible**: Displays prompt to create a channel.
- **No Messages in Channel**: `ConversationEmptyState` with channel name and starter prompt.
- **No DMs in Conversation**: `DirectMessageEmptyState` with peer initial and starter prompt.
- **No DMs in Sidebar**: "No messages yet. Start a conversation" prompt.
- **No Notifications**: "You're all caught up. Mentions, direct messages, and thread replies will show up here."
- **No Search Results**: `SearchNoResultsState` with query echo, active filter indicators, and a "Clear filters" action.
- **Recent Activity Empty State**: Honest placeholder on `WorkspaceHome` ("Nothing here yet.").

---

## 19. Mock & Fake Data Audit

- **Core Application**: **ZERO fake or mock data**. No hardcoded users, no fake chats, no demo messages. All application data originates from PostgreSQL and Express.
- **Marketing Pages (`apps/web/components/landing/*`)**: Static marketing content, hero preview mockups, and value pillar descriptions for public promotional purposes.
- **Recent Activity (`WorkspaceHome.tsx`)**: Static empty state ("Nothing here yet"). No mock activity is generated.
- **Development Invitation Link**: Because transactional email delivery is not configured, the backend generates an invitation token displayed directly in the dialog as a local acceptance URL.

---

## 20. Responsive Behavior

- **Desktop (>= 1024px)**: Complete multi-column interface: 60px Workspace Rail + 240px Navigation Sidebar + Top Bar + Main Content Area + Optional Thread Panel.
- **Tablet (768px - 1023px)**: Workspace Rail remains visible; Navigation Sidebar collapses into the `MobileNavDrawer` triggered by the TopBar hamburger menu.
- **Mobile (< 768px)**: Workspace Rail collapses; workspace switching moves inside `MobileNavDrawer`. Top bar search input collapses to a search icon button linking to `/app/search`. Messages, composers, and dialogs adjust to 100% viewport width with safe area inset padding (`env(safe-area-inset-bottom)`).

---

## 21. Accessibility

- **Semantic Structure**: Proper use of `<header>`, `<nav>`, `<main>`, `<section>`, `<ol>`, `<ul>`, `<fieldset>`, `<legend>`.
- **Skip Link**: `<a href="#main-content">Skip to content</a>` present in `AppShell`.
- **Modal Accessibility (`apps/web/components/app/dialog.tsx`)**:
  - Follows WAI-ARIA Dialog (Modal) pattern.
  - Sets `aria-modal="true"`, `role="dialog"` or `role="alertdialog"`.
  - Focus is trapped within modal while open; background elements marked `inert`.
  - Escape key closes modal.
  - Focus returns to the trigger element upon closing.
- **Keyboard Navigation**:
  - Full arrow key navigation in menus (`useMenuKeyboard`).
  - Global `⌘K` / `Ctrl+K` shortcut to focus search input.
- **Touch Targets**: Uses `.touch-hit` utility providing a minimum 44px hit area for mobile/touch interactions.
- **Reduced Motion**: Honored via `motion-reduce:active:scale-100` and CSS transitions.

---

## 22. Technical Debt

1. **Unhandled `AbortError` in `use-notifications.ts`**:
   - `fetchNotifications` throws an `AbortError` when an `AbortController.signal` is aborted on component unmount.
   - The caller in `use-notifications.ts` does not wrap `await fetchNotifications(...)` in a `try...catch` block.
   - Result: 5 test files in `@teamflow/web` trigger 25 unhandled promise rejection errors during test teardown.
2. **Missing Transactional Email Service**:
   - Invitation emails cannot actually be sent over SMTP/Resend. Users must manually copy the development invitation link.
3. **No File Search Capability**:
   - The search engine indexes messages, channels, and users, but does not index attachments or files despite UI placeholder copy mentioning files.
4. **Recent Activity Feed is Static**:
   - `WorkspaceHome` lacks an activity aggregator query across audit logs/events.

---

## 23. Known Bugs

1. **`AbortError` Unhandled Rejection on Notification Hook Unmount**:
   - In `apps/web/lib/notifications.ts` line 242-245, when `error.name === 'AbortError'`, the error is re-thrown.
   - In `apps/web/lib/use-notifications.ts` line 153, the call `await fetchNotifications(...)` is not caught, causing an unhandled promise rejection when the component unmounts while a request is in flight.

---

## 24. Verified Functionality

- Full authentication lifecycle (email/password sign-up, sign-in, session verification, logout).
- Route protection with server-side Edge middleware and client guards.
- Multi-tenant workspace management (creation, deterministic selection, switching, renaming, deletion, empty states).
- Public and private channel management (creation, listing, editing, deleting, leaving, member management).
- Full channel message lifecycle (posting, cursor pagination, editing, soft deleting, threading, reactions, mentions, attachments).
- 1:1 and group direct messaging (creation, listing, unread tracking, read receipts, threading, reactions, attachments).
- Realtime communication with Socket.IO (messages, reactions, typing indicators, presence, notifications, workspace lifecycle).
- Workspace member management (role promotion/demotion, member expulsion).
- Workspace invitation workflow (invitation generation, revocation, and token-based acceptance).
- Permission-aware workspace search (messages, channels, users with hybrid FTS and trigram matching).
- Notification system (realtime delivery, unread counts, mark as read, mark all read, notification preferences).
- User profile management (display name and avatar editing).
- S3 / Cloudflare R2 file attachments (presigned uploads, signed downloads, deletion).
- Accessible modal dialogs and responsive navigation drawer.

---

## 25. Partially Implemented Functionality

- **Workspace Invitations**: Fully functional database and token logic, but relies on a manual development link because email dispatch is not configured.
- **Search System**: Fully functional for messages, channels, and members, but does not search attachments/files.

---

## 26. UI-Only / Mock Functionality

- **Recent Activity on Home**: Renders a static empty state card ("Nothing here yet") without querying a real activity feed.
- **Marketing Landing Page (`/`)**: Displays static mockups and marketing preview graphics.

---

## 27. Missing Functionality

- **File / Attachment Content Search**: Indexing and searching uploaded file contents.
- **Recent Activity Feed API**: An endpoint or service to aggregate workspace audit/activity events.
- **Live Email Dispatch**: Integration with an email provider (e.g. Resend, SendGrid) for invitation delivery and email verification.

---

## 28. Files Relevant to Future UI Work

### Shell & Core Chrome
- `apps/web/components/app/AppShell.tsx`: Root authenticated shell layout.
- `apps/web/components/app/WorkspaceRail.tsx`: Desktop workspace switcher rail.
- `apps/web/components/app/Sidebar.tsx`: Channels, DMs, and workspace navigation sidebar.
- `apps/web/components/app/TopBar.tsx`: Breadcrumb, search bar, active indicator, notifications, and user menu.
- `apps/web/components/app/MobileNavDrawer.tsx`: Responsive navigation drawer for mobile/tablet.
- `apps/web/components/app/AppShellSkeleton.tsx`: Main loading skeleton.

### Home & Pages
- `apps/web/app/app/page.tsx`: `/app` workspace home route.
- `apps/web/components/app/WorkspaceHome.tsx`: Greeting, overview, action buttons, quick-start cards, and activity section.
- `apps/web/components/app/WorkspaceEmptyState.tsx`: Zero-workspaces view.

### Channels & Messaging
- `apps/web/app/app/channels/[slug]/page.tsx`: Channel view container.
- `apps/web/app/app/dms/[conversationId]/page.tsx`: DM view container.
- `apps/web/components/app/MessageRow.tsx`: Individual message layout, actions, reactions, and attachments.
- `apps/web/components/app/MessageComposer.tsx`: Input box, toolbar, attachment button, mention autocomplete.
- `apps/web/components/app/ThreadPanel.tsx`: Side panel for threaded discussion replies.
- `apps/web/components/app/MessageReactions.tsx` & `EmojiPicker.tsx`: Emoji reaction triggers and picker popover.
- `apps/web/components/app/AttachmentDisplay.tsx`: Attachment preview cards and download triggers.
- `apps/web/components/app/TypingIndicator.tsx`: Realtime typing indicator.
- `apps/web/components/app/PresenceIndicator.tsx`: Online/offline status indicator dot.

### Dialogs & Modals
- `apps/web/components/app/dialog.tsx`: Core accessible Dialog and menu hooks (`useModalDialog`, `useMenuKeyboard`).
- `apps/web/components/app/CreateWorkspace.tsx`: Workspace creation form.
- `apps/web/components/app/CreateChannelDialog.tsx`: Channel creation dialog.
- `apps/web/components/app/EditChannelDialog.tsx`: Channel renaming/description edit dialog.
- `apps/web/components/app/ChannelDeleteDialog.tsx`: Channel deletion confirmation.
- `apps/web/components/app/ChannelMembersDialog.tsx`: Channel member list and invite dialog.
- `apps/web/components/app/StartDirectMessageDialog.tsx`: DM creation and member picker dialog.
- `apps/web/components/app/InviteMemberDialog.tsx`: Workspace team invitation dialog.
- `apps/web/components/app/DeleteMessageDialog.tsx`: Message deletion confirmation modal.

### Search & Notifications
- `apps/web/app/app/search/page.tsx`: Search page route.
- `apps/web/components/search/SearchFilters.tsx`: Search filter pills and controls.
- `apps/web/components/search/SearchResults.tsx`: Search results list and highlighting.
- `apps/web/components/notifications/NotificationCenter.tsx`: Bell icon, popover panel, and filter bar.
- `apps/web/components/notifications/NotificationItem.tsx`: Notification row item with deep link.
- `apps/web/components/notifications/NotificationPreferencesForm.tsx`: Notification delivery settings.

### Settings & Profile
- `apps/web/app/app/settings/page.tsx`: Settings navigation hub.
- `apps/web/components/app/ProfileContent.tsx`: Profile display name and avatar URL form.
- `apps/web/components/app/WorkspaceSettingsContent.tsx`: Workspace rename and danger zone deletion.
- `apps/web/components/app/MembersContent.tsx`: Workspace member list, role selector, and pending invitations.


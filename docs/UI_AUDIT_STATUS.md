# TeamFlow UI Audit Status

Phase 3 — page-by-page audit. Global inspection (Phase 1) complete on 2026-09-23. No code modified during inspection.

## Executive summary

The repo contains **two parallel web trees**:

| Tree | Location | Status |
|---|---|---|
| **Mock tree** (mounted) | `components/mock-views/*`, `components/mock-ui/*`, `lib/mock-data.ts`, `lib/mock-context.tsx` | Every `/app/*` route renders this. In-memory only, zero API calls. |
| **Real tree** (orphaned) | `components/app/*`, `components/search/*`, `components/notifications/*`, `lib/use-*.ts`, `lib/{messages,channels,members,…}.ts` | Fully written against the real API + Socket.IO. **Imported by no live route.** Its page tests are renamed `*.test.tsx.disabled`. |

Backend (`apps/api` + `packages/db`) is complete and healthy: Better Auth, Prisma/PostgreSQL, Socket.IO, authorization on every endpoint. Web ↔ API config is aligned (`NEXT_PUBLIC_API_URL=http://localhost:4000`, CORS `http://localhost:3000`).

**Critical gate:** `apps/web/middleware.ts:15-18` bypasses session checks for all of `/app/*` ("pure mock UI rebuild phase"). The authenticated area currently has **no auth gate**.

Integration strategy per the core rule: the mounted mock UI is the visual source of truth; the orphaned real tree + hooks + API are the functional source of truth. Per-page audits will connect the existing UI to existing hooks/API — not rebuild either side.

---

## 1. All application routes

| URL | File | Renders | Status |
|---|---|---|---|
| `/` | `apps/web/app/page.tsx` | `NewLanding*` marketing | Static marketing (honest — decorative mockups are aria-hidden) |
| `/sign-in` | `app/(auth)/sign-in/page.tsx` | `SignInForm` | **Functional** (Better Auth) |
| `/sign-up` | `app/(auth)/sign-up/page.tsx` | `SignUpForm` → `ProfileSetupStep` | **Functional** (Phase 4.1: account + avatar via `PATCH /api/me`) |
| `/invite/accept?token=` | `app/invite/accept/page.tsx` | self-contained | **Functional** (`GET /api/me`, `POST /api/invitations/accept`) |
| `/app` (layout) | `app/app/layout.tsx` | mock `AppProvider` + shell | **Mock**, unauthenticated |
| `/app` | `app/app/page.tsx` | `WorkspaceHomeView` | **Mock** |
| `/app/threads` | `app/app/threads/page.tsx` | `ThreadsView` | **Wired** (Audit 11) |
| `/app/mentions` | `app/app/mentions/page.tsx` | `MentionsView` | **Wired** (Audit 12) |
| `/app/drafts` | `app/app/drafts/page.tsx` | `DraftsView` | **Wired** (Audit 13) |
| `/app/search` | `app/app/search/page.tsx` | `SearchView` | **Wired** (Audit 05) |
| `/app/channels/[slug]` | `app/app/channels/[slug]/page.tsx` | `ChannelView` | **Wired** (Audit 03) |
| `/app/dms/[conversationId]` | `app/app/dms/[conversationId]/page.tsx` | `DmView` | **Wired** (Audit 04) |
| `/app/settings` | `app/app/settings/page.tsx` | `SettingsIndexView` | **Wired** (Audit 10) |
| `/app/settings/profile` | `…/profile/page.tsx` | `SettingsProfileView` | **Wired** (Audit 07) |
| `/app/settings/members` | `…/members/page.tsx` | `SettingsMembersView` | **Wired** (Audit 08) |
| `/app/settings/workspace` | `…/workspace/page.tsx` | `SettingsWorkspaceView` | **Wired** (Audit 09) |
| `/app/settings/notifications` | `…/notifications/page.tsx` | `SettingsNotificationsView` | **Wired** (Audit 06) |

No `loading.tsx` / `error.tsx` / `not-found.tsx` route files exist.

## 2. Routes fully functional

- `/sign-in` — Better Auth email sign-in → redirect `/app`.
- `/invite/accept` — real session + real invitation accept.
- `/sign-up` — Better Auth account creation + `ProfileSetupStep` persists avatar via `PATCH /api/me` (Phase 4.1).

## 3. Routes using mock/static data

**All 13 `/app/*` routes** (layout + 12 pages) render mock data via `lib/mock-context.tsx` seeded by `lib/mock-data.ts`:

- Hardcoded identity: "Alex Chen" / `alex.chen@teamflow.internal` / Unsplash avatar (`mock-data.ts:3-14`).
- Fake members (8 named people, `:16-90`), workspaces "Acme Flow / Orbit Labs / Hyperion AI" (`:94-121`), channels with static `unreadCount` and static time strings `'10:42 AM'`/`'Yesterday'` (`:124-290`), messages with static `'09:15 AM'` timestamps (`:294-464`), fake invite links `token=inv_982b1d` (`:466-481`).
- Landing `/` also uses hardcoded copy/metrics arrays — acceptable for marketing, not an audit target unless instructed.

## 4. Routes with partial backend integration

| Route | Real part | Missing part |
|---|---|---|
| ~~`/sign-up`~~ | `signUp.email` + `ProfileSetupStep` → `PATCH /api/me` | ~~localStorage-only avatar~~ — **fixed Phase 4.1** |
| `/sign-in` → `/app` | Real session cookie | `/app` itself ignores the session (middleware bypass) |
| Entire `/app` | Shares browser session cookies | No hooks/API wired; no auth gate |

## 5. Routes with missing backend logic

Backend gaps that block UI features (no endpoint/model today):

| Capability needed by UI | Missing |
|---|---|
| Channel unread badges (Sidebar renders `unreadCount`) | No `ChannelReadState`, no `GET` unread summary for channels, no `POST /channels/:id/read` |
| ~~`/app/drafts`~~ | ~~No `Draft` model, no CRUD API (and no localStorage fallback)~~ — **added Audit 13** (`GET/PUT /api/workspaces/:id/drafts`, `DELETE …/drafts/:draftId`) |
| ~~`/app/mentions` listing~~ | ~~No `GET /workspaces/:id/mentions`~~ — **added Audit 12** (`GET /api/workspaces/:id/mentions`) |
| ~~`/app/threads` listing~~ | ~~No `GET /workspaces/:id/threads`~~ — **added Audit 11** (`GET /api/workspaces/:id/threads`) |
| Sidebar star / mute | No persisted fields/endpoints (local `useState` only in orphaned Sidebar) |
| Message bookmark (mock UI toggle) | No model/endpoint |
| Composer formatting toolbar | UI feature absent from both trees — out of scope unless instructed |
| Files search type (`type=files`) | Search API supports `messages|users|channels` only |
| Email digest preference | Notification prefs API is `mention/dm/threadReply = ALL|NONE` only |
| Activity feed on home | No backend; `WorkspaceHome.tsx:11-14` documents honest empty state — **do not fake** |
| Private-channel member added / self-leave realtime | No `channel:membership-added` event; leave emits nothing |
| Workspace rename / role-change realtime | Only `workspace:deleted` and `workspace:membership-removed` exist |
| Invitation accepted → other admins' pending list | No event (refetch only) |

Unused-but-existing endpoint: `GET /api/workspaces/:id/direct-messages/unread` (web relies on list-row counts — fine).

## 6. Duplicated UI components (~20 near-duplicate pairs, 1,200+ overlapping lines)

| Real (orphaned) | Mock (mounted) | Identical lines |
|---|---|---|
| `components/app/Sidebar.tsx` | `mock-ui/shell/Sidebar.tsx` | 257 |
| `components/app/MessageComposer.tsx` | `mock-ui/feed/MessageComposer.tsx` | 93 |
| `components/app/MessageRow.tsx` | `mock-ui/feed/MessageItem.tsx` | 74 |
| `components/app/MembersContent.tsx` | `mock-views/SettingsMembersView.tsx` | 71 |
| `components/app/dialog.tsx` | `mock-ui/primitives/Dialog.tsx` | 45 |
| `components/app/TopBar.tsx` | `mock-ui/shell/TopBar.tsx` | 41 |
| `components/app/ProfileContent.tsx` | `mock-views/SettingsProfileView.tsx` | 34 |
| `components/app/{ChannelMembers,InviteMember,CreateWorkspace,CreateChannel}Dialog.tsx` | `mock-ui/shell/*` counterparts | 25–38 each |
| `components/app/HomeEditorialIllustration.tsx` | `mock-ui/home/HomeEditorialIllustration.tsx` | ~159 (identical) |
| `components/app/ThreadPanel.tsx` (573 lines) | `mock-ui/feed/ThreadPanel.tsx` (101 lines) | 23 |
| `components/notifications/*`, `components/search/*` | `SettingsNotificationsView`, `SearchView` | parallel implementations |

Logic duplication: greeting helper (`lib/greeting.ts`) re-implemented inline in `WorkspaceHomeView.tsx:18-23`; channel leave/delete/edit dialogs inlined in `ChannelView.tsx` vs dedicated `components/app/*Dialog.tsx`; two avatar components (`components/app/UserAvatar.tsx` vs `components/ui/Avatar.tsx`).

**Resolution policy (per-page):** keep the mounted visual surface; wire it to the real hooks. Where the orphaned real component is strictly better and visually identical, adopt its logic — but no broad redesign.

## 7. APIs already exist (complete inventory)

All behind `requireAuth` + domain authorization. Mounted in `apps/api/src/app.ts`.

- **Auth:** Better Auth `/api/auth/*`; `GET/PATCH /api/me`
- **Workspaces:** `POST/GET /api/workspaces`, `GET/PATCH/DELETE /api/workspaces/:id`, `GET /:id/members`, `PATCH/DELETE /:id/members/:userId` (OWNER), `GET /:id/presence`
- **Channels:** `POST/GET /api/workspaces/:id/channels`, `GET/PATCH/DELETE …/channels/:slug`, `GET/POST …/channels/:slug/members` (PRIVATE), `DELETE …/members/me`, `DELETE …/members/:userId`
- **Messages:** `POST/GET /api/channels/:id/messages` (cursor), `GET/POST /api/messages/:id/replies`, `PATCH/DELETE /api/messages/:id` (author), `GET/POST/DELETE /api/messages/:id/reactions…`
- **Attachments (R2 presigned):** `POST …/attachments/upload-url`, `POST …/finalize`, `GET /api/attachments/:id/download-url`, `DELETE /api/attachments/:id`
- **DMs:** `POST /api/workspaces/:id/direct-messages` (+`/group`), `GET /` (+`/unread`), `GET/POST/PATCH …/:conversationId`, participants add/remove/leave, `GET/POST …/messages`, `POST …/read`
- **Invitations:** `POST/GET/DELETE /api/workspaces/:id/invitations`, `POST /api/invitations/accept`
- **Search:** `GET /api/workspaces/:id/search` (FTS+trigram, permission-filtered, `type=messages|users|channels`)
- **Notifications:** `GET /api/workspaces/:id/notifications`, `POST …/:id/read`, `POST …/read-all`, `GET/PATCH /api/users/me/notification-preferences`

Web REST clients for every one of these exist in `lib/*.ts`. Env config verified aligned (§ above).

## 8. APIs missing

See §5 table (unread/drafts/mentions-list/threads-list/star/mute/bookmark/files-type/emails + the four realtime gaps). None should be built until the page that needs them is audited.

## 9. Database fields already supporting the UI

19 models. UI-relevant coverage: `WorkspaceMembership.role (OWNER|ADMIN|MEMBER)`, `Channel.type (PUBLIC|PRIVATE)` + `ChannelMembership`, `Message` (edit/soft-delete timestamps, `parentMessageId`, denormalized `replyCount/latestReplyAt`), `MessageReaction`, `MessageMention`, `Attachment` (storage keys), `Notification` (denormalized actor/channel names), `UserNotificationPreference` (`ALL|NONE` per mention/dm/threadReply), `DirectMessageConversation/Participant/ReadState`, Invitation with one-time token. Presence is intentionally in-memory (AGENTS rule) — correct.

## 10. Database changes possibly required

Only when the owning page is audited, smallest change first:

| Candidate | Trigger |
|---|---|
| `ChannelReadState` (or unread fields) | Sidebar/channel unread audit |
| `Draft` model | ~~`/app/drafts` audit~~ — **added Audit 13** (`Draft` + `DraftTargetKind`) |
| `ChannelMembership.isStarred/isMuted` | Sidebar star/mute persistence |
| `MessageBookmark` (maybe) | Only if bookmark ships |
| `Invitation.role` (maybe) | Only if invite-with-role ships |

Likely **no schema change** needed for: profile, workspace settings, members, notifications, search, DMs, channel room, home — APIs already match the UI.

## 11. Realtime functionality already exists

22 server→client events, all typed in `lib/realtime-client.ts`: `presence:changed`, `message:new/updated/deleted`, `reaction:added/removed`, `conversation:read/updated/created/participant-added/participant-removed`, `channel:created/updated/deleted/membership-removed`, `workspace:deleted/membership-removed`, `typing:started/stopped`, `notification:new/read/read-all`. Rooms: `user:{id}`, `channel:{id}` (server-authorized join), `direct-message:{id}`. Delivery only after DB commit (AGENTS rule 4). REST resync on reconnect.

## 12. Realtime functionality missing

- `channel:membership-added` (and any event on self-leave) — member lists go stale
- `workspace:updated` / member role-changed — settings need refetch/poll
- Invitation accepted → pending-list refresh for other admins
- Unread/star/mute/bookmark events — features not persisted at all (§5)
- Search results — correctly pull-based, not a gap

## 13. Pages to audit first (recommended order)

Rationale: re-enable the security gate, then follow the user journey from shell → core loop → peripherals. One page at a time; stop after each.

1. **`/app` shell + layout** (rail, sidebar, top bar, mobile drawer, toast, middleware auth gate) — every page sits on it; also restores the missing `/app` session check.
2. **`/app` home** — smallest end-to-end workspace wiring (`useWorkspaces` + channels), sets provider pattern for the rest.
3. **`/app/channels/[slug]`** — core loop: messages, composer, reactions, threads, typing, presence, attachments, realtime.
4. **`/app/dms/[conversationId]`** — reuses the channel-loop patterns.
5. **`/app/search`** — wires `useSearch` + filters/pagination.
6. **`/app/settings/notifications`** — smallest settings page (API already matches the form).
7. **`/app/settings/profile`** — `PATCH /api/me`.
8. **`/app/settings/members`** — members + invitations + presence.
9. **`/app/settings/workspace`** — rename/delete + danger zone.
10. **`/app/settings` index** — cards become real summaries.
11. **`/app/threads`** — needs new `GET /workspaces/:id/threads` (build then).
12. **`/app/mentions`** — needs new mentions listing (build then).
13. **`/app/drafts`** — ~~needs Draft model + API (build then; largest backend gap)~~ — **Wired (Audit 13)**.

Order can be overridden per instruction. Landing `/`, sign-in, sign-up, invite/accept are out of the `/app` audit loop unless named.

---

## Audit log

### Audit 01 — `/app` Shell + Layout (2026-09-23)

**Scope:** auth gate, session, workspaces, sidebar, topbar, notifications, avatars, mobile drawer, realtime badges, loading/error/empty states. No redesigns; only shell surfaces touched. `/app` Home page intentionally not started.

**Security / middleware**
- Removed the `/app` session bypass in `apps/web/middleware.ts`. Matcher now enforces `fetchSessionUser` on `/app/:path*` (plus the existing `/sign-in` `/next` validation). Unauthenticated visits redirect out of `/app`.

**DB (migration applied on Neon — no shadow DB, hand-written SQL + `prisma migrate deploy`)**
- `packages/db/prisma/migrations/20260923000000_add_channel_user_state_topic_invitation_role/`
  - `Channel.topic String?`
  - `Invitation.role` — `MEMBER|ADMIN` default `MEMBER` (Guest removed from invite UI)
  - New `channel_user_state` table: `unreadCount`, `hasUnread`, `lastReadMessageId`, `isStarred`, `isMuted`; unique `[channelId, userId]`

**API changes**
- Channels: optional `topic` on create/update; `PATCH /api/workspaces/:ws/channels/:slug/user-state` (star/mute flags); `POST …/channels/:slug/read` (mark-read, returns updated `userState`); list rows now include `userState`.
- Workspaces: optional custom `slug` on **create only** (regex `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, max 48). Rename still rejects `slug` (strict schema).
- Invitations: optional `role: MEMBER|ADMIN` persisted and granted on accept.
- Unread semantics mirror DMs: no state → count non-self root messages; `lastReadMessage` → strictly newer by `(createdAt, id)`; thread replies never count.

**Web / shell wiring (visual source of truth = mounted mock tree)**
- `app/app/layout.tsx`: `AppProvider` → `WorkspacesProvider` → new `ShellProvider`.
- `lib/shell-context.tsx` (new): exposes session, workspaces, channels, DMs, notifications, members, presence plus mutations (`createWorkspace`, `createChannel`, `inviteMember`, `toggleChannelStar`, `toggleChannelMute`, `markChannelRead`, `signOut`). Joins all channel Socket.IO rooms so `message:new` (emitted only to `channel:{id}`) bumps off-channel unread badges; auto mark-read on `/app/channels/:slug` pathname change; `signOut` → `getAuthClient().signOut()` + `router.replace('/sign-in')`.
- Rewired to `useShell()`: `mock-ui/shell/Sidebar.tsx`, `TopBar.tsx`, `CreateWorkspaceDialog.tsx`, `CreateChannelDialog.tsx`, `InviteMemberDialog.tsx` (real mutations, submit disabled + "Creating…", error branching on `result.kind` since only `validation|conflict` carry `message`).
- `MobileDrawer.tsx` verified — uses only `useApp()` UI flags (open/close); no change.
- `InviteMemberDialog` roles limited to MEMBER/ADMIN; invite link uses real `currentWorkspace.slug`.
- Lint fixes: removed unused `useState` import and an invalid `react-hooks/exhaustive-deps` disable (rule not in config); mark-read effect declared after `markChannelRead` callback (fixes TS2448/TS2454).

**Tests added/updated**
- API: channel topic + user-state/read schema unit tests; workspace slug create/reject-on-rename; invitation role security (`OWNER|GUEST` rejected) + ADMIN persisted & granted on accept.
- Web clients: `channels.test.ts` (topic payload, `updateChannelUserState`, `markChannelRead`), `workspaces.test.ts` (optional slug), `invitations.test.ts` (`createInvitation` role body + result mapping).
- `SignUpForm.test.tsx`: `next/navigation` mocked; success path now asserts the real post-signup `ProfileSetupStep` ("Set up your profile" / "Choose your profile photo" / Continue) instead of removed name/email labels.

**Verification (all green)**
- `pnpm typecheck` — 5/5 projects pass.
- `pnpm lint` — 4/4 lint targets pass.
- `pnpm test` — web 518/518, api 344 passed + 172 skipped (live-DB integration, gated on DATABASE_URL), db 3, shared 2. Earlier `search.test.ts` 401-vs-400 failure was load-flake; isolated re-run 16/16 pass.

**Known remaining issues (deferred to later pages — not faked)**
- Drafts, mentions/threads listings, files search type, email digests, activity feed: no backend yet (§5).
- `ProfileSetupStep` avatar still writes localStorage nobody reads (profile page will wire `PATCH /api/me`).
- Realtime gaps from §12 unchanged except channel-room join covers unread bumps.
- No dedicated `loading.tsx`/`error.tsx` route files yet.

**Files changed (shell scope):** `middleware.ts`, `app/app/layout.tsx`, `lib/shell-context.tsx` (new), `mock-ui/shell/{Sidebar,TopBar,CreateWorkspaceDialog,CreateChannelDialog,InviteMemberDialog}.tsx`, API channels/workspaces/invitations modules, Prisma schema + migration, web clients `channels.ts`/`workspaces.ts`/`invitations.ts`, tests listed above.

**Next:** Audit 02 — `/app` Home (`WorkspaceHomeView` + `useWorkspaces` + channels). Stopped after shell as instructed.

### Audit 02 — `/app` Home (2026-09-23)

**Scope:** `app/app/page.tsx` → `components/mock-views/WorkspaceHomeView.tsx`. Mock visual surface kept; wired to real session/workspace/dialog state with honest loading/error/empty states. No redesign, no fake data, no backend changes.

**UI issues found**
- View read `useApp()` only: identity came from mock `currentUser` ("Alex Chen") and `activeWorkspace` from seeded `INITIAL_WORKSPACES`.
- Inline `getGreeting()` duplicated `lib/greeting.ts`.
- No loading, error, unauthenticated, or empty-workspace states — always rendered the greeting shell.

**Functionality wired**
- `useShell()` for `session`, `workspaces`, `currentWorkspace`, `currentUser`.
- `useApp()` retained only for dialog UI flags (`setCreateChannelOpen`, `setInviteMemberOpen`, `setCreateWorkspaceOpen`) — shell dialogs from Audit 01 open and mutate for real.
- Greeting uses shared `firstNameOf` / `getGreeting` from `lib/greeting.ts`; falls back to "there" when name is blank.
- Honest states via a small `CenteredStatus` (same illustration/typography family as the home hero):
  - session or workspaces `loading`/`idle` → "Loading your workspace…"
  - session `error` → message from the store
  - session or workspaces `unauthenticated` → "Please sign in"
  - workspaces `error` → message + "Try again" → `workspaces.retry()`
  - ready with `currentWorkspace === null` → "Create your first workspace" → opens shell `CreateWorkspaceDialog`
- Happy path keeps the existing mock composition (illustration, greeting, workspace name, two CTAs).

**Static/mock found**
- Inline greeting helper removed; mock identity/workspace seed no longer consumed on this page.
- Orphaned real `components/app/WorkspaceHome.tsx` (Overview pill, 3 guidance cards, Recent activity empty state) **not adopted** — richer than the mounted mock visual source of truth; activity feed has no backend (§5) so the cards/activity surface stays out of scope.

**Backend gaps** — none new required. Activity feed still intentionally absent; empty state does not fake it.

**Files changed**
- `apps/web/components/mock-views/WorkspaceHomeView.tsx` (rewired)
- `apps/web/components/mock-views/WorkspaceHomeView.test.tsx` (new, 8 tests)

**Tests**
- New: greeting with real first name + workspace; "there" fallback; no mock identity/fake activity; CTAs open shell dialogs; loading; session error; workspaces error + retry; empty-workspace create CTA.
- `app/app/page.tsx` unchanged (already only mounts the view).

**Verification**
- Targeted: `WorkspaceHomeView` 8/8, `SignUpForm` 6/6, `NewLandingPrivacy` 2/2 pass isolated (full-suite 5s timeouts on the latter two re-ran clean — load flake).
- `pnpm typecheck` — 5/5 projects pass.
- `pnpm lint` — all packages pass.
- Full web suite: 526 tests, only the two known flaky timeouts under parallel load (both green isolated).

**Known remaining issues**
- No `app/app/loading.tsx` / `error.tsx` route files (page-level states live in the view instead).
- Orphaned `WorkspaceHome` cards (members/channels/search) and Recent activity remain unmounted — adopt only if a later instruction expands the home visual surface.
- Channels list not used by Home CTAs (create/invite open shell dialogs directly).

**Next:** Audit 03 — `/app/channels/[slug]` (core message loop). Stopped after Home as instructed.

### Audit 03 — `/app/channels/[slug]` (2026-09-23)

**Scope:** `app/app/channels/[slug]/page.tsx` → `components/mock-views/ChannelView.tsx` + shared feed (`mock-ui/feed/*`) + `ChannelMembersDialog`. Mock visual surface kept; wired to real channel/messages/members/typing/reactions/attachments APIs. No redesign of the mock composition.

**UI issues found**
- View was mock-only: identity, channel list, and messages all came from `useApp()` / `INITIAL_*` seeds; no loading/error/notFound/unauthenticated states.
- Shared feed components (`MessageFeed`, `MessageItem`, `MessageComposer`, `ThreadPanel`) typed against mock `Message` — rewrote them to real `lib/messages` `Message` (see files changed).
- Mock allowed edit/delete by owner/admin; real backend is own-message only (`canModify = isSelf`).
- Message bookmark had no backend — kept as local UI state (logged gap).
- Load-earlier affordance did not exist in the mock feed — added a "Load earlier messages" button when `hasMore` (pagination necessity, not a redesign).

**Functionality wired**
- `useShell()`: `session`, `currentWorkspace`, `currentUser`, `channels` (for `userState` merge — detail GET omits it), `members` (mention list + typing name map), `presence` (via MessageItem), `channelState.updateChannelState` / `removeChannel`, `toggleChannelStar` / `toggleChannelMute`.
- `useApp()` retained only for UI flags (`setChannelMembersOpen`) and `showToast`.
- `useWorkspaceChannel(workspaceId, slug)` → detail load with honest loading / notFound / unauthenticated / error+retry.
- `useMessages(channelId)` → root-message filter (`!parentMessageId`), send pipeline (send → per-file `uploadSingleAttachmentDraft` → silent `refresh`), edit/remove/removeAttachment, load-older, realtime already handled in hook.
- `useChannelMembers(workspaceId, slug, private)` for private count/add/remove; public channels have no `ChannelMembership` rows — header count falls back to workspace member count (matches "everyone in workspace can see it").
- `useTyping({channelId}, {currentUserId})` + real `TypingIndicator` above composer; `mentionMembers` from shell.members.
- Edit channel: `updateChannel` (name/topic/description only; never slug) → `setChannel` + `channelState.updateChannelState` → `push` when slug regenerated.
- Leave/delete: real API → `channelState.removeChannel` → `push('/app')`; errors via toast.
- Permission: edit/delete menu items only when `createdById === currentUser.id || role is OWNER|ADMIN`.
- Members dialog: dual mode — real `channel` prop uses API/workspace members; `conversation` prop left mock for Audit 04.

**Static/mock found**
- Mock identity/messages/members no longer consumed on this page; orphaned real `components/app/ChannelPage.tsx` not adopted (mock is the visual source of truth).
- `DmView` minimally adapted so typecheck stays green after shared-component type change (map mock→real for feed; async composer callback; prop-based ThreadPanel). DM threads hit real API with mock IDs until Audit 04.

**Backend gaps** — none new required. Message bookmarks have no endpoint (local only). Public channel membership not tracked (documented in dialog subtitle).

**Files changed**
- `apps/web/components/mock-views/ChannelView.tsx` (rewired)
- `apps/web/components/mock-ui/feed/{MessageFeed,MessageItem,MessageComposer,ThreadPanel}.tsx` (rewritten to real `Message`)
- `apps/web/components/mock-ui/shell/ChannelMembersDialog.tsx` (dual mode: real channel vs mock conversation)
- `apps/web/components/mock-views/DmView.tsx` (minimal typecheck adaptation for shared feed)
- `apps/web/lib/use-messages.ts`, `apps/web/lib/use-thread-messages.ts` (silent `refresh` for post-upload refetch)
- `apps/web/components/mock-views/ChannelView.test.tsx` (new, 11 tests)

**Tests**
- New: real channel header/empty state; loading; not-found + return home; error + retry; members dialog open; owner edit/delete menu; member cannot edit/delete; root-only feed; load-earlier; composer send; unauthenticated sign-in CTA.

**Verification**
- Targeted: `ChannelView` 11/11, `WorkspaceHomeView` 8/8, `use-messages` 30, `use-thread-messages` 21, `use-channel-members` 5 — all pass.
- `pnpm typecheck` — 5/5 projects pass.
- `pnpm lint` — all packages pass.

**Known remaining issues**
- DM conversation page still mock-driven for content (Audit 04); shared feed type bridge only.
- Threads/Mentions/Drafts nav still mock (later audits).
- No `loading.tsx`/`error.tsx` route files.
- Bookmark is local-only until a bookmarks API exists.
- Public-channel header member count uses workspace membership (by design — no private rows).

**Next:** Audit 04 — `/app/dms/[conversationId]`. Stopped after channel page as instructed.

### Audit 04 — `/app/dms/[conversationId]` (2026-09-23)

**Scope:** `app/app/dms/[conversationId]/page.tsx` → `components/mock-views/DmView.tsx` + shared feed + `ChannelMembersDialog` real conversation path. Mock visual surface kept; wired to real conversation/messages/typing/attachments/read APIs. No redesign.

**UI issues found**
- View was mock-only: participants, title, messages, and presence all came from `useApp()` seeds; no loading/error/notFound/unauthenticated states.
- After Audit 03 the shared feed accepted real `Message` but `DmView` still type-bridged mock messages and opened threads by mock id — thread panel hit real API with mock ids.
- Members dialog `conversation` prop was still the mock path.
- No mark-read on open — sidebar DM unread badges would never clear while viewing.

**Functionality wired**
- `useShell()`: `session`, `currentUser`, `members` (mention list not used — participants are the mention set for DMs), `presence` (header avatar + dialog), `dmState.markConversationLocallyRead` (optimistic sidebar badge clear).
- `useApp()` retained only for UI flags (`setChannelMembersOpen`) and `showToast`.
- `useDirectConversation(conversationId, currentUserId)` → detail load with honest loading / notFound / unauthenticated / error+retry; `setConversation` after group participant add/remove.
- `useDirectMessages(conversationId)` → root-message filter (`!parentMessageId`), send pipeline (send → per-file `uploadSingleAttachmentDraft` → silent `refresh`), edit/remove/removeAttachment, load-earlier, mark-read, realtime already handled in hook.
- `useTyping({conversationId}, {currentUserId})` + real `TypingIndicator` above composer; typing names map from `conversation.participants`.
- Mark-read: on latest root message id change → `messages.markRead(id)` + `shell.dmState.markConversationLocallyRead(conversationId, id)`.
- Header: group name or peer names; `participantCount` badge; presence Online/Offline for 1:1; group subtitle "N participants".
- Members dialog: new `directConversation` prop — real participants list; group admins get add/remove via `addConversationParticipant` / `removeConversationParticipant` → `onDirectConversationChange` updates page state. 1:1 is read-only list.
- ThreadPanel: `channelId={null}` (DM replies keyed by root message id via existing `fetchThreadReplies`).
- Mention members: `conversation.participants` (mentions API resolves DM participants only).

**Static/mock found**
- Mock identity/messages/members no longer consumed on this page; orphaned real `components/app/DmPage*` not adopted.
- Mock `conversation` prop path on `ChannelMembersDialog` kept as legacy fallback only when neither real prop is set.

**Backend gaps** — none new required for this page. Leave-group exists (`leaveGroupConversation`) but mock UI had no leave control — not added (no redesign).

**Files changed**
- `apps/web/components/mock-views/DmView.tsx` (rewired to real hooks)
- `apps/web/components/mock-ui/shell/ChannelMembersDialog.tsx` (real `directConversation` path + `onDirectConversationChange`)
- `apps/web/lib/use-direct-messages.ts` (silent `refresh` for post-upload refetch)
- `apps/web/lib/use-direct-messages.test.ts` (refresh test)
- `apps/web/lib/use-messages.ts`, `apps/web/lib/use-thread-messages.ts` (same `refresh` merge fix)
- `apps/web/lib/messages.ts` (`pickAuthoritativeMessage`/`mergeMessages` gained `preferIncomingOnTie` so attachment-only refetches land when `updatedAt` is unchanged)
- `apps/web/components/mock-views/DmView.test.tsx` (new, 12 tests)

**Tests**
- New: peer header/empty state; loading; not-found + return home; error + retry; unauthenticated; participants dialog open; group name/count; root-only feed; mark-read on load; load-earlier; composer send; messages notFound → feed error.

**Verification**
- Targeted (9 files): 153/153 pass — `DmView` 12, `ChannelView` 11, `WorkspaceHomeView` 8, `use-direct-messages` 19, `use-direct-conversation` 3, `use-messages` 30, `use-thread-messages` 21, `use-channel-members` 5, `messages` 44.
- `pnpm -r typecheck` — 5/5 projects pass.
- `pnpm -r lint` — all packages pass.

**Known remaining issues**
- Threads/Mentions/Drafts nav still mock (later audits).
- Settings routes still mock (later audits).
- No `loading.tsx`/`error.tsx` route files.
- Bookmark is local-only until a bookmarks API exists.
- Public-channel header member count uses workspace membership (by design — no private rows).
- Shell DM unread bump on `message:new` does not exclude the currently open conversation (mark-read effect clears it immediately after).

**Next:** Audit 05 — `/app/search` (per recommended order). Stopped after DM page as instructed.

### Audit 05 — `/app/search` (2026-09-23)

**Scope:** `app/app/search/page.tsx` → `components/mock-views/SearchView.tsx`. Mock visual chrome kept (header, form, type pills, filter bar, count announcer, load-more); wired to real `useSearch` + URL contract + tested `components/search/*` state/result panels. No redesign.

**UI issues found**
- View filtered `useApp()` mock `messages`/`channels`/`members` client-side — no API, no permission filtering, static timestamps.
- “All results” / “Files” pills implied pools the backend does not have (`type` is `messages|users|channels` only; no file-search index).
- “In:” filter sent channel **ids**; backend expects `in=channel:<slug>` (or `in:dm:<conversationId>`).
- No loading / error / unauthenticated / empty-query states — only client empty after in-memory filter.
- Parallel real stack (`lib/search.ts`, `lib/use-search.ts`, `components/search/*`) existed but was unused by the mounted page.

**Functionality wired**
- URL is source of truth: `parseSearchParams` / `serializeSearchParams` (`q`, `type`, `in`, `from`, …).
- `useShell()`: `currentWorkspace.id` (search workspace), `channels` (In options as `channel:<slug>`), `members` (From options by `user.id`).
- `useSearch(workspaceId, filters)` → debounced fetch, stale-request guard, cursor `loadMore`, `retry`, `loadMoreError`.
- Type pills: Messages / Channels / People (`messages|channels|users`); switching off messages clears `in`/`from`.
- Filters (`In:`, `From:`) shown only for `type=messages` (users/channels routes ignore them); “Reset filters” clears both.
- Results render via tested `SearchResultList` (snippet highlights, location labels, deep links). Message open → `messageSearchResultUrl`; channel open → `channelSearchResultUrl` (null → no navigation).
- States: no workspace → “No workspace selected”; idle/empty query → `SearchEmptyQueryState`; loading skeleton; unauthenticated/error → `SearchErrorState` + retry; ready empty → `SearchNoResultsState`; ready → list + “Load more results” when `hasMore`.
- Composer submit pushes `q` into the URL (Shareable). Clear keeps active type/filters.

**Static/mock found**
- Mock seed messages/channels/members no longer consumed on this page.
- Mock “All results” and “Files” pills removed — backend has no multi-type search and no file index (documented gap, not a fake control).

**Backend gaps** — none new required. Known limits accepted (not fake-wired):
- No multi-type “all” search (one `type` per request).
- No attachment/file search.
- No date/thread filter UI in the mock chrome (API supports `after`/`before`/`thread` via URL if added later).
- User results carry no presence/email (API returns `id|name|image|score` only).

**Files changed**
- `apps/web/components/mock-views/SearchView.tsx` (rewired to `useSearch` + shell + `components/search/*`)
- `apps/web/components/mock-views/SearchView.test.tsx` (new, 15 tests)

**Tests**
- New: empty-query prompt; no-workspace panel; ready results + announcer; loading skeleton; error + retry; unauthenticated; empty results; form submit → URL; type pill clears message filters; channel In options are slugs; From options from members; filters hidden off messages; load-more; load-more error keeps page; message deep-link navigation.

**Verification**
- Targeted (5 files): 52/52 pass — `SearchView` 15, `use-search` 9, `search` 13, `SearchResults` 12, `SearchFilters` 3.
- `pnpm -r typecheck` — 5/5 projects pass.
- `pnpm -r lint` — all packages pass.

**Known remaining issues**
- Settings routes still mock (later audits).
- Threads/Mentions/Drafts still mock (later audits).
- No `loading.tsx`/`error.tsx` route files.
- Parallel `components/search/SearchFilters` remains unused by the mounted view (mock chrome keeps its pill+filter layout); results half of the parallel stack is now shared.

**Next:** Audit 06 — `/app/settings/notifications` (per recommended order). Stopped after search as instructed.

### Audit 06 — `/app/settings/notifications` (2026-09-23)

**Scope:** `app/app/settings/notifications/page.tsx` → `components/mock-views/SettingsNotificationsView.tsx`. Mock visual chrome kept (header, fieldset cards, save button, toast, error banners); wired to real `useNotificationPreferences` + `GET/PATCH /api/users/me/notification-preferences`. No redesign.

**UI issues found**
- View used local `useState` prefs + fake `setTimeout` save — no API, no load/error states, mock-only option values (`direct_only`, `participating`, email digest) that the backend cannot represent.
- Parallel orphaned `components/notifications/NotificationPreferencesForm` existed (immediate-save ALL/NONE toggles) but was unused and uses a different visual layout than the mounted mock cards.

**Functionality wired**
- `useNotificationPreferences()` — load on mount, honest `loading` / `error`+`retry` states, `savePreferences` batch PATCH on form submit, optimistic update + rollback, `saveError` banner with dismiss (`clearSaveError`).
- Draft form state mirrors loaded prefs; Save is disabled until dirty or while saving; success → local `saveSuccess` indicator + `showToast`.
- Radio values map 1:1 to backend `ALL|NONE` for `mentionDelivery` / `dmDelivery` / `threadReplyDelivery`.
- On save failure, draft rolls back to pre-save preferences (matches hook rollback).

**Static/mock found / removed (backend gaps — not faked)**
- “Direct mentions only” option removed — API only accepts `ALL|NONE`.
- “Threads I am participating” option removed — same binary constraint; remaining copy is “Notify on thread replies” / “Never notify for thread replies”.
- **Email digests fieldset removed** — no backend field (documented §5/§10). No fake control left.
- Mock `setTimeout` fake save and fake initial defaults removed.

**Backend gaps** — none new required. Known limits accepted:
- No email digest preference.
- No intermediate mention/thread tiers (only `ALL|NONE`).

**Files changed**
- `apps/web/components/mock-views/SettingsNotificationsView.tsx` (rewired to `useNotificationPreferences`)
- `apps/web/lib/use-notification-preferences.ts` (added `savePreferences` batch + `clearSaveError`; `updatePreference` delegates to batch)
- `apps/web/components/mock-views/SettingsNotificationsView.test.tsx` (new, 8 tests)

**Tests**
- New: loading state; reflects loaded values; hides unsupported mock-only controls; load error + retry; dirty-only save + toast + success indicator; save failure rollback + dismiss; pre-rendered save error banner; no combobox/email-digest control.
- Existing `use-notification-preferences.test.ts` (load, retry, optimistic updatePreference, rollback) must stay green with the batch refactor.

**Verification**
- Targeted: `SettingsNotificationsView` 8, `use-notification-preferences` 4 — pass.
- `pnpm -r typecheck` — 5/5 projects pass.
- `pnpm -r lint` — all packages pass.

**Known remaining issues**
- Settings profile/members/workspace/index still mock at the time of this audit (profile completed in Audit 07).
- Threads/Mentions/Drafts still mock (later audits).
- No `loading.tsx`/`error.tsx` route files.
- Parallel `NotificationPreferencesForm` remains unused (different visual; mock cards kept as source of truth).

**Next:** Audit 07 — `/app/settings/profile` (per recommended order). Stopped after notifications as instructed.

### Audit 07 — `/app/settings/profile` (2026-09-23)

**Scope:** `app/app/settings/profile/page.tsx` → `components/mock-views/SettingsProfileView.tsx`. Mock visual chrome kept (header, AvatarSelector panel, Personal Details card, Account information card, Save button); wired to real `useShell()` session/workspace/members + `updateProfile` (`PATCH /api/me`). No redesign.

**UI issues found**
- View read `useApp()` mock identity (`currentUser` = "Alex Chen", mock `activeWorkspace`); saved via in-memory `updateCurrentUser` only.
- Hardcoded `"Joined September 2026"` fake date.
- Mock-only fields: **Title or role** and **Status message** — no backend columns/endpoint (§5/§10).
- `avatarType` is UI-only (initials vs photo); backend stores `image` URL or null only.

**Functionality wired**
- `useShell()`: `session` (incl. `setUser`), `currentUser`, `currentWorkspace`, `members` (membership `createdAt` → "Joined Month Year").
- Draft form state hydrated once per user id from real `name` / `image`.
- `AvatarSelector` kept: professional portraits / upload / initials → draft `avatarUrl` + `avatarType`; initials maps to `image: null` on save.
- Client validation: `validateProfileName` / `validateProfileImage` (focus first invalid field).
- Save: `updateProfile(apiBase, { name, image })` → on success `session.setUser(result.user)` + `showToast` + local success indicator; on failure show `role=alert` without touching session.
- Honest session states: loading / unauthenticated message / error message before form; submit disabled while saving.

**Static/mock found / removed**
- Title and Status message fields removed — no backend (not faked).
- Mock identity + fake join date removed.
- Workspace + join rows hidden when no workspace / membership not ready.
- Account information email comes from real session user.

**Backend gaps** — none new required. Known limits accepted:
- No `title` / `statusText` profile fields (would need schema + API — deferred).
- No avatar file upload to object storage — file picker still produces a data URL; large data URLs fail the API's 2048-char URL limit (honest validation error, not a fake upload).
- User account creation date not exposed by `GET /api/me`; join row uses workspace membership `createdAt`.

**Files changed**
- `apps/web/components/mock-views/SettingsProfileView.tsx` (rewired to shell + `updateProfile`)
- `apps/web/components/mock-views/SettingsProfileView.test.tsx` (new, 11 tests)

**Tests**
- New: loading; unauthenticated; real identity/workspace/join date; omit workspace rows; no mock-only fields; empty-name validation; save name+image + `setUser`; initials → `image:null`; API validation error; unauthenticated save; submit disabled while saving.

**Verification**
- Targeted: `SettingsProfileView` 11/11 pass.
- `pnpm -r typecheck` — 5/5 projects pass.
- `pnpm -r lint` — all packages pass.

**Known remaining issues**
- Settings members/workspace/index still mock (later audits).
- Threads/Mentions/Drafts still mock (later audits).
- No `loading.tsx`/`error.tsx` route files.
- ProfileSetupStep avatar still writes localStorage nobody reads (auth flow out of `/app` loop unless named).
- Parallel orphaned `components/app/ProfileContent.tsx` unused (different visual; mock cards kept as source of truth).

**Next:** Audit 08 — `/app/settings/members` (per recommended order). Stopped after profile as instructed.

### Audit 08 — `/app/settings/members` (2026-09-23)

**Scope:** `app/app/settings/members/page.tsx` → `components/mock-views/SettingsMembersView.tsx`. Mock visual chrome kept (header + live count, search, member table with avatars/presence/role pills, pending invitations section, remove/revoke confirm dialogs); wired to real `useShell()` session/workspace/members/presence + `usePendingInvitations` + member/invitation mutation APIs. Invite button opens the already-wired shell `InviteMemberDialog`. No redesign.

**UI issues found**
- View read `useApp()` mock store (`members`, `pendingInvites`, `currentUser`, `activeWorkspace`); role update used fake `setTimeout` + in-memory `updateMemberRole`.
- Search filtered on `member.title` (no backend field); placeholder said "name, email, or title".
- Role select offered lowercase `guest` (no GUEST role in backend — invitation roles are MEMBER|ADMIN only; OWNER immutable).
- Pending rows showed mock `Invited as {role} · {invitedAt}`; real `PendingInvitation` has no `role` and exposes `invitedBy` + `expiresAt`.
- Member subtitle rendered `title · email` — title does not exist on the API.

**Functionality wired**
- `useShell()`: `session`, `currentUser`, `currentWorkspace` (incl. caller `role`), `members` (`useWorkspaceMembers` + `retry`), `presence.getPresence`.
- `usePendingInvitations(currentWorkspace.id)` with honest loading / error+retry / empty states (shown only when caller can manage invitations).
- Permissions mirror backend: role change + remove = `currentWorkspace.role === 'OWNER'`; invite + pending list = OWNER or ADMIN.
- Role change: `updateWorkspaceMemberRole(apiBase, workspaceId, userId, ADMIN|MEMBER)` → optimistic local update + `members.retry()`; forbidden/conflict/validation surface as dismissible `role=alert`.
- Remove: confirm dialog → `removeWorkspaceMember` → drop row + `members.retry()`; disabled while acting.
- Revoke: confirm dialog → `revokeInvitation` → `pending.retry()`; 404 treated as already gone → refresh.
- Invite button → `setInviteMemberOpen(true)` (shell dialog already calls `inviteMember` / `createInvitation`). On dialog close, pending + members are refetched (create path).
- Search: name + email only (title filter dropped).
- Presence from real workspace presence (ONLINE/OFFLINE via Avatar).
- Honest session states: loading / unauthenticated / no workspace / members error+retry before the table.

**Static/mock found / removed**
- Guest role option removed (backend has no GUEST).
- Fake `setTimeout` role update removed.
- Mock `pendingInvites` / `revokeInvite` / `updateMemberRole` / `removeMember` from `useApp()` no longer read.
- "Invited as {role}" copy replaced with "Invited by {name} · Expires {date}" from real payload.
- Title search + title subtitle removed (no field).
- Invite button and pending section hidden for MEMBER (API is 403).

**Backend gaps** — none new required. Known limits accepted:
- Pending invitation list has no realtime push — other admins see new/accepted invites only via refetch (known gap; dialog-close refetch covers the inviter).
- Pending payload has no `role` field — role shown on invite dialog only at create time, not in the pending list.
- Only OWNER can change roles / remove members; ADMIN can invite but not manage roles (matches `routes.ts`).

**Files changed**
- `apps/web/components/mock-views/SettingsMembersView.tsx` (rewired to shell + pending + member/invite APIs)
- `apps/web/components/mock-views/SettingsMembersView.test.tsx` (new, 18 tests)

**Tests**
- New: session loading; unauthenticated; members error+retry; real list/count/workspace; no mock-only fields (title search, Guest, "Invited as"); name/email filter; empty search + clear; MEMBER hides invite/pending/selects; ADMIN invite + pending with inviter/expiry; pending error+retry; opens invite dialog; role PATCH + retry; role forbidden error; no select for owner/self; remove via DELETE + list update; remove conflict error; revoke + pending refetch; invite-dialog close refetch.

**Verification**
- Targeted: `SettingsMembersView` 18/18 pass.
- Full suite: apps/web 602/602 pass; apps/api 344 pass (+172 live-DB skipped).
- `pnpm -r typecheck` — 5/5 projects pass.
- `pnpm -r lint` — all packages pass.

**Known remaining issues**
- Settings workspace/index still mock (later audits).
- Threads/Mentions/Drafts still mock (later audits).
- No `loading.tsx`/`error.tsx` route files.
- Parallel orphaned `components/app/MembersContent.tsx` unused (different visual; mock cards kept as source of truth).
- ProfileSetupStep avatar still writes localStorage nobody reads (auth flow out of `/app` loop unless named).

**Next:** Audit 09 — `/app/settings/workspace` (per recommended order). Stopped after members as instructed.

### Audit 09 — `/app/settings/workspace` (2026-09-23)

**Scope:** `app/app/settings/workspace/page.tsx` → `components/mock-views/SettingsWorkspaceView.tsx`. Mock visual chrome kept (workspace identity card with avatar/slug, rename form, danger zone with type-to-confirm delete); wired to real `useShell()` session/workspace/store + `updateWorkspace` / `deleteWorkspace` / `validateWorkspaceName`. No redesign.

**UI issues found**
- View read `useApp()` mock store (`activeWorkspace`, `renameWorkspace`, `deleteWorkspace`) and mock `useRouter` from the app provider rather than real navigation/store APIs.
- Danger zone delete had no role gate (any member could attempt delete; backend is OWNER-only).
- Rename form had no role gate (backend rename = OWNER|ADMIN via `canEditMetadata`).
- Mock-only fields rendered as real: `plan` badge, fake `teamflow.io` domain, mock `avatarText`.
- Client validation relied on native HTML5 `required` only (no `validateWorkspaceName` message surfacing).

**Functionality wired**
- `useShell()`: `session`, `currentWorkspace` (incl. caller `role`), `workspaces` store (`updateWorkspace` / `removeWorkspace`). `showToast` from `useApp()` only (UI chrome).
- Rename: `validateWorkspaceName` client-side → `updateWorkspace(apiBase, id, name)` → `workspaces.updateWorkspace(result.workspace)` + toast `Workspace renamed successfully.` + success banner; API validation/forbidden/conflict surface as dismissible alerts.
- Delete: type-to-confirm → `deleteWorkspace` → `workspaces.removeWorkspace(id)` + toast `Deleted {name}` + `router.push('/app')`; 404/notFound treated as already gone → still navigates (avoids a stuck confirm dialog).
- Permissions mirror backend: rename = OWNER|ADMIN (others see disabled input + hint "Only owners and admins can rename this workspace."); delete button = OWNER-only (others see "Only the workspace owner can delete this workspace.")
- Slug shown read-only from the real workspace slug (not a fake `teamflow.io` URL); avatar initial derived from the real name.
- Honest session states: loading / unauthenticated / no workspace before the forms.
- Forms use `noValidate` so `validateWorkspaceName` / delete confirm validation run instead of silent HTML5 blocking.

**Static/mock found / removed**
- Mock `activeWorkspace` / `renameWorkspace` / `deleteWorkspace` from `useApp()` no longer read.
- Mock `plan` badge, fake `domain` (`teamflow.io`), and static `avatarText` removed.
- Any-role delete removed (OWNER only); any-role rename removed (OWNER|ADMIN).
- Fake `useRouter` from mock app context replaced with `lib/mock-hooks/useRouter`.

**Backend gaps** — none new required. Known limits accepted:
- Slug is immutable (never changed by rename) — shown read-only, matching API.
- Delete is OWNER-only; no "transfer ownership" flow exists.

**Files changed**
- `apps/web/components/mock-views/SettingsWorkspaceView.tsx` (rewired to shell + workspace APIs)
- `apps/web/components/mock-views/SettingsWorkspaceView.test.tsx` (new, 16 tests)

**Tests**
- New: session loading; unauthenticated; no workspace; real name/slug/avatar; no mock-only plan/domain; empty-name validation; rename PATCH + store update + toast; unchanged name no API call; API validation error without store update; MEMBER disabled rename + no delete; ADMIN rename-only; wrong type-to-confirm blocks delete; delete success + `removeWorkspace` + `push('/app')`; notFound delete still navigates; forbidden delete no navigation; in-flight button disabled.

**Verification**
- Targeted: `SettingsWorkspaceView` 16/16 pass.
- Full suite: apps/web 618/618 pass; apps/api 344 pass (+172 live-DB skipped).
- `pnpm -r typecheck` — 5/5 projects pass.
- `pnpm -r lint` — all packages pass.

**Known remaining issues**
- Settings index still mock (later audit).
- Threads/Mentions/Drafts still mock (later audits).
- No `loading.tsx`/`error.tsx` route files.
- Parallel orphaned `components/app/WorkspaceSettingsContent.tsx` unused (different visual; mock cards kept as source of truth).
- ProfileSetupStep avatar still writes localStorage nobody reads (auth flow out of `/app` loop unless named).

**Next:** Audit 10 — `/app/settings` index (per recommended order). Stopped after workspace as instructed.

### Audit 10 — `/app/settings` index (2026-09-23)

**Scope:** `app/app/settings/page.tsx` → `components/mock-views/SettingsIndexView.tsx`. Mock visual chrome kept (header + four-card grid with icons, meta badges, Manage footer); wired card metas and descriptions to real shell data + real notification preferences. No redesign.

**UI issues found**
- View read `useApp()` mock store (`activeWorkspace`, `members`) for card content.
- Profile meta hardcoded to `Alex Chen`.
- Workspace meta used mock `activeWorkspace.plan` (`{plan} plan` — no plan field on the API).
- Notifications meta hardcoded to `All active`.
- Card copy promised mock-only surfaces: profile "role title", workspace "vanity URL / retention policies / administrative controls", notifications "email digest / desktop push triggers" (real prefs are only mention/DM/thread ALL|NONE).
- No session loading / unauthenticated / error states — rendered mock cards to signed-out visitors.

**Functionality wired**
- `useShell()`: `session`, `currentUser`, `currentWorkspace`, `workspaces` store, `members` (`useWorkspaceMembers`).
- `useNotificationPreferences()` for the notifications card summary (real `fetchNotificationPreferences`).
- Profile meta: real `currentUser.name` (fallback `—`).
- Members meta: real member count when ready (`2 members` / `1 member`); `…` while loading/idle; `—` on error/unauthenticated.
- Workspace meta: real caller `role` (OWNER/ADMIN/MEMBER) when workspaces are ready; `…` / `—` otherwise. Mock `plan` badge removed.
- Notifications meta: `All active` / `Muted` / `N of 3 on` derived from the three real delivery prefs; `…` while loading; `—` on error.
- Honest session gates before cards: loading / unauthenticated (or error message) — cards hidden until authenticated.
- Card destinations unchanged (`push` to profile / members / workspace / notifications).
- Copy narrowed to surfaces the APIs actually support (name+avatar+email; rename/slug/danger zone; mention/DM/thread alerts).

**Static/mock found / removed**
- Mock `activeWorkspace` / `members` from `useApp()` no longer read (view no longer uses `useApp` at all).
- Hardcoded `Alex Chen`, `{plan} plan`, and always-on `All active` badges removed.
- Mock-only copy about role titles, vanity URLs, retention policies, digests, and desktop push removed.
- No new backend required.

**Backend gaps** — none. Known limits accepted:
- Notifications summary is a compact three-key digest; per-channel prefs are not summarized here.
- Cards remain div+onClick (mock chrome); not converted to links this audit.

**Files changed**
- `apps/web/components/mock-views/SettingsIndexView.tsx` (rewired to shell + notification prefs)
- `apps/web/components/mock-views/SettingsIndexView.test.tsx` (new, 13 tests)

**Tests**
- New: session loading; unauthenticated hides cards; session error message; four cards + real destinations + real profile name; real role not plan; real member count, never Alex Chen; members loading placeholder; members error placeholder; notifications All active / 2 of 3 on / Muted; prefs load failure placeholder; no mock plan/retention/role-title copy.

**Verification**
- Targeted: `SettingsIndexView` 13/13 pass.
- Full suite: apps/web 631/631 pass; apps/api 344 pass (+172 live-DB skipped).
- `pnpm -r typecheck` — 5/5 projects pass.
- `pnpm -r lint` — all packages pass.

**Known remaining issues**
- Mentions/Drafts still mock (later audits).
- No `loading.tsx`/`error.tsx` route files.
- ProfileSetupStep avatar still writes localStorage nobody reads (auth flow out of `/app` loop unless named).
- Settings index cards are clickable divs (a11y: not keyboard-focusable links) — kept to preserve mock chrome.

**Next:** Audit 11 — `/app/threads` (needs new `GET /workspaces/:id/threads`; build then). Stopped after settings index as instructed.

### Audit 11 — `/app/threads` (2026-09-23)

**Scope:** `app/app/threads/page.tsx` → `components/mock-views/ThreadsView.tsx`. Mock visual chrome kept (header + card list with destination pill, avatar, body, latest-reply preview, reply-count footer, empty state); wired to a new backend aggregate and deep-link open into Channel/DM ThreadPanel. No redesign.

**UI issues found**
- View read `useApp()` mock store (`messages`, `channels`, `members`, `dms`, `openThread`, `currentUser`) — zero API calls; no backend aggregate existed.
- Open used a global mock `openThread` instead of navigating with a deep link the real views can honor.
- No session/loading/unauthenticated/error gates — rendered mock cards to signed-out visitors.

**New backend (smallest missing piece)**
- `GET /api/workspaces/:workspaceId/threads?limit&cursor` — roots the caller participates in (author or replier) inside accessible containers (public channel / private with membership / DM participation), ordered by `latestReplyAt DESC, id DESC`, keyset cursor `{latestReplyAt, id}`.
- Membership gate via `getMembershipRole`; non-members/unknown workspaces share one 404 (no enumeration).
- Response: root `{id, body, replyCount, createdAt, latestReplyAt, author, container, latestReply}` + `pageInfo {nextCursor, hasMore}`; latest reply hydrated in one batch query.

**Functionality wired**
- `useShell()` session + `currentWorkspace` → `useThreads(workspaceId)` (new hook: idle/loading/ready/unauthenticated/error + retry + load-more).
- Real cards: destination `#name` / DM title, root author, body, reply count, latest-reply preview, relative last-activity.
- Honest gates: session loading / unauthenticated (or error), no workspace, threads loading / unauthenticated / error with Try again, empty “No active threads”.
- Open action: `push('/app/channels/{slug}?message={rootId}')` or `push('/app/dms/{conversationId}?message={rootId}')`.
- `ChannelView` + `DmView` now consume `?message=` / `?reply=` via `useDeepLink` + `useSeekMessage`: pages history to the target, opens ThreadPanel when the target is a thread root (or has a reply deep link), then `consumeDeepLinkParams()`. Plain messages do not open the panel.

**Static/mock found / removed**
- Mock `useApp()` no longer read (view does not use `useApp`).
- Global `openThread` mock path removed; navigation is real `push` with deep links.

**Files changed**
- New: `apps/api/src/modules/threads/{service,routes,schemas,cursor,index,threads.test,threads.routes.test}.ts`; `apps/web/lib/{threads,use-threads,use-threads.test}.ts`
- Edited: `apps/api/src/app.ts` (mount threads router); `apps/web/components/mock-views/{ThreadsView,ThreadsView.test,ChannelView,ChannelView.test,DmView,DmView.test}.tsx`; `apps/web/components/mock-ui/feed/ThreadPanel.tsx` (`data-selected-thread-id`); `docs/UI_AUDIT_STATUS.md`

**Tests**
- New: ThreadsView 17 (gates, empty, real cards, channel/DM deep-link destinations, keyboard open, load more + error + disabled, plural reply); use-threads 7 (idle/load/error/retry/append/reset); ChannelView +3 deep-link (open on replyCount, no open for plain message, pages history); DmView +2 deep-link; threads service 9; threads live routes 5 (skip without DB env).

**Verification**
- Targeted: ThreadsView + use-threads + ChannelView + DmView 52/52 pass; threads unit 9/9 pass.
- Full suite: apps/web 660/660 pass; apps/api 353 pass (+177 live-DB skipped).
- `pnpm -r typecheck` — 5/5 projects pass.
- `pnpm -r lint` — all packages pass.

**Known remaining issues**
- Mentions/Drafts still mock (later audits).
- Live threads route tests skip without DB env (pattern used across API).
- Non-thread deep-linked messages do not scroll/highlight in the mock feed (MessageItem has no `data-message-id` yet) — only thread open is in scope for this audit.
- Thread list is not live-updated on new replies (refetch on mount/retry only).
- Cards remain div+role=button (mock chrome; keyboard Enter/Space works).

**Next:** Audit 12 — `/app/mentions`. Stopped after threads as instructed.

### Audit 12 — `/app/mentions` (2026-09-23)

**Scope:** `app/app/mentions/page.tsx` → `components/mock-views/MentionsView.tsx`. Mock visual chrome kept (header with count badge + card list with destination pill, sender, body, thread/channel label, “Jump to message”, empty state); wired to a new backend aggregate and the Audit 11 deep-link open. No redesign.

**UI issues found**
- View read `useApp()` mock store and filtered client-side by `content.includes('@')` or first-name substring — **wrong data** (not `MessageMention` rows); zero API calls.
- Jump used global mock `openThread` / plain `push` without a message deep link the real views can honor.
- No session/loading/unauthenticated/error gates — rendered mock cards to signed-out visitors.
- Empty copy hardcoded `@alex` (mock identity) instead of the signed-in user’s name.

**New backend (smallest missing piece)**
- `GET /api/workspaces/:workspaceId/mentions?limit&cursor` — `MessageMention.mentionedUserId = caller` on non-deleted messages inside accessible containers (public channel / private with membership / DM participation), ordered by mention `createdAt DESC, messageId DESC`, keyset cursor `{createdAt, messageId}`.
- Membership gate via `getMembershipRole`; non-members/unknown workspaces share one 404 (no enumeration).
- Response: `{id, body, createdAt, parentMessageId, author, container}` + `pageInfo {nextCursor, hasMore}`; DM container name falls back to first non-self participant when the conversation has no title.

**Functionality wired**
- `useShell()` session + `currentWorkspace` → `useMentions(workspaceId)` (new hook: idle/loading/ready/unauthenticated/error + retry + load-more).
- Real cards: destination `#name` / DM name, message author, body, formatted time, `parentMessageId ? 'In thread discussion' : 'In channel feed'`.
- Honest gates: session loading / unauthenticated (or error), no workspace, mentions loading / unauthenticated / error with Try again, empty “No mentions yet” with `@{currentUser first name}`.
- Jump: `push('/app/channels/{slug}?message={id}')` or `push('/app/dms/{conversationId}?message={id}')` — reuses Audit 11 `useDeepLink` / `useSeekMessage` consumption on ChannelView / DmView.

**Static/mock found / removed**
- Mock `useApp()` no longer read (view does not use `useApp`).
- Client `@` substring / first-name filter removed; list is server-side `MessageMention` truth.
- Global `openThread` mock path removed; navigation is real `push` with deep links.

**Files changed**
- New: `apps/api/src/modules/mentions/{list.service,cursor,schemas,routes,list.service.test,mentions.routes.test}.ts` (routes test replaced/overwrote prior empty scaffold if any); `apps/web/lib/{workspace-mentions,use-mentions,use-mentions.test}.ts`
- Edited: `apps/api/src/modules/mentions/index.ts` (export listing surface); `apps/api/src/app.ts` (mount mentions router); `apps/web/components/mock-views/{MentionsView,MentionsView.test}.tsx`; `docs/UI_AUDIT_STATUS.md`

**Tests**
- New: MentionsView 17 (gates, empty with `@ada`, real cards, thread label, channel/DM deep-link destinations, keyboard open, load more + error + disabled, header count); use-mentions 7 (idle/load/error/retry/append/reset); list.service 7 (membership 404, access filters, keyset, malformed cursor, channel + DM hydration, nextCursor); mentions live routes 6 (skip without DB env).

**Verification**
- Targeted: MentionsView + use-mentions 24/24 pass; mentions module unit 33/33 pass (parser + service + list).
- Full suite: apps/web 684/684 pass; apps/api 360 pass (+173 live-DB skipped).
- `pnpm -r typecheck` — 5/5 projects pass.
- `pnpm -r lint` — all packages pass.

**Known remaining issues**
- Drafts still mock (last `/app` audit; needs Draft model + API).
- Live mentions route tests skip without DB env (pattern used across API).
- Non-thread deep-linked messages do not scroll/highlight in the mock feed (MessageItem has no `data-message-id` yet) — thread open works via Audit 11.
- Mentions list is not live-updated on new mentions (refetch on mount/retry only).
- Cards remain div+role=button (mock chrome; keyboard Enter/Space works).
- Self-mentions are included (MessageMention keeps them; notification suppression is a separate layer).

**Next:** ~~Audit 13 — `/app/drafts` (needs Draft model + API; largest remaining backend gap).~~ **Done — Audit 13 complete.** Stopped after drafts as instructed.

### Audit 13 — `/app/drafts` (2026-09-23)

**Scope:** `app/app/drafts/page.tsx` → `components/mock-views/DraftsView.tsx`. Mock visual chrome kept (header with count badge + card list with destination pill, body, “Autosaved”, Discard / Resume message, empty state); wired to a new backend CRUD surface and minimal composer autosave so the empty-state copy stays honest. No redesign.

**UI issues found**
- View read `useApp()` mock store (`drafts: Record<string,string>` keyed `chn-*`/`dm-*` with seeds in `lib/mock-context.tsx`) — **wrong data**; zero API calls.
- Resume used plain `push` to mock channel/DM ids, not real routes/slugs.
- No session/loading/unauthenticated/error gates — rendered mock cards to signed-out visitors.
- Empty copy claimed “autosaved here” while the mounted MessageComposer never persisted anything.

**New backend (smallest missing piece)**
- `Draft` model (migration `20260923190000_add_drafts`) — unique `(userId, workspaceId, targetId)`, `targetKind` `CHANNEL | DIRECT_MESSAGE | THREAD`, trimmed body, cascade on user/workspace delete. Empty bodies delete the row (never store whitespace).
- `GET /api/workspaces/:workspaceId/drafts` — caller’s drafts for that workspace, ordered `updatedAt DESC, id DESC`, hydrated with container `{type, id, name, slug?}` (channel slug for Resume; DM name falls back to peer; thread hydrates root channel/DM). Stale containers (channel deleted / DM gone) are skipped.
- `PUT /api/workspaces/:workspaceId/drafts` — strict body `{targetKind, targetId, body}`; membership gate via `getMembershipRole` (non-members/unknown → one 404); target access re-checked (public/private channel membership, DM participation, thread root message in accessible container) → 403; body max 10000 (same as messages); empty body clears.
- `DELETE /api/workspaces/:workspaceId/drafts/:draftId` — caller-only; unknown/other’s draft → 404; returns 204.

**Functionality wired**
- `useShell()` session + `currentWorkspace` → `useDrafts(workspaceId)` (idle/loading/ready/unauthenticated/error + `discard` + `discardError` + retry).
- Real cards: destination `#name` / `@peer` / thread `#name`, body (line-clamp), “Autosaved”, Discard (icon + footer) and Resume message.
- Honest gates: session loading / unauthenticated (or error), no workspace, drafts loading / unauthenticated / error with Try again, empty “No drafts” with the original autosave copy.
- Resume: channel → `/app/channels/{slug}`; DM → `/app/dms/{conversationId}`; thread → `/app/channels/{slug}?message={rootId}` (Audit 11 deep-link open).
- Composer autosave (Audit 13 honesty): optional `draftContext` on mock `MessageComposer` loads the matching draft on target change, debounces PUT (600ms), clears the server row after a successful send. ChannelView passes `CHANNEL`+channel id; DmView passes `DIRECT_MESSAGE`+conversation id.

**Static/mock found / removed**
- Mock `useApp()` no longer read (view does not use `useApp`).
- Mock seeds `chn-c2`/`chn-c3` drafts no longer drive the page.
- Global mock `deleteDraft` / `drafts` map unused by DraftsView.

**Files changed**
- New: `packages/db/prisma/migrations/20260923190000_add_drafts/migration.sql`; `apps/api/src/modules/drafts/{service,schemas,routes,index,service.test,drafts.routes.test}.ts`; `apps/web/lib/{drafts,use-drafts,use-drafts.test}.ts`; `apps/web/components/mock-views/DraftsView.test.tsx`
- Edited: `packages/db/prisma/schema.prisma` (Draft model + User/Workspace relations); `apps/api/src/app.ts` (mount drafts router); `apps/web/components/mock-views/{DraftsView,ChannelView,DmView}.tsx`; `apps/web/components/mock-ui/feed/MessageComposer.tsx` (draftContext props + load/save/clear); pre-existing live-test fixes (`channels.routes.test.ts` safe-field list includes `topic`; `auth/me.ts` image URL restricted to http/https so `ftp://` is 400); `docs/UI_AUDIT_STATUS.md`

**Tests**
- New: DraftsView 18 (gates, empty copy, real cards, DM `@` label, channel/DM/thread Resume paths, discard icon + footer, header count, discard error, load-more-style hide); use-drafts 8 (idle/load/error/retry/reset/discard ok/discard error/no-op); drafts service 13 (membership 404, list scope, empty clear, max length, channel/DM/thread access 403, upsert key, DM + thread hydration, discard ownership); drafts live routes 8 (401, non-member 404, validation 400s, inaccessible channel 403, save/list/update/clear, per-user scoping, discard 204/404, Resume slug contract — skip without DB env).

**Verification**
- Targeted: DraftsView + use-drafts 26/26 pass; drafts module 13 unit + 8 live (with env) pass.
- Pre-existing live failures fixed: channels safe-field `topic` list; profile `ftp://` image URL → 400.
- Full suite: apps/web **710/710** pass; apps/api **552 pass + 2 fail → after fix, channels+profile+drafts 43/43 pass** (full re-run after these two fixes confirms the previously failing suites; remaining live suites unaffected by Audit 13).
- `pnpm -r typecheck` — 5/5 projects pass.
- `pnpm -r lint` — all packages pass.
- Route table, §5 gap row, §10 Draft candidate, and audit order 01→13 updated.

**Known remaining issues**
- Live draft/channel/profile route tests skip without DB env (pattern used across API).
- Composer draft load is a best-effort full-list fetch filtered client-side (drafts for one workspace are small); no realtime draft sync (refetch on mount/retry only).
- Thread panel composer does not pass `draftContext` (only channel + DM roots) — thread drafts only appear if written via API.
- Non-thread deep-linked messages still do not scroll/highlight (MessageItem has no `data-message-id` yet).
- Cards remain div+role=button (mock chrome; keyboard Enter/Space works).

**Next:** Audit 13 is the last `/app` audit — **stop**; await instructions for wrap-up / next phase.

---

## Phase 4.1 — Sign-up + Profile Onboarding (2026-09-23)

**Scope:** `/sign-up` → `SignUpForm` → `ProfileSetupStep` → real profile persistence. Visual design unchanged (approved Stitch auth layout, AvatarSelector chrome, CTA copy).

### UI issues
- `ProfileSetupStep` wrote `localStorage['teamflow_profile_setup']` (name/email/avatarUrl/avatarType) with **no reader anywhere**; avatar never reached `PATCH /api/me`.
- File upload produced a raw `FileReader` data URL (often multi-MB) that failed the API’s 2048-char http(s) URL cap with no path to success.
- No save error surface, no in-flight guard on Continue; Skip and Continue shared the same dead localStorage path.
- Refresh mid-setup: middleware sends an authenticated `/sign-up` visitor to `/app` (in-memory `created` flag only) — recovery is Settings → Profile; no localStorage onboarding flag.

### Static/mock behavior (removed)
- Dead `teamflow_profile_setup` localStorage write removed (no replacement client-side authority).

### Existing backend reused
- `PATCH /api/me` (`apps/api/src/modules/auth/me.ts`) — session-scoped caller-only update of `name` / `image`.
- `GET /api/me` + Better Auth `signUp.email` (session established on sign-up; verified by live profile tests).
- `updateProfile` / `validateProfileImage` (`apps/web/lib/profile.ts`).
- Professional catalog (`lib/avatar-catalog.ts`); initials → `image: null`; avatarType inferred from `image` (same as Settings).

### Backend functionality added
- `image` field accepts **inline avatar data URLs** in addition to http(s) URLs:
  - `data:image/(jpeg|jpg|png|webp|gif);base64,…`, max **400_000** chars, strict base64 shape (`MAX_DATA_IMAGE_LENGTH`).
  - Rejected: svg+xml, malformed base64, oversize → 400 `VALIDATION_ERROR`.
- `express.json({ limit: '1mb' })` (default 100kb rejected avatar payloads).

### API changes
- No new routes. `updateMeSchema.image` union extended (http URL | data URL | null). Strict body unchanged (extra fields still 400).

### Database changes
- **None.** `User.image` already `String?`; no migration.

### Avatar/storage changes
- Message-attachment R2 pipeline **not** reused (message-scoped, author/workspace keyed — inappropriate for avatars; `R2_PUBLIC_URL` is a placeholder).
- `AvatarSelector` upload path: type/size gate (jpeg/png/webp/gif, ≤5MB) → canvas downscale to ≤512px → JPEG data URL → parent save via `PATCH /api/me`.
- Same selector improves Settings → Profile uploads (shared component).
- Circular crop remains in `Avatar` (`rounded-full`); no second profile system.

### Authentication changes
- None. Continue uses existing session cookie; unauthenticated save → `router.replace('/sign-in')`.

### Redirect behavior
- New user: signup → in-place ProfileSetupStep → Continue saves → `/app`; Skip → `/app` without avatar write (defaults: signup name, initials).
- Existing user: sign-in → `/app` (middleware; never re-onboarded — `created` is session-local to the sign-up form).
- Refresh mid-setup: authenticated `/sign-up` → middleware → `/app`; avatar set later in Settings if needed.

### Tests
- New: `ProfileSetupStep.test.tsx` 7 (render, professional save+push, initials `image:null`, skip no-save, save error, unauthenticated → sign-in, duplicate-submit guard).
- Updated: `SignUpForm.test.tsx` — continue still shows step; new “persists avatar then `/app`”.
- Updated: `lib/profile.test.ts` — data URL accept/reject/oversize.
- New: `updateMeSchema` unit tests in `me.test.ts` (3) — http/null/data ok; svg/malformed/ftp/oversize/empty/extra fail.
- Live: `profile.routes.test.ts` + data-URL accept/reject/clear (6/6 with DB env).

### Verification
- Targeted: ProfileSetupStep + SignUpForm + profile client **26/26**; me schema **8/8**; live profile routes **6/6**.
- SettingsProfileView **11/11** (unchanged behavior still green).
- `pnpm -r typecheck` — pass; `pnpm -r lint` — pass.
- Full web suite: **720/720** pass (sequential, one suite only).
- Full API suite: **558/558** pass (sequential, with DB env).
- `pnpm -r typecheck` — 5/5 projects pass.
- `pnpm -r lint` — all packages pass.
- Route table + §4 gap row for `/sign-up` marked fixed; Phase 4.1 section appended.

### Remaining issues
- Avatar data URLs live in `user.image` (fine for ≤512px JPEG; not object-storage). R2 public URL env is a placeholder — revisit if object storage for avatars is required later.
- Settings “Custom photo URL” field can display a long data URL after upload (pre-existing field binding; save still works).
- Onboarding completion is not a DB flag — mid-setup refresh lands on `/app` without re-showing the step (by design; Settings is the recovery path).
- Invalid upload file type/size is ignored silently in AvatarSelector (previous selection kept); no toast in approved chrome.

---

## Phase 4.2 — Sign-in + Authentication (2026-09-30)

**Scope:** `/sign-in` → `SignInForm` → Better Auth session → `/app`. Visual design unchanged (approved Stitch sign-in layout, brand panel, CTA copy).

### UI issues
- Sign-in enforced the sign-up min-8 password rule client-side (`validatePassword`), blocking short-but-attemptable passwords with a misleading message. Fixed: sign-in uses `validateExistingPassword` (required-only); server remains authoritative for credential checks.
- Unauthenticated `/app` bounce dropped the query string (`?next=` built from pathname only), so `/app/search?q=…` lost its query. Fixed: `decideAuthPageDestination` takes optional `search`; middleware passes `request.nextUrl.search`.
- `shell.signOut` (live `/app` TopBar path) skipped realtime disconnect + attachment-cache clear that `UserMenu` performs. Fixed: shell teardown now matches `UserMenu` (disconnect + clear + replace + refresh).

### Static/mock behavior
- None found in the sign-in flow. No mock users, hardcoded credentials, fake success states, localStorage auth, client-only auth, simulated delays, or dev bypasses. `grep` for mock/setTimeout/localStorage-session patterns in sign-in scope: clean.

### Existing auth functionality reused
- Better Auth `signIn.email` / `signOut` via `lib/auth-client.ts` (API `/api/auth`, `credentials: include`).
- `GET /api/me` + `SafeAuthUser` allowlist; `requireAuth` 401 envelope.
- `getSafeReturnTo`, `decideAuthPageDestination`, `fetchSessionUser`, middleware matcher.
- `toAuthErrorMessage` + `SIGN_IN_FALLBACK`; `AuthField`, `PasswordField` (show/hide), `AuthSubmitButton`, `AuthError`, `AuthSwitchLink`, `AuthLayout`/`AuthBrandPanel`.

### Backend changes
- None. No new endpoints; no `/api/login` or parallel auth system.

### API changes
- None.

### Database changes
- None.

### Middleware/auth-guard changes
- `decideAuthPageDestination(pathname, authenticated, returnTo, search = '')` — optional 4th param, backward compatible; unauthenticated `/app` redirect now encodes `pathname + search`.
- `middleware.ts` passes `request.nextUrl.search` through.
- `SignInForm` re-validates `returnTo` with `getSafeReturnTo` before `router.replace` (defense in depth; page already sanitizes).

### Session changes
- No cookie/security config changes. `shell.signOut` teardown aligned with `UserMenu`; on sign-out error the client still leaves to `/sign-in` and middleware re-verifies (never fakes success). Session remains the cookie; no localStorage auth added.

### Tests
- Updated: `SignInForm.test.tsx` 8 → 17 (Enter-submits, short-password accepted, rapid-click single-request, network-failure fallback without leaking internals, unsafe external + protocol-relative `returnTo` → `/app`, query-bearing `returnTo`, notice, mobile container).
- Updated: `lib/validation.test.ts` +1 (`validateExistingPassword`).
- Updated: `lib/auth-guard.test.ts` 16 (query preservation, `/app/dms/123`, `javascript:` rejection, non-app paths).
- New: `lib/auth-middleware.test.ts` 5 (middleware decision matrix + `next` round-trip + fail-closed).
- New: `lib/use-session-user.test.ts` 3 (loads `/api/me` with credentials, 401 → unauthenticated, network failure → safe error).
- New: `lib/shell-context.test.tsx` 3 (sign-out tears down + leaves; error still leaves; throw still tears down).
- Re-enabled: `components/app/UserMenu.test.tsx` 5 (identity, sign-out + redirect, teardown, failure keeps session, safe error).
- No API suite rerun (no API changes).

### Verification
- Targeted: **59/59** (single run, 8 files).
- Full web suite: **748/748** (75 files, sequential, single run).
- `pnpm -r typecheck` — 5/5 pass; `pnpm -r lint` — pass.

### Remaining issues
- `?status=account-created` notice renders but nothing links to it — resolved as intentional reserve (code comment in `sign-in/page.tsx`; current sign-up keeps its session and routes via ProfileSetupStep → `/app`).
- `decideRouteAccess` is legacy test-only — resolved as documented/deprecated in `auth-guard.ts` (live middleware uses `decideAuthPageDestination`); behavior pinned by tests, no new usages.
- `UserMenu.test.tsx` re-enabled from `.disabled` (5/5 pass: identity, sign-out + redirect, realtime/cache teardown, failure keeps session, safe error). Both sign-out paths now covered: `UserMenu` (components/app) + `shell.signOut` (live TopBar via `shell-context.test.tsx`).
- Phase 4.1 carryovers unchanged (avatar data URLs, silent upload rejects, no onboarding DB flag).

---

## Phase 4.3 — Invite Accept (2026-09-30)

**Scope:** `/invite/accept?token=…` → session check → explicit Accept → `POST /api/invitations/accept` → workspace. Visual design unchanged (approved centered-panel chrome, copy, CTA).

### UI issues
- Session expiring between page load and Accept click triggered a full-page `window.location.reload()`. Fixed: page calls `session.refresh()` so the view falls through to the sign-in prompt with the token preserved in `?next=` (no reload, jsdom-testable).
- Concurrent-accept race (server 409) surfaced as generic "Something went wrong" with no recovery path. Fixed: lib client retries once idempotently (loser's transaction rolled back, token unconsumed) and deterministically lands on the already-member accepted view.

### Static/mock behavior
- None found. No mock tokens, fake workspaces, or simulated accepts in production code; token lives in memory only (never localStorage, never logged).

### Existing functionality reused
- Web: `useSessionUser` (loading/unauth/error states), `acceptInvitation` client, `getSafeReturnTo` (allows `/invite/accept`), sign-in `?next=` round-trip (Phase 4.2), `InviteMemberDialog` link builder (token-encoded).
- API: `createInvitationAcceptRouter` (auth-gated, strict zod, non-enumerating 404/403/409), `acceptInvitation` service (SHA-256 token hash, email match, expiry/consumed/revoked checks, advisory-lock serialization, atomic membership + consumption, idempotent already-member). No backend changes needed — implementation already satisfied the UI.

### Backend changes
- None.

### API changes
- None.

### Database changes
- None.

### Middleware/auth-guard changes
- None. `/invite/accept` intentionally stays outside the middleware matcher (public route with client-side session handling); verified the middleware-built `?next=` for `/app` never collides with it.

### Session changes
- None to cookie/security. 401-on-accept now re-checks via `session.refresh()` instead of reloading.

### Tests
- New: `lib/invitations.test.ts` `acceptInvitation` block 4 (workspace + alreadyMember mapping, 401/404/403/transport/malformed mapping, 409 → single retry → accepted, double-409 → failed; token body asserted).
- Updated: `app/invite/accept/page.test.tsx` 5 → 10 (missing token, duplicate-submit guard, failed → Try-again → idle, 401 → refresh → sign-in prompt, `?next=` round-trip through `getSafeReturnTo`).
- API accept paths already covered live (`invitations.routes.test.ts`: accept, unknown/expired tokens, wrong email, idempotent already-member, concurrent serialization, ADMIN role, cross-workspace denial). No API rerun (no API changes).

### Verification
- Targeted: **27/27** (single run: page + invitations lib + pending-invitations + auth-middleware).
- Full web suite: **757/757** (75 files, sequential, single run).
- `pnpm -r typecheck` — 5/5 pass; `pnpm -r lint` — pass.

### Remaining issues
- Email delivery still does not exist (by design): creators share the local link from `InviteMemberDialog`. Token is returned once at creation and never re-exposed.
- Accepted view does not distinguish first-join from already-member (same approved panel + Open workspace → `/app`).
- `UserMenu.test.tsx` (5) and `shell-context.test.tsx` (3) both cover sign-out; no consolidation needed.

---

## Phase 4.4 — Cross-Route Auth/Session Lifecycle (2026-09-30)

**Scope:** every route × session state (loading / authenticated / expired / error). Visual design unchanged; expired-session panels follow the established ChannelView/DmView "Go to sign in" pattern.

### Lifecycle matrix (verified)
- `/` (landing): static marketing for everyone, no session dependency; navbar links to `/sign-in`. Intentional — no redirect for authenticated visitors.
- `/sign-in`, `/sign-up`: public; middleware bounces authenticated visitors to safe `?next=` or `/app` (Phase 4.2).
- `/app/*`: middleware gates via `GET /api/me` (fail closed); unauthenticated → `/sign-in?next=<path+query>` (Phase 4.2).
- `/invite/accept`: intentionally outside the middleware matcher (public; client-side session handling, Phase 4.3).
- Session expiry mid-app: data hooks surface `unauthenticated` (401 → value, never thrown); views show expired-session panels; sign-out tears down cookie + socket + caches (Phases 4.2–4.3).
- Browser back/forward after sign-out: middleware re-verifies on navigation; shell remounts and refetches `/api/me` — no stale access.

### UI issues (all fixed)
- 8 expired-session dead-ends showed "Please sign in" with no path forward:
  - `WorkspaceHomeView` ×2 (session + workspaces) — added "Go to sign in".
  - `DraftsView` ×2 (session gate split + data branch) — `StatusPanel` with action.
  - `MentionsView` ×2 (session gate split + data branch), `ThreadsView` ×2 (same).
  - `SettingsMembersView` ×2 (session gate + members branch), `SettingsProfileView`, `SettingsWorkspaceView` — inline panels gained conditional buttons.
  - `SearchView` — unauthenticated offered only Retry (loops on 401); now "Go to sign in" via new optional `SearchErrorState.actionLabel` (default "Try again", error path unchanged).
  - `ThreadPanel` — offered only "Close thread"; added "Go to sign in" anchor (no router hook needed).
- `WorkspaceRail` "Sign in required" micro-label intentionally left (rail has no room for a button; honest text).

### Static/mock behavior
- None added. All fixes reuse existing navigation (`push('/sign-in')`) and approved button styles.

### Existing functionality reused
- `StatusPanel`/`CenteredStatus` action slots, mock `useRouter().push`, `SearchErrorState`, `Link`/anchor to `/sign-in`.

### Backend changes
- None.

### API changes
- None.

### Database changes
- None.

### Middleware/auth-guard changes
- None.

### Session changes
- None to cookie/security. Client-side expiry UX only.

### Tests
- Updated: Drafts/Mentions/Threads session + request unauth tests → heading + click-through `push('/sign-in')`.
- New: WorkspaceHome ×2, SettingsMembers/Profile/Workspace click-throughs, SearchView click-through, `SearchErrorState` custom-label test.
- Full web suite: **760/760** (75 files, sequential, single run).
- `pnpm -r typecheck` — 5/5 pass; `pnpm -r lint` — pass. No API rerun (no API changes).

### Remaining issues
- Cross-tab sign-out has no sync (second tab shows app until remount/interaction surfaces 401 panels). Documented; no infra for it.
- Landing stays static for authenticated visitors (intentional).
- Phase 4.1 carryovers unchanged (avatar data URLs, silent upload rejects, no onboarding DB flag).

---

## Phase 4.5 — Realtime Polish (2026-09-30)

**Scope:** Socket.IO lifecycle polish only (client ack robustness + badge rejoin). No gateway, protocol, or visual changes.

### Audit findings (already solid, left untouched)
- Server gateway: cookie-auth handshake, per-room authorization, persist-then-emit, advisory-locked accepts, private recipient rooms. Covered by live API tests (realtime, presence, typing).
- Per-hook reconnect recovery already correct: channels/DMs/messages/threads/notifications/presence/typing all refetch or resubscribe on `onRealtimeReconnect`; notifications merge by id with REST resync.
- `connectRealtime` idempotent; sign-out disconnects (Phases 4.2–4.3); typing-stop best-effort by design.

### UI issues (fixed, 2)
- Ack promises hung forever on transport drop between emit and ack: `joinRealtimeChannel`, `joinRealtimeDirectConversation`, `emitTypingStart`. The shell badge-join loop awaits sequentially, so one hung join starved every channel after it. Fixed: `withAckTimeout` (5s, `REALTIME_ACK_TIMEOUT_MS`) → `{ ok: false, error: 'TIMEOUT' }`; server rejections still pass through; late acks ignored after settle.
- Shell badge-joins (off-channel unread rooms) never rejoined on reconnect — no hook owns them, so badges silently stopped updating after a drop until the channel list changed. Fixed: shell-context subscribes `onRealtimeReconnect` → clears and re-emits joins for current channels; unsubscribes + leaves on cleanup.

### Static/mock behavior
- None added. Timeout and rejoin paths use existing plumbing.

### Existing functionality reused
- `onRealtimeReconnect`, `join/leaveRealtimeChannel`, socket singleton, hook reconnect patterns.

### Backend changes
- None.

### API changes
- None.

### Database changes
- None.

### Middleware/auth-guard changes
- None.

### Session changes
- None.

### Tests
- New: `lib/realtime-client.test.ts` 8 (ack ok, rejection passthrough, connect-first, channel/DM/typing timeouts, late-ack ignored).
- Updated: `lib/shell-context.test.tsx` +3 (badge joins on mount, rejoin on reconnect, leave on unmount; channel state now mutable in mocks).
- Full web suite: **771/771** (76 files, sequential, single run).
- `pnpm -r typecheck` — 5/5 pass; `pnpm -r lint` — pass. No API rerun (no API changes).

### Remaining issues
- Hung-join timeout is fail-safe, not self-healing: a timed-out join retries on next channels change or reconnect, not on a timer.
- Cross-tab sign-out still unsynced (Phase 4.4 carryover).
- Phase 4.1 carryovers unchanged (avatar data URLs, silent upload rejects, no onboarding DB flag).

---

## Phase 4.6 — Final Cross-App Audit (2026-09-30)

**Scope:** whole-tree certification. No code changes — verification only.

### Final certification (all sequential, single runs)
- Full API suite: **558/558** (49 files, live DB env). First pass showed one file-level failure with zero failed assertions (known infra flake class); clean re-run green, exit 0.
- Full web suite: **771/771** (76 files).
- `pnpm -r typecheck` — 5/5 pass; `pnpm -r lint` — pass.

### Phase 4 close-out
- 4.1 `/sign-up` + profile onboarding: real `PATCH /api/me` persistence, avatar data URLs, localStorage authority removed.
- 4.2 `/sign-in`: required-only password, query-preserving `?next=`, shell sign-out teardown, `UserMenu` tests re-enabled, dead helpers documented.
- 4.3 `/invite/accept`: 409-retry, 401 → session refresh, full state coverage.
- 4.4 lifecycle matrix: 8 expired-session dead-ends fixed; landing/invite intentionally public; cross-tab sync documented as absent.
- 4.5 realtime polish: ack timeouts, badge rejoin on reconnect; gateway verified untouched.
- Progression: web 720 → 748 → 757 → 760 → 771; API 558 stable throughout (no API changes after 4.1).

### Known remaining issues (accepted)
- Cross-tab sign-out unsynced; landing static for authenticated users; avatar data URLs (not object storage); silent invalid-upload ignores; no onboarding DB flag; email delivery nonexistent (local invite links by design); `WorkspaceRail` micro-label without action; hung-join timeout is fail-safe, not self-healing.
- Working tree uncommitted — checkpoint to a branch recommended.

**Phase 4 COMPLETE. No further phases pending.**


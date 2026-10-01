# TeamFlow Authenticated UI Redesign Audit (Phase 1)

## 1. Current UI Architecture
The application is a client-side Vite React 19 application with TypeScript and Tailwind CSS.
State is centralized in `src/context/AppContext.tsx` (`AppProvider` & `useApp`), with client-side push-state navigation managed by `src/hooks/useRouter.ts`.

### Layout Composition
- **Window Wrapper**: `src/App.tsx` renders the outer application container.
- **Navigation Shell**:
  - `src/components/shell/WorkspaceRail.tsx`: 60px/64px left rail displaying workspace switcher tiles and create-workspace trigger.
  - `src/components/shell/Sidebar.tsx`: Navigation sidebar with workspace header, primary links (Home, Channels, DMs), and bottom administration links.
  - `src/components/shell/TopBar.tsx`: Top bar with workspace breadcrumb, search input, notification bell, and user profile dropdown.
  - `src/components/shell/MobileDrawer.tsx`: Responsive slide-over drawer for tablet/mobile viewports.
- **Core View Router**: `src/App.tsx` routes between views:
  - `/app` or `/`: `WorkspaceHomeView.tsx`
  - `/app/channels/:slug`: `ChannelView.tsx`
  - `/app/dms/:conversationId`: `DmView.tsx`
  - `/app/search`: `SearchView.tsx`
  - `/app/settings`: `SettingsIndexView.tsx`
  - `/app/settings/members`: `SettingsMembersView.tsx`
  - `/app/settings/workspace`: `SettingsWorkspaceView.tsx`
  - `/app/settings/profile`: `SettingsProfileView.tsx`
  - `/app/settings/notifications`: `SettingsNotificationsView.tsx`
- **Feed & Messaging Components**:
  - `src/components/feed/MessageFeed.tsx`: Message stream with jump-to-latest button, empty states, and virtual scroll behavior.
  - `src/components/feed/MessageItem.tsx`: Message item with avatar, reactions, mentions, thread reply counter, and action toolbar.
  - `src/components/feed/MessageComposer.tsx`: Input composer with textarea, formatting actions, @-mention autocomplete, and file attachment draft support.
  - `src/components/feed/ThreadPanel.tsx`: Side panel / bottom sheet for threaded discussions.
- **Primitives**:
  - `src/components/primitives/AuthField.tsx`: Standardized accessible form field with validation states.
  - `src/components/primitives/Dialog.tsx`: Accessible modal dialog with focus traps, escape dismissal, and backdrop.
  - `src/components/primitives/MessageListSkeleton.tsx`: Calm pulse skeleton loader.
  - `src/components/primitives/Toast.tsx`: Status notifications.

## 2. Routes & Data Sources
- **Workspaces**: `activeWorkspace`, `workspaces`, `switchWorkspace`, `createWorkspace`, `renameWorkspace`, `deleteWorkspace`.
- **Members**: `currentUser`, `members`, `updateCurrentUser`, `updateMemberRole`, `removeMember`, `pendingInvites`, `inviteMember`, `revokeInvite`.
- **Channels**: `channels`, `createChannel`, `updateChannel`, `deleteChannel`, `joinChannel`, `leaveChannel`, `toggleFavoriteChannel`, `toggleMuteChannel`.
- **Direct Messages**: `conversations`, `getOrCreateDmConversation`.
- **Messages & Threads**: `messages`, `sendMessage`, `addReaction`, `removeReaction`, `deleteMessage`, `editMessage`, `activeThreadId`, `setActiveThreadId`.
- **Notifications**: `notifications`, `unreadNotificationsCount`, `markAllNotificationsRead`, `notificationPreferences`, `updateNotificationPreferences`.
- **Search**: URL search params (`?q=&type=&in=&from=`) filtering messages, channels, members, and attachments.

## 3. Functionality That Must Remain Untouched
1. All state transitions, hooks, and context dispatchers in `AppContext.tsx`.
2. Workspace switching, creation, renaming, and type-to-confirm deletion.
3. Channel creation, topic/description editing, member management, leaving, and deletion.
4. Message creation, editing, deleting, multi-reaction toggling, and file attachment draft flow.
5. Thread reply workflows and focus management.
6. Search URL synchronization and query filtering.
7. Members permissions, role changes, invite links, and invitation revocation.
8. Accessibility guarantees: full keyboard navigation, escape closures, ARIA live regions, focus traps.

## 4. Visual Changes Required (Per Reference Image)
1. **Design Tokens & Palette (`src/index.css`)**:
   - Transition from high-contrast purple-tinted whites to warm neutral foundation:
     - Canvas background: `#FAF9F8`
     - Secondary surfaces: `#F6F5F3`
     - Sidebar background: `#F7F6F5`
     - Elevated surfaces: `#FFFFFF`
     - Text primary: `#171A21`
     - Text secondary: `#4F5360`
     - Text muted: `#737782`
     - Borders: `#E4E2DF` and subtle `#ECEAE7`
     - Brand blue accent: `#3157D5` (hover `#2547BE`, soft `#EEF2FF`)
     - Mac traffic lights: `#EE6A62` (close), `#E9B949` (minimize), `#46B96B` (expand).
2. **Mac Application Shell (`src/App.tsx`, `WorkspaceRail.tsx`, `Sidebar.tsx`, `TopBar.tsx`)**:
   - Window styling with rounded corners (18–22px), subtle outer border `#E4E2DF`, and soft shadow (`0 20px 60px rgba(20, 24, 32, 0.10)`).
   - Top-left traffic light controls (`● ● ●`).
   - Compact 64px Workspace Rail with active brand indicator, square workspace tiles ([AF], [OL], [HY]), and dashed `+` tile.
   - Refined Sidebar with workspace header (`Acme Flow ▾`, `Enterprise workspace`, new message compose icon), compact primary navigation (Home active pill, Threads, Mentions, Drafts), clean CHANNELS and DIRECT MESSAGES sections with inline `+` triggers, and footer actions (`Invite people`, `Workspace settings`).
   - TopBar with refined search bar (`Search messages, channels, and people...` + `⌘ K`), notification bell with unread dot, and user profile pill with real user name, presence dot, and `• Online` subtitle.
3. **Home Screen (`WorkspaceHomeView.tsx`)**:
   - Eliminate card clutter, fake metrics, and dense dashboards.
   - Implement editorial vector illustration matching reference (geometric hills, warm sun, floating window card with avatars, pastel palette).
   - Dynamic greeting: "Good morning, [User]" / "Good afternoon, [User]" using real user first name.
   - Clean workspace subtitle: "You’re in [Workspace Name]. Let’s make progress together."
   - Centered search input with `⌘ K` keyboard shortcut.
   - Primary action `#2E3440` "Create a channel" and secondary white "Invite your team".
   - Editorial quote: "“Great teams build more together.” — TeamFlow".
   - Quiet, honest recent activity section or minimal state.
4. **Channel, DM, Message, and Settings Refinements**:
   - Calm, non-bubble messages sitting directly on canvas.
   - White refined composer with 12px radius, subtle border `#E4E2DF`.
   - Settings window adhering to the macOS preference aesthetic.

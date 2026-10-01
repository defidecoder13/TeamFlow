# TeamFlow Authenticated UI Audit & Redesign Specification

This document audits the existing authenticated TeamFlow application architecture, inventories routes and components, cataloges current visual inconsistencies, and defines the redesign implementation plan adhering to the finalized Home screen design system.

---

## 1. Current Routes & Mapping

| Route Pattern | View Component | Status & Role |
| :--- | :--- | :--- |
| `/app`, `/` | `WorkspaceHomeView.tsx` | **Visual Source of Truth**. Minimalist workspace hub, greeting, quick jumps, channels preview, activity feeds. |
| `/app/channels/:slug` | `ChannelView.tsx` | Realtime channel conversation screen, topic, member counts, star/mute toggles, message feed, rich composer, thread sidebar. |
| `/app/dms/:conversationId`| `DmView.tsx` | 1-on-1 and Group Direct Messages, participant avatars, presence dots, shared message feed & composer. |
| `/app/search` | `SearchView.tsx` | Omnisearch across messages, channels, members, and attachments with granular category filter tabs and In/From qualifiers. |
| `/app/threads` | `ThreadsView.tsx` *(new)* | Dedicated workspace threads view displaying active discussion threads, channel origins, participant previews, and reply counts. |
| `/app/mentions` | `MentionsView.tsx` *(new)* | Dedicated mentions view displaying all tagged discussions (`@alex`, `@everyone`, etc.) with quick jump to source. |
| `/app/drafts` | `DraftsView.tsx` *(new)* | Dedicated message drafts view displaying autosaved channel & DM drafts with resume and discard controls. |
| `/app/settings` | `SettingsIndexView.tsx` | Settings navigation overview cards (Profile, Members, Workspace, Notifications). |
| `/app/settings/profile` | `SettingsProfileView.tsx` | User profile, display name, avatar URL, title, status message, live avatar preview. |
| `/app/settings/members` | `SettingsMembersView.tsx` | Workspace member roster, presence status, role assignment (Owner, Admin, Member, Guest), invite links, revoke flow. |
| `/app/settings/workspace` | `SettingsWorkspaceView.tsx` | Workspace identity, display name, immutable domain slug, and Danger Zone deletion modal. |
| `/app/settings/notifications` | `SettingsNotificationsView.tsx` | Notification preferences for mentions, DMs, threads, and email digest schedule. |

---

## 2. Current Components & Hierarchy

- **Shell & Navigation:**
  - `Sidebar.tsx`: Single continuous sidebar with integrated workspace switcher popover, primary nav (Home, Threads, Mentions, Drafts), Channels list with hover shortcuts (copy link, star, mute), Direct Messages list with live presence dots, and bottom administration buttons.
  - `TopBar.tsx`: Global search bar (`⌘K`), unread notification bell with interactive dropdown menu, and user profile trigger with presence dot and session menu.
  - `MobileDrawer.tsx`: Responsive drawer enclosing the unified sidebar with ESC / overlay dismissal.
- **Feed & Messaging:**
  - `MessageFeed.tsx`: Virtualized/grouped message list by date, empty states, and inline thread triggers.
  - `MessageItem.tsx`: Avatar, presence indicator, role badges, markdown/code formatting, reaction pills, attachment pills, thread preview button, and hover toolbar (quick react, thread reply, copy text, bookmark, edit, delete).
  - `MessageComposer.tsx`: Multi-line auto-expanding textarea, markdown formatting buttons (bold, italic, code, list, link), `@mention` autocomplete listbox, file attachment upload with progress/limits, and Enter/Shift+Enter keyboard management.
  - `ThreadPanel.tsx`: Resizable/docked thread side panel with root message, replies list, and compact thread composer.
- **Primitives & Modals:**
  - `Dialog.tsx`: Accessible dialog with focus trapping, scroll locking, and accessible labels.
  - `AuthField.tsx`: Reusable text input with label, prefix/suffix text, error, and helper texts.
  - `MessageListSkeleton.tsx`: Conversation loading placeholder skeleton.
  - `Toast.tsx`: Toast status announcer.
  - `CreateChannelDialog.tsx`, `CreateWorkspaceDialog.tsx`, `InviteMemberDialog.tsx`, `ChannelMembersDialog.tsx`.

---

## 3. Data Sources & State Management (`AppContext.tsx`)

- **State Store:** React Context (`AppContext`) holding workspaces, active workspace, channels, direct messages, messages, members, current user, notifications, pending invites, and preferences.
- **Persistence & Operations:**
  - Realtime mock store initialized with authentic seed records in `initialData.ts`.
  - CRUD operations for workspaces, channels, members, direct messages, message reactions, threads, and attachments.
  - In-place editing and deletion hooks for user messages.
  - Draft management for draft message persistence across navigation.

---

## 4. Functionality That Must Remain Intact

1. **Authentication & Session Awareness:** Current user identity (`Alex Chen`, Staff Product Designer), presence status (`online`, `away`, `offline`), and roles (`owner`, `admin`, `member`, `guest`).
2. **Channel Management:** Creating public/private channels, editing topic/description, leaving channels, deleting channels, starring, muting, and viewing/adding members.
3. **Messaging Engine:** Sending messages, inline code and `@mention` parsing, file attachments (up to 25MB), emoji reactions with user toggle, and thread discussions.
4. **Direct Messaging:** 1-on-1 and group conversations, participant avatars, and presence status indicators.
5. **Global Search:** Keyword search across messages, channels, members, and attachments with channel and author filter dropdowns.
6. **Workspace Administration:** Renaming workspace, inviting members via email or instant link, updating member roles, removing members, revoking invites, and type-to-confirm workspace deletion.
7. **Accessibility & Keyboard Navigation:** `⌘K` for search, ESC to close modals/menus/thread panel, arrow keys for autocomplete and dropdowns, full focus trapping.

---

## 5. Visual Inconsistencies Identified & Resolution Plan

1. **Legacy Color Tokens:**
   - Some components still used residual shades (`#eeedf7`, `#f4f2fd`, `#e3e1ec`, `#ba1a1a`, `bg-black`).
   - *Resolution:* Standardize strictly on the finalized design tokens:
     - Neutral background: `#FAF9F8`
     - Sidebar background: `#F7F6F5`
     - Card / surface: `#FFFFFF`
     - Subtle border: `#E4E2DF`
     - Secondary hover: `#F1F0EE` / `#F6F5F3`
     - Text Primary: `#171A21`
     - Text Secondary: `#4F5360`
     - Text Muted: `#737782`
     - Brand Accent: `#3157D5` (with light pill `#EEF2FF`)
     - Danger: `#C94A45` (with light wash `bg-rose-50 border-rose-200`)
     - Dark action buttons: `#2E3440` (hover `#1E222A`)
2. **Skeleton Palette:**
   - `MessageListSkeleton.tsx` used old purple-tinted backgrounds.
   - *Resolution:* Update to clean neutral `#ECEAE7`.
3. **Message Inline Editing & Deletion:**
   - Add inline editing inside `MessageItem.tsx` with Save / Cancel actions, avoiding disruptive modals.
   - Provide message deletion with prompt confirmation.
4. **Primary Navigation Destinations (Threads, Mentions, Drafts):**
   - Provide dedicated screens for `/app/threads`, `/app/mentions`, and `/app/drafts` matching the refined Home screen structure and aesthetic.
5. **Consistency across Channel, DM, Search, and Settings:**
   - Ensure header heights (`56px` / `h-14`), borders (`#E4E2DF`), search input styles, button radii (`rounded-[8px]`), and card shadows (`shadow-2xs`) align uniformly.

---

## 6. Implementation Phases

- **Phase 1:** Complete this audit documentation (`AUTHENTICATED_UI_AUDIT.md`).
- **Phase 2:** Refine shared primitives (`MessageListSkeleton`, `Toast`, `Dialog`, inline message edit controls).
- **Phase 3:** Redesign Channel Screen (`ChannelView.tsx`) & Message Composer/Item refinements.
- **Phase 4:** Redesign Direct Messages Screen (`DmView.tsx`).
- **Phase 5:** Implement dedicated Views for Threads (`ThreadsView.tsx`), Mentions (`MentionsView.tsx`), and Drafts (`DraftsView.tsx`).
- **Phase 6:** Redesign Search Screen (`SearchView.tsx`).
- **Phase 7:** Redesign Settings Suite (`SettingsIndexView`, `SettingsWorkspaceView`, `SettingsMembersView`, `SettingsProfileView`, `SettingsNotificationsView`).
- **Phase 8:** Verification with `compile_applet` and test pass.

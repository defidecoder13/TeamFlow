# TeamFlow — Product Context

## Platform

Web (Next.js App Router + React + TypeScript + Tailwind v4). Desktop-first
authenticated team collaboration; responsive down to phones (drawer nav,
bottom-sheet threads, 44px coarse-pointer targets).

## Product

TeamFlow is a multi-tenant team collaboration workspace focused on real-time
communication, offline reliability, and permission-aware retrieval. Users:
small dev teams, startups, project teams, and remote teams.

## Register & Visual Direction

"A calm, premium macOS-inspired collaboration workspace with editorial typography,
warm neutral surfaces, restrained functional color, and carefully crafted vector illustrations."

Design SERVES the product. The interface feels like a polished native macOS
productivity application translated into a modern web environment:
- Warm neutral foundation (80–90% neutral: `#F8F7F6`, `#FAF9F8`, `#F5F4F3`, `#FFFFFF`).
- Restrained functional color (cobalt blue `#3157D5` for primary actions/focus; soft secondary accents).
- Single Inter typographic family with editorial hierarchy.
- Soft macOS-like surfaces with hairline 1px borders (`#E2E1E1`) and whisper-soft elevation.
- Flat vector illustrations (editorial, geometric, human, atmospheric).
- Standard states on every control. No fake metrics, no demo content, no dead controls.

## Brand Personality

Calm, premium, minimal, human, editorial, spacious, approachable, refined,
lightweight, functional, and trustworthy. Native macOS clarity, quiet hairline
structure, understated executive rhythm, never decorative.

## Anti-references

- No generic SaaS dashboard look with crowded KPI cards or neon charts.
- No enterprise admin panel look with dense gray tables.
- No generic AI-generated interface look with purple/violet gradients.
- No heavy glassmorphic or blur-saturated overlays.
- No Slack clone styling; TeamFlow has an editorial, native macOS character.
- No interface where every button, card, and chip is an exaggerated rounded pill.
- No fake activity, fake users, mock analytics, percentages, or simulated workspace data.
- No placeholder actions: every button/link maps to a real route or API.
- No "Spaces" terminology (canonical: channels). No Drafts (canonical: Saved).
- No AI assistant UI (future concept only). No huddles, no exports, no seats meters.
- No remote image hotlinks; initials avatars or valid user profile uploads only.

## Core Surfaces (Authenticated shell is permanent)

Workspace rail (56–64px: brand mark, switcher, add) → sidebar (240–256px:
workspace identity, Home, channels, DMs, Members/Workspace/Settings) → top
bar (56–64px: breadcrumb, ⌘K search input → /app/search?q=, Active badge,
notifications, user menu) → main workspace canvas.

## Routes (/app)

- `/app` — Workspace Home (greeting, invite/create actions, 3 onboarding
  cards, honest empty activity)
- `/app/channels/[slug]` — Channel view (header, feed, composer, thread panel)
- `/app/dms/[conversationId]` — 1:1 and group DMs
- `/app/search` — URL-driven search (`?q=&type=&in=&from=…`)
- `/app/settings/members` — Members, roles, invitations
- `/app/settings/workspace` — Rename, delete (owner-only)
- `/app/settings/profile` — Display name, avatar
- `/app/settings/notifications` — Notification delivery preferences

## Voice

Direct, honest, calm, concise, warm, and confident. Avoid hype (no "Unlock the
ultimate productivity experience!!!", prefer "A calmer way to work together.").
Empty states state facts and offer the next real action. Errors explain and offer
retry. Sentence case, consistent nouns everywhere (workspace, channel, thread,
reply, member, invitation).

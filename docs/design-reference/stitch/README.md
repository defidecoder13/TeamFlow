# TeamFlow Stitch Design References (Historical Export)

> **MIGRATION STATUS NOTICE:**  
> This directory contains **legacy historical design references** exported from Google Stitch during Phase 0.
> Its color palette (cool lavender `#fbf8ff`, Material Design 3 tokens) and layout mocks have been **superseded**.
>
> The **authoritative, single source of truth** for all visual design rules, color palettes, typography scales,
> component specifications, and future redesign phases is:
>
> 👉 **`apps/web/DESIGN.md` (TeamFlow Design System v2.0)**
>
> Consult this directory only for historical context and layout breakdown ideas; never use its tokens or raw HTML.

---

> **Actual location:** `docs/design-reference/stitch/` (singular `design-reference`).
> If you were told `docs/design-references/stitch/`, that path does not exist — this directory is the package.

## 1. Purpose

This directory is a **legacy design reference package only**, exported from Google Stitch. It exists so future
frontend tasks can see previous wireframe compositions while implementing real features. It is **not**
source code, **not** a component library, and **not** an architecture proposal. Nothing here runs in
the application and nothing here may be imported, copied as-is, or treated as a backend contract.

## 2. Exported screen inventory

| Folder                             | Screen                             | `screen.png`              | `code.html` |
| ---------------------------------- | ---------------------------------- | ------------------------- | ----------- |
| `sign_in_teamflow_2/`              | Sign In (current)                  | ✅ real screenshot        | ✅ 12 KB    |
| `sign_in_teamflow_1/`              | Sign In (older variant)            | ⚠️ 28-byte stub, no image | ✅ 22 KB    |
| `sign_up_teamflow/`                | Sign Up                            | ✅ real screenshot        | ✅ 18 KB    |
| `workspace_home_polished/`         | Workspace Home                     | ✅ real screenshot        | ✅ 24 KB    |
| `direct_message_alex_morgan/`      | Direct Message (Alex Morgan)       | ⚠️ 28-byte stub, no image | ✅ 30 KB    |
| `workspace_members_teamflow/`      | Workspace Members                  | ✅ real screenshot        | ✅ 31 KB    |
| `search_results_teamflow/`         | Search Results                     | ✅ real screenshot        | ✅ 34 KB    |
| `ai_workspace_assistant_teamflow/` | AI Workspace Assistant             | ✅ real screenshot        | ✅ 24 KB    |
| `teamflow_design_system/`          | Design system source (`DESIGN.md`) | n/a                       | n/a         |

There is **no Channel or Thread folder** in this export.

## 3. Historical visual references

These screens illustrate previous layout compositions:

- **Sign In** → `sign_in_teamflow_2/` (the variant **with** the screenshot)
- **Sign Up** → `sign_up_teamflow/`
- **Workspace Home** → `workspace_home_polished/`
- **Direct Message** → `direct_message_alex_morgan/` (code-only: its `screen.png` is a stub)
- **Workspace Members** → `workspace_members_teamflow/`
- **Search Results** → `search_results_teamflow/`
- **AI Workspace Assistant** → `ai_workspace_assistant_teamflow/`

## 4. Reference-only / older variants

- **`sign_in_teamflow_1/` — reference only.** Older sign-in variant. Consult only for alternate form ideas.
- **Channel + Thread — reference only.** No folder for these exists in this export. Reuse the channel and thread patterns defined in `apps/web/DESIGN.md`.

## 5. Superseded Design System Source

The local file `teamflow_design_system/DESIGN.md` in this directory contains the **legacy Phase 0 Stitch export tokens** (Material Design 3 schema and cool-lavender `#fbf8ff` / `#f4f2fd` colors).

**Do NOT use tokens from `teamflow_design_system/DESIGN.md`.**  
The active, authoritative design tokens and rules live in:
👉 **`apps/web/DESIGN.md`** (TeamFlow Design System v2.0 with warm neutral foundation `#F8F7F6`, restrained blue `#3157D5`, and editorial typography).

## 6. Screen notes (historical layout context)

- **Sign In:** macOS window frame with traffic lights; two-column split; brand panel; form side.
- **Sign Up:** Mirrored split; brand panel; form side.
- **Workspace Home:** OVERVIEW label + date, "Good morning, {name}", onboarding cards with pastel icon tiles, genuine "Nothing here yet." activity empty state.
- **Direct Message:** Conversation header, day divider, message rows, composer.
- **Workspace Members:** Members table with role pills, invite buttons, pending-invite rows.
- **Search Results:** Query bar with scope chips, result counts, type tabs, mixed result cards with highlight marks.
- **AI Assistant (unimplemented concept):** Concept only. Not part of core product.

## 7. Rules for using Stitch references

1. **`apps/web/DESIGN.md` is the single source of truth** for all tokens, colors, typography, and component styling.
2. **`code.html` is an implementation reference, NOT production code.**
3. **Existing TeamFlow architecture and documentation always take priority over Stitch HTML.**
4. **Future implementations must use the existing Next.js + React + TypeScript + Tailwind architecture.**
5. **Dynamic data must replace Stitch mock data.**
6. **TeamFlow canonical terminology wins** ("channels", not "spaces"; "Saved", not "Drafts").

# TeamFlow Stitch Design References

> **Actual location:** `docs/design-reference/stitch/` (singular `design-reference`).
> If you were told `docs/design-references/stitch/`, that path does not exist — this directory is the package.

## 1. Purpose

This directory is a **design reference package only**, exported from Google Stitch. It exists so future
frontend tasks can see the approved look-and-feel while implementing real features. It is **not**
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

## 3. LOCKED visual references

These screens are approved as the visual target for their future implementation tasks:

- **Sign In** → `sign_in_teamflow_2/` (the variant **with** the screenshot)
- **Sign Up** → `sign_up_teamflow/`
- **Workspace Home** → `workspace_home_polished/`
- **Direct Message** → `direct_message_alex_morgan/` (code-only: its `screen.png` is a stub;
  use the layout below plus the shared shell language from the screenshotted screens)
- **Workspace Members** → `workspace_members_teamflow/`
- **Search Results** → `search_results_teamflow/`
- **AI Workspace Assistant** → `ai_workspace_assistant_teamflow/`

“Locked” means: match the composition, hierarchy, spacing rhythm, and token usage of the
screenshot. It never means copying the HTML.

## 4. Reference-only / older variants

- **`sign_in_teamflow_1/` — reference only.** Older sign-in variant (contains both “Welcome back”
  and “Create an account” panels, “Keep me signed in”, “Forgot password”). Same brand copy as the
  locked variant, but no screenshot exists, so it cannot be the visual truth. Consult only for
  alternate form ideas.
- **Channel + Thread — reference only.** No folder for these exists in this export. When channel
  and thread UI are built, reuse the message-row, composer, and shell patterns from Direct Message
  and Workspace Home instead of inventing a new language.

## 5. Design system source

`teamflow_design_system/DESIGN.md` is the token and principle source: Inter type scale
(display 40 → caption 12, tight negative tracking on headlines, uppercase `label-sm` eyebrows),
surface scale (`#fbf8ff` canvas → `#ffffff` containers), charcoal `#18181B` / zinc `#71717A` /
`#A1A1AA` text hierarchy, hairline `#EAE8E4` borders, 8px controls / 12px cards / 16–24px
windows, three elevation levels, and the desktop-first shell model (256px rail, ⌘K search,
16px icons, 34px nav rows). Responsive breakpoints: desktop ≥1024px, tablet drawer
768–1023px, single-column mobile <768px.

## 6. Screen notes (what to take from each)

Shared shell (Home, Members, Search, AI, DM): far-left icon rail (mark, nav icons, add,
bottom avatar) → 256px sidebar (workspace switcher; Home / Threads / Mentions / Saved;
SPACES channels; DIRECT MESSAGES with presence dots; Settings / Help) → top bar (breadcrumb,
⌘K search, presence, bell, profile) → lavender-tinted canvas. Sidebar contents **vary per
screenshot** (see §8) — follow the task’s phase scope, not any single screenshot.

- **Sign In (locked):** macOS window frame with traffic lights; 50/50 split; lavender brand
  panel (∞ mark + TeamFlow, eyebrow “A calmer way to work together”, headline “Ideas,
  discussions and progress. All in one place.”, geometric mountain/sphere visual, footnote);
  form side (top-right switch link, “Welcome back”, icon-led email/password inputs with
  show/hide, black “Sign in →” button). Do NOT copy: remember-me checkbox, “Forgot password?”,
  “OR CONTINUE WITH” social buttons.
- **Sign Up (locked):** mirrored split; eyebrow “BUILD TOGETHER”, headline “A workspace for
  what’s next.”, name/email/password, black “Create account →”. Do NOT copy: social buttons or
  the Terms/Privacy footer as functional links (no such pages exist).
- **Workspace Home (locked):** OVERVIEW label + date, “Good morning, {name}”, spec supporting
  copy, Invite/Create actions, three onboarding cards with pastel icon tiles, genuine
  “Nothing here yet.” activity empty state.
- **Direct Message (locked, code-only):** conversation header (avatar, name, presence, huddle /
  search / details actions), day divider, message rows (avatar, name, time, “You” badge, hover
  toolbar: react / reply / bookmark / more), code block, composer (bold/italic/code/link,
  attach/emoji, ⌘↵ hint, Send). Never hotlink the `googleusercontent.com` avatar URLs.
- **Workspace Members (locked):** members table (role pills Owner/Admin/Member, Active dots,
  joined dates, Edit/⋯), “2 pending invitations”, seats meter, Export CSV + Invite buttons,
  pending-invite rows (Resend/Revoke). Buttons stay visual-only until the backend exists.
- **Search Results (locked):** query bar with scope chips + “ESC to clear”, result counts, type
  tabs (All/Messages/Files/People/Spaces), mixed result cards with highlight marks, right rail
  (Scope & Modifiers, prefix-tag shortcuts, activity sparkline). The sparkline/“+142%”/“14ms”
  figures are fake analytics — never present mock metrics as real.
- **AI Assistant (locked):** scope pill (“All spaces & DMs”), chat bubbles, numbered grounded
  answer, SOURCES cards, suggestion chips, composer with workspace chip + ⌘↵ hint. Future
  answers must still pass the same workspace/channel permission filtering as search
  (AGENTS.md rule 9).

## 7. Rules for using Stitch references

1. **Screenshots are the visual source of truth.** Where `screen.png` is a real image, match it.
   Where it is a stub (`sign_in_teamflow_1`, `direct_message_alex_morgan`), say so and fall back
   to `code.html` layout plus sibling screenshots.
2. **`code.html` is an implementation reference, NOT production code.** Read it for layout order,
   spacing values, and component breakdown — then reimplement in our architecture.
3. **Existing TeamFlow architecture and documentation always take priority over Stitch HTML.**
   On any conflict, `teamflow-documentation/docs/` and `AGENTS.md` win.
4. **Future implementations must use the existing Next.js + React + TypeScript + Tailwind
   architecture.** Stitch files are static HTML with the Tailwind Play CDN, inline
   `tailwind.config` theme extensions, Google Fonts (Inter variable, Material Symbols), and
   `darkMode: class`. None of that may enter the repo: no CDN scripts, no icon fonts, no new
   frameworks, no new auth/database/state systems. Translate tokens to the Tailwind v4 setup;
   keep the system font stack and hand-drawn SVG icons unless a task explicitly decides otherwise.
5. **Reuse existing TeamFlow components** (`components/auth/*`, `components/app/*`, `lib/*`)
   rather than reproducing Stitch markup. Extend the system; do not fork it.
6. **Dynamic data must replace Stitch mock data.** Mock names (John Smith, Acme Studio, Alex
   Morgan, Sarah Chen, David Kim, Maya Patel), static dates (“Wednesday, Oct 24”, “Jan 12,
   2024”), counts (“24 results”, “5 of 10 seats”), and activity content are demonstration data
   only. Greetings, dates, counts, and activity must be runtime-derived.
7. **TeamFlow terminology and backend contracts win where Stitch differs** (see §8).

## 8. Known Stitch ↔ TeamFlow conflicts

- **“Drafts” vs “Saved”:** some screenshots (Home, Search) show “Drafts”. **“Saved” is canonical**
  TeamFlow navigation — never implement “Drafts”.
- **Sidebar contents drift between screenshots** (Members/AI Assistant appear in some, not
  others). Sidebar membership follows the implementation phase, not any one screenshot.
- **“Spaces” vs channels:** Stitch mixes “SPACES” labels with `#channel` rows and “Create a
  space”. TeamFlow canonical terminology is **channels** (`docs/02`, `docs/05`).
- **Unimplemented controls pictured:** social logins, forgot-password, remember-me, Terms/Privacy
  links, Export CSV, invite flows, huddles, message actions. Per the established Phase 1C rule,
  never render controls for features that do not exist; upcoming actions are disabled with
  explanations until their backend lands.
- **Accent usage:** Stitch uses cobalt `#1f44e4`/`#3B5BF8` links and focus rings; the implemented
  auth UI is monochrome stone. Keep future accent use restrained and consistent with whatever
  the active task specifies.
- **“Global Index” scope and “Syncing real-time” pills** imply backend capabilities that do not
  exist yet — visual ideas only, backend contracts rule.

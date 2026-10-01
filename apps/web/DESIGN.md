---
name: TeamFlow Design System
version: 2.0.0
status: authoritative
principle: "A calm, premium macOS-inspired collaboration workspace with editorial typography, warm neutral surfaces, restrained functional color, and carefully crafted vector illustrations."
tokens:
  canvas:
    primary: '#F8F7F6'
    warm: '#FAF9F8'
    soft: '#F5F4F3'
  surface:
    primary: '#FFFFFF'
    secondary: '#F5F4F3'
    tertiary: '#EFEEED'
    hover: '#F0EFF2'
    selected: '#E9E8EE'
    sidebar: '#F7F6F7'
  borders:
    primary: '#E2E1E1'
    soft: '#ECEAEA'
    focus: '#3157D5'
  text:
    primary: '#171A21'
    secondary: '#4F5360'
    muted: '#737782'
    placeholder: '#9296A0'
    disabled: '#A7A9AF'
  accent:
    primary: '#3157D5'
    hover: '#2547BE'
    soft: '#EEF2FF'
    surface: '#EAF0FF'
  secondary-accents:
    blue: '#4F6FE8'
    green: '#48B88A'
    amber: '#E8A33A'
    cyan: '#55B7C8'
    purple: '#8B72D8'
    coral: '#E47C68'
  illustration:
    blue-gray: '#B9C7DE'
    lavender: '#D7D2EC'
    sand: '#DCC8BA'
    sage: '#C5D7CF'
    dusty-rose: '#D7B6AE'
  traffic-lights:
    red: '#EE6A62'
    yellow: '#E9B949'
    green: '#46B96B'
  presence:
    online: '#35B879'
    away: '#E4A53A'
    offline: '#A3A6AC'
  buttons:
    primary-bg: '#2E3440'
    primary-text: '#FFFFFF'
    secondary-bg: '#FFFFFF'
    secondary-border: '#DEDDE0'
    secondary-text: '#242832'
    secondary-hover: '#F5F4F4'
    danger: '#BA1A1A'
  inputs:
    bg: '#FFFFFF'
    border: '#DDDCDF'
    placeholder: '#9296A0'
    focus-border: '#3157D5'
    focus-ring: 'rgba(49, 87, 213, 0.10)'
  shadows:
    floating: '0 4px 16px rgba(20, 25, 35, 0.08)'
    dialog: '0 20px 60px rgba(20, 25, 35, 0.12)'
---

# TeamFlow Design System (v2.0)

> **SINGLE SOURCE OF TRUTH**  
> This document specifies the authoritative visual design language, color tokens, typography scales, component rules, and interaction patterns for TeamFlow. All future UI redesign work—across marketing, authentication, and the authenticated application—must strictly adhere to the standards documented here.
>
> *(Supersedes all legacy Material Design 3 tokens and previous Stitch export references).*

---

## 1. Core Visual Principle

> **"A calm, premium macOS-inspired collaboration workspace with editorial typography, warm neutral surfaces, restrained functional color, and carefully crafted vector illustrations."**

The interface feels like a polished, native macOS productivity application translated into a modern web environment: tactile, restrained, highly readable, and quiet.

### Essential Character:
- **Calm**: 80–90% of the interface remains warm and neutral; color is never deployed for decoration alone.
- **Premium**: Crisp 1px hairlines, subtle surface contrast, and soft ambient elevation over heavy drop shadows.
- **Editorial**: Deliberate type hierarchy using `Inter` with tight negative tracking on display headlines and generous line heights for body copy.
- **Human & Approachable**: Warm neutral canvases (`#F8F7F6`, `#FAF9F8`) replace clinical stark whites or cold corporate grays.
- **Spacious**: Clear 8px base rhythm with breathing room between functional groupings.
- **Functional**: Every interactive element maps to a real operation; zero fake data or decorative controls.

### Explicit Anti-References (What TeamFlow is NOT):
- **NOT** a generic SaaS dashboard with crowded KPI cards and neon charts.
- **NOT** an enterprise admin panel with dense, cluttered gray tables.
- **NOT** a generic AI-generated interface with random purple/violet gradient overlays.
- **NOT** a heavily glassmorphic or blur-saturated product.
- **NOT** a Slack clone; TeamFlow has an editorial, native macOS character.
- **NOT** an interface where every button, card, and chip is an exaggerated rounded pill.

---

## 2. Core Design Foundation

The visual architecture is structured around seven interdependent pillars:

```
NEUTRAL FOUNDATION (80–90% warm neutrals)
       +
RESTRAINED COLOR (functional accents only)
       +
STRONG TYPOGRAPHY (editorial Inter ramp)
       +
SOFT MACOS-LIKE SURFACES (tactile window panes)
       +
VECTOR ILLUSTRATION (flat, human, geometric)
       +
SPACIOUS LAYOUT (8px spatial rhythm)
       +
SUBTLE INTERACTION (micro-transitions, press feedback)
```

### Color Distribution Principle
Color exists to support visual hierarchy, guide focus, and signify state—not to decorate:
- **80–90% Neutral**: Canvases, window panes, sidebars, borders, cards, and primary text.
- **10–20% Color**: Brand mark, functional state indicators, active navigation highlights, avatars, vector illustrations, and contextual primary actions.

### Depth & Elevation Hierarchy
Depth is established without visual noise using a strict 4-step hierarchy:
1. **Spacing**: White space separates unrelated sections.
2. **Surface Contrast**: Shifting between canvas (`#F8F7F6`), secondary surface (`#F5F4F3`), and primary surface (`#FFFFFF`).
3. **Borders**: Hairline 1px borders (`#E2E1E1`, `#ECEAEA`) define crisp perimeters.
4. **Subtle Shadow**: Applied only to floating overlays and dialogs—never on everyday cards.

---

## 3. Color System

### Canvas Palette
The foundational backdrop on which windows, sidebars, and work surfaces sit:
- **Primary Canvas**: `#F8F7F6` — Default application window canvas and page backdrop.
- **Warm Canvas**: `#FAF9F8` — Editorial split-view panels and hero backdrops.
- **Soft Canvas**: `#F5F4F3` — Subdued container sections and outer window gutters.

### Surface Palette
Interior panes, cards, toolbars, and navigation rails:
- **Primary Surface**: `#FFFFFF` — High-focus panels, message feeds, input fields, and modal containers.
- **Secondary Surface**: `#F5F4F3` — Inset containers, message composer bar, and card fills.
- **Tertiary Surface**: `#EFEEED` — Elevated chips, search fields, and subtle badges.
- **Hover Surface**: `#F0EFF2` — Interactive list rows, buttons, and nav item hover state.
- **Selected Surface**: `#E9E8EE` — Active navigation item, active channel row, or selected message.
- **Sidebar Surface**: `#F7F6F7` — Left-hand primary navigation sidebar and drawer interior.

### Border Palette
Crisp 1px boundary lines:
- **Primary Border**: `#E2E1E1` — Structural separators, card borders, window outlines.
- **Soft Border**: `#ECEAEA` — Subtle dividers, day separators, secondary grid lines.
- **Focus Border**: `#3157D5` — Active keyboard and input focus indicator.

### Typography & Ink Hierarchy
- **Primary Text**: `#171A21` — Display titles, headings, active text, button labels, high contrast.
- **Secondary Text**: `#4F5360` — Body copy, channel descriptions, member list details.
- **Muted Text**: `#737782` — Timestamps, metadata, secondary icons, breadcrumbs.
- **Placeholder**: `#9296A0` — Input placeholder text and inactive hints.
- **Disabled**: `#A7A9AF` — Disabled triggers, inert icons, unavailable options.

### Primary Functional Accent
A focused, restrained blue applied sparingly for primary affordances:
- **Primary Accent**: `#3157D5` — Hyperlinks, focus rings, selected icons, primary commit buttons.
- **Hover Accent**: `#2547BE` — Hover state for primary accent links and buttons.
- **Soft Accent**: `#EEF2FF` — Soft badge backgrounds, selected pill fills.
- **Surface Accent**: `#EAF0FF` — Active mention tags and highlighted result blocks.

*Rule: Do NOT make the entire application blue. The accent is functional, not decorative.*

### Secondary Accent Palette
Desaturated, soft, and functional accents for tags, presence, channels, and illustrations:
- **Blue**: `#4F6FE8`
- **Green**: `#48B88A`
- **Amber**: `#E8A33A`
- **Cyan**: `#55B7C8`
- **Purple**: `#8B72D8`
- **Coral**: `#E47C68`

*Rule: Avoid neon, fluorescent, or hyper-saturated tones.*

### Vector Illustration Palette
Atmospheric, quiet shades for editorial line-and-fill artwork:
- **Blue Gray**: `#B9C7DE`
- **Lavender**: `#D7D2EC`
- **Sand**: `#DCC8BA`
- **Sage**: `#C5D7CF`
- **Dusty Rose**: `#D7B6AE`

### macOS Traffic Light Indicators
Used exclusively when representing application window headers:
- **Close (Red)**: `#EE6A62`
- **Minimize (Yellow)**: `#E9B949`
- **Maximize (Green)**: `#46B96B`
- **Dimensions**: 10px diameter, 6px inter-dot spacing.

---

## 4. Typography System

The typeface across all surfaces is **Inter** (`sans-serif`).

### Font Weights
- **400 Regular**: Body copy, descriptions, message bodies, timestamps.
- **500 Medium**: Button labels, input values, navigation items, table headers.
- **600 Semibold**: Page titles, section headings, card titles, user names.
- **700 Bold**: Hero headlines, display numbers.

### Typography Scale

| Token | Size | Line Height | Weight | Letter Spacing | Purpose / Usage |
|---|---|---|---|---|---|
| **Display** | 40px | 1.05 (42px) | 500–600 | -0.035em | Marketing hero, major display statements |
| **Page Heading** | 32px | 1.15 (37px) | 600 | -0.03em | Primary view headings, auth page titles |
| **Hero** | 32–40px | 1.05–1.1 | 600 | -0.035em | Editorial banners and welcome screens |
| **Section Heading** | 18px | 1.3 (23px) | 600 | -0.015em | Panel headers, modal titles, drawer headers |
| **Card Heading** | 14–16px | 1.35 (19–22px) | 600 | -0.01em | Quick-start cards, feature module headings |
| **Body** | 14px | 1.55 (22px) | 400 | Normal | Primary chat messages, body paragraphs |
| **Secondary** | 13px | 1.45 (19px) | 400–500 | Normal | Navigation rows, metadata, sub-labels |
| **Labels / Micro** | 11–12px | 1.4 (15–17px) | 500 | +0.02em | Section eyebrows, timestamps, kbd hints |

---

## 5. Spacing System

All layouts, padding, margins, and gaps follow an **8px base rhythm**:

```
 4px  (0.25rem) → Micro spacing (icon-to-text gap, badge padding)
 8px  (0.50rem) → Small controls, item gaps, compact paddings
12px  (0.75rem) → Compact component interiors, input padding
16px  (1.00rem) → Standard component padding, list spacing
20px  (1.25rem) → Card padding, moderate section margins
24px  (1.50rem) → Generous card padding, header margins
32px  (2.00rem) → Section separation, panel gutters
40px  (2.50rem) → Major layout gutters, view transitions
48px  (3.00rem) → Primary section divisions
64px  (4.00rem) → Page-level separation, hero margins
```

*Rule: Arbitrary spacing values (e.g. 17px, 29px) are strictly prohibited.*

---

## 6. Border Radius & Shapes

TeamFlow utilizes moderate, tailored corner radii:

- **Small Controls**: `6px` — Navigation items, action badges, dropdown menus.
- **Inputs & Fields**: `8px` — Text inputs, textareas, select controls.
- **Buttons**: `8px` — Primary, secondary, and icon buttons.
- **Cards**: `10–14px` (recommended `12px`) — Dashboard cards, onboarding modules.
- **Large Windows & Dialogs**: `14–18px` (recommended `16px`) — Auth containers, modal dialogs.
- **Avatars & Pills**: `999px` (`rounded-full`) — User avatars, presence dots, status tags.

*Rule: Avoid excessive pill shapes on regular rectangular buttons or cards.*

---

## 7. Shadows & Elevation

Shadows must be subtle, diffuse, and multi-layered. Heavy, pitch-black drop shadows are banned.

- **Level 0 (Flat)**:
  - `box-shadow: none;`
  - Separation achieved strictly via border (`1px solid #E2E1E1`) and surface color contrast.
- **Level 1 (Floating Controls & Popovers)**:
  - `box-shadow: 0 4px 16px rgba(20, 25, 35, 0.08);`
  - Used on dropdown menus, emoji picker, user menu, tooltip overlays.
- **Level 2 (Modals & Sheets)**:
  - `box-shadow: 0 20px 60px rgba(20, 25, 35, 0.12);`
  - Used on centered application dialogs and slide-over drawers.
  - Backdrop: `rgba(23, 26, 33, 0.40)` with `backdrop-filter: blur(2px)`.

---

## 8. Component Specifications

### 8.1 Buttons
Buttons are compact, intentional, and clearly prioritized:

- **Primary Action**:
  - Background: `#2E3440` (Nordic dark charcoal)
  - Text: `#FFFFFF`
  - Height: `40px`
  - Border-radius: `8px`
  - Padding: `0 16px`
  - Typography: `13–14px`, weight `500–600`
  - Hover: `#1F242C`
  - Focus: Ring `2px` in `#3157D5` with `2px` offset
  - Active: Scale `0.98` with 150ms transition
- **Secondary Action**:
  - Background: `#FFFFFF`
  - Border: `1px solid #DEDDE0`
  - Text: `#242832`
  - Height: `40px`
  - Border-radius: `8px`
  - Padding: `0 16px`
  - Hover: Background `#F5F4F4`, border `#D0CFD2`
- **Danger Action**:
  - Background: `#BA1A1A`
  - Text: `#FFFFFF`
  - Height: `40px`
  - Radius: `8px`
  - Hover: `#9E1616`
- **Ghost / Icon Button**:
  - Background: `transparent`
  - Text: `#4F5360`
  - Radius: `6–8px`
  - Hover: `#F0EFF2`, text `#171A21`

### 8.2 Input Fields
- **Container**: Height `40–44px`, background `#FFFFFF`, border `1px solid #DDDCDF`, radius `8px`, horizontal padding `12px`.
- **Text**: `14px`, color `#171A21`, placeholder `#9296A0`.
- **Focus**: Border `#3157D5`, ring `box-shadow: 0 0 0 3px rgba(49, 87, 213, 0.10)`.
- **Error State**: Border `#BA1A1A`, error text `#BA1A1A` at `12px` font size.

### 8.3 Cards & Modules
- **Padding**: `20px`
- **Radius**: `12px`
- **Min-Height**: `~140px`
- **Surface**: `#FFFFFF` with hairline border `1px solid #E2E1E1`
- **Feature Icons**: `32–36px` square icon container, radius `8–10px`, soft pastel background tint (e.g. `#EEF2FF`, `#EAF0FF`), outline icon `16–20px`.
- **Hierarchy**: Small colorful icon → Card heading (14–16px, semibold) → Concise description (13px, secondary) → Contextual link/action.

### 8.4 Icon System
- **Style**: Cohesive outline icons with `1.5–2px` stroke, rounded joins, and simple geometry.
- **Default Sizes**:
  - Micro / Inline: `14–16px`
  - Navigation / Actions: `16–18px`
  - Feature / Section: `20–24px`
- **Color**: Inherits `currentColor`; matches text hierarchy unless used in a colored feature tile.

### 8.5 Avatars & Presence
- **Avatar Sizes**:
  - Small / Inline: `20–24px`
  - Navigation / Rows: `28–32px`
  - Profile / Large: `40–48px`
- **Shape**: Full circle (`999px`)
- **Initials Fallback**: Warm neutral background (`#EFEEED`) with semibold text (`#171A21`).
- **Presence Dot**:
  - Diameter: `6–8px` with `1.5px` white border cutout.
  - **Online**: `#35B879`
  - **Away**: `#E4A53A`
  - **Offline**: `#A3A6AC`

---

## 9. Surface Guidelines

### 9.1 Authentication (Sign-in / Sign-up)
- **Container**: Centered macOS-inspired application frame with subtle 1px border (`#E2E1E1`), `16px` radius, and `0 20px 60px rgba(20, 25, 35, 0.12)` shadow.
- **Desktop Layout (Two-Column, ~48% / 52%)**:
  - *Left (Marketing)*: Warm canvas (`#FAF9F8`), TeamFlow logo, editorial label ("A calmer way to work together"), bold display headline, supporting paragraph, and custom vector illustration (landscapes, workspace, geometry).
  - *Right (Form)*: White surface (`#FFFFFF`), account switch link in top-right, clean form heading, input fields, primary submit button, legal copy.
- **Mobile**: Single-column layout focusing on the form with compact branding.

### 9.2 Application Shell
- **Structure**:
  - **Workspace Rail**: `56–64px` width, background `#F8F7F6`, right border `1px solid #E2E1E1`.
  - **Sidebar**: `240–256px` width, background `#F7F6F7`, right border `1px solid #E2E1E1`.
  - **Top Bar**: `56–64px` height, background `#FFFFFF`, bottom border `1px solid #E2E1E1`.
  - **Main Content**: Background `#F8F7F6` with readable max width (`max-w-4xl` for settings/home; full bleed for messages).
- **Navigation Rows**: Height `34px`, radius `6px`, padding `0 10px`. Active row: `#E9E8EE` background with `#171A21` semibold text. (No giant high-contrast blue fills).
- **Global Search Input**: Height `36–40px`, radius `8–10px`, background `#F5F4F6`, border `1px solid #E2E1E1`, integrated `⌘K` badge.

### 9.3 Home Page (`/app`)
- **Tone**: Spacious, calm, and editorial.
- **Header**: Overview tag + formatted date.
- **Hero**: Time-based greeting ("Good morning, {name}"), warm supporting statement, primary actions ("Invite your team", "Create a channel").
- **Quick-Start Cards**: 3 lightweight modules with pastel icon containers.
- **Recent Activity**: Honest empty state with subtle vector illustration ("Nothing here yet.").

### 9.4 Empty States
- **Rule**: Never fabricate mock messages, fake channels, or false metrics.
- **Composition**: Centered subtle vector illustration or icon + concise, honest title + helpful next action button.

---

## 10. Motion & Interaction

- **Standard Timing**: `150–200ms` for micro-interactions (hovers, button presses, focus rings).
- **Surface Transitions**: `200–300ms` for larger layout surfaces (drawers, modal entrances, popovers).
- **Curves**:
  - Deliberate entrances: `cubic-bezier(0.23, 1, 0.32, 1)` (ease-out-expo).
  - Drawers & slide-outs: `cubic-bezier(0.32, 0.72, 0, 1)` (ease-drawer).
- **Press Feedback**: Subtle scale `active:scale-[0.98]` on primary clickable triggers.
- **Reduced Motion**: All animations instantly collapse (`duration: 0.01ms`) when `prefers-reduced-motion: reduce` is detected.

---

## 11. Responsive Architecture

- **Desktop (≥ 1024px)**: Full multi-pane environment: Workspace Rail + Sidebar + Top Bar + Main Workspace + Side Thread Panel.
- **Tablet (768px – 1023px)**: Workspace Rail visible; Sidebar accessible via slide-over drawer; Main content adapts smoothly.
- **Mobile (< 768px)**: Clean single-column layout. Rail collapses into mobile drawer; Top Bar search condenses to an icon trigger; Thread panel displays as a full bottom-sheet. Minimum touch target of `44px` enforced for all controls.

---

## 12. Accessibility Mandates (WCAG AA)

- **Contrast Ratios**: Minimum 4.5:1 for body text (`#171A21` on `#F8F7F6` exceeds 13:1; `#4F5360` exceeds 7:1).
- **Keyboard Navigation**: Full tab sequence, visible focus rings (`#3157D5`), arrow key navigation in menus.
- **Modal Dialogs**: Trapped focus, `aria-modal="true"`, background elements marked `inert`, Escape key dismissal, focus restoration to trigger element.
- **Semantic HTML**: Strict usage of `<nav>`, `<header>`, `<main>`, `<dialog>`, and ARIA attributes for live regions (`role="status"`, `role="alert"`).

---

## 13. Phased UI Redesign Roadmap

All subsequent implementation work must execute sequentially surface-by-surface:

1. **PHASE 1**: Landing Page (`/`)
2. **PHASE 2**: Authentication (`/sign-in`, `/sign-up`)
3. **PHASE 3**: Application Shell (Rail, Sidebar, Top Bar, Mobile Drawer)
4. **PHASE 4**: Workspace Home (`/app`)
5. **PHASE 5**: Channels View (`/app/channels/[slug]`)
6. **PHASE 6**: Message Feed & Composer
7. **PHASE 7**: Thread Panel & Replies
8. **PHASE 8**: Direct Messages (`/app/dms/[conversationId]`)
9. **PHASE 9**: Search Page (`/app/search`)
10. **PHASE 10**: Members & Invitations (`/app/settings/members`, `/invite/accept`)
11. **PHASE 11**: Workspace Settings (`/app/settings/workspace`)
12. **PHASE 12**: Notifications (`/app/settings/notifications`, Notification Center)
13. **PHASE 13**: Remaining Settings & Modals (`/app/settings/profile`, etc.)


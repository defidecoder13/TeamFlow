---
name: TeamFlow Design System
colors:
  surface: '#fbf8ff'
  surface-dim: '#dad9e3'
  surface-bright: '#fbf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f2fd'
  surface-container: '#eeedf7'
  surface-container-high: '#e8e7f1'
  surface-container-highest: '#e3e1ec'
  on-surface: '#1a1b22'
  on-surface-variant: '#47464b'
  inverse-surface: '#2f3038'
  inverse-on-surface: '#f1effa'
  outline: '#77767b'
  outline-variant: '#c8c5cb'
  surface-tint: '#5f5e61'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1e'
  on-primary-container: '#858387'
  inverse-primary: '#c8c5ca'
  secondary: '#1f44e4'
  on-secondary: '#ffffff'
  secondary-container: '#4261fe'
  on-secondary-container: '#faf7ff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1d1b16'
  on-tertiary-container: '#88837c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4e1e6'
  primary-fixed-dim: '#c8c5ca'
  on-primary-fixed: '#1b1b1e'
  on-primary-fixed-variant: '#47464a'
  secondary-fixed: '#dee0ff'
  secondary-fixed-dim: '#bac3ff'
  on-secondary-fixed: '#00105a'
  on-secondary-fixed-variant: '#0030c8'
  tertiary-fixed: '#e8e2d9'
  tertiary-fixed-dim: '#cbc6bd'
  on-tertiary-fixed: '#1d1b16'
  on-tertiary-fixed-variant: '#494640'
  background: '#fbf8ff'
  on-background: '#1a1b22'
  surface-variant: '#e3e1ec'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.025em
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.06em
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  space-3xl: 4rem
  sidebar-width: 16rem
  app-max-width: 80rem
  window-frame-padding: 1.5rem
---

## Brand & Style

The design system is engineered for modern desktop-first team collaboration, evoking focus, poise, and tactile clarity. Inspired directly by native macOS ergonomics and refined European editorial interfaces, it rejects abrasive contrast and saturated visual noise in favor of serene warmth, breathing room, and whisper-soft architectural boundaries.

### Core Visual Tenets
- **Calm Native Precision:** Emulates window chrome, traffic light accents, and subtle hairline divides reminiscent of native macOS workspace apps.
- **Architectural Warmth:** Replaces clinical, stark blue-whites with an organic, warm-neutral canvas (`#F9F8F6`) balanced with pure porcelain cards (`#FFFFFF`) and hairline division lines (`#EAE8E4`).
- **Tactile Restraint:** Depth is articulated through faint ambient floor diffusion and structural boundaries rather than intrusive, heavy dropshadows.
- **Typographic Poise:** Crisp neutral charcoal typography provides uncompromising legibility while maintaining an understated, executive rhythm.

## Colors

The palette is tuned to reduce cognitive fatigue during prolonged working sessions, relying on natural tonality, balanced grays, and selective utility accents.

### Palette Architecture
- **Primary Anchor (`#18181B`):** Deep zinc charcoal utilized for primary action triggers, high-emphasis headlines, and active navigation indicators.
- **Interactive Accent (`#3B5BF8`):** Restrained digital cobalt deployed purposefully for links, focused states, and key contextual affordances.
- **Canvas Base (`#F9F8F6`):** An organic warm stone tone forming the application frame, split-screen hero panels, and window backdrops.
- **Surface Elevation (`#FFFFFF`):** Crisp pure white applied to interactive modules, elevated cards, inputs, dropdown popovers, and main work documents.
- **Structural Hairstyle (`#EAE8E4`):** Soft, low-contrast borders providing quiet structural compartmentalization without visual clutter.
- **Text & Hierarchy:**
  - High Contrast: `#18181B` (Headings, primary input text, button labels)
  - Medium Contrast: `#71717A` (Secondary labels, subheaders, placeholder hints)
  - Low Contrast: `#A1A1AA` (Dividers, disabled states, shortcut keycaps)

## Typography

Typography prioritizes functional neutrality, rhythmic hierarchy, and micro-legibility. Inter provides the modern, utilitarian clarity native to desktop-class operating systems.

### Usage Guidelines
- **Eyebrow Headers (`label-sm`):** Rendered in uppercase with tracking (`+0.06em`) in muted zinc (`#71717A`) to frame sections (e.g., `SPACES`, `A CALMER WAY TO WORK TOGETHER`).
- **Headlines:** Display and Headline styles employ tight negative tracking (`-0.015em` to `-0.025em`) and semi-bold weights to anchor attention without overwhelming the UI.
- **Interface Copy:** Standard desktop data density leverages `body-sm` (13px) and `body-md` (14px) for optimal information scanning in lists, sidebars, and dialogue panels.

## Layout & Spacing

The layout model is desktop-first, anchored by structured master-detail panels, fluid center stages, and fixed horizontal utility headers.

### Layout Principles
- **Shell Layout:** A desktop window wrapper featuring standard window traffic controls (`12px` diameter, `8px` gap) positioned at `top-left`. A persistent primary navigation rail (`256px` / `16rem` width) docks to the left, bounded by a vertical hairline border (`1px solid #EAE8E4`).
- **Main Canvas:** Divided flexibly between dual split-pane authentication views (50/50 hero canvas vs form container) and workspace views (left sidebar, top unified command search bar, modular dashboard grid).
- **Responsive Adaptations:**
  - **Desktop (>= 1024px):** Persistent sidebar, full multi-column grid cards, elevated dialog panels with floating placement.
  - **Tablet (768px - 1023px):** Sidebar collapses into a drawer; form containers and split screens stack vertically.
  - **Mobile (< 768px):** Single-column stacks, full-bleed sheets, and sticky action buttons at screen base.

## Elevation & Depth

The design system abandons heavy, muddy drop-shadows in favor of crisp perimeter containment and soft, ambient multi-stop diffusions that replicate natural daylight.

### Elevation Hierarchy
- **Level 0 (Flat Canvas):** Surfaces rest directly on `#F9F8F6` with no elevation. Separation relies on `1px solid #EAE8E4`.
- **Level 1 (Card & Grid Modules):** Floating panels and dashboard status tiles (`#FFFFFF`) use:
  - `box-shadow: 0 1px 2px rgba(24, 24, 27, 0.04), 0 4px 12px rgba(24, 24, 27, 0.02);`
  - Border: `1px solid #EAE8E4`
- **Level 2 (Popovers & Flyouts):** User profile sheets, action menus, and contextual search dropdowns:
  - `box-shadow: 0 4px 6px -1px rgba(24, 24, 27, 0.06), 0 16px 32px -4px rgba(24, 24, 27, 0.08);`
  - Border: `1px solid rgba(234, 232, 228, 0.9)`
- **Level 3 (Modal Windows):** Centered application dialogues:
  - `box-shadow: 0 20px 48px -8px rgba(24, 24, 27, 0.12);`
  - Backdrop: `rgba(24, 24, 27, 0.15)` with `backdrop-filter: blur(8px)`

## Shapes

The roundedness level is `2` (Rounded), providing a standard radius of `8px` (`0.5rem`), with outer window containers and macro cards scaling up to `16px` (`1rem`) and `24px` (`1.5rem`).

### Geometric Geometry
- **Form Controls & Inputs:** `8px` border radius (`rounded-md` equivalent) for clean, compact alignment.
- **Buttons:** `8px` for standard controls; `10px` for large primary submit triggers.
- **Avatars:** Fully circular (`rounded-full`) with subtle `1px` inner borders.
- **Container Window Enclosures:** Large outer frames and split-view cards employ `16px` to `20px` corner curvature to mirror modern macOS application frames.

## Components

### Buttons
- **Primary:** Background `#18181B`, text `#FFFFFF`, radius `8px`, height `40px` (or `44px` for forms). Transition `all 150ms ease`. Hover: `#27272A`. Focused: ring of `2px` in `#3B5BF8` with `2px` offset.
- **Secondary / Social OAuth:** Background `#FFFFFF`, text `#18181B`, border `1px solid #EAE8E4`, radius `8px`, height `40px`. Hover: background `#F9F8F6`, border `#D4D2CD`.
- **Tertiary / Ghost:** Transparent background, text `#71717A`. Hover: background `rgba(24, 24, 27, 0.05)`, text `#18181B`.

### Input Fields
- **Container:** Pure white background (`#FFFFFF`), border `1px solid #EAE8E4`, radius `8px`, height `42px`, horizontal padding `12px`.
- **Typography:** `14px`, text `#18181B`, placeholder `#A1A1AA`.
- **Leading/Trailing Elements:** Dedicated icon containers in muted zinc (`#71717A`), password visibility toggles with soft hover states.
- **Focus State:** Border color `#18181B` or `#3B5BF8` with an ambient glow (`box-shadow: 0 0 0 3px rgba(59, 91, 248, 0.12)`).

### Navigation & Sidebar Items
- **Items:** Height `34px`, border-radius `6px`, padding `0 10px`, icon size `16px`. Text color `#71717A`.
- **Active State:** Background `rgba(24, 24, 27, 0.06)` or pure `#FFFFFF` with slight ambient shadow, text `#18181B`, font weight `500`.

### Cards & Feature Tiles
- **Dashboard Modules:** `#FFFFFF` fill, border `1px solid #EAE8E4`, radius `12px`, padding `20px`.
- **Feature Icons:** Encased in soft pastel tinted squares (`36px × 36px`, radius `8px`), such as soft blue, mint, amber, and indigo backgrounds with centered colored iconography.

### Search Header Bar
- **Global Input:** Subtle pill or rounded rectangle (`radius 8px`), background `#F9F8F6` or `#FFFFFF`, border `1px solid #EAE8E4`, integrated keyboard command shortcut badge (`⌘K`) aligned to the right in `#A1A1AA`.

### Popover & Profile Menus
- Floating container `#FFFFFF`, radius `12px`, padding `6px`, elevation Level 2. Divider line `#EAE8E4`. Destructive actions highlighted in restrained coral-red (`#EF4444`).
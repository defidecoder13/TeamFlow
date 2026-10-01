---
target: /app every screen
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/Users/subhamsantra/Project/TeamFlow/apps/web/app/app"
timestamp: 2026-09-22T17-52-39Z
slug: apps-web-app-app
---
# Critique — TeamFlow `/app` (all 9 routes + shell)

Method: dual-agent (A: design-director review · B: detector + structural evidence).

## Design Health Score — 25/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Decorative always-on `Active` badge; upload progress locked behind global busy |
| 2 | Match System / Real World | 3 | Dual `Settings` labels; blue DM avatar disc speaks a different language |
| 3 | User Control and Freedom | 2 | Composer locks typing during send/upload; removes confirm but offer no undo |
| 4 | Consistency and Standards | 2 | Avatars, banners, error styles, channel-vs-DM headers diverge |
| 5 | Error Prevention | 3 | Solid |
| 6 | Recognition Rather Than Recall | 2 | Message actions hover-only; public roster undiscoverable |
| 7 | Flexibility and Efficiency | 2 | No shortcuts, no bulk invite, no continued typing |
| 8 | Aesthetic and Minimalist Design | 3 | Emerald + cobalt + amber + reds stretch the claimed restraint |
| 9 | Error Recovery | 3 | Composer errors auto-dismiss in 5s; page submit errors sit below the fold |
| 10 | Help and Documentation | 2 | Slug-immutable said 3x on one card; dev-link guidance thin |

## Design Specificity Verdict

LLM: disciplined but interchangeable — Slack/Linear homage with ethics-as-differentiator, no authored visual signature. Detector: 28 design-system-font-size advisories (15x 10px, 9x 15px, 4x 26px) across 14 files; zero findings in Sidebar, TopBar, dialog, drawer, WorkspaceHome. Structural pass: no unlabeled interactives, no transition-all/scale(0)/ease-in, no aria-hidden-on-focusable; truncation carries title recovery.

## Overall Impression

Linear-class foundation (dialog primitive, honest states, URL search) in a visual system that never takes a position. Biggest opportunity: touch as first-class citizen plus one memorable signature.

## What's Working

Modal/menu foundation with trap/inert/restore and menu keyboard discipline; honesty as a feature (no fake rows, permission-scoped mentions, ?message=/&reply= seek, stale-send guard); state completeness (shaped skeletons, correct retry vocabulary, stable typing region, storm-free presence).

## Priority Issues

- [P0] Message actions unreachable on touch — hover-only toolbar (MessageRow.tsx:238-240). Fix: persistent overflow affordance on touch.
- [P1] Public channels have no roster — static count vs group-DM Members button (channels/[slug]/page.tsx:873-877). Fix: read-only members dialog for public channels.
- [P1] Composer locks out during send/upload — textarea disables, typing halts (MessageComposer.tsx:554-557). Fix: queue-based send, editable composer.
- [P1] Settings IA collision — dual Settings labels, menu-only Profile, partial active states (Sidebar.tsx, UserMenu.tsx). Fix: single settings index + full active states.
- [P2] Thread root drops context — raw text, no mentions/attachments (ThreadPanel.tsx:353-360). Fix: render with MessageBody + AttachmentDisplay.

## Persona Red Flags

Alex: send blocks second thoughts; single-email invite with manual dev-link copy; Cmd+K dead-ends in inputs; type-switch clears filters silently. Sam: Tab lands on invisible toolbar buttons; hover-revealed timestamps; thread close lacks focus restore; thread Escape risks dialog fights. Casey: no message actions on phones; 28px targets vs 44px rule; mobile search drops query; 85dvh sheet leaves no reading room.

## Minor Observations

Active emerald pill reads as fake liveness; blue DM avatar disc loudest color on least important element; slug help 3x on one card; invite success moves no focus; 28 type-ramp advisories need DESIGN.md confirmation.

## Questions to Consider

What would you remove (not restyle) to make one screen unmistakably TeamFlow? What should feel designed at the first message, first invite, first recovered failure?

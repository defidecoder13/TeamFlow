/**
 * Static primary-navigation labels for the application shell.
 *
 * These four entries are navigation chrome (Home / Threads / Mentions /
 * Saved, per canonical TeamFlow terminology) — not workspace data. The mock
 * channel/DM placeholders were removed in Phase 2D; channels and direct
 * messages render honest empty states until their backends land.
 */

export interface ShellNavItem {
  id: string;
  label: string;
}

export const PRIMARY_NAV_ITEMS: ShellNavItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'threads', label: 'Threads' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'saved', label: 'Saved' },
];

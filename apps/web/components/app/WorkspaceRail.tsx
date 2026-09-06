/**
 * Narrow far-left workspace rail (Phase 1D shell).
 *
 * Visual placeholders only: workspace switching/creation arrive with the
 * workspace backend in a later phase. Non-functional controls are disabled
 * with explanatory titles rather than pretending to work.
 */

import type { SessionUser } from '../../lib/auth-guard';
import { PlusIcon } from './icons';
import { UserAvatar } from './UserAvatar';

export function WorkspaceRail({ user }: { user: SessionUser }) {
  return (
    <nav
      aria-label="Workspaces"
      className="hidden w-14 shrink-0 flex-col items-center border-r border-stone-200 bg-white py-3 md:flex"
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-stone-900 text-sm font-semibold text-white"
      >
        T
      </span>

      <div className="mt-4 flex flex-col items-center gap-2">
        <button
          type="button"
          disabled
          title="Workspaces arrive in a later phase"
          aria-label="Current workspace (placeholder)"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-stone-100 text-sm font-semibold text-stone-700 ring-2 ring-stone-900/70 ring-offset-2 ring-offset-white disabled:cursor-not-allowed"
        >
          T
        </button>
        <button
          type="button"
          disabled
          title="Workspace creation arrives in a later phase"
          aria-label="Add workspace (unavailable)"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-dashed border-stone-300 text-stone-400 disabled:cursor-not-allowed"
        >
          <PlusIcon />
        </button>
      </div>

      <div className="mt-auto" title={`${user.name} (${user.email})`}>
        <UserAvatar name={user.name} image={user.image} size="md" />
      </div>
    </nav>
  );
}

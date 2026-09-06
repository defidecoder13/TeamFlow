/**
 * Dedicated create-workspace state for authenticated users with no
 * workspaces (Phase 2D).
 *
 * Shows no fake workspace information. The embedded creation form talks to
 * the real workspace API; the page supplies what happens afterwards.
 */

import { CreateWorkspace } from './CreateWorkspace';
import type { WorkspaceSummary } from '../../lib/workspaces';

interface WorkspaceEmptyStateProps {
  onCreated: (workspace: WorkspaceSummary) => void;
  onUnauthenticated: () => void;
}

export function WorkspaceEmptyState({ onCreated, onUnauthenticated }: WorkspaceEmptyStateProps) {
  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-stone-200 bg-white px-6 py-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-8">
      <span
        aria-hidden="true"
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-lg font-semibold text-white"
      >
        T
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-zinc-900">
        Create your first workspace
      </h1>
      <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-zinc-500">
        A workspace is where your team collaborates — channels, conversations, and everything around
        them.
      </p>
      <CreateWorkspace onCreated={onCreated} onUnauthenticated={onUnauthenticated} />
    </div>
  );
}

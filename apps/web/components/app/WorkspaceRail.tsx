/**
 * Narrow far-left workspace rail (Phase 4K.4: functional switching/creation).
 *
 * Loads the caller's workspaces via useWorkspaces (authoritative), indicates
 * the active workspace (persisted in localStorage, fallback to first), allows
 * switching (updates stored ID + navigates to /app), and provides creation
 * via the existing CreateWorkspace form in a dialog. Visual style preserved
 * from the Phase 1D placeholder; disabled placeholders removed.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspaces } from '../../lib/use-workspaces';
import { CreateWorkspace } from './CreateWorkspace';
import { PlusIcon } from './icons';
import { UserAvatar } from './UserAvatar';
import type { SessionUser } from '../../lib/auth-guard';

function workspaceInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'T';
}

export function WorkspaceRail({ user }: { user: SessionUser }) {
  const router = useRouter();
  const { state: workspacesState, retry, addWorkspace, setCurrentWorkspace } = useWorkspaces(true);
  const [createOpen, setCreateOpen] = useState(false);

  const handleSwitch = useCallback(
    (workspaceId: string) => {
      if (workspacesState.status !== 'ready' || workspacesState.current?.id === workspaceId) return;
      setCurrentWorkspace(workspaceId);
      router.push('/app');
    },
    [workspacesState, setCurrentWorkspace, router],
  );

  const handleCreated = useCallback(
    (workspace: Parameters<typeof addWorkspace>[0]) => {
      addWorkspace(workspace);
      setCreateOpen(false);
      router.push('/app');
    },
    [addWorkspace, router],
  );

  // Close dialog on Escape
  useEffect(() => {
    if (!createOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setCreateOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [createOpen]);

  const isReady = workspacesState.status === 'ready';
  const workspaces = isReady ? workspacesState.workspaces : [];
  const currentId = isReady ? (workspacesState.current?.id ?? null) : null;

  return (
    <>
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
          {workspacesState.status === 'loading' || workspacesState.status === 'idle' ? (
            <div
              role="status"
              aria-label="Loading workspaces"
              className="flex flex-col items-center gap-2"
            >
              <span className="sr-only">Loading workspaces…</span>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="h-9 w-9 animate-pulse rounded-[10px] bg-stone-100"
                />
              ))}
            </div>
          ) : workspacesState.status === 'error' ? (
            <div className="flex flex-col items-center gap-2">
              <span className="text-[11px] text-red-600" role="alert">
                Failed
              </span>
              <button
                type="button"
                onClick={retry}
                className="text-[11px] font-medium text-zinc-900 underline"
                aria-label="Retry loading workspaces"
              >
                Retry
              </button>
            </div>
          ) : workspaces.length === 0 ? (
            <span className="px-2 text-center text-[11px] leading-tight text-stone-400">
              No workspaces
            </span>
          ) : (
            workspaces.map((ws) => {
              const active = ws.id === currentId;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleSwitch(ws.id)}
                  aria-label={`Switch to ${ws.name}`}
                  aria-current={active ? 'page' : undefined}
                  title={ws.name}
                  className={`flex h-9 w-9 items-center justify-center rounded-[10px] text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-stone-900 ${
                    active
                      ? 'bg-stone-900 text-white ring-2 ring-stone-900/70 ring-offset-2 ring-offset-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  {workspaceInitial(ws.name)}
                </button>
              );
            })
          )}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="Create new workspace"
            title="Create new workspace"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-dashed border-stone-300 text-stone-400 transition-colors hover:border-stone-400 hover:text-stone-600 focus-visible:outline-2 focus-visible:outline-stone-900"
          >
            <PlusIcon />
          </button>
        </div>

        <div className="mt-auto" title={`${user.name} (${user.email})`}>
          <UserAvatar name={user.name} image={user.image} size="md" />
        </div>
      </nav>

      {createOpen && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px]"
          onClick={() => setCreateOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-workspace-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]"
          >
            <div className="flex items-start justify-between">
              <h2 id="create-workspace-title" className="text-base font-semibold text-zinc-900">
                Create workspace
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close dialog"
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="mt-1 text-sm text-stone-500">
              A workspace is where your team collaborates.
            </p>
            <CreateWorkspace
              onCreated={handleCreated}
              onUnauthenticated={() => {
                setCreateOpen(false);
                router.replace('/sign-in');
              }}
            />
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg border border-stone-300 bg-white px-3.5 py-1.5 text-sm font-medium text-stone-700 hover:border-stone-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

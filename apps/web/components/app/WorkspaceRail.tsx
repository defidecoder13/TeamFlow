/**
 * Narrow far-left workspace rail — Stitch "Workspace Home — TeamFlow" reference.
 *
 * Live reference: Stitch project projects/8727821180897355571
 * ("Workspace Home — TeamFlow" screen). Light 60px rail: brand tile, hairline
 * divider, workspace switcher (active = charcoal tile + left indicator,
 * inactive = white bordered tile), dashed add-workspace affordance.
 *
 * Behavior (authoritative, from useWorkspaces): indicates the active
 * workspace (persisted in localStorage, fallback to first), switches
 * (updates stored ID + navigates to /app), and creates via the existing
 * CreateWorkspace form in a dialog. The switcher list only renders when
 * there is something to switch between (2+ workspaces), so a lone workspace
 * is identified once in the sidebar header instead of twice. No remote
 * logo hotlinks: the brand tile uses the local TeamFlowLogo mark.
 */

'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspaces } from '../../lib/use-workspaces';
import { TeamFlowLogo } from '../brand/TeamFlowLogo';
import { CreateWorkspace } from './CreateWorkspace';
import { Dialog } from './dialog';
import { CloseIcon, PlusIcon } from './icons';

function workspaceInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'T';
}

export function WorkspaceRail() {
  const router = useRouter();
  const { state: workspacesState, retry, addWorkspace, setCurrentWorkspace } = useWorkspaces();
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

  // Close dialog on Escape — handled by the shared Dialog primitive.

  const isReady = workspacesState.status === 'ready';
  const workspaces = isReady ? workspacesState.workspaces : [];
  const currentId = isReady ? (workspacesState.current?.id ?? null) : null;

  return (
    <>
      <nav
        aria-label="Workspaces"
        className="hidden w-[60px] shrink-0 flex-col items-center justify-between border-r border-[#e3e1ec]/60 bg-[#fbf8ff] py-3.5 md:flex"
      >
        <div className="flex flex-col items-center gap-4 w-full">
          <span
            title="TeamFlow"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#e3e1ec]/80 bg-white p-1.5 text-[#1a1b22] shadow-[0_1px_2px_rgba(24,24,27,0.04)]"
          >
            <TeamFlowLogo size={24} showWordmark={false} />
          </span>
          <div className="h-px w-7 bg-[#e3e1ec]/70" aria-hidden="true" />
          <div className="flex flex-col items-center gap-2.5 w-full">
            {workspacesState.status === 'loading' || workspacesState.status === 'idle' ? (
              <div
                role="status"
                aria-label="Loading workspaces"
                className="flex flex-col items-center gap-1.5"
              >
                <span className="sr-only">Loading workspaces…</span>
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    aria-hidden="true"
                    className="h-10 w-10 animate-pulse rounded-xl bg-white/60"
                  />
                ))}
              </div>
            ) : workspacesState.status === 'error' ? (
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className="px-1 text-center text-[11px] leading-tight text-red-700"
                  role="alert"
                >
                  Couldn&apos;t load workspaces
                </span>
                <button
                  type="button"
                  onClick={retry}
                  className="rounded text-[11px] font-medium text-[#1a1b22] underline transition-colors focus-visible:outline-2 focus-visible:outline-[#1f44e4]"
                  aria-label="Retry loading workspaces"
                >
                  Retry
                </button>
              </div>
            ) : workspacesState.status === 'unauthenticated' ? (
              <span className="px-2 text-center text-[11px] leading-tight text-[#47464b]">
                Sign in required
              </span>
            ) : workspaces.length <= 1 ? null : (
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
                    className={`touch-hit relative flex h-10 w-10 items-center justify-center rounded-xl text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[#1f44e4] ${
                      active
                        ? 'bg-[#18181b] font-semibold text-white shadow-[0_1px_2px_rgba(24,24,27,0.04)] ring-2 ring-[#1a1b22]/10'
                        : 'border border-[#e3e1ec] bg-white font-medium text-[#47464b] shadow-[0_1px_2px_rgba(24,24,27,0.04)] hover:border-[#c8c5cb] hover:text-[#1a1b22]'
                    }`}
                  >
                    {active ? (
                      <span
                        className="absolute -left-[14px] top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#18181b]"
                        aria-hidden="true"
                      />
                    ) : null}
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
              className="touch-hit flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-[#e3e1ec] text-[#5f5e61] shadow-[0_1px_2px_rgba(24,24,27,0.04)] transition-colors hover:border-[#c8c5cb] hover:text-[#1a1b22] focus-visible:outline-2 focus-visible:outline-[#1f44e4]"
            >
              <PlusIcon />
            </button>
          </div>
        </div>

        <div aria-hidden="true" />
      </nav>

      {createOpen && (
        <Dialog
          open
          onClose={() => setCreateOpen(false)}
          labelledBy="create-workspace-title"
          size="md"
        >
          <div>
            <div className="flex items-start justify-between">
              <h2 id="create-workspace-title" className="text-base font-semibold text-[#1a1b22]">
                Create workspace
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close dialog"
                className="touch-hit rounded-lg p-1 text-[#5f5e61] transition-colors hover:bg-[#f4f2fd] hover:text-[#47464b] focus-visible:outline-2 focus-visible:outline-[#1f44e4]"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-[#47464b]">
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
                className="rounded-lg border border-[#c8c5cb] bg-white px-3.5 py-1.5 text-sm font-medium text-[#47464b] transition-colors hover:border-[#c8c5cb] focus-visible:outline-2 focus-visible:outline-[#1f44e4]"
              >
                Cancel
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

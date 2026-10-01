/**
 * Mobile navigation drawer — `adapt` pass (phones/tablets).
 *
 * Below `lg` the sidebar is hidden, leaving phones with no in-app
 * navigation. This drawer reuses the exact same `Sidebar` content (no
 * duplicated navigation) in a left-anchored sheet, plus the workspace
 * switcher the hidden rail carries on desktop. Backdrop + Escape close
 * it, navigating closes it, and focus is trapped inside while open,
 * moves in on open, and returns to the TopBar menu button on close.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { useWorkspaces } from '../../lib/use-workspaces';
import { Sidebar } from './Sidebar';
import { useModalDialog } from './dialog';

export function MobileNavDrawer({
  open,
  onClose,
  workspaceName,
  workspaceId,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  workspaceName: string | null;
  workspaceId: string | null;
  currentUserId?: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const panelRef = useModalDialog({ open: open && mounted, onClose });
  const pathname = usePathname();
  const router = useRouter();
  const prevPathname = useRef(pathname);
  const { state: workspacesState, setCurrentWorkspace } = useWorkspaces();

  // Close on navigation (link taps inside the reused Sidebar) — only when
  // the route actually changes, never on mount.
  useEffect(() => {
    if (open && prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      onClose();
    }
  }, [open, pathname, onClose]);

  if (!open || !mounted) {
    return null;
  }

  const isReady = workspacesState.status === 'ready';
  const workspaces = isReady ? workspacesState.workspaces : [];
  const currentId = isReady ? (workspacesState.current?.id ?? null) : null;
  const showSwitcher = workspaces.length > 1;

  function handleSwitch(id: string) {
    if (!isReady || currentId === id) return;
    setCurrentWorkspace(id);
    router.push('/app');
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-40 lg:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 starting:opacity-0"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-[#E4E2DF] bg-[#F7F6F5] pb-[env(safe-area-inset-bottom)] shadow-[0_20px_48px_-8px_rgba(20,24,32,0.24)] transition-transform duration-300 ease-drawer starting:-translate-x-full focus:outline-none"
      >

        {showSwitcher ? (
          <div className="border-b border-[#E4E2DF] px-3 py-3">
            <p
              id="mobile-workspace-switcher-label"
              className="px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#737782]"
            >
              Workspaces
            </p>
            <ul aria-labelledby="mobile-workspace-switcher-label" className="mt-1.5 space-y-0.5">
              {workspaces.map((ws) => {
                const active = ws.id === currentId;
                return (
                  <li key={ws.id}>
                    <button
                      type="button"
                      onClick={() => handleSwitch(ws.id)}
                      aria-current={active ? 'page' : undefined}
                      title={ws.name}
                      className={[
                        'flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-[#3157D5]',
                        active
                          ? 'bg-white font-medium text-[#171A21] ring-1 ring-[#E4E2DF] shadow-2xs'
                          : 'text-[#4F5360] hover:bg-white/60 hover:text-[#171A21]',
                      ].join(' ')}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-xs font-semibold ${
                          active ? 'bg-[#171A21] text-white' : 'bg-[#E4E2DF] text-[#4F5360]'
                        }`}
                      >
                        {ws.name.trim().charAt(0).toUpperCase() || 'T'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left">{ws.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        <Sidebar
          workspaceName={workspaceName}
          workspaceId={workspaceId}
          currentUserId={currentUserId}
          className="flex min-h-0 w-full flex-1 flex-col px-3 py-2"
          onNavigateMobile={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}

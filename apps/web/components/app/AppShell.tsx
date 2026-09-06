/**
 * Desktop application shell (Phase 1D): workspace rail + navigation sidebar
 * + main column (top bar + scrollable content). No horizontal scrolling;
 * rail/sidebar collapse on smaller screens (drawer arrives later if needed).
 */

import type { ReactNode } from 'react';
import type { SessionUser } from '../../lib/auth-guard';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { WorkspaceRail } from './WorkspaceRail';

interface AppShellProps {
  user: SessionUser;
  /** Real current workspace name, or null when the user has none yet. */
  workspaceName: string | null;
  /** Real current workspace id, or null — drives the sidebar channel list. */
  workspaceId: string | null;
  location: string;
  children: ReactNode;
}

export function AppShell({ user, workspaceName, workspaceId, location, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f4f3f6] text-sm text-stone-900">
      <WorkspaceRail user={user} />
      <Sidebar workspaceName={workspaceName} workspaceId={workspaceId} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} workspaceName={workspaceName} location={location} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * Application shell: workspace rail + navigation sidebar + main column
 * (top bar + scrollable content). No horizontal scrolling.
 *
 * Responsive (`adapt` pass): the rail shows from `md`, the sidebar from
 * `lg`; below `lg` navigation lives in the mobile drawer (same `Sidebar`
 * content, no duplication), toggled from the TopBar menu button.
 */

'use client';

import { useState, type ReactNode } from 'react';
import type { SessionUser } from '../../lib/auth-guard';
import { MobileNavDrawer } from './MobileNavDrawer';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface AppShellProps {
  user: SessionUser;
  /** Real current workspace name, or null when the user has none yet. */
  workspaceName: string | null;
  /** Real current workspace id, or null — drives the sidebar channel list. */
  workspaceId: string | null;
  location: string;
  children: ReactNode;
  /** 'default' centers content in max-w-3xl with padding; 'full' allows full height/width views like chat. */
  contentLayout?: 'default' | 'full';
}

export function AppShell({
  user,
  workspaceName,
  workspaceId,
  location,
  children,
  contentLayout = 'default',
}: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#FAF9F8] text-[14px] text-[#171A21] antialiased">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-lg bg-[#171A21] px-4 py-2 text-[13px] font-medium text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3157D5]"
      >
        Skip to content
      </a>
      <Sidebar workspaceName={workspaceName} workspaceId={workspaceId} currentUserId={user.id} />
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        <TopBar
          user={user}
          workspaceName={workspaceName}
          workspaceId={workspaceId}
          location={location}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        {contentLayout === 'full' ? (
          <main id="main-content" className="flex min-h-0 flex-1 flex-col bg-[#FAF9F8]">
            {children}
          </main>
        ) : (
          <main id="main-content" className="min-h-0 flex-1 overflow-y-auto bg-[#FAF9F8]">
            <div className="mx-auto w-full max-w-4xl px-6 py-8 lg:px-8">{children}</div>
          </main>
        )}
      </div>
      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        workspaceName={workspaceName}
        workspaceId={workspaceId}
        currentUserId={user.id}
      />
    </div>
  );
}


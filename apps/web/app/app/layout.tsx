'use client';

import { AppProvider } from '@/lib/mock-context';
import { WorkspacesProvider } from '@/lib/use-workspaces';
import { ShellProvider } from '@/lib/shell-context';
import { PostLoginTransition } from '@/components/app/PostLoginTransition';
import { Sidebar } from '@/components/mock-ui/shell/Sidebar';
import { TopBar } from '@/components/mock-ui/shell/TopBar';
import { MobileDrawer } from '@/components/mock-ui/shell/MobileDrawer';
import { Toast } from '@/components/mock-ui/primitives/Toast';

import { CreateWorkspaceDialog } from '@/components/mock-ui/shell/CreateWorkspaceDialog';
import { CreateChannelDialog } from '@/components/mock-ui/shell/CreateChannelDialog';
import { InviteMemberDialog } from '@/components/mock-ui/shell/InviteMemberDialog';

import { Suspense } from 'react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppProvider>
        <WorkspacesProvider>
          <ShellProvider>
            <div className="w-full h-screen overflow-hidden flex bg-[#FAF9F8] text-[#171A21] antialiased font-sans">
              {/* Primary Sidebar (desktop) */}
              <div className="animate-shell-enter hidden md:flex shrink-0">
                <Sidebar />
              </div>

              {/* Main Content Area */}
              <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white">
                {/* Top bar */}
                <div className="animate-shell-enter" style={{ animationDelay: '60ms' }}>
                  <TopBar />
                </div>

                {/* Routed view component */}
                <div
                  className="animate-shell-enter flex-1 flex min-h-0 overflow-hidden relative bg-[#FAF9F8]"
                  style={{ animationDelay: '120ms' }}
                >
                  {children}
                </div>
              </div>

              {/* Mobile Drawer */}
              <MobileDrawer />

              {/* Global Dialogs */}
              <CreateWorkspaceDialog />
              <CreateChannelDialog />
              <InviteMemberDialog />

              {/* Live status Toast */}
              <Toast />

              {/* Post-login celebration (first authenticated paint only) */}
              <PostLoginTransition />
            </div>
          </ShellProvider>
        </WorkspacesProvider>
      </AppProvider>
    </Suspense>
  );
}

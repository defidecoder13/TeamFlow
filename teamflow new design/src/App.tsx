import React from 'react';
import { AppProvider } from './context/AppContext';
import { useRouter } from './hooks/useRouter';
import { Sidebar } from './components/shell/Sidebar';
import { TopBar } from './components/shell/TopBar';
import { MobileDrawer } from './components/shell/MobileDrawer';
import { Toast } from './components/primitives/Toast';

// Modals
import { CreateWorkspaceDialog } from './components/shell/CreateWorkspaceDialog';
import { CreateChannelDialog } from './components/shell/CreateChannelDialog';
import { InviteMemberDialog } from './components/shell/InviteMemberDialog';

// Views
import { WorkspaceHomeView } from './views/WorkspaceHomeView';
import { ChannelView } from './views/ChannelView';
import { DmView } from './views/DmView';
import { SearchView } from './views/SearchView';
import { SettingsIndexView } from './views/SettingsIndexView';
import { SettingsMembersView } from './views/SettingsMembersView';
import { SettingsWorkspaceView } from './views/SettingsWorkspaceView';
import { SettingsProfileView } from './views/SettingsProfileView';
import { SettingsNotificationsView } from './views/SettingsNotificationsView';

const AppContent: React.FC = () => {
  const { pathname } = useRouter();

  // Route matching
  const renderRoute = () => {
    if (pathname === '/app' || pathname === '/') {
      return <WorkspaceHomeView />;
    }

    if (pathname.startsWith('/app/channels/')) {
      const slug = pathname.replace('/app/channels/', '');
      return <ChannelView slug={slug} />;
    }

    if (pathname.startsWith('/app/dms/')) {
      const conversationId = pathname.replace('/app/dms/', '');
      return <DmView conversationId={conversationId} />;
    }

    if (pathname === '/app/search') {
      return <SearchView />;
    }

    if (pathname === '/app/settings') {
      return <SettingsIndexView />;
    }

    if (pathname === '/app/settings/members') {
      return <SettingsMembersView />;
    }

    if (pathname === '/app/settings/workspace') {
      return <SettingsWorkspaceView />;
    }

    if (pathname === '/app/settings/profile') {
      return <SettingsProfileView />;
    }

    if (pathname === '/app/settings/notifications') {
      return <SettingsNotificationsView />;
    }

    // Default fallback
    return <WorkspaceHomeView />;
  };

  return (
    <div className="w-full h-screen overflow-hidden flex bg-[#FAF9F8] text-[#171A21] antialiased font-sans">
      {/* Primary Sidebar (desktop) */}
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white">
        {/* Top bar */}
        <TopBar />

        {/* Routed view component */}
        <div className="flex-1 flex min-h-0 overflow-hidden relative bg-[#FAF9F8]">
          {renderRoute()}
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
    </div>
  );
};

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;

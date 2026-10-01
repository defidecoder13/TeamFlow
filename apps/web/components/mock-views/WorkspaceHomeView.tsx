'use client';

import React from 'react';
import { useApp } from '../../lib/mock-context';
import { useRouter } from '../../lib/mock-hooks/useRouter';
import { useShell } from '../../lib/shell-context';
import { firstNameOf, getGreeting } from '../../lib/greeting';
import { HomeEditorialIllustration } from '../mock-ui/home/HomeEditorialIllustration';
import { Hash, UserPlus } from 'lucide-react';

function CenteredStatus({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <main
      id="main-content"
      className="flex-1 overflow-y-auto bg-[#FAF9F8] flex flex-col items-center justify-center selection:bg-[#EEF2FF] selection:text-[#3157D5] px-4"
    >
      <div className="w-full max-w-md text-center">
        <HomeEditorialIllustration className="w-full max-w-[280px] mx-auto mb-5 opacity-80" />
        <h1 className="text-[22px] font-semibold text-[#171A21] tracking-tight">{title}</h1>
        <p className="mt-2 text-[14px] text-[#4F5360] leading-relaxed">{message}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-5 px-4 py-2 bg-[#2E3440] hover:bg-[#1E222A] text-white text-[13px] font-medium rounded-[8px] transition-colors shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5] cursor-pointer"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </main>
  );
}

export const WorkspaceHomeView: React.FC = () => {
  const { setCreateChannelOpen, setInviteMemberOpen, setCreateWorkspaceOpen } = useApp();
  const { session, workspaces, currentWorkspace, currentUser } = useShell();
  const { push } = useRouter();

  if (session.status === 'loading' || workspaces.state.status === 'loading' || workspaces.state.status === 'idle') {
    return (
      <CenteredStatus
        title="Loading your workspace…"
        message="Fetching your session and workspace."
      />
    );
  }

  if (session.status === 'error') {
    return (
      <CenteredStatus
        title="Couldn’t load your session"
        message={session.message}
      />
    );
  }

  if (session.status === 'unauthenticated') {
    return (
      <CenteredStatus
        title="Please sign in"
        message="Your session has expired. Sign in again to continue."
        actionLabel="Go to sign in"
        onAction={() => push('/sign-in')}
      />
    );
  }

  if (workspaces.state.status === 'error') {
    return (
      <CenteredStatus
        title="Couldn’t load workspaces"
        message={workspaces.state.message}
        actionLabel="Try again"
        onAction={workspaces.retry}
      />
    );
  }

  if (workspaces.state.status === 'unauthenticated') {
    return (
      <CenteredStatus
        title="Please sign in"
        message="Your session has expired. Sign in again to continue."
        actionLabel="Go to sign in"
        onAction={() => push('/sign-in')}
      />
    );
  }

  if (!currentWorkspace) {
    return (
      <CenteredStatus
        title="Create your first workspace"
        message="A workspace is where your team collaborates — channels, conversations, and everything around them."
        actionLabel="Create workspace"
        onAction={() => setCreateWorkspaceOpen(true)}
      />
    );
  }

  const firstName = firstNameOf(currentUser?.name ?? '') || 'there';

  return (
    <main
      id="main-content"
      className="flex-1 overflow-y-auto bg-[#FAF9F8] flex flex-col items-center justify-center selection:bg-[#EEF2FF] selection:text-[#3157D5]"
    >
      <div className="w-full max-w-xl mx-auto px-4 sm:px-6 py-12 flex flex-col items-center text-center">
        <HomeEditorialIllustration className="w-full max-w-[380px] mb-5" />

        <div className="space-y-2 mb-6">
          <h1 className="text-[28px] sm:text-[32px] font-semibold text-[#171A21] tracking-tight leading-tight">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-[15px] text-[#4F5360] font-normal leading-relaxed">
            You’re in <span className="font-medium text-[#171A21]">{currentWorkspace.name}</span>.
            <br className="hidden sm:inline" /> Let’s make progress together.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setCreateChannelOpen(true)}
            className="px-4 py-2 bg-[#2E3440] hover:bg-[#1E222A] text-white text-[13px] font-medium rounded-[8px] transition-colors flex items-center gap-2 shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5] cursor-pointer"
          >
            <Hash className="w-4 h-4 text-neutral-300" />
            <span>Create a channel</span>
          </button>

          <button
            type="button"
            onClick={() => setInviteMemberOpen(true)}
            className="px-4 py-2 bg-white hover:bg-[#F6F5F3] text-[#171A21] border border-[#E4E2DF] hover:border-[#D2D0CC] text-[13px] font-medium rounded-[8px] transition-colors flex items-center gap-2 shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5] cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-[#4F5360]" />
            <span>Invite your team</span>
          </button>
        </div>
      </div>
    </main>
  );
};

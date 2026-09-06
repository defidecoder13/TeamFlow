/**
 * Workspace Members route (Phase 2E + 2F-B).
 *
 * Read-only membership data plus the invitation workflow: session →
 * workspaces → current workspace → members list + pending invitations.
 * Invitation creation and acceptance use the real backend; email delivery
 * does not exist (development link flow instead).
 */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '../../../../components/app/AppShell';
import { AppShellSkeleton } from '../../../../components/app/AppShellSkeleton';
import { MembersContent } from '../../../../components/app/MembersContent';
import { WorkspaceEmptyState } from '../../../../components/app/WorkspaceEmptyState';
import { useSessionUser } from '../../../../lib/use-session-user';
import { usePendingInvitations } from '../../../../lib/use-pending-invitations';
import { useWorkspaceMembers } from '../../../../lib/use-workspace-members';
import { useWorkspaces } from '../../../../lib/use-workspaces';

function MembersLoading() {
  return (
    <div role="status" aria-label="Loading members" className="space-y-2">
      <span className="sr-only">Loading members…</span>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          aria-hidden="true"
          className="h-[68px] animate-pulse rounded-lg border border-stone-200 bg-white"
        />
      ))}
    </div>
  );
}

function LoadErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div
        role="alert"
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <h1 className="text-base font-semibold tracking-tight text-stone-900">
          Couldn&apos;t load TeamFlow
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800"
        >
          Try again
        </button>
      </div>
    </main>
  );
}

export default function MembersPage() {
  const router = useRouter();
  const session = useSessionUser();
  const {
    state: workspaces,
    retry: retryWorkspaces,
    addWorkspace,
  } = useWorkspaces(session.status === 'authenticated');
  const currentWorkspace =
    session.status === 'authenticated' && workspaces.status === 'ready' ? workspaces.current : null;
  const { state: members, retry: retryMembers } = useWorkspaceMembers(currentWorkspace?.id ?? null);
  const canInvite =
    session.status === 'authenticated' &&
    workspaces.status === 'ready' &&
    workspaces.current !== null &&
    workspaces.current.role !== 'MEMBER';
  const { state: pending, retry: retryPending } = usePendingInvitations(
    canInvite && currentWorkspace ? currentWorkspace.id : null,
  );

  const signedOut =
    session.status === 'unauthenticated' ||
    workspaces.status === 'unauthenticated' ||
    members.status === 'unauthenticated' ||
    pending.status === 'unauthenticated';

  useEffect(() => {
    if (signedOut) {
      router.replace('/sign-in');
    }
  }, [signedOut, router]);

  const resolving =
    session.status === 'loading' ||
    (session.status === 'authenticated' &&
      (workspaces.status === 'idle' || workspaces.status === 'loading'));
  if (resolving) {
    return <AppShellSkeleton />;
  }

  if (signedOut) {
    return (
      <p role="status" className="p-8 text-sm text-stone-500">
        Redirecting to sign-in…
      </p>
    );
  }

  if (session.status === 'error') {
    return <LoadErrorPanel message={session.message} onRetry={() => window.location.reload()} />;
  }

  if (workspaces.status === 'error') {
    return <LoadErrorPanel message={workspaces.message} onRetry={retryWorkspaces} />;
  }

  if (session.status === 'authenticated' && workspaces.status === 'ready') {
    const current = workspaces.current;
    if (!current) {
      return (
        <AppShell user={session.user} workspaceName={null} workspaceId={null} location="Home">
          <WorkspaceEmptyState
            onCreated={(workspace) => addWorkspace(workspace)}
            onUnauthenticated={() => router.replace('/sign-in')}
          />
        </AppShell>
      );
    }
    if (members.status === 'loading' || members.status === 'idle') {
      return (
        <AppShell
          user={session.user}
          workspaceName={current.name}
          workspaceId={current.id}
          location="Members"
        >
          <MembersLoading />
        </AppShell>
      );
    }
    if (members.status === 'error') {
      return <LoadErrorPanel message={members.message} onRetry={retryMembers} />;
    }
    return (
      <AppShell
        user={session.user}
        workspaceName={current.name}
        workspaceId={current.id}
        location="Members"
      >
        <MembersContent
          members={members.members}
          currentUserId={session.user.id}
          workspace={{ id: current.id, name: current.name }}
          canInvite={canInvite}
          pending={pending.status === 'ready' ? pending.invitations : []}
          pendingLoading={pending.status === 'loading' || pending.status === 'idle'}
          pendingError={pending.status === 'error' ? pending.message : null}
          onRetryPending={retryPending}
          onInvitationCreated={retryPending}
          onUnauthenticated={() => router.replace('/sign-in')}
        />
      </AppShell>
    );
  }

  return <AppShellSkeleton />;
}

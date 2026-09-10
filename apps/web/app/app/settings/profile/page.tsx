/**
 * Profile Settings route (Phase 4K.5).
 */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '../../../../components/app/AppShell';
import { AppShellSkeleton } from '../../../../components/app/AppShellSkeleton';
import { WorkspaceEmptyState } from '../../../../components/app/WorkspaceEmptyState';
import { ProfileContent } from '../../../../components/app/ProfileContent';
import { useSessionUser } from '../../../../lib/use-session-user';
import { useWorkspaces } from '../../../../lib/use-workspaces';

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

export default function ProfilePage() {
  const router = useRouter();
  const session = useSessionUser() as ReturnType<typeof useSessionUser> & {
    refresh: () => void;
    setUser: (u: import('../../../../lib/profile').SessionUser) => void;
  };
  const {
    state: workspaces,
    retry: retryWorkspaces,
    addWorkspace,
  } = useWorkspaces(session.status === 'authenticated');

  const signedOut = session.status === 'unauthenticated' || workspaces.status === 'unauthenticated';

  useEffect(() => {
    if (signedOut) router.replace('/sign-in');
  }, [signedOut, router]);

  const resolving =
    session.status === 'loading' ||
    (session.status === 'authenticated' &&
      (workspaces.status === 'idle' || workspaces.status === 'loading'));

  if (resolving) return <AppShellSkeleton />;
  if (signedOut)
    return (
      <p role="status" className="p-8 text-sm text-stone-500">
        Redirecting to sign-in…
      </p>
    );
  if (session.status === 'error')
    return <LoadErrorPanel message={session.message} onRetry={() => window.location.reload()} />;
  if (workspaces.status === 'error')
    return <LoadErrorPanel message={workspaces.message} onRetry={retryWorkspaces} />;

  if (session.status === 'authenticated') {
    const current = workspaces.status === 'ready' ? workspaces.current : null;
    // Profile is per-user, not per-workspace, but AppShell needs workspace context
    if (workspaces.status === 'ready' && !current) {
      return (
        <AppShell user={session.user} workspaceName={null} workspaceId={null} location="Settings">
          <ProfileContent
            user={session.user}
            onUpdated={(u) => session.setUser(u)}
            onUnauthenticated={() => router.replace('/sign-in')}
          />
        </AppShell>
      );
    }
    return (
      <AppShell
        user={session.user}
        workspaceName={current?.name ?? null}
        workspaceId={current?.id ?? null}
        location="Settings"
      >
        {workspaces.status === 'ready' && !current ? (
          <WorkspaceEmptyState
            onCreated={(ws) => addWorkspace(ws)}
            onUnauthenticated={() => router.replace('/sign-in')}
          />
        ) : (
          <ProfileContent
            user={session.user}
            onUpdated={(u) => session.setUser(u)}
            onUnauthenticated={() => router.replace('/sign-in')}
          />
        )}
      </AppShell>
    );
  }

  return <AppShellSkeleton />;
}

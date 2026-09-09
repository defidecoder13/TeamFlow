/**
 * User Notification Preferences route (Phase 4H.8).
 *
 * Provides a dedicated settings view for configuring notification delivery rules.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '../../../../components/app/AppShell';
import { AppShellSkeleton } from '../../../../components/app/AppShellSkeleton';
import { NotificationPreferencesForm } from '../../../../components/notifications/NotificationPreferencesForm';
import { WorkspaceEmptyState } from '../../../../components/app/WorkspaceEmptyState';
import { useNotificationPreferences } from '../../../../lib/use-notification-preferences';
import { useSessionUser } from '../../../../lib/use-session-user';
import { useWorkspaces } from '../../../../lib/use-workspaces';

function PreferencesSkeleton() {
  return (
    <div role="status" aria-label="Loading preferences" className="space-y-4">
      <span className="sr-only">Loading notification preferences…</span>
      <div className="h-6 w-48 animate-pulse rounded bg-stone-200" />
      <div className="h-40 animate-pulse rounded-xl border border-stone-200 bg-white" />
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="w-full rounded-xl border border-stone-200 bg-white p-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <h2 className="text-base font-semibold tracking-tight text-stone-900">
        Couldn&apos;t load preferences
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800"
      >
        Try again
      </button>
    </div>
  );
}

export default function NotificationPreferencesPage() {
  const router = useRouter();
  const session = useSessionUser();
  const {
    state: workspaces,
    retry: retryWorkspaces,
    addWorkspace,
  } = useWorkspaces(session.status === 'authenticated');
  const {
    state: prefsState,
    isSaving,
    saveError,
    updatePreference,
    retry: retryPrefs,
  } = useNotificationPreferences();

  const currentWorkspace =
    session.status === 'authenticated' && workspaces.status === 'ready' ? workspaces.current : null;

  const signedOut = session.status === 'unauthenticated' || workspaces.status === 'unauthenticated';

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
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <ErrorPanel message={session.message} onRetry={() => window.location.reload()} />
      </main>
    );
  }

  if (workspaces.status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <ErrorPanel message={workspaces.message} onRetry={retryWorkspaces} />
      </main>
    );
  }

  if (session.status === 'authenticated' && workspaces.status === 'ready') {
    if (!currentWorkspace) {
      return (
        <AppShell
          user={session.user}
          workspaceName={null}
          workspaceId={null}
          location="Preferences"
        >
          <WorkspaceEmptyState
            onCreated={(workspace) => addWorkspace(workspace)}
            onUnauthenticated={() => router.replace('/sign-in')}
          />
        </AppShell>
      );
    }

    return (
      <AppShell
        user={session.user}
        workspaceName={currentWorkspace.name}
        workspaceId={currentWorkspace.id}
        location="Notifications"
      >
        <div className="space-y-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-400">
              Account settings
            </p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-stone-900">
              Notifications
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Manage how and when you receive notifications across your workspaces.
            </p>
          </div>

          {prefsState.status === 'loading' || prefsState.status === 'idle' ? (
            <PreferencesSkeleton />
          ) : prefsState.status === 'error' ? (
            <ErrorPanel message={prefsState.message} onRetry={retryPrefs} />
          ) : (
            <NotificationPreferencesForm
              preferences={prefsState.preferences}
              isSaving={isSaving}
              saveError={saveError}
              onUpdate={(key, val) => void updatePreference(key, val)}
            />
          )}
        </div>
      </AppShell>
    );
  }

  return <AppShellSkeleton />;
}

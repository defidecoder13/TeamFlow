/**
 * Channel route (Phase 3B).
 *
 * A channel shell/metadata state — NOT a messaging screen. Shows the real
 * channel record (icon, name, visibility, description) and a genuine empty
 * conversation state that the messaging phase will build on. No composer,
 * no fake messages, no mock members.
 */

'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../../components/app/AppShell';
import { AppShellSkeleton } from '../../../../components/app/AppShellSkeleton';
import { EditChannelDialog } from '../../../../components/app/EditChannelDialog';
import { HashIcon, LockIcon } from '../../../../components/app/icons';
import { WorkspaceEmptyState } from '../../../../components/app/WorkspaceEmptyState';
import { useSessionUser } from '../../../../lib/use-session-user';
import { useWorkspaceChannel } from '../../../../lib/use-workspace-channel';
import { useWorkspaces } from '../../../../lib/use-workspaces';
import type { Channel } from '../../../../lib/channels';

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

function EmptyConversationMark() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 72"
      className="h-auto w-full max-w-[120px]"
    >
      <g fill="none" stroke="#d6d3d1" strokeWidth="1.5">
        <rect x="8" y="8" width="104" height="14" rx="7" />
        <rect x="8" y="29" width="76" height="14" rx="7" />
        <rect x="8" y="50" width="90" height="14" rx="7" />
      </g>
    </svg>
  );
}

function ChannelView({
  channel,
  canEdit,
  workspaceId,
  onChannelUpdated,
  onUnauthenticated,
}: {
  channel: Channel;
  canEdit: boolean;
  workspaceId: string;
  onChannelUpdated: (channel: Channel) => void;
  onUnauthenticated: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const ChannelIcon = channel.type === 'PRIVATE' ? LockIcon : HashIcon;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500"
        >
          <ChannelIcon className="h-4 w-4" />
        </span>
        <h1 className="text-[22px] font-semibold tracking-tight text-stone-900">{channel.name}</h1>
        <span className="rounded-md bg-stone-900/[0.06] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-stone-600">
          {channel.type === 'PRIVATE' ? 'Private' : 'Public'}
        </span>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto inline-flex h-8 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-[13px] font-medium text-stone-600 transition-colors hover:border-stone-300 hover:text-stone-900"
          >
            Edit channel
          </button>
        ) : null}
      </div>
      {channel.description ? (
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-500">
          {channel.description}
        </p>
      ) : null}

      <section
        aria-label="Conversation"
        className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-12 text-center"
      >
        <EmptyConversationMark />
        <p className="mt-4 text-[15px] font-semibold text-stone-900">Welcome to #{channel.slug}</p>
        <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-stone-500">
          Start a conversation with your team.
        </p>
      </section>

      {editing ? (
        <EditChannelDialog
          workspaceId={workspaceId}
          channel={channel}
          onClose={() => setEditing(false)}
          onUpdated={(updated) => {
            setEditing(false);
            onChannelUpdated(updated);
            if (updated.slug !== channel.slug) {
              router.push(`/app/channels/${updated.slug}`);
            }
          }}
          onUnauthenticated={onUnauthenticated}
        />
      ) : null}
    </div>
  );
}

export default function ChannelPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? (params.slug[0] ?? '') : (params.slug ?? '');
  const session = useSessionUser();
  const {
    state: workspaces,
    retry: retryWorkspaces,
    addWorkspace,
  } = useWorkspaces(session.status === 'authenticated');
  const current =
    session.status === 'authenticated' && workspaces.status === 'ready' ? workspaces.current : null;
  const {
    state: channelState,
    retry: retryChannel,
    setChannel,
  } = useWorkspaceChannel(current?.id ?? null, slug);

  const signedOut =
    session.status === 'unauthenticated' ||
    workspaces.status === 'unauthenticated' ||
    channelState.status === 'unauthenticated';

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
    if (channelState.status === 'loading' || channelState.status === 'idle') {
      return (
        <AppShell
          user={session.user}
          workspaceName={current.name}
          workspaceId={current.id}
          location="Channel"
        >
          <div role="status" aria-label="Loading channel" className="space-y-3">
            <span className="sr-only">Loading channel…</span>
            <div
              aria-hidden="true"
              className="h-9 w-64 animate-pulse rounded-lg bg-stone-900/[0.06]"
            />
            <div aria-hidden="true" className="h-40 animate-pulse rounded-xl bg-white" />
          </div>
        </AppShell>
      );
    }
    if (channelState.status === 'error') {
      return <LoadErrorPanel message={channelState.message} onRetry={retryChannel} />;
    }
    if (channelState.status === 'notFound') {
      return (
        <AppShell
          user={session.user}
          workspaceName={current.name}
          workspaceId={current.id}
          location="Channel"
        >
          <div className="flex flex-col items-center rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-14 text-center">
            <p className="text-[15px] font-semibold text-stone-900">Channel not found</p>
            <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-stone-500">
              This channel doesn&apos;t exist or you don&apos;t have access to it.
            </p>
            <Link
              href="/app"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800"
            >
              Back to Home
            </Link>
          </div>
        </AppShell>
      );
    }
    const canEdit = current.role === 'OWNER' || current.role === 'ADMIN';
    return (
      <AppShell
        user={session.user}
        workspaceName={current.name}
        workspaceId={current.id}
        location={channelState.channel.name}
      >
        <ChannelView
          channel={channelState.channel}
          canEdit={canEdit}
          workspaceId={current.id}
          onChannelUpdated={(updated) => {
            setChannel(updated);
            if (updated.slug !== slug) {
              router.push(`/app/channels/${updated.slug}`);
            }
          }}
          onUnauthenticated={() => router.replace('/sign-in')}
        />
      </AppShell>
    );
  }

  return <AppShellSkeleton />;
}

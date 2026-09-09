/**
 * Second-level navigation sidebar (Phase 1D shell, Phase 3B channels).
 *
 * Only real data is shown: primary navigation (static chrome), the current
 * workspace name, and channels from the channel API. Channels the backend
 * does not return (e.g. inaccessible private channels) never appear here.
 * The URL is the source of truth for the active channel.
 */

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { PRIMARY_NAV_ITEMS } from '../../lib/shell-data';
import { useDirectConversations } from '../../lib/use-direct-conversations';
import { useWorkspaceChannels } from '../../lib/use-workspace-channels';
import { CreateChannelDialog } from './CreateChannelDialog';
import { StartDirectMessageDialog } from './StartDirectMessageDialog';
import {
  HashIcon,
  HelpIcon,
  HomeIcon,
  LockIcon,
  MembersIcon,
  MentionsIcon,
  PlusIcon,
  SavedIcon,
  SettingsIcon,
  ThreadsIcon,
} from './icons';

function PrimaryIcon({ id }: { id: string }) {
  const className = 'h-4 w-4 shrink-0';
  switch (id) {
    case 'home':
      return <HomeIcon className={className} />;
    case 'threads':
      return <ThreadsIcon className={className} />;
    case 'mentions':
      return <MentionsIcon className={className} />;
    case 'saved':
      return <SavedIcon className={className} />;
    default:
      return null;
  }
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-400">
      {children}
    </p>
  );
}

export function Sidebar({
  workspaceName,
  workspaceId,
  currentUserId,
}: {
  workspaceName: string | null;
  workspaceId: string | null;
  currentUserId?: string | null;
}) {
  const [selected, setSelected] = useState('home');
  const [createOpen, setCreateOpen] = useState(false);
  const [startDmOpen, setStartDmOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const membersActive = pathname === '/app/settings/members';
  const settingsActive = pathname.startsWith('/app/settings/notifications');
  const {
    state: channelsState,
    retry: retryChannels,
    addChannel,
  } = useWorkspaceChannels(workspaceId);
  const {
    state: dmsState,
    retry: retryDms,
    addConversation,
  } = useDirectConversations(workspaceId, currentUserId);

  const activeSlug = pathname.startsWith('/app/channels/')
    ? decodeURIComponent(pathname.slice('/app/channels/'.length).split('/')[0] ?? '')
    : null;

  const activeDmId = pathname.startsWith('/app/dms/')
    ? decodeURIComponent(pathname.slice('/app/dms/'.length).split('/')[0] ?? '')
    : null;

  return (
    <nav
      aria-label="Primary"
      className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-stone-200 bg-[#faf9f7] px-3 py-4 lg:flex"
    >
      <div className="mb-3 px-1">
        <button
          type="button"
          disabled
          title={
            workspaceName
              ? 'Workspace switching arrives in a later phase'
              : 'Create a workspace to get started'
          }
          aria-label={workspaceName ? `Current workspace: ${workspaceName}` : 'No workspace yet'}
          className="flex h-9 w-full items-center gap-2 rounded-md px-1 text-left disabled:cursor-not-allowed"
        >
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-stone-900 text-[11px] font-semibold text-white"
          >
            {(workspaceName ?? 'T').trim().charAt(0).toUpperCase() || 'T'}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-900">
            {workspaceName ?? 'TeamFlow'}
          </span>
        </button>
      </div>
      <ul className="space-y-0.5">
        {PRIMARY_NAV_ITEMS.map((item) => {
          // Home is a real route: exact pathname match only, so nested
          // /app/* routes never highlight it. Other entries are placeholders
          // with local selection until their features land.
          const active = item.id === 'home' ? pathname === '/app' : selected === item.id;
          const rowClassName = (isActive: boolean) =>
            [
              'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors',
              isActive
                ? 'bg-stone-900/[0.07] text-stone-900'
                : 'text-stone-600 hover:bg-stone-900/[0.04] hover:text-stone-900',
            ].join(' ');
          if (item.id === 'home') {
            return (
              <li key={item.id}>
                <Link
                  href="/app"
                  aria-current={active ? 'page' : undefined}
                  className={rowClassName(active)}
                >
                  <PrimaryIcon id={item.id} />
                  {item.label}
                </Link>
              </li>
            );
          }
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setSelected(item.id)}
                className={rowClassName(active)}
              >
                <PrimaryIcon id={item.id} />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 space-y-1.5">
        <div className="flex items-center justify-between">
          <SectionLabel>Channels</SectionLabel>
          {workspaceId ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              aria-label="Create channel"
              title="Create a channel"
              className="mr-1 flex h-6 w-6 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-900/[0.05] hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-900"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {workspaceId && (channelsState.status === 'loading' || channelsState.status === 'idle') ? (
          <div role="status" aria-label="Loading channels" className="space-y-1 px-0.5">
            <span className="sr-only">Loading channels…</span>
            {[0, 1].map((row) => (
              <div
                key={row}
                aria-hidden="true"
                className="h-8 animate-pulse rounded-md bg-stone-900/[0.05]"
              />
            ))}
          </div>
        ) : workspaceId && channelsState.status === 'error' ? (
          <div className="px-2">
            <p role="alert" className="text-[13px] text-stone-500">
              Couldn&apos;t load channels.
            </p>
            <button
              type="button"
              onClick={retryChannels}
              className="mt-1 text-[13px] font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 transition-colors hover:decoration-zinc-900"
            >
              Try again
            </button>
          </div>
        ) : workspaceId && channelsState.status === 'ready' && channelsState.channels.length > 0 ? (
          <ul className="space-y-0.5" aria-label="Channels">
            {channelsState.channels.map((channel) => {
              const active = activeSlug === channel.slug;
              const ChannelIcon = channel.type === 'PRIVATE' ? LockIcon : HashIcon;
              return (
                <li key={channel.id}>
                  <Link
                    href={`/app/channels/${channel.slug}`}
                    aria-current={active ? 'page' : undefined}
                    title={channel.type === 'PRIVATE' ? `${channel.name} (private)` : channel.name}
                    className={[
                      'flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] transition-colors',
                      active
                        ? 'bg-stone-900/[0.07] font-medium text-stone-900'
                        : 'text-stone-600 hover:bg-stone-900/[0.04] hover:text-stone-900',
                    ].join(' ')}
                  >
                    <ChannelIcon className="h-4 w-4 shrink-0 text-stone-400" />
                    <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-2 text-[13px] leading-snug text-stone-400">No channels yet.</p>
        )}
      </div>

      {createOpen && workspaceId ? (
        <CreateChannelDialog
          workspaceId={workspaceId}
          workspaceName={workspaceName ?? 'this workspace'}
          onClose={() => setCreateOpen(false)}
          onCreated={(channel) => {
            addChannel(channel);
            setCreateOpen(false);
            router.push(`/app/channels/${channel.slug}`);
          }}
          onUnauthenticated={() => router.replace('/sign-in')}
        />
      ) : null}

      <div className="mt-6 space-y-1.5">
        <div className="flex items-center justify-between">
          <SectionLabel>Direct messages</SectionLabel>
          {workspaceId ? (
            <button
              type="button"
              onClick={() => setStartDmOpen(true)}
              aria-label="New direct message"
              className="flex h-5 w-5 items-center justify-center rounded text-stone-400 transition-colors hover:bg-stone-900/[0.06] hover:text-stone-700"
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {workspaceId && dmsState.status === 'loading' ? (
          <div className="space-y-1 px-2" aria-label="Loading direct messages">
            {[0, 1].map((key) => (
              <div key={key} className="h-8 animate-pulse rounded-md bg-stone-900/[0.05]" />
            ))}
          </div>
        ) : workspaceId && dmsState.status === 'error' ? (
          <div className="px-2">
            <p role="alert" className="text-[13px] text-stone-500">
              Couldn&apos;t load direct messages.
            </p>
            <button
              type="button"
              onClick={retryDms}
              className="mt-1 text-[13px] font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 transition-colors hover:decoration-zinc-900"
            >
              Try again
            </button>
          </div>
        ) : workspaceId && dmsState.status === 'ready' && dmsState.conversations.length > 0 ? (
          <ul className="space-y-0.5" aria-label="Direct messages">
            {dmsState.conversations.map((conv) => {
              const active = activeDmId === conv.id;
              const isGroup = conv.type === 'GROUP';
              const groupDisplayName =
                conv.name?.trim() ||
                (conv.participants && conv.participants.length > 0
                  ? conv.participants
                      .filter((p) => !currentUserId || p.id !== currentUserId)
                      .map((p) => p.name)
                      .join(', ') || 'Group Message'
                  : 'Group Message');

              const displayName = isGroup
                ? groupDisplayName
                : (conv.peer?.name ?? conv.participant?.name ?? 'Direct Message');
              const initial = displayName.trim().charAt(0).toUpperCase() || '?';
              const unreadCount = conv.unreadCount ?? 0;
              const hasUnread = unreadCount > 0 || Boolean(conv.hasUnread);
              const participantCount = conv.participantCount ?? conv.participants?.length;
              return (
                <li key={conv.id}>
                  <Link
                    href={`/app/dms/${conv.id}`}
                    aria-current={active ? 'page' : undefined}
                    title={displayName}
                    className={[
                      'flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] transition-colors',
                      active
                        ? 'bg-stone-900/[0.07] font-medium text-stone-900'
                        : hasUnread
                          ? 'font-semibold text-stone-900 hover:bg-stone-900/[0.04]'
                          : 'text-stone-600 hover:bg-stone-900/[0.04] hover:text-stone-900',
                    ].join(' ')}
                  >
                    {isGroup ? (
                      <span
                        aria-hidden="true"
                        className={[
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium',
                          hasUnread ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-700',
                        ].join(' ')}
                      >
                        <MembersIcon className="h-3 w-3" />
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className={[
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium',
                          hasUnread ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-700',
                        ].join(' ')}
                      >
                        {initial}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{displayName}</span>
                    {isGroup && participantCount && participantCount > 0 ? (
                      <span className="text-[11px] text-stone-400 font-normal shrink-0">
                        {participantCount}
                      </span>
                    ) : null}
                    {unreadCount > 0 ? (
                      <span
                        data-testid={`unread-badge-${conv.id}`}
                        aria-label={`${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`}
                        className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-stone-900 px-1.5 text-[10px] font-semibold text-white"
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-2 text-[13px] leading-snug text-stone-400">No messages yet.</p>
        )}
      </div>

      {startDmOpen && workspaceId ? (
        <StartDirectMessageDialog
          workspaceId={workspaceId}
          workspaceName={workspaceName ?? 'this workspace'}
          onClose={() => setStartDmOpen(false)}
          onSelectConversation={(conv) => {
            addConversation(conv);
            setStartDmOpen(false);
            router.push(`/app/dms/${conv.id}`);
          }}
          onUnauthenticated={() => router.replace('/sign-in')}
        />
      ) : null}

      <div className="mt-auto space-y-0.5 pt-6">
        <Link
          href="/app/settings/members"
          aria-current={membersActive ? 'page' : undefined}
          className={[
            'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors',
            membersActive
              ? 'bg-stone-900/[0.07] text-stone-900'
              : 'text-stone-600 hover:bg-stone-900/[0.04] hover:text-stone-900',
          ].join(' ')}
        >
          <MembersIcon className="h-4 w-4 shrink-0" />
          Members
        </Link>
        <Link
          href="/app/settings/notifications"
          className={[
            'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors',
            settingsActive
              ? 'bg-stone-900/[0.07] text-stone-900'
              : 'text-stone-600 hover:bg-stone-900/[0.04] hover:text-stone-900',
          ].join(' ')}
        >
          <SettingsIcon className="h-4 w-4 shrink-0" />
          Settings
        </Link>
        <button
          type="button"
          disabled
          title="Help arrives in a later phase"
          className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-stone-400 disabled:cursor-not-allowed"
        >
          <HelpIcon className="h-4 w-4 shrink-0" />
          Help
        </button>
      </div>
    </nav>
  );
}

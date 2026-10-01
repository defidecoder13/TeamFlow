/**
 * Sidebar navigation component matching the new design project.
 *
 * Implements:
 * - Single integrated sidebar (width 256px / w-64, surface #F7F6F5, border #E4E2DF)
 * - Workspace header with integrated popover workspace switcher ([AF] Acme Flow ▾)
 * - Switcher displays real workspaces, active checkmark, and "+ Create a workspace" trigger
 * - Primary navigation: Home, Threads, Mentions, Drafts
 * - Channels section with + trigger, unread badges, hover actions (copy link, star, mute)
 * - Direct Messages section with + trigger, presence status dots, group counts, unread badges
 * - Footer actions: "Invite people" and "Workspace settings"
 * - Connects to real TeamFlow channels, direct messages, presence, and workspace store
 */

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useState, useRef, useEffect } from 'react';
import {
  Home,
  MessageSquare,
  AtSign,
  FileEdit,
  Hash,
  Lock,
  Plus,
  ChevronDown,
  Settings,
  UserPlus,
  Star,
  BellOff,
  Link2,
  Check,
} from 'lucide-react';
import { useWorkspaceChannels } from '../../lib/use-workspace-channels';
import { useDirectConversations } from '../../lib/use-direct-conversations';
import { usePresence } from '../../lib/use-presence';
import { useOptionalWorkspaces } from '../../lib/use-workspaces';
import { CreateChannelDialog } from './CreateChannelDialog';
import { StartDirectMessageDialog } from './StartDirectMessageDialog';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { InviteMemberDialog } from './InviteMemberDialog';

function getWorkspaceInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'T';
}

export function Sidebar({
  workspaceName,
  workspaceId,
  currentUserId,
  className,
  onNavigateMobile,
}: {
  workspaceName: string | null;
  workspaceId: string | null;
  currentUserId?: string | null;
  className?: string;
  onNavigateMobile?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Dialog states
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [startDmOpen, setStartDmOpen] = useState(false);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [inviteMemberOpen, setInviteMemberOpen] = useState(false);

  // List pagination states
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [showAllDms, setShowAllDms] = useState(false);

  // Workspace switcher popover state
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [copiedChannelId, setCopiedChannelId] = useState<string | null>(null);

  // Star & mute local visual state
  const [starredChannels, setStarredChannels] = useState<Record<string, boolean>>({});
  const [mutedChannels, setMutedChannels] = useState<Record<string, boolean>>({});

  const workspaceTriggerRef = useRef<HTMLButtonElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

  // Workspaces store (safe access if provider is mounted)
  const workspacesStore = useOptionalWorkspaces();

  const {
    state: channelsState,
    addChannel,
  } = useWorkspaceChannels(workspaceId);

  const {
    state: dmsState,
    addConversation,
  } = useDirectConversations(workspaceId, currentUserId);

  const { getPresence } = usePresence(workspaceId);

  // Close workspace switcher when clicking outside or pressing Escape
  useEffect(() => {
    if (!isWorkspaceMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        workspaceMenuRef.current &&
        !workspaceMenuRef.current.contains(e.target as Node) &&
        workspaceTriggerRef.current &&
        !workspaceTriggerRef.current.contains(e.target as Node)
      ) {
        setIsWorkspaceMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsWorkspaceMenuOpen(false);
        workspaceTriggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isWorkspaceMenuOpen]);

  const activeSlug = pathname.startsWith('/app/channels/')
    ? decodeURIComponent(pathname.slice('/app/channels/'.length).split('/')[0] ?? '')
    : null;

  const activeDmId = pathname.startsWith('/app/dms/')
    ? decodeURIComponent(pathname.slice('/app/dms/'.length).split('/')[0] ?? '')
    : null;

  const channels = channelsState.status === 'ready' ? channelsState.channels : [];
  const conversations = dmsState.status === 'ready' ? dmsState.conversations : [];

  const visibleChannels = showAllChannels ? channels : channels.slice(0, 8);
  const visibleConversations = showAllDms ? conversations : conversations.slice(0, 8);

  const handleCopyChannelLink = (slug: string, channelId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/app/channels/${slug}`;
      navigator.clipboard.writeText(url);
      setCopiedChannelId(channelId);
      setTimeout(() => setCopiedChannelId(null), 1500);
    }
  };

  const toggleStarChannel = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStarredChannels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleMuteChannel = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMutedChannels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const realWorkspaces =
    workspacesStore && workspacesStore.state.status === 'ready'
      ? workspacesStore.state.workspaces
      : workspaceName && workspaceId
        ? [{ id: workspaceId, name: workspaceName, slug: workspaceName.toLowerCase(), role: 'OWNER' as const }]
        : [];

  const effectiveWorkspaceName =
    workspaceName ||
    (workspacesStore && workspacesStore.state.status === 'ready'
      ? workspacesStore.state.current?.name ?? null
      : null);

  const effectiveWorkspaceId =
    workspaceId ||
    (workspacesStore && workspacesStore.state.status === 'ready'
      ? workspacesStore.state.current?.id ?? null
      : null);

  return (
    <nav
      aria-label="Primary"
      className={
        className ??
        'hidden w-64 shrink-0 bg-[#F7F6F5] border-r border-[#E4E2DF] flex-col h-full select-none lg:flex'
      }
    >
      {/* Workspace Header with Integrated Popover Switcher */}
      <div className="h-[52px] px-3 border-b border-[#E4E2DF] flex items-center relative bg-[#F7F6F5] shrink-0">
        <nav aria-label="Workspaces" className="sr-only">
          {realWorkspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => {
                if (workspacesStore) workspacesStore.setCurrentWorkspace(ws.id);
                router.push('/app');
              }}
            >
              {ws.name}
            </button>
          ))}
        </nav>
        {effectiveWorkspaceName && (
          <span className="sr-only" aria-label={`Current workspace: ${effectiveWorkspaceName}`}>
            Current workspace: {effectiveWorkspaceName}
          </span>
        )}
        <button
          ref={workspaceTriggerRef}
          type="button"
          onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 -mx-1 rounded-[8px] hover:bg-[#F1F0EE] transition-colors text-left focus-visible:ring-2 focus-visible:ring-[#3157D5] group cursor-pointer"
          aria-expanded={isWorkspaceMenuOpen}
          aria-haspopup="dialog"
          aria-label={effectiveWorkspaceName ? `${effectiveWorkspaceName} workspace menu` : 'Workspace menu'}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-[8px] bg-[#171A21] text-white flex items-center justify-center font-bold text-[12px] shrink-0 shadow-2xs">
              {effectiveWorkspaceName ? getWorkspaceInitial(effectiveWorkspaceName) : 'T'}
            </div>
            <span className="text-[14px] font-semibold text-[#171A21] truncate tracking-tight">
              {effectiveWorkspaceName || 'Select workspace'}
            </span>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-[#737782] group-hover:text-[#171A21] shrink-0 transition-transform duration-150 ${
              isWorkspaceMenuOpen ? 'rotate-180 text-[#171A21]' : ''
            }`}
          />
        </button>

        {/* Workspace Switcher Popover */}
        {isWorkspaceMenuOpen && (
          <div
            ref={workspaceMenuRef}
            role="dialog"
            aria-label="Switch workspace"
            className="absolute top-[48px] left-2 right-2 w-[calc(100%-16px)] bg-white border border-[#E4E2DF] rounded-[12px] shadow-[0_12px_32px_rgba(20,24,32,0.12)] p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#737782]">
              Switch workspace
            </div>

            <div className="max-h-60 overflow-y-auto space-y-0.5 py-0.5">
              {realWorkspaces.map((ws) => {
                const isActive = ws.id === effectiveWorkspaceId;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      if (workspacesStore) {
                        workspacesStore.setCurrentWorkspace(ws.id);
                      }
                      setIsWorkspaceMenuOpen(false);
                      router.push('/app');
                    }}
                    className={`w-full h-11 px-2.5 flex items-center gap-2.5 text-left transition-colors rounded-[8px] cursor-pointer ${
                      isActive
                        ? 'bg-[#EEF2FF] text-[#3157D5]'
                        : 'hover:bg-[#F1F0EE] text-[#171A21]'
                    }`}
                  >
                    {/* Active checkmark */}
                    <div className="w-4 flex items-center justify-center shrink-0">
                      {isActive && <Check className="w-4 h-4 text-[#3157D5]" />}
                    </div>

                    <div
                      className={`w-7 h-7 rounded-[6px] flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        isActive
                          ? 'bg-[#3157D5] text-white'
                          : 'bg-[#171A21] text-white'
                      }`}
                    >
                      {getWorkspaceInitial(ws.name)}
                    </div>

                    <span
                      className={`text-[13px] truncate flex-1 ${
                        isActive ? 'font-semibold text-[#3157D5]' : 'font-medium text-[#171A21]'
                      }`}
                    >
                      {ws.name}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="my-1 border-t border-[#E4E2DF]" />

            <button
              type="button"
              onClick={() => {
                setIsWorkspaceMenuOpen(false);
                setCreateWorkspaceOpen(true);
              }}
              className="w-full h-10 px-2.5 flex items-center gap-2.5 text-left text-[13px] font-medium text-[#171A21] hover:bg-[#F1F0EE] rounded-[8px] transition-colors cursor-pointer"
            >
              <div className="w-4 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4 text-[#737782]" />
              </div>
              <span>Create a workspace</span>
            </button>
          </div>
        )}
      </div>

      {/* Primary Navigation & Section Lists */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4 text-[13px]">
        {/* Core Navigation Items */}
        <div className="space-y-0.5">
          {/* Home */}
          <Link
            href="/app"
            onClick={onNavigateMobile}
            aria-current={pathname === '/app' ? 'page' : undefined}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] font-medium transition-colors ${
              pathname === '/app'
                ? 'bg-[#EEF2FF] text-[#3157D5] font-semibold'
                : 'text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE]'
            }`}
          >
            <Home
              className={`w-4 h-4 ${
                pathname === '/app' ? 'text-[#3157D5]' : 'text-[#737782]'
              }`}
            />
            <span>Home</span>
          </Link>

          {/* Threads */}
          <Link
            href="/app/search?type=messages"
            onClick={onNavigateMobile}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
          >
            <MessageSquare className="w-4 h-4 text-[#737782]" />
            <span>Threads</span>
          </Link>

          {/* Mentions */}
          <Link
            href="/app/search?q=@"
            onClick={onNavigateMobile}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
          >
            <AtSign className="w-4 h-4 text-[#737782]" />
            <span>Mentions</span>
          </Link>

          {/* Drafts */}
          <button
            type="button"
            onClick={() => {}}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
          >
            <FileEdit className="w-4 h-4 text-[#737782]" />
            <span>Drafts</span>
          </button>
        </div>

        {/* CHANNELS Section */}
        <div>
          <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#737782]">
            <span>CHANNELS</span>
            {effectiveWorkspaceId ? (
              <button
                type="button"
                onClick={() => setCreateChannelOpen(true)}
                className="p-0.5 rounded hover:bg-[#ECEAE7] text-[#737782] hover:text-[#171A21] transition-colors"
                title="Create channel"
                aria-label="Create channel"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>

          {effectiveWorkspaceId && (channelsState.status === 'loading' || channelsState.status === 'idle') ? (
            <div role="status" aria-label="Loading channels" className="space-y-1 px-1 py-1">
              <span className="sr-only">Loading channels…</span>
              {[0, 1].map((r) => (
                <div key={r} aria-hidden="true" className="h-7 animate-pulse rounded-[6px] bg-[#ECEAE7]" />
              ))}
            </div>
          ) : effectiveWorkspaceId && channelsState.status === 'ready' && channels.length > 0 ? (
            <ul className="mt-0.5 space-y-0.5" aria-label="Channels">
              {visibleChannels.map((channel) => {
                const isActive = activeSlug === channel.slug;
                const isStarred = Boolean(starredChannels[channel.id]);
                const isMuted = Boolean(mutedChannels[channel.id]);
                const unreadCount = (channel as unknown as { unreadCount?: number }).unreadCount ?? 0;

                return (
                  <li key={channel.id} className="group relative flex items-center rounded-[8px]">
                    <Link
                      href={`/app/channels/${channel.slug}`}
                      onClick={onNavigateMobile}
                      aria-current={isActive ? 'page' : undefined}
                      title={channel.type === 'PRIVATE' ? `${channel.name} (private)` : channel.name}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[8px] font-medium text-left transition-colors ${
                        isActive
                          ? 'bg-[#EEF2FF] text-[#3157D5] font-semibold'
                          : 'text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE]'
                      } ${isMuted ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        {channel.type === 'PRIVATE' ? (
                          <Lock className="w-3.5 h-3.5 text-[#737782] shrink-0" />
                        ) : (
                          <Hash className="w-3.5 h-3.5 text-[#737782] shrink-0" />
                        )}
                        <span className="truncate">{channel.name}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isStarred && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                        {unreadCount > 0 && !isActive && (
                          <span className="bg-[#171A21] text-white text-[11px] font-semibold px-1.5 py-0.2 rounded-full tabular-nums">
                            {unreadCount}
                          </span>
                        )}
                      </div>
                    </Link>

                    {/* Channel Hover Toolbar */}
                    <div className="absolute right-1 hidden group-hover:flex items-center bg-white border border-[#E4E2DF] rounded-[6px] shadow-2xs p-0.5 gap-0.5 z-10">
                      <button
                        type="button"
                        onClick={(e) => handleCopyChannelLink(channel.slug, channel.id, e)}
                        className="p-1 hover:bg-[#F1F0EE] rounded text-[#737782] hover:text-[#171A21]"
                        title="Copy channel link"
                        aria-label={`Copy link to #${channel.name}`}
                      >
                        {copiedChannelId === channel.id ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Link2 className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => toggleStarChannel(channel.id, e)}
                        className={`p-1 hover:bg-[#F1F0EE] rounded ${
                          isStarred ? 'text-amber-500 fill-amber-500' : 'text-[#737782] hover:text-[#171A21]'
                        }`}
                        title={isStarred ? 'Unstar channel' : 'Star channel'}
                        aria-label={isStarred ? 'Unstar channel' : 'Star channel'}
                      >
                        <Star className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => toggleMuteChannel(channel.id, e)}
                        className={`p-1 hover:bg-[#F1F0EE] rounded ${
                          isMuted ? 'text-[#C94A45]' : 'text-[#737782] hover:text-[#171A21]'
                        }`}
                        title={isMuted ? 'Unmute channel' : 'Mute channel'}
                        aria-label={isMuted ? 'Unmute channel' : 'Mute channel'}
                      >
                        <BellOff className="w-3 h-3" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-2 py-1 text-[13px] text-[#737782]">
              <p>No channels yet.</p>
              {effectiveWorkspaceId ? (
                <button
                  type="button"
                  onClick={() => setCreateChannelOpen(true)}
                  className="mt-1 text-[12px] font-medium text-[#171A21] underline decoration-[#DDDCDF] hover:decoration-[#171A21]"
                >
                  Create the first channel
                </button>
              ) : null}
            </div>
          )}

          {channels.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAllChannels(!showAllChannels)}
              aria-expanded={showAllChannels}
              className="mt-1 px-2.5 py-1 text-[12px] font-medium text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] w-full text-left transition-colors"
            >
              <span>{showAllChannels ? 'Show fewer' : `Show all ${channels.length} channels`}</span>
            </button>
          )}
        </div>

        {/* DIRECT MESSAGES Section */}
        <div>
          <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#737782]">
            <span>DIRECT MESSAGES</span>
            {effectiveWorkspaceId ? (
              <button
                type="button"
                onClick={() => setStartDmOpen(true)}
                className="p-0.5 rounded hover:bg-[#ECEAE7] text-[#737782] hover:text-[#171A21] transition-colors"
                title="Start direct message"
                aria-label="Start direct message"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>

          {effectiveWorkspaceId && dmsState.status === 'loading' ? (
            <div role="status" aria-label="Loading direct messages" className="space-y-1 px-1 py-1">
              <span className="sr-only">Loading direct messages…</span>
              {[0, 1].map((k) => (
                <div key={k} aria-hidden="true" className="h-7 animate-pulse rounded-[6px] bg-[#ECEAE7]" />
              ))}
            </div>
          ) : effectiveWorkspaceId && dmsState.status === 'ready' && conversations.length > 0 ? (
            <ul className="mt-0.5 space-y-0.5" aria-label="Direct messages">
              {visibleConversations.map((conv) => {
                const isActive = activeDmId === conv.id;
                const isGroup = conv.type === 'GROUP';
                const groupDisplayName =
                  conv.name?.trim() ||
                  (conv.participants && conv.participants.length > 0
                    ? conv.participants
                        .filter((p) => !currentUserId || p.id !== currentUserId)
                        .map((p) => p.name)
                        .join(', ') || 'Group Message'
                    : 'Group Message');

                const peer = conv.peer ?? conv.participant;
                const displayName = isGroup ? groupDisplayName : (peer?.name ?? 'Direct Message');
                const initial = displayName.trim().charAt(0).toUpperCase() || '?';
                const unreadCount = conv.unreadCount ?? 0;
                const participantCount = conv.participantCount ?? conv.participants?.length;
                const presenceStatus = peer?.id ? getPresence(peer.id).status : 'offline';

                return (
                  <li key={conv.id}>
                    <Link
                      href={`/app/dms/${conv.id}`}
                      onClick={onNavigateMobile}
                      aria-current={isActive ? 'page' : undefined}
                      title={displayName}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[8px] font-medium text-left transition-colors ${
                        isActive
                          ? 'bg-[#EEF2FF] text-[#3157D5] font-semibold'
                          : unreadCount > 0 || conv.hasUnread
                            ? 'font-semibold text-[#171A21] hover:bg-[#F1F0EE]'
                            : 'text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="relative shrink-0">
                          {peer?.image ? (
                            <img
                              src={peer.image}
                              alt=""
                              className="w-5 h-5 rounded-full object-cover bg-[#ECEAE7]"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-[#E4E2DF] text-[#171A21] text-[10px] font-semibold flex items-center justify-center">
                              {initial}
                            </div>
                          )}
                          {!isGroup && (
                            <span
                              role="img"
                              aria-label={`Presence: ${String(presenceStatus).toUpperCase() === 'ONLINE' ? 'online' : 'offline'}`}
                              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
                                String(presenceStatus).toUpperCase() === 'ONLINE'
                                  ? 'bg-[#48B88A]'
                                  : 'bg-neutral-400'
                              }`}
                            />
                          )}
                        </div>
                        <span className="truncate">{displayName}</span>
                        {isGroup && participantCount && participantCount > 0 ? (
                          <span className="shrink-0 text-[11px] font-normal tabular-nums text-[#737782]">
                            {participantCount}
                          </span>
                        ) : null}
                      </div>

                      {unreadCount > 0 && (
                        <span
                          data-testid={`unread-badge-${conv.id}`}
                          aria-label={`${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`}
                          className="bg-[#171A21] text-white text-[11px] font-semibold px-1.5 py-0.2 rounded-full tabular-nums ml-auto"
                        >
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-2 py-1 text-[13px] text-[#737782]">
              <p>No messages yet.</p>
              {effectiveWorkspaceId ? (
                <button
                  type="button"
                  onClick={() => setStartDmOpen(true)}
                  className="mt-1 text-[12px] font-medium text-[#171A21] underline decoration-[#DDDCDF] hover:decoration-[#171A21]"
                >
                  Start a conversation
                </button>
              ) : null}
            </div>
          )}

          {conversations.length > 8 && (
            <button
              type="button"
              onClick={() => setShowAllDms(!showAllDms)}
              aria-expanded={showAllDms}
              className="mt-1 px-2.5 py-1 text-[12px] font-medium text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] w-full text-left transition-colors"
            >
              <span>{showAllDms ? 'Show fewer' : `Show all ${conversations.length} conversations`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer Administration */}
      <div className="p-2 border-t border-[#E4E2DF] bg-[#F7F6F5] space-y-0.5">
        <button
          type="button"
          onClick={() => setInviteMemberOpen(true)}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-[13px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
        >
          <UserPlus className="w-4 h-4 text-[#737782]" />
          <span>Invite people</span>
        </button>

        <Link
          href="/app/settings/workspace"
          onClick={onNavigateMobile}
          aria-current={pathname === '/app/settings/workspace' ? 'page' : undefined}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${
            pathname === '/app/settings/workspace'
              ? 'bg-[#EEF2FF] text-[#3157D5] font-semibold'
              : 'text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE]'
          }`}
        >
          <Settings className="w-4 h-4 text-[#737782]" />
          <span>Workspace settings</span>
        </Link>
      </div>

      {/* Dialogs */}
      {createChannelOpen && effectiveWorkspaceId ? (
        <CreateChannelDialog
          workspaceId={effectiveWorkspaceId}
          workspaceName={effectiveWorkspaceName ?? 'this workspace'}
          onClose={() => setCreateChannelOpen(false)}
          onCreated={(channel) => {
            addChannel(channel);
            setCreateChannelOpen(false);
            router.push(`/app/channels/${channel.slug}`);
          }}
          onUnauthenticated={() => router.replace('/sign-in')}
        />
      ) : null}

      {startDmOpen && effectiveWorkspaceId ? (
        <StartDirectMessageDialog
          workspaceId={effectiveWorkspaceId}
          workspaceName={effectiveWorkspaceName ?? 'this workspace'}
          onClose={() => setStartDmOpen(false)}
          onSelectConversation={(conv) => {
            addConversation(conv);
            setStartDmOpen(false);
            router.push(`/app/dms/${conv.id}`);
          }}
          onUnauthenticated={() => router.replace('/sign-in')}
        />
      ) : null}

      {createWorkspaceOpen ? (
        <CreateWorkspaceDialog
          open={createWorkspaceOpen}
          onClose={() => setCreateWorkspaceOpen(false)}
          onCreated={() => {
            setCreateWorkspaceOpen(false);
            router.push('/app');
          }}
        />
      ) : null}

      {inviteMemberOpen && effectiveWorkspaceId ? (
        <InviteMemberDialog
          workspaceId={effectiveWorkspaceId}
          workspaceName={effectiveWorkspaceName ?? 'this workspace'}
          onClose={() => setInviteMemberOpen(false)}
          onCreated={() => setInviteMemberOpen(false)}
          onUnauthenticated={() => router.replace('/sign-in')}
        />
      ) : null}
    </nav>
  );
}

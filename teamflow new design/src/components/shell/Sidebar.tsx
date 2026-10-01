import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useRouter } from '../../hooks/useRouter';
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

export const Sidebar: React.FC<{ onNavigateMobile?: () => void }> = ({ onNavigateMobile }) => {
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspaceId,
    setCreateWorkspaceOpen,
    channels,
    dms,
    members,
    currentUser,
    setCreateChannelOpen,
    setInviteMemberOpen,
    createOrGetDm,
    toggleMuteChannel,
    toggleFavoriteChannel,
    showToast,
  } = useApp();

  const { pathname, push } = useRouter();

  // Navigation states
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [showAllDms, setShowAllDms] = useState(false);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [copiedChannelId, setCopiedChannelId] = useState<string | null>(null);

  const workspaceTriggerRef = useRef<HTMLButtonElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

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

  const channelsLimit = 8;
  const dmsLimit = 8;

  const visibleChannels = showAllChannels ? channels : channels.slice(0, channelsLimit);
  const visibleDms = showAllDms ? dms : dms.slice(0, dmsLimit);

  const navigateTo = (url: string) => {
    push(url);
    if (onNavigateMobile) onNavigateMobile();
  };

  const handleCopyChannelLink = (channelSlug: string, channelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/app/channels/${channelSlug}`;
    navigator.clipboard.writeText(url);
    setCopiedChannelId(channelId);
    showToast(`Copied link to #${channelSlug}`, 'success');
    setTimeout(() => setCopiedChannelId(null), 1500);
  };

  const handleStartNewDm = () => {
    const otherMember = members.find((m) => m.id !== currentUser.id) || members[0];
    const newDm = createOrGetDm([currentUser.id, otherMember.id]);
    navigateTo(`/app/dms/${newDm.id}`);
  };

  return (
    <aside
      aria-label="Workspace navigation"
      className="w-64 shrink-0 bg-[#F7F6F5] border-r border-[#E4E2DF] flex flex-col h-full select-none"
    >
      {/* Workspace Header with Integrated Switcher */}
      <div className="h-[52px] px-3 border-b border-[#E4E2DF] flex items-center relative bg-[#F7F6F5] shrink-0">
        <button
          ref={workspaceTriggerRef}
          type="button"
          onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 -mx-1 rounded-[8px] hover:bg-[#F1F0EE] transition-colors text-left focus-visible:ring-2 focus-visible:ring-[#3157D5] group cursor-pointer"
          aria-expanded={isWorkspaceMenuOpen}
          aria-haspopup="dialog"
          aria-label={`${activeWorkspace.name} workspace menu`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Workspace Logo or Initials */}
            {activeWorkspace.logoUrl ? (
              <img
                src={activeWorkspace.logoUrl}
                alt=""
                className="w-7 h-7 rounded-[8px] object-cover bg-[#ECEAE7] shrink-0 border border-[#E4E2DF]"
              />
            ) : (
              <div className="w-7 h-7 rounded-[8px] bg-[#171A21] text-white flex items-center justify-center font-bold text-[12px] shrink-0 shadow-2xs">
                {activeWorkspace.avatarText}
              </div>
            )}
            <span className="text-[14px] font-semibold text-[#171A21] truncate tracking-tight">
              {activeWorkspace.name}
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
              {workspaces.map((ws) => {
                const isActive = ws.id === activeWorkspace.id;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      setActiveWorkspaceId(ws.id);
                      setIsWorkspaceMenuOpen(false);
                      showToast(`Switched to ${ws.name}`, 'success');
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

                    {/* Logo / Initials */}
                    {ws.logoUrl ? (
                      <img
                        src={ws.logoUrl}
                        alt=""
                        className="w-7 h-7 rounded-[6px] object-cover bg-[#ECEAE7] shrink-0"
                      />
                    ) : (
                      <div
                        className={`w-7 h-7 rounded-[6px] flex items-center justify-center text-[11px] font-bold shrink-0 ${
                          isActive
                            ? 'bg-[#3157D5] text-white'
                            : 'bg-[#171A21] text-white'
                        }`}
                      >
                        {ws.avatarText}
                      </div>
                    )}

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

      {/* Navigation & Section Lists */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4 text-[13px]">
        {/* Primary Navigation matching visual reference */}
        <div className="space-y-0.5">
          {/* Home */}
          <button
            type="button"
            onClick={() => navigateTo('/app')}
            aria-current={pathname === '/app' || pathname === '/' ? 'page' : undefined}
            className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] font-medium transition-colors ${
              pathname === '/app' || pathname === '/'
                ? 'bg-[#EEF2FF] text-[#3157D5] font-semibold'
                : 'text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE]'
            }`}
          >
            <Home
              className={`w-4 h-4 ${
                pathname === '/app' || pathname === '/' ? 'text-[#3157D5]' : 'text-[#737782]'
              }`}
            />
            <span>Home</span>
          </button>

          {/* Threads */}
          <button
            type="button"
            onClick={() => navigateTo('/app/search?type=messages')}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
          >
            <MessageSquare className="w-4 h-4 text-[#737782]" />
            <span>Threads</span>
          </button>

          {/* Mentions */}
          <button
            type="button"
            onClick={() => navigateTo('/app/search?q=@')}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
          >
            <AtSign className="w-4 h-4 text-[#737782]" />
            <span>Mentions</span>
          </button>

          {/* Drafts */}
          <button
            type="button"
            onClick={() => showToast('Drafts are autosaved locally.', 'info')}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
          >
            <FileEdit className="w-4 h-4 text-[#737782]" />
            <span>Drafts</span>
          </button>
        </div>

        {/* CHANNELS Section */}
        <div>
          <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-[#737782]">
            <span>CHANNELS</span>
            <button
              type="button"
              onClick={() => setCreateChannelOpen(true)}
              className="p-0.5 rounded hover:bg-[#ECEAE7] text-[#737782] hover:text-[#171A21] transition-colors"
              title="Create channel"
              aria-label="Create channel"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-0.5 space-y-0.5" role="list" aria-label="Channels">
            {visibleChannels.map((channel) => {
              const isActive = pathname === `/app/channels/${channel.slug}`;
              return (
                <div
                  key={channel.id}
                  role="listitem"
                  className="group relative flex items-center rounded-[8px]"
                >
                  <button
                    type="button"
                    onClick={() => navigateTo(`/app/channels/${channel.slug}`)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[8px] font-medium text-left transition-colors ${
                      isActive
                        ? 'bg-[#EEF2FF] text-[#3157D5] font-semibold'
                        : 'text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE]'
                    } ${channel.isMuted ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      {channel.isPrivate ? (
                        <Lock className="w-3.5 h-3.5 text-[#737782] shrink-0" />
                      ) : (
                        <Hash className="w-3.5 h-3.5 text-[#737782] shrink-0" />
                      )}
                      <span className="truncate">{channel.name}</span>
                    </div>

                    {/* Unread badge or favorite indicator */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {channel.isFavorite && (
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      )}
                      {channel.unreadCount > 0 && !isActive && (
                        <span className="bg-[#171A21] text-white text-[11px] font-semibold px-1.5 py-0.2 rounded-full tabular-nums">
                          {channel.unreadCount}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Channel Hover Toolbar */}
                  <div className="absolute right-1 hidden group-hover:flex items-center bg-white/95 backdrop-blur-xs border border-[#E4E2DF] rounded-[6px] shadow-2xs p-0.5 gap-0.5 z-10">
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
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteChannel(channel.id);
                      }}
                      className={`p-1 hover:bg-[#F1F0EE] rounded ${
                        channel.isFavorite
                          ? 'text-amber-500 fill-amber-500'
                          : 'text-[#737782] hover:text-[#171A21]'
                      }`}
                      title={channel.isFavorite ? 'Unstar channel' : 'Star channel'}
                      aria-label={channel.isFavorite ? 'Unstar channel' : 'Star channel'}
                    >
                      <Star className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMuteChannel(channel.id);
                      }}
                      className={`p-1 hover:bg-[#F1F0EE] rounded ${
                        channel.isMuted ? 'text-[#C94A45]' : 'text-[#737782] hover:text-[#171A21]'
                      }`}
                      title={channel.isMuted ? 'Unmute channel' : 'Mute channel'}
                      aria-label={channel.isMuted ? 'Unmute channel' : 'Mute channel'}
                    >
                      <BellOff className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {channels.length > channelsLimit && (
            <button
              type="button"
              onClick={() => setShowAllChannels(!showAllChannels)}
              className="mt-1 px-2.5 py-1 text-[12px] font-medium text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] w-full text-left transition-colors"
            >
              <span>{showAllChannels ? 'Show less' : `Show all ${channels.length}`}</span>
            </button>
          )}
        </div>

        {/* DIRECT MESSAGES Section */}
        <div>
          <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-[#737782]">
            <span>DIRECT MESSAGES</span>
            <button
              type="button"
              onClick={handleStartNewDm}
              className="p-0.5 rounded hover:bg-[#ECEAE7] text-[#737782] hover:text-[#171A21] transition-colors"
              title="Start direct message"
              aria-label="Start direct message"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-0.5 space-y-0.5" role="list" aria-label="Direct messages">
            {visibleDms.map((dm) => {
              const otherParticipantIds = dm.participantIds.filter((id) => id !== currentUser.id);
              const otherMembers = members.filter((m) => otherParticipantIds.includes(m.id));
              const title =
                otherMembers.length > 0
                  ? otherMembers.map((m) => m.name).join(', ')
                  : 'Direct message';
              const primaryOther = otherMembers[0] || currentUser;
              const isActive = pathname === `/app/dms/${dm.id}`;

              return (
                <div key={dm.id} role="listitem">
                  <button
                    type="button"
                    onClick={() => navigateTo(`/app/dms/${dm.id}`)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[8px] font-medium text-left transition-colors ${
                      isActive
                        ? 'bg-[#EEF2FF] text-[#3157D5] font-semibold'
                        : 'text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="relative shrink-0">
                        {primaryOther.avatarUrl ? (
                          <img
                            src={primaryOther.avatarUrl}
                            alt=""
                            className="w-5 h-5 rounded-full object-cover bg-[#ECEAE7]"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-neutral-200 text-neutral-700 text-[10px] font-semibold flex items-center justify-center">
                            {title.charAt(0)}
                          </div>
                        )}
                        <span
                          role="img"
                          aria-label={`Presence: ${primaryOther.presence}`}
                          className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
                            primaryOther.presence === 'online'
                              ? 'bg-[#48B88A]'
                              : primaryOther.presence === 'away'
                              ? 'bg-[#E8A33A]'
                              : 'bg-neutral-400'
                          }`}
                        />
                      </div>
                      <span className="truncate">{title}</span>
                    </div>

                    {dm.unreadCount > 0 && !isActive && (
                      <span className="bg-[#171A21] text-white text-[11px] font-semibold px-1.5 py-0.2 rounded-full tabular-nums">
                        {dm.unreadCount}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {dms.length > dmsLimit && (
            <button
              type="button"
              onClick={() => setShowAllDms(!showAllDms)}
              className="mt-1 px-2.5 py-1 text-[12px] font-medium text-[#737782] hover:text-[#171A21] hover:bg-[#F1F0EE] rounded-[6px] w-full text-left transition-colors"
            >
              <span>{showAllDms ? 'Show less' : `Show all ${dms.length}`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer Administration matching Reference Image */}
      <div className="p-2 border-t border-[#E4E2DF] bg-[#F7F6F5] space-y-0.5">
        <button
          type="button"
          onClick={() => setInviteMemberOpen(true)}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-[13px] font-medium text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE] transition-colors"
        >
          <UserPlus className="w-4 h-4 text-[#737782]" />
          <span>Invite people</span>
        </button>

        <button
          type="button"
          onClick={() => navigateTo('/app/settings/workspace')}
          aria-current={pathname === '/app/settings/workspace' ? 'page' : undefined}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${
            pathname === '/app/settings/workspace'
              ? 'bg-[#EEF2FF] text-[#3157D5] font-semibold'
              : 'text-[#4F5360] hover:text-[#171A21] hover:bg-[#F1F0EE]'
          }`}
        >
          <Settings className="w-4 h-4 text-[#737782]" />
          <span>Workspace settings</span>
        </button>
      </div>
    </aside>
  );
};

import React, { useState } from 'react';
import { Dialog } from '../primitives/Dialog';
import { useApp } from '../../../lib/mock-context';
import { useShell } from '../../../lib/shell-context';
import { useChannelMembers } from '../../../lib/use-channel-members';
import { getApiBaseUrl } from '../../../lib/config';
import {
  addConversationParticipant,
  removeConversationParticipant,
  type DirectConversation,
} from '../../../lib/messages';
import type { Channel, DMConversation } from '../../../lib/mock-types';
import type { Channel as RealChannel } from '../../../lib/channels';
import { UserPlus, X } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';

interface ChannelMembersDialogProps {
  /** Real channel (channel page path). When set, conversation is ignored. */
  channel?: RealChannel;
  /** Real direct/group conversation (DM page — Audit 04). Ignored when channel is set. */
  directConversation?: DirectConversation;
  /** Called after a successful participant add/remove so the page can refresh its conversation. */
  onDirectConversationChange?: (conversation: DirectConversation) => void;
  /** Mock conversation path (legacy — only used when neither channel nor directConversation is set). */
  conversation?: Channel | DMConversation;
}

function isChannelConversation(
  value: Channel | DMConversation | undefined,
): value is Channel {
  if (!value) return false;
  return 'memberIds' in value;
}

export const ChannelMembersDialog: React.FC<ChannelMembersDialogProps> = ({
  channel,
  directConversation,
  onDirectConversationChange,
  conversation,
}) => {
  const {
    isChannelMembersOpen,
    setChannelMembersOpen,
    members: mockMembers,
    currentUser: mockCurrentUser,
    addMemberToChannel,
    removeMemberFromChannel,
    showToast,
  } = useApp();
  const shell = useShell();

  const [selectedAddMemberId, setSelectedAddMemberId] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const workspaceId = shell.currentWorkspace?.id ?? null;
  const isPrivateReal = channel?.type === 'PRIVATE';
  const realMembers = useChannelMembers(
    workspaceId,
    channel?.slug ?? null,
    Boolean(channel) && isPrivateReal,
  );

  const close = () => {
    setSearchFilter('');
    setSelectedAddMemberId('');
    setChannelMembersOpen(false);
  };

  // --- Real direct conversation path (Audit 04) ---
  if (!channel && directConversation) {
    const conv = directConversation;
    const participantIds = new Set(conv.participants.map((p) => p.id));
    const workspaceMembers =
      shell.members.state.status === 'ready' ? shell.members.state.members : [];

    const rows = conv.participants.map((p) => ({
      key: p.id,
      userId: p.id,
      name: p.name,
      email: p.email,
      image: p.image,
      role: workspaceMembers.find((wm) => wm.user.id === p.id)?.role ?? 'MEMBER',
    }));

    const filteredRows = rows.filter(
      (m) =>
        m.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        m.email.toLowerCase().includes(searchFilter.toLowerCase())
    );

    const isGroup = conv.type === 'GROUP';
    const canManageGroup = isGroup && conv.currentUserRole === 'ADMIN';
    const availableForAdd = canManageGroup
      ? workspaceMembers.filter((wm) => !participantIds.has(wm.user.id))
      : [];

    const handleAddMember = async () => {
      if (!selectedAddMemberId) return;
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        showToast('Could not add participant', 'error');
        return;
      }
      const result = await addConversationParticipant(apiBase, conv.id, selectedAddMemberId);
      if (result.ok) {
        setSelectedAddMemberId('');
        showToast('Participant added', 'success');
        onDirectConversationChange?.(result.data);
      } else {
        showToast(result.message ?? 'Could not add participant', 'error');
      }
    };

    const handleRemoveMember = async (userId: string, name: string) => {
      let apiBase: string;
      try {
        apiBase = getApiBaseUrl();
      } catch {
        showToast('Could not remove participant', 'error');
        return;
      }
      const result = await removeConversationParticipant(apiBase, conv.id, userId);
      if (result.ok) {
        showToast(`${name} removed`, 'success');
        const nextParticipants = conv.participants.filter((p) => p.id !== userId);
        onDirectConversationChange?.({
          ...conv,
          participants: nextParticipants,
          participantCount: Math.max(1, (conv.participantCount ?? conv.participants.length) - 1),
        });
      } else {
        showToast(result.message ?? 'Could not remove participant', 'error');
      }
    };

    const countLabel = `${rows.length} member${rows.length === 1 ? '' : 's'}`;
    const title = isGroup
      ? conv.name
        ? `${conv.name} participants`
        : 'Group conversation'
      : 'Conversation participants';

    return (
      <Dialog
        isOpen={isChannelMembersOpen}
        onClose={close}
        title={title}
        description={countLabel}
      >
        <div className="space-y-4">
          <input
            type="search"
            placeholder="Find members..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-[13px] bg-[#F6F5F3] border border-[#E4E2DF] rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-[#EEF2FF] focus-visible:border-[#3157D5] placeholder:text-[#737782]"
          />

          {canManageGroup && availableForAdd.length > 0 && (
            <div className="p-3 bg-[#FAF9F8] rounded-[8px] border border-[#E4E2DF] space-y-2">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#171A21]">
                <UserPlus className="w-3.5 h-3.5 text-[#3157D5]" />
                <span>Add someone to this conversation</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedAddMemberId}
                  onChange={(e) => setSelectedAddMemberId(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-[13px] bg-white border border-[#E4E2DF] rounded-[6px] outline-none"
                >
                  <option value="">Select a teammate...</option>
                  {availableForAdd.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name} ({m.role})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleAddMember()}
                  disabled={!selectedAddMemberId}
                  className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#2E3440] hover:bg-[#1E222A] disabled:opacity-40 disabled:cursor-not-allowed rounded-[6px] transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-[#E4E2DF] max-h-[300px] overflow-y-auto pr-1">
            {filteredRows.map((member) => {
              const isSelf = member.userId === shell.currentUser?.id;
              const presence = shell.presence.getPresence(member.userId);
              return (
                <div key={member.key} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar
                      name={member.name}
                      src={member.image}
                      size={34}
                      presence={presence.status === 'ONLINE' ? 'online' : 'offline'}
                      showPresence
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-[#171A21] truncate">
                          {member.name}
                        </span>
                        {isSelf && (
                          <span className="text-[11px] text-[#737782] font-medium bg-[#F1F0EE] px-1.5 py-0.2 rounded">
                            You
                          </span>
                        )}
                        {member.role === 'OWNER' && (
                          <span className="text-[10px] uppercase font-semibold text-[#737782] bg-[#F1F0EE] px-1.5 py-0.2 rounded border border-[#E4E2DF]">
                            Owner
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-[#737782] truncate">{member.email}</p>
                    </div>
                  </div>

                  {canManageGroup && !isSelf && rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveMember(member.userId, member.name)}
                      className="p-1 text-[#737782] hover:text-[#C94A45] hover:bg-rose-50 rounded-[6px] transition-colors"
                      title={`Remove ${member.name} from conversation`}
                      aria-label={`Remove ${member.name} from conversation`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            {filteredRows.length === 0 && (
              <p className="py-3 text-[13px] text-[#737782]">No members match your search.</p>
            )}
          </div>
        </div>
      </Dialog>
    );
  }

  // --- Conversation (mock DM) path — only when neither real prop is set ---
  if (!channel) {
    const conv = conversation;
    const targetMemberIds = isChannelConversation(conv)
      ? conv.memberIds
      : conv && 'participantIds' in conv
        ? conv.participantIds
        : [];
    const channelMembers = mockMembers.filter((m) => targetMemberIds.includes(m.id));
    const availableMembers = mockMembers.filter((m) => !targetMemberIds.includes(m.id));

    const filteredMembers = channelMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        m.email.toLowerCase().includes(searchFilter.toLowerCase()) ||
        m.title.toLowerCase().includes(searchFilter.toLowerCase())
    );

    const title = isChannelConversation(conv)
      ? `#${conv.name} members`
      : 'Conversation participants';

    const handleAddMember = () => {
      if (isChannelConversation(conv) && selectedAddMemberId) {
        addMemberToChannel(conv.id, selectedAddMemberId);
        setSelectedAddMemberId('');
      }
    };

    return (
      <Dialog
        isOpen={isChannelMembersOpen}
        onClose={close}
        title={title}
        description={`${channelMembers.length} member${channelMembers.length === 1 ? '' : 's'}`}
      >
        <div className="space-y-4">
          <input
            type="search"
            placeholder="Find members..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full px-3 py-1.5 text-[13px] bg-[#F6F5F3] border border-[#E4E2DF] rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-[#EEF2FF] focus-visible:border-[#3157D5] placeholder:text-[#737782]"
          />

          {isChannelConversation(conv) && availableMembers.length > 0 && (
            <div className="p-3 bg-[#FAF9F8] rounded-[8px] border border-[#E4E2DF] space-y-2">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#171A21]">
                <UserPlus className="w-3.5 h-3.5 text-[#3157D5]" />
                <span>Add someone to this channel</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedAddMemberId}
                  onChange={(e) => setSelectedAddMemberId(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-[13px] bg-white border border-[#E4E2DF] rounded-[6px] outline-none"
                >
                  <option value="">Select a teammate...</option>
                  {availableMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.title})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddMember}
                  disabled={!selectedAddMemberId}
                  className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#2E3440] hover:bg-[#1E222A] disabled:opacity-40 disabled:cursor-not-allowed rounded-[6px] transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-[#E4E2DF] max-h-[300px] overflow-y-auto pr-1">
            {filteredMembers.map((member) => {
              const isSelf = member.id === mockCurrentUser.id;
              return (
                <div key={member.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar
                      name={member.name}
                      src={member.avatarUrl}
                      size={34}
                      presence={member.presence}
                      showPresence
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-[#171A21] truncate">
                          {member.name}
                        </span>
                        {isSelf && (
                          <span className="text-[11px] text-[#737782] font-medium bg-[#F1F0EE] px-1.5 py-0.2 rounded">
                            You
                          </span>
                        )}
                        {member.role === 'owner' && (
                          <span className="text-[10px] uppercase font-semibold text-[#737782] bg-[#F1F0EE] px-1.5 py-0.2 rounded border border-[#E4E2DF]">
                            Owner
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-[#737782] truncate">{member.title}</p>
                    </div>
                  </div>

                  {isChannelConversation(conv) &&
                    !isSelf &&
                    conv.memberIds.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMemberFromChannel(conv.id, member.id)}
                        className="p-1 text-[#737782] hover:text-[#C94A45] hover:bg-rose-50 rounded-[6px] transition-colors"
                        title={`Remove ${member.name} from channel`}
                        aria-label={`Remove ${member.name} from channel`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      </Dialog>
    );
  }

  const channelMemberRows: import('../../../lib/channels').ChannelMember[] =
    realMembers.state.status === 'ready' ? realMembers.state.members : [];
  const channelMemberUserIds = new Set(channelMemberRows.map((m) => m.userId));

  const workspaceMembers =
    shell.members.state.status === 'ready' ? shell.members.state.members : [];

  // Private: membership list from API. Public: every workspace member can see it.
  const displayRows =
    channel.type === 'PRIVATE'
      ? channelMemberRows.map((m) => ({
          key: m.id,
          userId: m.userId,
          name: m.user.name,
          email: m.user.email,
          image: m.user.image,
          role: workspaceMembers.find((wm) => wm.user.id === m.userId)?.role ?? 'MEMBER',
        }))
      : workspaceMembers.map((wm) => ({
          key: wm.id,
          userId: wm.user.id,
          name: wm.user.name,
          email: wm.user.email,
          image: wm.user.image,
          role: wm.role,
        }));

  const filteredRows = displayRows.filter(
    (m) =>
      m.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.email.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.role.toLowerCase().includes(searchFilter.toLowerCase())
  );

  // Add/remove only for private channels (backend enforces PRIVATE membership).
  const availableForAdd =
    channel.type === 'PRIVATE'
      ? workspaceMembers.filter((wm) => !channelMemberUserIds.has(wm.user.id))
      : [];

  const canManageMembers =
    channel.type === 'PRIVATE' &&
    (shell.currentWorkspace?.role === 'OWNER' ||
      shell.currentWorkspace?.role === 'ADMIN' ||
      channel.createdById === shell.currentUser?.id);

  const handleAddMember = async () => {
    if (!selectedAddMemberId) return;
    const result = await realMembers.addMember(selectedAddMemberId);
    if (result.ok) {
      setSelectedAddMemberId('');
      showToast('Member added', 'success');
    } else {
      showToast(result.error ?? 'Could not add member', 'error');
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    const result = await realMembers.removeMember(userId);
    if (result.ok) {
      showToast(`${name} removed`, 'success');
    } else {
      showToast(result.error ?? 'Could not remove member', 'error');
    }
  };

  const listReady = realMembers.state.status === 'ready';
  const countLabel = listReady
    ? `${displayRows.length} member${displayRows.length === 1 ? '' : 's'}`
    : 'Members';

  return (
    <Dialog
      isOpen={isChannelMembersOpen}
      onClose={close}
      title={`#${channel.name} members`}
      description={countLabel}
    >
      <div className="space-y-4">
        <input
          type="search"
          placeholder="Find members..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="w-full px-3 py-1.5 text-[13px] bg-[#F6F5F3] border border-[#E4E2DF] rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-[#EEF2FF] focus-visible:border-[#3157D5] placeholder:text-[#737782]"
        />

        {channel.type === 'PRIVATE' && !listReady && realMembers.state.status === 'loading' && (
          <p className="text-[13px] text-[#737782]">Loading members…</p>
        )}
        {channel.type === 'PRIVATE' &&
          (realMembers.state.status === 'error' ||
            realMembers.state.status === 'unauthenticated') && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-[8px] text-[13px] text-[#C94A45]" role="alert">
              {realMembers.state.status === 'error'
                ? realMembers.state.message
                : 'Session expired.'}
              <button
                type="button"
                onClick={realMembers.retry}
                className="ml-2 font-medium underline"
              >
                Try again
              </button>
            </div>
          )}
        {channel.type === 'PRIVATE' && realMembers.state.status === 'notFound' && (
          <p className="text-[13px] text-[#737782]">
            You do not have access to this channel’s member list.
          </p>
        )}

        {channel.type === 'PUBLIC' && (
          <p className="text-[12px] text-[#737782]">
            Public channel — everyone in this workspace can see it.
          </p>
        )}

        {canManageMembers && availableForAdd.length > 0 && (
          <div className="p-3 bg-[#FAF9F8] rounded-[8px] border border-[#E4E2DF] space-y-2">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#171A21]">
              <UserPlus className="w-3.5 h-3.5 text-[#3157D5]" />
              <span>Add someone to this channel</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedAddMemberId}
                onChange={(e) => setSelectedAddMemberId(e.target.value)}
                className="flex-1 px-2.5 py-1.5 text-[13px] bg-white border border-[#E4E2DF] rounded-[6px] outline-none"
              >
                <option value="">Select a teammate...</option>
                {availableForAdd.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name} ({m.role})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleAddMember()}
                disabled={!selectedAddMemberId}
                className="px-3 py-1.5 text-[12px] font-medium text-white bg-[#2E3440] hover:bg-[#1E222A] disabled:opacity-40 disabled:cursor-not-allowed rounded-[6px] transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-[#E4E2DF] max-h-[300px] overflow-y-auto pr-1">
          {filteredRows.map((member) => {
            const isSelf = member.userId === shell.currentUser?.id;
            const presence = shell.presence.getPresence(member.userId);
            return (
              <div key={member.key} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar
                    name={member.name}
                    src={member.image}
                    size={34}
                    presence={presence.status === 'ONLINE' ? 'online' : 'offline'}
                    showPresence
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-[#171A21] truncate">
                        {member.name}
                      </span>
                      {isSelf && (
                        <span className="text-[11px] text-[#737782] font-medium bg-[#F1F0EE] px-1.5 py-0.2 rounded">
                          You
                        </span>
                      )}
                      {member.role === 'OWNER' && (
                        <span className="text-[10px] uppercase font-semibold text-[#737782] bg-[#F1F0EE] px-1.5 py-0.2 rounded border border-[#E4E2DF]">
                          Owner
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[#737782] truncate">{member.email}</p>
                  </div>
                </div>

                {canManageMembers &&
                  channel.type === 'PRIVATE' &&
                  !isSelf &&
                  displayRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveMember(member.userId, member.name)}
                      className="p-1 text-[#737782] hover:text-[#C94A45] hover:bg-rose-50 rounded-[6px] transition-colors"
                      title={`Remove ${member.name} from channel`}
                      aria-label={`Remove ${member.name} from channel`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
              </div>
            );
          })}
          {listReady && filteredRows.length === 0 && (
            <p className="py-3 text-[13px] text-[#737782]">No members match your search.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
};

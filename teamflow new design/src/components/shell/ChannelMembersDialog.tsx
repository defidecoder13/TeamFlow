import React, { useState } from 'react';
import { Dialog } from '../primitives/Dialog';
import { useApp } from '../../context/AppContext';
import { Channel, DMConversation } from '../../types';
import { UserPlus, Check, X } from 'lucide-react';

interface ChannelMembersDialogProps {
  channel?: Channel;
  conversation?: DMConversation;
}

export const ChannelMembersDialog: React.FC<ChannelMembersDialogProps> = ({
  channel,
  conversation,
}) => {
  const {
    isChannelMembersOpen,
    setChannelMembersOpen,
    members,
    currentUser,
    addMemberToChannel,
    removeMemberFromChannel,
  } = useApp();

  const [selectedAddMemberId, setSelectedAddMemberId] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const targetMemberIds = channel ? channel.memberIds : conversation ? conversation.participantIds : [];
  const channelMembers = members.filter((m) => targetMemberIds.includes(m.id));
  const availableMembers = members.filter((m) => !targetMemberIds.includes(m.id));

  const filteredMembers = channelMembers.filter(
    (m) =>
      m.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.email.toLowerCase().includes(searchFilter.toLowerCase()) ||
      m.title.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const title = channel ? `#${channel.name} members` : 'Conversation participants';

  const handleAddMember = () => {
    if (channel && selectedAddMemberId) {
      addMemberToChannel(channel.id, selectedAddMemberId);
      setSelectedAddMemberId('');
    }
  };

  return (
    <Dialog
      isOpen={isChannelMembersOpen}
      onClose={() => {
        setSearchFilter('');
        setSelectedAddMemberId('');
        setChannelMembersOpen(false);
      }}
      title={title}
      description={`${channelMembers.length} member${channelMembers.length === 1 ? '' : 's'}`}
    >
      <div className="space-y-4">
        {/* Search inside members */}
        <input
          type="search"
          placeholder="Find members..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="w-full px-3 py-1.5 text-[13px] bg-[#F6F5F3] border border-[#E4E2DF] rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-[#EEF2FF] focus-visible:border-[#3157D5] placeholder:text-[#737782]"
        />

        {/* Add member section (for channels) */}
        {channel && availableMembers.length > 0 && (
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

        {/* Members list */}
        <div className="divide-y divide-[#E4E2DF] max-h-[300px] overflow-y-auto pr-1">
          {filteredMembers.map((member) => {
            const isSelf = member.id === currentUser.id;
            return (
              <div key={member.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <img
                      src={member.avatarUrl}
                      alt={member.name}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full object-cover bg-[#ECEAE7]"
                    />
                    <span
                      role="img"
                      aria-label={`Status: ${member.presence}`}
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                        member.presence === 'online'
                          ? 'bg-[#48B88A]'
                          : member.presence === 'away'
                          ? 'bg-[#E8A33A]'
                          : 'bg-neutral-400'
                      }`}
                    />
                  </div>

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

                {channel && !isSelf && channel.memberIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMemberFromChannel(channel.id, member.id)}
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
};

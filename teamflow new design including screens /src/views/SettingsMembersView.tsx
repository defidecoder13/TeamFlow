import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Member, MemberRole, PendingInvite } from '../types';
import { Dialog } from '../components/primitives/Dialog';
import {
  Users,
  UserPlus,
  Search,
  X,
  Shield,
  MoreHorizontal,
  Mail,
  Trash2,
  Check,
  Clock,
} from 'lucide-react';

export const SettingsMembersView: React.FC = () => {
  const {
    activeWorkspace,
    members,
    currentUser,
    updateMemberRole,
    removeMember,
    pendingInvites,
    revokeInvite,
    setInviteMemberOpen,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);

  // Member to remove confirm
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  // Invite to revoke confirm
  const [inviteToRevoke, setInviteToRevoke] = useState<PendingInvite | null>(null);

  const filteredMembers = members.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRoleChange = (memberId: string, newRole: MemberRole) => {
    setRoleUpdatingId(memberId);
    setTimeout(() => {
      updateMemberRole(memberId, newRole);
      setRoleUpdatingId(null);
    }, 300);
  };

  const handleRemoveConfirm = () => {
    if (memberToRemove) {
      removeMember(memberToRemove.id);
      setMemberToRemove(null);
    }
  };

  const handleRevokeConfirm = () => {
    if (inviteToRevoke) {
      revokeInvite(inviteToRevoke.id);
      setInviteToRevoke(null);
    }
  };

  return (
    <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header & Live Count */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E4E2DF] pb-4">
          <div>
            <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">
              Teammates & permissions
            </h1>
            <p className="text-[13px] text-[#4F5360] mt-0.5">
              <span className="tabular-nums font-semibold text-[#171A21]">
                {members.length} member{members.length === 1 ? '' : 's'}
              </span>{' '}
              in {activeWorkspace.name}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setInviteMemberOpen(true)}
            className="px-4 py-2 bg-[#2E3440] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#1E222A] transition-colors flex items-center gap-2 self-start sm:self-auto shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5]"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite member</span>
          </button>
        </div>

        {/* Search member filter */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#737782] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or title..."
            className="w-full pl-9 pr-8 py-2 text-[13px] bg-white border border-[#E4E2DF] hover:border-[#D2D0CC] focus:border-[#3157D5] rounded-[8px] outline-none text-[#171A21] placeholder:text-[#737782]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737782] hover:text-[#171A21]"
              aria-label="Clear filter"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Members List */}
        <div className="bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs overflow-hidden">
          {filteredMembers.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-[14px] font-semibold text-[#171A21]">
                No members matching "{searchQuery}"
              </p>
              <p className="text-[13px] text-[#737782]">
                Check for typos or clear the search query.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 px-3 py-1.5 text-[12px] font-medium text-[#3157D5] hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#E4E2DF]">
              {filteredMembers.map((member) => {
                const isSelf = member.id === currentUser.id;
                const isUpdating = roleUpdatingId === member.id;

                return (
                  <div
                    key={member.id}
                    className="p-4 flex items-center justify-between gap-4 hover:bg-[#FAF9F8] transition-colors"
                  >
                    {/* Left: Avatar + presence + details */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={member.avatarUrl}
                          alt={member.name}
                          className="w-10 h-10 rounded-[8px] object-cover bg-[#ECEAE7]"
                        />
                        <span
                          role="img"
                          aria-label={`Presence: ${member.presence}`}
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                            member.presence === 'online'
                              ? 'bg-[#48B88A]'
                              : member.presence === 'away'
                              ? 'bg-[#E8A33A]'
                              : 'bg-neutral-400'
                          }`}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-semibold text-[#171A21] truncate">
                            {member.name}
                          </span>
                          {isSelf && (
                            <span className="text-[11px] font-medium text-[#737782] bg-[#F1F0EE] px-1.5 py-0.2 rounded">
                              You
                            </span>
                          )}
                          {member.role === 'owner' && (
                            <span className="text-[10px] uppercase font-semibold text-[#737782] bg-[#F1F0EE] px-1.5 py-0.2 rounded border border-[#E4E2DF]">
                              OWNER
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-[#737782] truncate">
                          {member.title} · <span className="font-sans">{member.email}</span>
                        </p>
                      </div>
                    </div>

                    {/* Right: Role select + actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {member.role === 'owner' ? (
                        <span className="text-[13px] text-[#737782] px-2 py-1">Owner</span>
                      ) : (
                        <select
                          aria-label={`Role for ${member.name}`}
                          aria-busy={isUpdating}
                          disabled={isUpdating}
                          value={member.role}
                          onChange={(e) =>
                            handleRoleChange(member.id, e.target.value as MemberRole)
                          }
                          className="px-2.5 py-1 text-[13px] bg-[#F6F5F3] border border-[#E4E2DF] rounded-[6px] text-[#171A21] outline-none disabled:opacity-50"
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                          <option value="guest">Guest</option>
                        </select>
                      )}

                      {!isSelf && member.role !== 'owner' && (
                        <button
                          type="button"
                          onClick={() => setMemberToRemove(member)}
                          className="p-1.5 text-[#737782] hover:text-[#C94A45] hover:bg-rose-50 rounded-[6px] transition-colors"
                          title={`Remove ${member.name}`}
                          aria-label={`Remove ${member.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pending Invitations Section */}
        {pendingInvites.length > 0 && (
          <div className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#1a1b22]">
                Pending invitations ({pendingInvites.length})
              </h2>
            </div>

            <div className="bg-white border border-[#e3e1ec] rounded-[12px] shadow-2xs divide-y divide-[#e3e1ec] overflow-hidden">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="p-4 flex items-center justify-between gap-4 hover:bg-[#fbf8ff] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-[6px] bg-[#f4f2fd] text-[#5f5e61] flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[#1a1b22] truncate">
                        {invite.email}
                      </p>
                      <span className="text-[12px] text-[#5f5e61]">
                        Invited as <span className="capitalize">{invite.role}</span> · {invite.invitedAt}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInviteToRevoke(invite)}
                      className="px-2.5 py-1 text-[12px] font-medium text-[#ba1a1a] hover:bg-red-50 border border-red-200 rounded-[6px] transition-colors"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Remove Member Confirm Dialog */}
      <Dialog
        isOpen={Boolean(memberToRemove)}
        onClose={() => setMemberToRemove(null)}
        title={memberToRemove ? `Remove ${memberToRemove.name}?` : 'Remove member'}
        description={
          memberToRemove
            ? `Are you sure you want to remove ${memberToRemove.name} from ${activeWorkspace.name}? They will immediately lose access to all channels, direct messages, and workspace files.`
            : ''
        }
        role="alertdialog"
      >
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setMemberToRemove(null)}
            className="px-4 py-2 text-[13px] font-medium text-[#47464b] hover:text-[#1a1b22] rounded-[8px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRemoveConfirm}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-[#ba1a1a] hover:bg-red-700 rounded-[8px]"
          >
            Remove member
          </button>
        </div>
      </Dialog>

      {/* Revoke Invite Confirm Dialog */}
      <Dialog
        isOpen={Boolean(inviteToRevoke)}
        onClose={() => setInviteToRevoke(null)}
        title="Revoke invitation?"
        description={
          inviteToRevoke
            ? `This will immediately invalidate the invitation link for ${inviteToRevoke.email}.`
            : ''
        }
        role="alertdialog"
      >
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setInviteToRevoke(null)}
            className="px-4 py-2 text-[13px] font-medium text-[#47464b] hover:text-[#1a1b22] rounded-[8px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRevokeConfirm}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-[#ba1a1a] hover:bg-red-700 rounded-[8px]"
          >
            Revoke invitation
          </button>
        </div>
      </Dialog>
    </main>
  );
};

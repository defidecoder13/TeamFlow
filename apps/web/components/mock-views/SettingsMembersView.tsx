'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../lib/mock-context';
import { useRouter } from '../../lib/mock-hooks/useRouter';
import { useShell } from '../../lib/shell-context';
import { usePendingInvitations } from '../../lib/use-pending-invitations';
import { Dialog } from '../mock-ui/primitives/Dialog';
import { Avatar } from '@/components/ui/Avatar';
import { getApiBaseUrl } from '../../lib/config';
import {
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
  type WorkspaceMember,
} from '../../lib/members';
import { formatInvitationDate, revokeInvitation } from '../../lib/invitations';
import type { PendingInvitation } from '../../lib/invitations';
import type { WorkspaceRole } from '../../lib/workspaces';
import {
  UserPlus,
  Search,
  X,
  Trash2,
  Mail,
  Loader2,
} from 'lucide-react';

function matchesQuery(member: WorkspaceMember, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return (
    member.user.name.toLowerCase().includes(needle) ||
    member.user.email.toLowerCase().includes(needle)
  );
}

export const SettingsMembersView: React.FC = () => {
  const { isInviteMemberOpen, setInviteMemberOpen } = useApp();
  const { session, currentUser, currentWorkspace, members, presence } = useShell();
  const { push } = useRouter();
  const workspaceId = currentWorkspace?.id ?? null;
  const pending = usePendingInvitations(workspaceId);

  const [searchQuery, setSearchQuery] = useState('');
  const [list, setList] = useState<WorkspaceMember[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<WorkspaceMember | null>(null);
  const [inviteToRevoke, setInviteToRevoke] = useState<PendingInvitation | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const shellMembers = members.state.status === 'ready' ? members.state.members : null;

  useEffect(() => {
    if (shellMembers) {
      setList(shellMembers);
      setActionError(null);
    }
  }, [shellMembers]);

  // Refresh pending + member lists when the invite dialog closes (create path).
  const retryPending = pending.retry;
  const retryMembers = members.retry;
  const prevInviteOpen = useRef(isInviteMemberOpen);
  useEffect(() => {
    if (prevInviteOpen.current && !isInviteMemberOpen) {
      retryPending();
      retryMembers();
    }
    prevInviteOpen.current = isInviteMemberOpen;
  }, [isInviteMemberOpen, retryPending, retryMembers]);

  const currentRole = currentWorkspace?.role ?? null;
  const canManageMembers = currentRole === 'OWNER';
  const canInvite = currentRole === 'OWNER' || currentRole === 'ADMIN';
  const currentUserId = currentUser?.id ?? null;
  const workspaceName = currentWorkspace?.name ?? 'your workspace';

  const filteredMembers = useMemo(
    () => list.filter((m) => matchesQuery(m, searchQuery)),
    [list, searchQuery],
  );

  const visiblePending =
    pending.state.status === 'ready' ? pending.state.invitations : [];
  const pendingLoading = pending.state.status === 'loading';
  const pendingError = pending.state.status === 'error' ? pending.state.message : null;

  async function handleRoleChange(member: WorkspaceMember, newRole: WorkspaceRole) {
    if (!workspaceId || member.role === newRole || actingId) return;
    setActingId(member.user.id);
    setActionError(null);
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setActingId(null);
      setActionError('Could not connect to API server.');
      return;
    }
    const result = await updateWorkspaceMemberRole(
      apiBase,
      workspaceId,
      member.user.id,
      newRole,
    );
    setActingId(null);
    if (result.ok) {
      setList((prev) =>
        prev.map((m) => (m.user.id === member.user.id ? result.member : m)),
      );
      members.retry();
      return;
    }
    if (result.kind === 'unauthenticated') {
      setActionError('Your session expired. Please sign in again.');
      return;
    }
    if (result.kind === 'forbidden') {
      setActionError('Only the workspace owner can change member roles.');
      return;
    }
    setActionError(result.message ?? 'Could not update role.');
  }

  async function handleRemove(member: WorkspaceMember) {
    if (!workspaceId || actingId) return;
    setActingId(member.user.id);
    setActionError(null);
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setActingId(null);
      setActionError('Could not connect to API server.');
      return;
    }
    const result = await removeWorkspaceMember(apiBase, workspaceId, member.user.id);
    setActingId(null);
    setMemberToRemove(null);
    if (result.ok) {
      setList((prev) => prev.filter((m) => m.user.id !== member.user.id));
      members.retry();
      return;
    }
    if (result.kind === 'unauthenticated') {
      setActionError('Your session expired. Please sign in again.');
      return;
    }
    if (result.kind === 'forbidden') {
      setActionError('Only the workspace owner can remove members.');
      return;
    }
    setActionError(result.message ?? 'Could not remove member.');
  }

  async function handleRevoke(invitation: PendingInvitation) {
    if (!workspaceId || revoking) return;
    setRevoking(true);
    setRevokeError(null);
    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setRevoking(false);
      setRevokeError('Could not connect to API server.');
      return;
    }
    const result = await revokeInvitation(apiBase, workspaceId, invitation.id);
    setRevoking(false);
    setInviteToRevoke(null);
    if (result.ok) {
      pending.retry();
      return;
    }
    if (result.kind === 'unauthenticated') {
      setRevokeError('Your session expired. Please sign in again.');
      return;
    }
    if (result.kind === 'notFound') {
      pending.retry();
      return;
    }
    if (result.kind === 'forbidden') {
      setRevokeError('You do not have permission to revoke invitations.');
      return;
    }
    setRevokeError(result.message ?? 'Could not revoke invitation.');
  }

  if (session.status === 'loading') {
    return (
      <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
        <div
          role="status"
          aria-label="Loading members"
          className="max-w-4xl mx-auto text-[13px] text-[#4F5360]"
        >
          Loading members…
        </div>
      </main>
    );
  }

  if (session.status !== 'authenticated' || !currentUser) {
    return (
      <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
        <div role="status" className="max-w-4xl mx-auto text-[13px] text-[#4F5360]">
          <p>Please sign in to manage workspace members.</p>
          {session.status === 'unauthenticated' ? (
            <button
              type="button"
              onClick={() => push('/sign-in')}
              className="mt-3 rounded-[8px] bg-[#2E3440] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
            >
              Go to sign in
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  if (!currentWorkspace) {
    return (
      <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
        <div role="status" className="max-w-4xl mx-auto text-[13px] text-[#4F5360]">
          Select a workspace to manage members.
        </div>
      </main>
    );
  }

  if (members.state.status === 'loading' || members.state.status === 'idle') {
    return (
      <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
        <div
          role="status"
          aria-label="Loading members"
          className="max-w-4xl mx-auto text-[13px] text-[#4F5360]"
        >
          Loading members…
        </div>
      </main>
    );
  }

  if (members.state.status === 'error') {
    return (
      <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
        <div className="max-w-4xl mx-auto" role="alert">
          <p className="text-[13px] text-[#4F5360]">{members.state.message}</p>
          <button
            type="button"
            onClick={members.retry}
            className="mt-2 text-[13px] font-medium text-[#3157D5] hover:underline"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (members.state.status === 'unauthenticated') {
    return (
      <main id="main-content" className="flex-1 overflow-y-auto bg-[#FAF9F8] p-4 sm:p-8">
        <div role="status" className="max-w-4xl mx-auto text-[13px] text-[#4F5360]">
          <p>Please sign in to manage workspace members.</p>
          <button
            type="button"
            onClick={() => push('/sign-in')}
            className="mt-3 rounded-[8px] bg-[#2E3440] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
          >
            Go to sign in
          </button>
        </div>
      </main>
    );
  }

  const memberCount = list.length;

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
              <span className="tabular-nums font-semibold text-[#171A21]" aria-live="polite">
                {memberCount} member{memberCount === 1 ? '' : 's'}
              </span>{' '}
              in {workspaceName}
            </p>
          </div>

          {canInvite ? (
            <button
              type="button"
              onClick={() => setInviteMemberOpen(true)}
              className="px-4 py-2 bg-[#2E3440] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#1E222A] transition-colors flex items-center gap-2 self-start sm:self-auto shadow-2xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#3157D5]"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite member</span>
            </button>
          ) : null}
        </div>

        {/* Search member filter */}
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-[#737782] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="member-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            autoComplete="off"
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

        {actionError && (
          <div className="rounded-[8px] bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700" role="alert">
            {actionError}
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="ml-2 font-medium underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Members List */}
        <div className="bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs overflow-hidden">
          {filteredMembers.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-[14px] font-semibold text-[#171A21]">
                {searchQuery ? (
                  <>
                    No members matching &ldquo;
                    <span className="font-semibold text-[#171A21]">{searchQuery}</span>&rdquo;
                  </>
                ) : (
                  'No members yet.'
                )}
              </p>
              {searchQuery ? (
                <>
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
                </>
              ) : (
                <p className="text-[13px] text-[#737782]">Try inviting a teammate.</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#E4E2DF]">
              {filteredMembers.map((member) => {
                const isSelf = member.user.id === currentUserId;
                const isOwner = member.role === 'OWNER';
                const isUpdating = actingId === member.user.id;
                const canEditThisMember = canManageMembers && !isOwner && !isSelf;
                const presenceStatus = presence.getPresence(member.user.id).status;

                return (
                  <div
                    key={member.id}
                    className="p-4 flex items-center justify-between gap-4 hover:bg-[#FAF9F8] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={member.user.name}
                        src={member.user.image}
                        size={38}
                        presence={presenceStatus}
                        showPresence
                      />

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] font-semibold text-[#171A21] truncate">
                            {member.user.name}
                          </span>
                          {isSelf && (
                            <span className="text-[11px] font-medium text-[#737782] bg-[#F1F0EE] px-1.5 py-0.2 rounded">
                              You
                            </span>
                          )}
                          {isOwner && (
                            <span className="text-[10px] uppercase font-semibold text-[#737782] bg-[#F1F0EE] px-1.5 py-0.2 rounded border border-[#E4E2DF]">
                              OWNER
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-[#737782] truncate">
                          <span className="font-sans">{member.user.email}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isOwner ? (
                        <span className="text-[13px] text-[#737782] px-2 py-1">Owner</span>
                      ) : canEditThisMember ? (
                        <select
                          aria-label={`Role for ${member.user.name}`}
                          aria-busy={isUpdating}
                          disabled={isUpdating}
                          value={member.role}
                          onChange={(e) =>
                            void handleRoleChange(
                              member,
                              e.target.value as WorkspaceRole,
                            )
                          }
                          className="px-2.5 py-1 text-[13px] bg-[#F6F5F3] border border-[#E4E2DF] rounded-[6px] text-[#171A21] outline-none disabled:opacity-50"
                        >
                          <option value="ADMIN">Admin</option>
                          <option value="MEMBER">Member</option>
                        </select>
                      ) : (
                        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#737782] bg-[#F1F0EE] border border-[#E4E2DF] px-2 py-1 rounded">
                          {member.role}
                        </span>
                      )}

                      {canManageMembers && !isSelf && !isOwner && (
                        <button
                          type="button"
                          disabled={isUpdating}
                          aria-busy={isUpdating}
                          onClick={() => setMemberToRemove(member)}
                          className="p-1.5 text-[#737782] hover:text-[#C94A45] hover:bg-rose-50 rounded-[6px] transition-colors disabled:opacity-50"
                          title={`Remove ${member.user.name}`}
                          aria-label={`Remove ${member.user.name}`}
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

        {/* Pending Invitations Section (OWNER/ADMIN only — API is 403 otherwise) */}
        {canInvite && (
          <div className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#1a1b22]">
                Pending invitations
                {visiblePending.length > 0 ? ` (${visiblePending.length})` : ''}
              </h2>
            </div>

            {pendingLoading ? (
              <div role="status" aria-label="Loading pending invitations" className="space-y-2">
                {[0, 1].map((row) => (
                  <div
                    key={row}
                    aria-hidden="true"
                    className="h-[52px] animate-pulse rounded-[12px] border border-[#E4E2DF] bg-white"
                  />
                ))}
              </div>
            ) : pendingError ? (
              <div className="rounded-[12px] border border-[#E4E2DF] bg-white px-4 py-3 text-[13px] text-[#4F5360]">
                <p role="alert">{pendingError}</p>
                <button
                  type="button"
                  onClick={pending.retry}
                  className="mt-2 rounded font-medium text-[#3157D5] underline hover:text-[#171A21]"
                >
                  Try loading invitations again
                </button>
              </div>
            ) : visiblePending.length === 0 ? null : (
              <>
                {revokeError && (
                  <div
                    className="rounded-[8px] bg-red-50 border border-red-200 px-3 py-2 text-[13px] text-red-700"
                    role="alert"
                  >
                    {revokeError}
                    <button
                      type="button"
                      onClick={() => setRevokeError(null)}
                      className="ml-2 font-medium underline"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                <div className="bg-white border border-[#e3e1ec] rounded-[12px] shadow-2xs divide-y divide-[#e3e1ec] overflow-hidden">
                  {visiblePending.map((invite) => (
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
                            Invited by {invite.invitedBy.name} · Expires{' '}
                            {formatInvitationDate(invite.expiresAt)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={revoking}
                          onClick={() => {
                            setRevokeError(null);
                            setInviteToRevoke(invite);
                          }}
                          aria-label={`Revoke invitation for ${invite.email}`}
                          className="px-2.5 py-1 text-[12px] font-medium text-[#ba1a1a] hover:bg-red-50 border border-red-200 rounded-[6px] transition-colors disabled:opacity-50"
                        >
                          {revoking && inviteToRevoke?.id === invite.id ? 'Revoking…' : 'Revoke'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Remove Member Confirm Dialog */}
      <Dialog
        isOpen={Boolean(memberToRemove)}
        onClose={() => {
          if (!actingId) setMemberToRemove(null);
        }}
        title={
          memberToRemove ? `Remove ${memberToRemove.user.name}?` : 'Remove member'
        }
        description={
          memberToRemove
            ? `Are you sure you want to remove ${memberToRemove.user.name} from ${workspaceName}? They will immediately lose access to all channels, direct messages, and workspace files.`
            : ''
        }
        role="alertdialog"
      >
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={Boolean(actingId)}
            onClick={() => setMemberToRemove(null)}
            className="px-4 py-2 text-[13px] font-medium text-[#47464b] hover:text-[#1a1b22] rounded-[8px] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={Boolean(actingId)}
            aria-busy={Boolean(actingId)}
            onClick={() => memberToRemove && void handleRemove(memberToRemove)}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-[#ba1a1a] hover:bg-red-700 rounded-[8px] disabled:opacity-50 flex items-center gap-1.5"
          >
            {actingId && memberToRemove && actingId === memberToRemove.user.id ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Removing…
              </>
            ) : (
              'Remove member'
            )}
          </button>
        </div>
      </Dialog>

      {/* Revoke Invite Confirm Dialog */}
      <Dialog
        isOpen={Boolean(inviteToRevoke)}
        onClose={() => {
          if (!revoking) setInviteToRevoke(null);
        }}
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
            disabled={revoking}
            onClick={() => setInviteToRevoke(null)}
            className="px-4 py-2 text-[13px] font-medium text-[#47464b] hover:text-[#1a1b22] rounded-[8px] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={revoking}
            aria-busy={revoking}
            onClick={() => inviteToRevoke && void handleRevoke(inviteToRevoke)}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-[#ba1a1a] hover:bg-red-700 rounded-[8px] disabled:opacity-50 flex items-center gap-1.5"
          >
            {revoking ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Revoking…
              </>
            ) : (
              'Revoke invitation'
            )}
          </button>
        </div>
      </Dialog>
    </main>
  );
};

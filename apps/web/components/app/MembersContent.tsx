/**
 * Workspace Members content (Phase 2E + 2F-B).
 *
 * Pure composition over real data: header with the true member count, an
 * Invite action for workspace admins, client-side name/email search, the
 * member list, honest empty states, and the real pending-invitation list.
 * No seats, analytics, or fabricated data of any kind.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { UserPlus, Mail, Trash2, X } from 'lucide-react';
import type { PendingInvitation } from '../../lib/invitations';
import { formatInvitationDate, revokeInvitation } from '../../lib/invitations';
import type { WorkspaceMember } from '../../lib/members';
import { getApiBaseUrl } from '../../lib/config';
import { removeWorkspaceMember, updateWorkspaceMemberRole } from '../../lib/members';
import type { WorkspaceRole } from '../../lib/workspaces';
import { usePresence } from '../../lib/use-presence';
import { Dialog } from './dialog';
import { InviteMemberDialog } from './InviteMemberDialog';
import { UserAvatar } from './UserAvatar';
import { SearchIcon } from './icons';

function matchesQuery(member: WorkspaceMember, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return true;
  }
  return (
    member.user.name.toLowerCase().includes(needle) ||
    member.user.email.toLowerCase().includes(needle)
  );
}

interface MembersContentProps {
  members: WorkspaceMember[];
  currentUserId: string;
  currentUserRole?: WorkspaceRole | null;
  workspace: { id: string; name: string };
  canInvite: boolean;
  pending: PendingInvitation[];
  pendingLoading: boolean;
  pendingError: string | null;
  onRetryPending: () => void;
  onInvitationCreated: () => void;
  onUnauthenticated: () => void;
  onMembersChanged?: () => void;
}

export function MembersContent({
  members: initialMembers,
  currentUserId,
  currentUserRole,
  workspace,
  canInvite,
  pending,
  pendingLoading,
  pendingError,
  onRetryPending,
  onInvitationCreated,
  onUnauthenticated,
  onMembersChanged,
}: MembersContentProps) {
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>(initialMembers);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<WorkspaceMember | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<PendingInvitation | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const { getPresence } = usePresence(workspace.id);
  const canManageMembers = currentUserRole === 'OWNER';

  useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  const visible = useMemo(() => members.filter((m) => matchesQuery(m, query)), [members, query]);

  async function handleRoleChange(member: WorkspaceMember, newRole: WorkspaceRole) {
    if (member.role === newRole) return;
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
    const result = await updateWorkspaceMemberRole(apiBase, workspace.id, member.user.id, newRole);
    setActingId(null);
    if (result.ok) {
      setMembers((prev) => prev.map((m) => (m.user.id === member.user.id ? result.member : m)));
      onMembersChanged?.();
      return;
    }
    if (result.kind === 'unauthenticated') {
      onUnauthenticated();
      return;
    }
    setActionError(result.message ?? 'Could not update role.');
  }

  async function handleRemove(member: WorkspaceMember) {
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
    const result = await removeWorkspaceMember(apiBase, workspace.id, member.user.id);
    setActingId(null);
    setConfirmRemove(null);
    if (result.ok) {
      setMembers((prev) => prev.filter((m) => m.user.id !== member.user.id));
      onMembersChanged?.();
      return;
    }
    if (result.kind === 'unauthenticated') {
      onUnauthenticated();
      return;
    }
    setActionError(result.message ?? 'Could not remove member.');
  }

  async function handleRevoke(invitation: PendingInvitation) {
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
    const result = await revokeInvitation(apiBase, workspace.id, invitation.id);
    setRevoking(false);
    setConfirmRevoke(null);
    if (result.ok) {
      onRetryPending();
      return;
    }
    if (result.kind === 'unauthenticated') {
      onUnauthenticated();
      return;
    }
    if (result.kind === 'notFound') {
      // Already accepted, revoked, or expired elsewhere — refresh the list
      // so the stale row disappears.
      onRetryPending();
      return;
    }
    setRevokeError(
      result.kind === 'forbidden'
        ? 'You do not have permission to revoke invitations.'
        : (result.message ?? 'Could not revoke invitation.'),
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E4E2DF] pb-4">
        <div>
          <h1 className="text-[26px] font-semibold text-[#171A21] tracking-tight">Members</h1>
          <p className="text-[13px] text-[#4F5360] mt-0.5">
            <span className="tabular-nums font-semibold text-[#171A21]" aria-live="polite">
              {members.length === 1 ? '1 member' : `${members.length} members`}
            </span>{' '}
            in {workspace.name}
          </p>
        </div>
        {canInvite ? (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="px-4 py-2 bg-[#2E3440] text-white text-[13px] font-medium rounded-[8px] hover:bg-[#1E222A] transition-colors flex items-center gap-2 self-start sm:self-auto shadow-2xs active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite member</span>
          </button>
        ) : null}
      </div>

      <div className="relative max-w-md">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#737782]"
        >
          <SearchIcon className="h-4 w-4" />
        </span>
        <label htmlFor="member-search" className="sr-only">
          Search members by name or email
        </label>
        <input
          id="member-search"
          type="search"
          autoComplete="off"
          placeholder="Search by name or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 w-full rounded-[8px] border border-[#E4E2DF] bg-white pl-9 pr-8 text-[13px] text-[#171A21] outline-none transition-colors placeholder:text-[#737782] hover:border-[#D2D0CC] focus:border-[#3157D5] focus:ring-2 focus:ring-[#EEF2FF]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737782] hover:text-[#171A21]"
            aria-label="Clear filter"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {actionError && (
        <div className="rounded-[8px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700" role="alert">
          {actionError}
        </div>
      )}

      {members.length === 0 ? (
        <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-8 text-center space-y-2 shadow-2xs">
          <p className="text-[14px] font-semibold text-[#171A21]">No members yet.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-[#E4E2DF] rounded-[12px] p-8 text-center space-y-2 shadow-2xs">
          <p className="text-[14px] font-semibold text-[#171A21]" role="status">
            {query ? (
              <>
                No members for &ldquo;<span className="font-semibold text-[#171A21]">{query}</span>&rdquo;.
              </>
            ) : (
              'No members match your search.'
            )}
          </p>
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-2 px-3 py-1.5 text-[12px] font-medium text-[#3157D5] hover:underline"
            >
              Clear search
            </button>
          ) : (
            <p className="mt-1 text-[13px] text-[#737782]">Try a different name or email.</p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs overflow-hidden">
          <ul className="divide-y divide-[#E4E2DF]" aria-label="Workspace members">
            {visible.map((member) => {
              const isCurrentUser = member.user.id === currentUserId;
              const isOwner = member.role === 'OWNER';
              const canEditThisMember = canManageMembers && !isOwner;
              return (
                <li
                  key={member.id}
                  className="flex items-center gap-3 p-4 hover:bg-[#FAF9F8] transition-colors"
                >
                  <UserAvatar
                    name={member.user.name}
                    image={member.user.image}
                    size="md"
                    presenceStatus={getPresence(member.user.id).status}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[14px] font-semibold text-[#171A21]">
                      <span className="truncate" title={member.user.name}>
                        {member.user.name}
                      </span>
                      {isCurrentUser ? (
                        <span className="shrink-0 rounded-[4px] bg-[#F1F0EE] px-1.5 py-0.5 text-[11px] font-medium text-[#737782]">
                          You
                        </span>
                      ) : null}
                      {isOwner && (
                        <span className="shrink-0 rounded-[4px] border border-[#E4E2DF] bg-[#F1F0EE] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#737782]">
                          OWNER
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[12px] text-[#737782]" title={member.user.email}>
                      {member.user.email}
                    </p>
                  </div>
                  {canEditThisMember ? (
                    <select
                      aria-label={`Role for ${member.user.name}`}
                      aria-busy={actingId === member.user.id}
                      value={member.role}
                      disabled={actingId === member.user.id}
                      onChange={(e) => void handleRoleChange(member, e.target.value as WorkspaceRole)}
                      className="shrink-0 rounded-[6px] border border-[#E4E2DF] bg-[#F6F5F3] px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#171A21] outline-none transition-colors hover:border-[#D2D0CC] focus:border-[#3157D5] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="MEMBER">Member</option>
                    </select>
                  ) : !isOwner ? (
                    <span
                      className="shrink-0 rounded-[4px] border border-[#E4E2DF] bg-[#F1F0EE] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#737782]"
                    >
                      {member.role}
                    </span>
                  ) : null}
                  {canManageMembers && !isOwner ? (
                    <button
                      type="button"
                      disabled={actingId === member.user.id}
                      aria-busy={actingId === member.user.id}
                      onClick={() => setConfirmRemove(member)}
                      aria-label={`Remove ${member.user.name}`}
                      className="shrink-0 rounded-[6px] p-1.5 text-[#737782] transition-colors hover:bg-rose-50 hover:text-[#C94A45] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
                      title="Remove from workspace"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {confirmRemove && (
        <Dialog
          open
          onClose={() => setConfirmRemove(null)}
          labelledBy="confirm-remove-title"
          size="sm"
          dismissable={!actingId}
        >
          <div>
            <h2 id="confirm-remove-title" className="text-base font-semibold text-[#171A21]">
              Remove {confirmRemove.user.name}?
            </h2>
            <p className="mt-2 text-sm text-[#4F5360]">
              They will lose access to this workspace and its private channels. This cannot be
              undone without re-inviting.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                disabled={!!actingId}
                className="rounded-[8px] border border-[#E4E2DF] bg-white px-3.5 py-1.5 text-sm font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRemove(confirmRemove)}
                disabled={!!actingId}
                aria-busy={!!actingId}
                className="rounded-[8px] bg-[#C94A45] px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C94A45] disabled:opacity-50 shadow-2xs"
              >
                {actingId === confirmRemove.user.id ? 'Removing…' : 'Remove member'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {confirmRevoke && (
        <Dialog
          open
          onClose={() => setConfirmRevoke(null)}
          labelledBy="confirm-revoke-title"
          size="sm"
          dismissable={!revoking}
        >
          <div>
            <h2 id="confirm-revoke-title" className="text-base font-semibold text-[#171A21]">
              Revoke invitation for {confirmRevoke.email}?
            </h2>
            <p className="mt-2 text-sm text-[#4F5360]">
              They will no longer be able to use the invitation link to join. This cannot be undone
              without re-inviting.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRevoke(null)}
                disabled={revoking}
                className="rounded-[8px] border border-[#E4E2DF] bg-white px-3.5 py-1.5 text-sm font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRevoke(confirmRevoke)}
                disabled={revoking}
                aria-busy={revoking}
                className="rounded-[8px] bg-[#C94A45] px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C94A45] disabled:opacity-50 shadow-2xs"
              >
                {revoking ? 'Revoking…' : 'Revoke invitation'}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {canInvite ? (
        <section aria-labelledby="pending-invitations-heading" className="mt-8 space-y-3">
          <h2 id="pending-invitations-heading" className="text-[15px] font-semibold text-[#171A21]">
            Pending invitations {pending.length > 0 ? `(${pending.length})` : ''}
          </h2>
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
                onClick={onRetryPending}
                className="mt-2 rounded font-medium text-[#3157D5] underline hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
              >
                Try loading invitations again
              </button>
            </div>
          ) : pending.length === 0 ? null : (
            <>
              {revokeError && (
                <div
                  className="rounded-[8px] bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700"
                  role="alert"
                >
                  {revokeError}
                </div>
              )}
              <div className="bg-white border border-[#E4E2DF] rounded-[12px] shadow-2xs divide-y divide-[#E4E2DF] overflow-hidden">
                <ul aria-label="Pending invitations" className="divide-y divide-[#E4E2DF]">
                  {pending.map((invitation) => (
                    <li
                      key={invitation.id}
                      className="flex items-center gap-3 p-4 hover:bg-[#FAF9F8] transition-colors"
                    >
                      <div className="w-8 h-8 rounded-[6px] bg-[#EEF2FF] text-[#3157D5] flex items-center justify-center shrink-0">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[13px] font-semibold text-[#171A21]"
                          title={invitation.email}
                        >
                          {invitation.email}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-[#737782]">
                          Invited by {invitation.invitedBy.name} · Expires{' '}
                          {formatInvitationDate(invitation.expiresAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={revoking}
                        onClick={() => {
                          setRevokeError(null);
                          setConfirmRevoke(invitation);
                        }}
                        aria-label={`Revoke invitation for ${invitation.email}`}
                        className="px-2.5 py-1 text-[12px] font-medium text-[#C94A45] hover:bg-rose-50 border border-rose-200 rounded-[6px] transition-colors shrink-0 disabled:opacity-50"
                        title="Revoke invitation"
                      >
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>
      ) : null}

      {dialogOpen ? (
        <InviteMemberDialog
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          onClose={() => setDialogOpen(false)}
          onCreated={onInvitationCreated}
          onUnauthenticated={onUnauthenticated}
        />
      ) : null}
    </div>
  );
}

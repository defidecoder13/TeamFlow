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
import type { PendingInvitation } from '../../lib/invitations';
import { formatInvitationDate } from '../../lib/invitations';
import type { WorkspaceMember } from '../../lib/members';
import { getApiBaseUrl } from '../../lib/config';
import { removeWorkspaceMember, updateWorkspaceMemberRole } from '../../lib/members';
import type { WorkspaceRole } from '../../lib/workspaces';
import { usePresence } from '../../lib/use-presence';
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

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-400">
        Workspace settings
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-[26px] font-semibold tracking-tight text-stone-900">Members</h1>
        <p className="text-sm text-stone-500" aria-live="polite">
          {members.length === 1 ? '1 member' : `${members.length} members`}
        </p>
        {canInvite ? (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="ml-auto inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Invite member
          </button>
        ) : null}
      </div>
      <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-stone-500">
        Everyone with access to this workspace.
      </p>

      <div className="relative mt-5 max-w-md">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
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
          className="h-10 w-full rounded-lg border border-stone-200 bg-white pl-9 pr-3 text-sm text-stone-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-colors placeholder:text-stone-400 hover:border-stone-300 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
      </div>

      {actionError && (
        <div className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {actionError}
        </div>
      )}

      {members.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center">
          <p className="text-sm font-medium text-stone-700">No members yet.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center">
          <p className="text-sm font-medium text-stone-700">No members match your search.</p>
          <p className="mt-1 text-[13px] text-stone-500">Try a different name or email.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Workspace members">
          {visible.map((member) => {
            const isCurrentUser = member.user.id === currentUserId;
            const isOwner = member.role === 'OWNER';
            const canEditThisMember = canManageMembers && !isOwner;
            return (
              <li
                key={member.id}
                className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <UserAvatar
                  name={member.user.name}
                  image={member.user.image}
                  size="md"
                  presenceStatus={getPresence(member.user.id).status}
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    <span className="truncate">{member.user.name}</span>
                    {isCurrentUser ? (
                      <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">
                        You
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[13px] text-stone-500">{member.user.email}</p>
                </div>
                {canEditThisMember ? (
                  <select
                    aria-label={`Role for ${member.user.name}`}
                    value={member.role}
                    disabled={actingId === member.user.id}
                    onChange={(e) => void handleRoleChange(member, e.target.value as WorkspaceRole)}
                    className="shrink-0 rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-700 focus:border-zinc-900 focus:outline-none disabled:opacity-50"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                  </select>
                ) : (
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${member.role === 'OWNER' ? 'bg-zinc-900 text-white' : member.role === 'ADMIN' ? 'bg-stone-200 text-zinc-700' : 'bg-stone-100 text-stone-500'}`}
                  >
                    {member.role}
                  </span>
                )}
                {canManageMembers && !isOwner ? (
                  <button
                    type="button"
                    disabled={actingId === member.user.id}
                    onClick={() => setConfirmRemove(member)}
                    aria-label={`Remove ${member.user.name}`}
                    className="shrink-0 rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    title="Remove from workspace"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {confirmRemove && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px]"
          onClick={() => setConfirmRemove(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-remove-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]"
          >
            <h2 id="confirm-remove-title" className="text-sm font-semibold text-zinc-900">
              Remove {confirmRemove.user.name}?
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              They will lose access to this workspace and its private channels. This cannot be
              undone without re-inviting.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                disabled={!!actingId}
                className="rounded-lg border border-stone-300 bg-white px-3.5 py-1.5 text-sm font-medium text-stone-700 hover:border-stone-400 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleRemove(confirmRemove)}
                disabled={!!actingId}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actingId === confirmRemove.user.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {canInvite ? (
        <section aria-labelledby="pending-invitations-heading" className="mt-8">
          <h2 id="pending-invitations-heading" className="text-[13px] font-semibold text-stone-900">
            Pending invitations
          </h2>
          {pendingLoading ? (
            <div role="status" aria-label="Loading pending invitations" className="mt-3 space-y-2">
              <span className="sr-only">Loading pending invitations…</span>
              {[0, 1].map((row) => (
                <div
                  key={row}
                  aria-hidden="true"
                  className="h-[52px] animate-pulse rounded-lg border border-stone-200 bg-white"
                />
              ))}
            </div>
          ) : pendingError ? (
            <div className="mt-3 rounded-lg border border-stone-200 bg-white px-3.5 py-3 text-[13px] text-stone-600">
              <p role="alert">{pendingError}</p>
              <button
                type="button"
                onClick={onRetryPending}
                className="mt-2 font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 transition-colors hover:decoration-zinc-900"
              >
                Try again
              </button>
            </div>
          ) : pending.length === 0 ? null : (
            <ul className="mt-3 space-y-2" aria-label="Pending invitations">
              {pending.map((invitation) => (
                <li
                  key={invitation.id}
                  className="rounded-lg border border-stone-200 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                >
                  <p className="truncate text-sm font-medium text-zinc-900">{invitation.email}</p>
                  <p className="mt-0.5 text-[13px] text-stone-500">
                    Invited by {invitation.invitedBy.name} · Expires{' '}
                    {formatInvitationDate(invitation.expiresAt)}
                  </p>
                </li>
              ))}
            </ul>
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

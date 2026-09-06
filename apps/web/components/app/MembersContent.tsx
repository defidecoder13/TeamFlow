/**
 * Workspace Members content (Phase 2E + 2F-B).
 *
 * Pure composition over real data: header with the true member count, an
 * Invite action for workspace admins, client-side name/email search, the
 * member list, honest empty states, and the real pending-invitation list.
 * No seats, analytics, or fabricated data of any kind.
 */

'use client';

import { useMemo, useState } from 'react';
import type { PendingInvitation } from '../../lib/invitations';
import { formatInvitationDate } from '../../lib/invitations';
import type { WorkspaceMember } from '../../lib/members';
import { InviteMemberDialog } from './InviteMemberDialog';
import { MemberRow } from './MemberRow';
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
  workspace: { id: string; name: string };
  canInvite: boolean;
  pending: PendingInvitation[];
  pendingLoading: boolean;
  pendingError: string | null;
  onRetryPending: () => void;
  onInvitationCreated: () => void;
  onUnauthenticated: () => void;
}

export function MembersContent({
  members,
  currentUserId,
  workspace,
  canInvite,
  pending,
  pendingLoading,
  pendingError,
  onRetryPending,
  onInvitationCreated,
  onUnauthenticated,
}: MembersContentProps) {
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const visible = useMemo(() => members.filter((m) => matchesQuery(m, query)), [members, query]);

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
          {visible.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isCurrentUser={member.user.id === currentUserId}
            />
          ))}
        </ul>
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

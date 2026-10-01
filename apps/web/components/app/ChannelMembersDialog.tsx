/**
 * Private Channel Members Dialog (Phase 4K.2).
 *
 * Viewing current members, adding workspace members, removing members.
 * Only visible to authorized users (OWNER/ADMIN/creator via canUpdateChannel),
 * but server remains authoritative.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog } from './dialog';
import type { Channel } from '../../lib/channels';
import type { ChannelMember } from '../../lib/channels';
import { useChannelMembers } from '../../lib/use-channel-members';
import { useWorkspaceMembers } from '../../lib/use-workspace-members';
import { UserAvatar } from './UserAvatar';
import { CloseIcon } from './icons';

interface ChannelMembersDialogProps {
  workspaceId: string;
  channel: Channel;
  canManage: boolean;
  onClose: () => void;
  onUnauthenticated?: () => void;
}

export function ChannelMembersDialog({
  workspaceId,
  channel,
  canManage,
  onClose,
  onUnauthenticated,
}: ChannelMembersDialogProps) {
  const {
    state,
    addMember,
    removeMember,
    retry: retryChannelMembers,
  } = useChannelMembers(workspaceId, channel.slug, true);
  const { state: wsMembersState, retry: retryWorkspaceMembers } = useWorkspaceMembers(workspaceId);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === 'unauthenticated') onUnauthenticated?.();
  }, [state.status, onUnauthenticated]);

  const members = state.status === 'ready' ? state.members : [];
  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);

  const available = useMemo(() => {
    if (wsMembersState.status !== 'ready') return [];
    return wsMembersState.members.filter((m) => !memberIds.has(m.user.id));
  }, [wsMembersState, memberIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q),
    );
  }, [available, search]);

  async function handleAdd(userId: string) {
    setSubmitting(userId);
    setError(null);
    const res = await addMember(userId);
    setSubmitting(null);
    if (!res.ok) setError(res.error ?? 'Failed to add member.');
  }

  async function handleRemove(userId: string) {
    setSubmitting(userId);
    setError(null);
    const res = await removeMember(userId);
    setSubmitting(null);
    if (!res.ok) setError(res.error ?? 'Failed to remove member.');
  }

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="channel-members-title"
      size="md"
      dismissable={!submitting}
    >
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="channel-members-title"
              className="truncate text-[17px] font-semibold text-[#171A21]"
            >
              #{channel.name} — Members
            </h2>
            <p className="mt-1 text-xs tabular-nums text-[#737782]">
              {state.status === 'ready'
                ? `${members.length} member${members.length === 1 ? '' : 's'}`
                : 'Private channel'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!!submitting}
            aria-label="Close dialog"
            className="touch-hit rounded-lg p-1.5 text-[#737782] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {error && (
            <div className="rounded-[8px] bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-[#C94A45]" role="alert">
              {error}
            </div>
          )}

          {state.status === 'loading' && <p className="text-xs text-[#737782]">Loading members…</p>}
          {state.status === 'error' && (
            <div className="space-y-1">
              <p className="text-xs text-[#C94A45]">Could not load members.</p>
              <button
                type="button"
                onClick={retryChannelMembers}
                className="rounded text-xs font-medium text-[#171A21] underline decoration-[#E4E2DF] underline-offset-4 transition-colors hover:decoration-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
              >
                Try again
              </button>
            </div>
          )}
          {state.status === 'notFound' && (
            <p className="text-xs text-[#C94A45]">Channel not found.</p>
          )}

          {canManage && (
            <div className="rounded-[10px] border border-[#E4E2DF] bg-[#FAF9F8] p-3.5 space-y-2">
              <label
                htmlFor="channel-member-search"
                className="block text-xs font-medium text-[#171A21]"
              >
                Add workspace member
              </label>
              <input
                id="channel-member-search"
                type="text"
                placeholder="Search members to add…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-[6px] border border-[#E4E2DF] bg-white px-2.5 py-1.5 text-xs text-[#171A21] outline-none placeholder:text-[#737782] focus:border-[#3157D5] focus-visible:ring-1 focus-visible:ring-[#3157D5]"
              />
              <div className="max-h-36 overflow-y-auto rounded-[6px] border border-[#E4E2DF] bg-white">
                {wsMembersState.status === 'error' ? (
                  <div className="space-y-1 p-2 text-center">
                    <p className="text-xs text-[#C94A45]">Could not load workspace members.</p>
                    <button
                      type="button"
                      onClick={retryWorkspaceMembers}
                      className="rounded text-xs font-medium text-[#171A21] underline decoration-[#E4E2DF] underline-offset-4 transition-colors hover:decoration-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
                    >
                      Try again
                    </button>
                  </div>
                ) : wsMembersState.status !== 'ready' ? (
                  <p className="p-2 text-center text-xs text-[#737782]">
                    Loading workspace members…
                  </p>
                ) : filtered.length === 0 ? (
                  <p className="p-2 text-center text-xs text-[#737782]">
                    {available.length === 0
                      ? 'All workspace members are already in this channel.'
                      : 'No matching members found.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-[#E4E2DF]">
                    {filtered.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between p-2 hover:bg-[#FAF9F8]"
                      >
                        <div className="mr-2 flex min-w-0 flex-1 items-center gap-2">
                          <UserAvatar name={m.user.name} image={m.user.image} size="sm" />
                          <div className="min-w-0">
                            <p
                              className="truncate text-xs font-medium text-[#171A21]"
                              title={m.user.name}
                            >
                              {m.user.name}
                            </p>
                            <p className="truncate text-[11px] text-[#737782]" title={m.user.email}>
                              {m.user.email}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!!submitting}
                          onClick={() => void handleAdd(m.user.id)}
                          aria-busy={submitting === m.user.id}
                          className="rounded-[6px] bg-[#2E3440] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#3157D5] disabled:opacity-50"
                        >
                          {submitting === m.user.id ? '…' : 'Add'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#737782]">
              Members
            </h3>
            {state.status === 'ready' && members.length === 0 ? (
              <p className="text-xs text-[#737782]">No members yet.</p>
            ) : (
              <ul className="max-h-56 divide-y divide-[#E4E2DF] overflow-y-auto rounded-[10px] border border-[#E4E2DF] bg-white">
                {members.map((member: ChannelMember) => (
                  <li key={member.id} className="flex items-center justify-between p-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <UserAvatar name={member.user.name} image={member.user.image} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-xs font-medium text-[#171A21]"
                          title={member.user.name}
                        >
                          {member.user.name}
                        </p>
                        <p
                          className="truncate text-[11px] text-[#737782]"
                          title={member.user.email}
                        >
                          {member.user.email}
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        disabled={!!submitting}
                        onClick={() => void handleRemove(member.userId)}
                        aria-label={`Remove ${member.user.name}`}
                        className="rounded p-1 text-[#737782] transition-colors hover:bg-rose-50 hover:text-[#C94A45] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
                        title="Remove from channel"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-[#E4E2DF]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[8px] border border-[#E4E2DF] bg-white px-4 py-1.5 text-xs font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

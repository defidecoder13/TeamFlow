/**
 * Private Channel Members Dialog (Phase 4K.2).
 *
 * Viewing current members, adding workspace members, removing members.
 * Only visible to authorized users (OWNER/ADMIN/creator via canUpdateChannel),
 * but server remains authoritative.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Channel } from '../../lib/channels';
import type { ChannelMember } from '../../lib/channels';
import { useChannelMembers } from '../../lib/use-channel-members';
import { useWorkspaceMembers } from '../../lib/use-workspace-members';
import { UserAvatar } from './UserAvatar';

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
  const { state, addMember, removeMember } = useChannelMembers(workspaceId, channel.slug, true);
  const { state: wsMembersState } = useWorkspaceMembers(workspaceId);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

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
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px]"
      onClick={() => !submitting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-members-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]"
      >
        <div className="flex items-start justify-between">
          <div>
            <h2
              id="channel-members-title"
              className="text-base font-semibold text-zinc-900 truncate"
            >
              #{channel.name} — Members
            </h2>
            <p className="mt-1 text-xs text-stone-500">
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
            className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600 disabled:opacity-50"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
              {error}
            </div>
          )}

          {state.status === 'loading' && <p className="text-xs text-stone-500">Loading members…</p>}
          {state.status === 'error' && (
            <p className="text-xs text-red-600">
              {state.status === 'error' ? 'Could not load members.' : ''}
            </p>
          )}
          {state.status === 'notFound' && (
            <p className="text-xs text-red-600">Channel not found.</p>
          )}

          {canManage && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-2">
              <label
                htmlFor="channel-member-search"
                className="block text-xs font-medium text-stone-700"
              >
                Add workspace member
              </label>
              <input
                id="channel-member-search"
                type="text"
                placeholder="Search members to add…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-stone-300 px-2.5 py-1 text-xs text-zinc-900 placeholder:text-stone-400 focus:border-zinc-900 focus:outline-none"
              />
              <div className="max-h-36 overflow-y-auto rounded border border-stone-200 bg-white">
                {wsMembersState.status !== 'ready' ? (
                  <p className="p-2 text-center text-xs text-stone-500">
                    Loading workspace members…
                  </p>
                ) : filtered.length === 0 ? (
                  <p className="p-2 text-center text-xs text-stone-500">
                    {available.length === 0
                      ? 'All workspace members are already in this channel.'
                      : 'No matching members found.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-stone-100">
                    {filtered.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between p-2 hover:bg-stone-50"
                      >
                        <div className="min-w-0 flex-1 mr-2 flex items-center gap-2">
                          <UserAvatar name={m.user.name} image={m.user.image} size="sm" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-zinc-900 truncate">
                              {m.user.name}
                            </p>
                            <p className="text-[10px] text-stone-500 truncate">{m.user.email}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!!submitting}
                          onClick={() => void handleAdd(m.user.id)}
                          className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
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
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
              Members
            </h3>
            {state.status === 'ready' && members.length === 0 ? (
              <p className="text-xs text-stone-500">No members yet.</p>
            ) : (
              <ul className="max-h-56 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-100 bg-stone-50/50 p-1">
                {members.map((member: ChannelMember) => (
                  <li key={member.id} className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <UserAvatar name={member.user.name} image={member.user.image} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-900 truncate">
                          {member.user.name}
                        </p>
                        <p className="text-[10px] text-stone-500 truncate">{member.user.email}</p>
                      </div>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        disabled={!!submitting}
                        onClick={() => void handleRemove(member.userId)}
                        aria-label={`Remove ${member.user.name}`}
                        className="rounded p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                        title="Remove from channel"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-300 bg-white px-4 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-400"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

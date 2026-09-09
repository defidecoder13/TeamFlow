/**
 * Group Members Dialog (Phase 4F.6).
 *
 * Allows viewing group members, and if ADMIN, adding participants,
 * removing participants, and renaming the group.
 * Allows any participant to leave the group.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { getApiBaseUrl } from '../../lib/config';
import { useWorkspaceMembers } from '../../lib/use-workspace-members';
import {
  addConversationParticipant,
  leaveGroupConversation,
  removeConversationParticipant,
  renameGroupConversation,
  type DirectConversation,
} from '../../lib/messages';
import { AuthError } from '../auth/AuthError';

export interface GroupMembersDialogProps {
  conversation: DirectConversation;
  workspaceId: string;
  currentUserId: string;
  onClose: () => void;
  onConversationUpdated?: (conversation: DirectConversation) => void;
  onLeftConversation?: () => void;
  onUnauthenticated?: () => void;
}

export function GroupMembersDialog({
  conversation,
  workspaceId,
  currentUserId,
  onClose,
  onConversationUpdated,
  onLeftConversation,
  onUnauthenticated,
}: GroupMembersDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(conversation.name ?? '');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);

  const { state: membersState } = useWorkspaceMembers(workspaceId);

  const currentUserParticipant = useMemo(() => {
    return conversation.participants.find((p) => p.id === currentUserId);
  }, [conversation.participants, currentUserId]);

  const isAdmin =
    conversation.currentUserRole === 'ADMIN' || currentUserParticipant?.role === 'ADMIN';

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isSubmitting, onClose]);

  const availableWorkspaceMembers = useMemo(() => {
    if (membersState.status !== 'ready') return [];
    const participantIds = new Set(conversation.participants.map((p) => p.id));
    return membersState.members.filter((m) => !participantIds.has(m.user.id));
  }, [membersState, conversation.participants]);

  const filteredAvailableMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return availableWorkspaceMembers;
    return availableWorkspaceMembers.filter(
      (m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q),
    );
  }, [availableWorkspaceMembers, memberSearch]);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmed = nameInput.trim();
    if (!trimmed) {
      setError('Group name cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setIsSubmitting(false);
      setError('Could not connect to API server.');
      return;
    }

    const res = await renameGroupConversation(apiBase, conversation.id, trimmed);
    setIsSubmitting(false);

    if (res.ok) {
      setIsRenaming(false);
      onConversationUpdated?.(res.data);
      return;
    }

    if ('unauthenticated' in res && res.unauthenticated) {
      onUnauthenticated?.();
      return;
    }

    setError(res.message || 'Failed to rename conversation.');
  }

  async function handleAddParticipant(userId: string) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setIsSubmitting(false);
      setError('Could not connect to API server.');
      return;
    }

    const res = await addConversationParticipant(apiBase, conversation.id, userId);
    setIsSubmitting(false);

    if (res.ok) {
      setIsAddingMember(false);
      setMemberSearch('');
      onConversationUpdated?.(res.data);
      return;
    }

    if ('unauthenticated' in res && res.unauthenticated) {
      onUnauthenticated?.();
      return;
    }

    setError(res.message || 'Failed to add participant.');
  }

  async function handleRemoveParticipant(userId: string) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setIsSubmitting(false);
      setError('Could not connect to API server.');
      return;
    }

    const res = await removeConversationParticipant(apiBase, conversation.id, userId);
    setIsSubmitting(false);

    if (res.ok) {
      const updatedParticipants = conversation.participants.filter((p) => p.id !== userId);
      onConversationUpdated?.({
        ...conversation,
        participants: updatedParticipants,
        participantCount: Math.max(
          1,
          (conversation.participantCount ?? conversation.participants.length) - 1,
        ),
      });
      return;
    }

    if ('unauthenticated' in res && res.unauthenticated) {
      onUnauthenticated?.();
      return;
    }

    setError(res.message || 'Failed to remove participant.');
  }

  async function handleLeave() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    let apiBase: string;
    try {
      apiBase = getApiBaseUrl();
    } catch {
      setIsSubmitting(false);
      setError('Could not connect to API server.');
      return;
    }

    const res = await leaveGroupConversation(apiBase, conversation.id);
    setIsSubmitting(false);

    if (res.ok) {
      onLeftConversation?.();
      onClose();
      return;
    }

    if ('unauthenticated' in res && res.unauthenticated) {
      onUnauthenticated?.();
      return;
    }

    setError(res.message || 'Failed to leave conversation.');
  }

  const groupDisplayName =
    conversation.name?.trim() ||
    conversation.participants
      .filter((p) => p.id !== currentUserId)
      .map((p) => p.name)
      .join(', ') ||
    'Group Message';

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px]"
      onClick={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-members-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-[0_20px_48px_-8px_rgba(24,24,27,0.12)]"
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 pr-2">
            <h2
              id="group-members-title"
              className="text-base font-semibold tracking-tight text-zinc-900 truncate"
            >
              {groupDisplayName}
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              {conversation.participants.length} member
              {conversation.participants.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:opacity-50"
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
          <AuthError message={error} />

          {/* Admin Rename Group Section */}
          {isAdmin && (
            <div className="rounded-lg border border-stone-100 bg-stone-50/50 p-3">
              {isRenaming ? (
                <form onSubmit={handleRename} className="space-y-2">
                  <label
                    htmlFor="rename-group-input"
                    className="block text-xs font-medium text-stone-700"
                  >
                    Group Name
                  </label>
                  <input
                    id="rename-group-input"
                    type="text"
                    autoFocus
                    disabled={isSubmitting}
                    value={nameInput}
                    maxLength={100}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter group name"
                    className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-zinc-900 placeholder:text-stone-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:opacity-50"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setIsRenaming(false);
                        setNameInput(conversation.name ?? '');
                      }}
                      className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition-colors hover:border-stone-400"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !nameInput.trim()}
                      className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white shadow-xs transition-colors hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {isSubmitting ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-stone-500">Group name: </span>
                    <span className="text-xs font-medium text-zinc-900 truncate">
                      {conversation.name ?? '(none)'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRenaming(true)}
                    className="ml-2 text-xs font-medium text-zinc-900 underline decoration-stone-300 underline-offset-2 hover:decoration-zinc-900"
                  >
                    Rename
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Members List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Members
              </h3>
              {isAdmin && !isAddingMember && conversation.participants.length < 20 && (
                <button
                  type="button"
                  onClick={() => setIsAddingMember(true)}
                  className="text-xs font-medium text-zinc-900 underline decoration-stone-300 underline-offset-2 hover:decoration-zinc-900"
                >
                  + Add Member
                </button>
              )}
            </div>

            {/* Add Member Dropdown / Input */}
            {isAddingMember && (
              <div className="mb-3 rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="search-add-member" className="text-xs font-medium text-stone-700">
                    Add workspace member
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingMember(false);
                      setMemberSearch('');
                    }}
                    className="text-xs text-stone-500 hover:text-stone-800"
                  >
                    Cancel
                  </button>
                </div>
                <input
                  id="search-add-member"
                  type="text"
                  autoFocus
                  placeholder="Search members to add…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full rounded-md border border-stone-300 px-2.5 py-1 text-xs text-zinc-900 placeholder:text-stone-400 focus:border-zinc-900 focus:outline-none"
                />
                <div className="max-h-36 overflow-y-auto rounded border border-stone-200 bg-white">
                  {filteredAvailableMembers.length === 0 ? (
                    <p className="p-2 text-center text-xs text-stone-500">
                      {availableWorkspaceMembers.length === 0
                        ? 'All workspace members are already in this group.'
                        : 'No matching members found.'}
                    </p>
                  ) : (
                    <ul className="divide-y divide-stone-100">
                      {filteredAvailableMembers.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between p-2 hover:bg-stone-50"
                        >
                          <div className="min-w-0 flex-1 mr-2">
                            <p className="text-xs font-medium text-zinc-900 truncate">
                              {m.user.name}
                            </p>
                            <p className="text-[10px] text-stone-500 truncate">{m.user.email}</p>
                          </div>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => void handleAddParticipant(m.user.id)}
                            className="rounded bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                          >
                            Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <ul className="max-h-56 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-100 bg-stone-50/50 p-1">
              {conversation.participants.map((p) => {
                const initial =
                  p.name.trim().charAt(0).toUpperCase() ||
                  p.email.trim().charAt(0).toUpperCase() ||
                  '?';
                const isSelf = p.id === currentUserId;
                const roleBadge = p.role === 'ADMIN' ? 'Admin' : 'Member';

                return (
                  <li key={p.id} className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-200 text-[10px] font-medium text-stone-700"
                      >
                        {initial}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-900 truncate">
                          {p.name} {isSelf ? '(You)' : ''}
                        </p>
                        <p className="text-[10px] text-stone-500 truncate">{p.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          p.role === 'ADMIN'
                            ? 'bg-zinc-900 text-white'
                            : 'bg-stone-200 text-stone-700'
                        }`}
                      >
                        {roleBadge}
                      </span>
                      {isAdmin && !isSelf && (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => void handleRemoveParticipant(p.id)}
                          aria-label={`Remove ${p.name}`}
                          className="rounded p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Remove from group"
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
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Leave Group Action */}
          <div className="border-t border-stone-100 pt-3">
            {confirmLeave ? (
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 space-y-2">
                <p className="text-xs text-red-800 font-medium">
                  Are you sure you want to leave this group conversation?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setConfirmLeave(false)}
                    className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-stone-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void handleLeave()}
                    className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white shadow-xs hover:bg-red-700 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Leaving…' : 'Leave Group'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setConfirmLeave(true)}
                  className="text-xs font-medium text-red-600 hover:text-red-700 underline decoration-red-200 underline-offset-2"
                >
                  Leave group
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onClose}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-400"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

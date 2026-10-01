/**
 * Group Members Dialog (Phase 4F.6).
 *
 * Allows viewing group members, and if ADMIN, adding participants,
 * removing participants, and renaming the group.
 * Allows any participant to leave the group.
 */

'use client';

import { useMemo, useRef, useState } from 'react';
import { Dialog } from './dialog';
import { getApiBaseUrl } from '../../lib/config';
import { usePresence } from '../../lib/use-presence';
import { useWorkspaceMembers } from '../../lib/use-workspace-members';
import {
  addConversationParticipant,
  leaveGroupConversation,
  removeConversationParticipant,
  renameGroupConversation,
  type DirectConversation,
} from '../../lib/messages';
import { AuthError } from '../auth/AuthError';
import { PresenceIndicator } from './PresenceIndicator';
import { CloseIcon } from './icons';

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
  const renameInputRef = useRef<HTMLInputElement>(null);

  const { state: membersState } = useWorkspaceMembers(workspaceId);
  const { getPresence } = usePresence(workspaceId);

  const currentUserParticipant = useMemo(() => {
    return conversation.participants.find((p) => p.id === currentUserId);
  }, [conversation.participants, currentUserId]);

  const isAdmin =
    conversation.currentUserRole === 'ADMIN' || currentUserParticipant?.role === 'ADMIN';

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
      renameInputRef.current?.focus();
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
    <Dialog
      open
      onClose={onClose}
      labelledBy="group-members-title"
      size="md"
      dismissable={!isSubmitting}
    >
      <div>
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 pr-2">
            <h2
              id="group-members-title"
              className="truncate text-[17px] font-semibold tracking-tight text-[#171A21]"
              title={groupDisplayName}
            >
              {groupDisplayName}
            </h2>
            <p className="mt-1 text-xs tabular-nums text-[#737782]">
              {conversation.participants.length} member
              {conversation.participants.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Close dialog"
            className="touch-hit rounded-lg p-1.5 text-[#737782] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <AuthError message={error} />

          {/* Admin Rename Group Section */}
          {isAdmin && (
            <div className="rounded-[10px] border border-[#E4E2DF] bg-[#FAF9F8] p-3">
              {isRenaming ? (
                <form onSubmit={handleRename} className="space-y-2">
                  <label
                    htmlFor="rename-group-input"
                    className="block text-xs font-medium text-[#171A21]"
                  >
                    Group name
                  </label>
                  <input
                    ref={renameInputRef}
                    id="rename-group-input"
                    type="text"
                    autoFocus
                    disabled={isSubmitting}
                    value={nameInput}
                    maxLength={100}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter group name"
                    className="w-full rounded-[8px] border border-[#E4E2DF] bg-white px-3 py-1.5 text-xs text-[#171A21] outline-none placeholder:text-[#737782] focus:border-[#3157D5] focus-visible:ring-1 focus-visible:ring-[#3157D5] disabled:opacity-50"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => {
                        setIsRenaming(false);
                        setNameInput(conversation.name ?? '');
                      }}
                      className="rounded-[6px] border border-[#E4E2DF] bg-white px-2.5 py-1 text-xs font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      aria-busy={isSubmitting}
                      className="rounded-[6px] bg-[#2E3440] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#3157D5] disabled:opacity-50"
                    >
                      {isSubmitting ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-[#737782]">Group name: </span>
                    <span className="text-xs font-medium text-[#171A21] truncate">
                      {conversation.name ?? '(none)'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRenaming(true)}
                    className="ml-2 rounded text-xs font-medium text-[#171A21] underline decoration-[#E4E2DF] underline-offset-2 transition-colors hover:decoration-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
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
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#737782]">
                Members
              </h3>
              {isAdmin && !isAddingMember && conversation.participants.length < 20 && (
                <button
                  type="button"
                  onClick={() => setIsAddingMember(true)}
                  className="rounded text-xs font-medium text-[#171A21] underline decoration-[#E4E2DF] underline-offset-2 transition-colors hover:decoration-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
                >
                  + Add Member
                </button>
              )}
            </div>

            {/* Add Member Dropdown / Input */}
            {isAddingMember && (
              <div className="mb-3 rounded-[10px] border border-[#E4E2DF] bg-[#FAF9F8] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="search-add-member" className="text-xs font-medium text-[#171A21]">
                    Add workspace member
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingMember(false);
                      setMemberSearch('');
                    }}
                    className="rounded text-xs text-[#737782] transition-colors hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
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
                  className="w-full rounded-[6px] border border-[#E4E2DF] bg-white px-2.5 py-1 text-xs text-[#171A21] outline-none placeholder:text-[#737782] focus:border-[#3157D5] focus-visible:ring-1 focus-visible:ring-[#3157D5]"
                />
                <div className="max-h-36 overflow-y-auto rounded-[6px] border border-[#E4E2DF] bg-white">
                  {filteredAvailableMembers.length === 0 ? (
                    <p className="p-2 text-center text-xs text-[#737782]">
                      {availableWorkspaceMembers.length === 0
                        ? 'All workspace members are already in this group.'
                        : 'No matching members found.'}
                    </p>
                  ) : (
                    <ul className="divide-y divide-[#E4E2DF]">
                      {filteredAvailableMembers.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between p-2 hover:bg-[#FAF9F8]"
                        >
                          <div className="mr-2 min-w-0 flex-1">
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
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => void handleAddParticipant(m.user.id)}
                            className="rounded-[6px] bg-[#2E3440] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-[#1E222A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#3157D5] disabled:opacity-50"
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

            <ul className="max-h-56 divide-y divide-[#E4E2DF] overflow-y-auto rounded-[10px] border border-[#E4E2DF] bg-white p-1">
              {conversation.participants.map((p) => {
                const initial =
                  p.name.trim().charAt(0).toUpperCase() ||
                  p.email.trim().charAt(0).toUpperCase() ||
                  '?';
                const isSelf = p.id === currentUserId;
                const roleBadge = p.role === 'ADMIN' ? 'Admin' : 'Member';

                return (
                  <li key={p.id} className="flex items-center justify-between p-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="relative inline-flex shrink-0">
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ECEAE7] text-xs font-medium text-[#171A21]"
                        >
                          {initial}
                        </span>
                        <span className="absolute bottom-0 right-0 translate-x-[15%] translate-y-[15%]">
                          <PresenceIndicator status={getPresence(p.id).status} size="sm" />
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-xs font-medium text-[#171A21]"
                          title={isSelf ? `${p.name} (You)` : p.name}
                        >
                          {p.name} {isSelf ? '(You)' : ''}
                        </p>
                        <p className="truncate text-[11px] text-[#737782]" title={p.email}>
                          {p.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-[6px] bg-[#F1F0EE] px-1.5 py-0.5 text-[11px] font-semibold text-[#4F5360]">
                        {roleBadge}
                      </span>
                      {isAdmin && !isSelf && (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => void handleRemoveParticipant(p.id)}
                          aria-label={`Remove ${p.name}`}
                          className="rounded p-1 text-[#737782] transition-colors hover:bg-rose-50 hover:text-[#C94A45] focus-visible:outline-2 focus-visible:outline-[#3157D5] disabled:opacity-50"
                          title="Remove from group"
                        >
                          <CloseIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Leave Group Action */}
          <div className="border-t border-[#E4E2DF] pt-3">
            {confirmLeave ? (
              <div className="space-y-2 rounded-[8px] border border-rose-200 bg-rose-50/50 p-3">
                <p className="text-xs font-medium text-[#C94A45]">
                  Are you sure you want to leave this group conversation?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setConfirmLeave(false)}
                    className="rounded-[6px] border border-[#E4E2DF] bg-white px-2.5 py-1 text-xs font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void handleLeave()}
                    className="rounded-[6px] bg-[#C94A45] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-[#B33E3A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C94A45] disabled:opacity-50"
                  >
                    {isSubmitting ? 'Leaving…' : 'Leave group'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setConfirmLeave(true)}
                  className="rounded text-xs font-medium text-[#C94A45] underline decoration-rose-200 underline-offset-2 transition-colors hover:text-[#B33E3A] focus-visible:outline-2 focus-visible:outline-[#C94A45] disabled:opacity-50"
                >
                  Leave group
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={onClose}
                  className="rounded-[8px] border border-[#E4E2DF] bg-white px-4 py-1.5 text-xs font-medium text-[#4F5360] transition-colors hover:bg-[#F1F0EE] hover:text-[#171A21] focus-visible:outline-2 focus-visible:outline-[#3157D5]"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
